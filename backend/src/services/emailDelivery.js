const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { createHash } = require('crypto');
// A provider timeout cannot prove non-delivery. Never retry that intent blindly.
async function deliverTemplate({ orgId, slug, reservation: r, to, rendered }, send) {
  const id = createHash('sha256').update(JSON.stringify([orgId, r.id, slug, to, r.status, r.check_in, r.check_out, r.amount_paid, r.total_amount, rendered.subject, rendered.html])).digest('hex');
  const now = Date.now();
  db.prepare("UPDATE email_deliveries SET state='uncertain', last_error='Envio interrompido; confirmar no Gmail antes de repetir.' WHERE organization_id=? AND reservation_id=? AND template_slug=? AND state='sending' AND updated_at<?")
    .run(orgId, r.id, slug, now - 120000);
  // Um envio incerto do mesmo modelo para a mesma reserva pode ter chegado ao
  // hóspede. Até a equipa o resolver, nenhuma versão nova (ex.: valores
  // atualizados) é enviada — seria um duplicado.
  const unresolved = db.prepare("SELECT state FROM email_deliveries WHERE organization_id=? AND reservation_id=? AND template_slug=? AND id!=? AND state IN ('uncertain','sending') LIMIT 1")
    .get(orgId, r.id, slug, id);
  if (unresolved) return { queued: true, delivery_status: unresolved.state, until: new Date(now + 3600000) };
  const claimed = db.prepare(`INSERT INTO email_deliveries(id,organization_id,reservation_id,template_slug,state,attempts,updated_at)
    VALUES(?,?,?,?,'sending',1,?) ON CONFLICT(id) DO UPDATE SET state='sending', attempts=attempts+1, updated_at=excluded.updated_at
    WHERE email_deliveries.state='blocked' AND email_deliveries.retry_at<=?`).run(id, orgId, r.id, slug, now, now).changes;
  if (!claimed) {
    const existing = db.prepare('SELECT * FROM email_deliveries WHERE id=?').get(id);
    return existing.state === 'sent' ? { id: existing.provider_id }
      : { queued: true, delivery_status: existing.state, until: new Date(Math.max(Number(existing.retry_at) || 0, now + 3600000)) };
  }
  try {
    const result = await send();
    if (!result?.id) {
      db.prepare("UPDATE email_deliveries SET state='blocked', last_error='Gmail desligado ou envio desativado.', retry_at=?, updated_at=? WHERE id=?").run(now + 60000, Date.now(), id);
      return { queued: true, delivery_status: 'blocked', until: new Date(now + 60000) };
    }
    db.prepare("UPDATE email_deliveries SET state='sent', provider_id=?, last_error=NULL, updated_at=? WHERE id=?").run(result.id, Date.now(), id);
    // Versões anteriores recusadas desta mensagem deixam de estar pendentes.
    db.prepare("UPDATE email_deliveries SET state='superseded', updated_at=? WHERE organization_id=? AND reservation_id=? AND template_slug=? AND id!=? AND state='blocked'")
      .run(Date.now(), orgId, r.id, slug, id);
    return result;
  } catch (error) {
    // A validation/auth/rate rejection is known not to have sent; network/5xx is uncertain.
    const status = Number(error.response?.status || error.status || error.code);
    const safeRetry = [400, 401, 403, 429].includes(status);
    db.prepare('UPDATE email_deliveries SET state=?, last_error=?, retry_at=?, updated_at=? WHERE id=?').run(safeRetry ? 'blocked' : 'uncertain', safeRetry ? 'Envio recusado; verificar configuração e destinatário.' : 'Resultado incerto; confirmar no Gmail antes de repetir.', now + 3600000, Date.now(), id);
    throw error;
  } finally {
    // Um envio por confirmar ou recusado aparece no sino (e sai dele quando é entregue).
    require('./liveUpdates').publish(orgId);
  }
}
// Resolução manual de um envio incerto, depois de a equipa confirmar no Gmail:
// 'sent' regista-o como entregue; 'retry' autoriza uma nova tentativa.
function resolveDelivery(orgId, reservationId, slug, resolution) {
  if (!['sent', 'retry'].includes(resolution)) throw httpError('Resolução inválida.', 400);
  return db.transaction(() => {
    const rows = db.prepare("SELECT id FROM email_deliveries WHERE organization_id=? AND reservation_id=? AND template_slug=? AND state IN ('uncertain','blocked')")
      .all(orgId, reservationId, slug);
    if (!rows.length) throw httpError('Não há envios por resolver para esta mensagem.', 404);
    const now = Date.now();
    for (const row of rows) {
      if (resolution === 'sent') db.prepare("UPDATE email_deliveries SET state='sent', last_error=NULL, updated_at=? WHERE id=?").run(now, row.id);
      else db.prepare("UPDATE email_deliveries SET state='blocked', retry_at=0, last_error=NULL, updated_at=? WHERE id=?").run(now, row.id);
    }
    if (resolution === 'sent') {
      const template = db.prepare('SELECT timing_event FROM organization_email_templates WHERE organization_id=? AND slug=?').get(orgId, slug);
      afterSent({ orgId, reservationId, slug, timingEvent: template?.timing_event });
    }
    return rows.length;
  }).immediate();
}
// Uma mensagem entregue (envio ou confirmação manual): as agendadas pela
// estadia não se repetem e o link do pré-check-in conta como enviado.
// Chamar dentro de uma transação.
function afterSent({ orgId, reservationId, slug, timingEvent }) {
  if (['checkin', 'checkout'].includes(timingEvent)) {
    db.prepare('INSERT OR IGNORE INTO organization_email_log (id,organization_id,template_slug,reservation_id) VALUES (?,?,?,?)')
      .run(require('crypto').randomUUID(), orgId, slug, reservationId);
  }
  if (slug === 'pre_checkin') require('./reservationLifecycle').markPrecheckinSent({ id: reservationId, organization_id: orgId });
}
module.exports = { deliverTemplate, resolveDelivery, afterSent };
