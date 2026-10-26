const { db } = require('../config/database');
const { sendTemplatedEmail, getEmailSettings, resolveAccommodationInheritance } = require('./emailService');
const crypto = require('crypto');
const { canSendTemplate, CANCELLATION_TEMPLATES } = require('./emailEligibility');
const { withSchedulerLease } = require('./schedulerLease');
const { localDateIso } = require('./reservationRules');

function getSendTime(reservation, template, settings) {
  const { timing_offset, timing_unit, timing_direction, timing_event } = template;
  let base;
  if (timing_event === 'checkin') {
    const [h = '15', m = '00'] = (settings.checkin_time || '15:00').split(':');
    base = new Date(`${reservation.check_in}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
  } else if (timing_event === 'checkout') {
    const [h = '11', m = '00'] = (settings.checkout_time || '11:00').split(':');
    base = new Date(`${reservation.check_out}T${h.padStart(2,'0')}:${m.padStart(2,'0')}:00`);
  } else {
    return null;
  }
  const ms = (timing_offset || 0) * (timing_unit === 'days' ? 86400000 : 3600000);
  return new Date(timing_direction === 'before' ? base.getTime() - ms : base.getTime() + ms);
}

let running = false;
let timer = null;
async function runScheduler() {
  if (running) return;
  running = true;
  if (process.env.EMAIL_ENABLED === 'false') { running = false; return; }
  try {
    await withSchedulerLease(db, 'email', async ensureLease => {
    const orgs = db.prepare('SELECT id FROM organizations').all();
    const from = localDateIso(new Date(), -8);
    const to   = localDateIso(new Date(), 31);
    const now = new Date();

    for (const org of orgs) {
      const templates = db.prepare(
        "SELECT * FROM organization_email_templates WHERE organization_id=? AND active=1 AND timing_event IN ('checkin','checkout')"
      ).all(org.id);
      if (!templates.length) continue;

      const reservations = db.prepare(`
        SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
               a.name as accommodation_name, a.wifi_name, a.wifi_password, a.door_code, a.parent_id as accommodation_parent_id,
               a.social_facebook, a.social_instagram, a.social_website, a.logo_url
        FROM reservations r
        JOIN guests g ON r.guest_id = g.id
        JOIN accommodations a ON r.accommodation_id = a.id
        WHERE r.organization_id = ? AND r.status NOT IN ('cancelada')
          AND ((r.check_in >= ? AND r.check_in <= ?) OR (r.check_out >= ? AND r.check_out <= ?))
      `).all(org.id, from, to, from, to);

      for (const res of reservations) {
        if (!res.guest_email) continue;
        const effectiveAccommodation = resolveAccommodationInheritance(db.prepare('SELECT * FROM accommodations WHERE id=? AND organization_id=?').get(res.accommodation_id, org.id), org.id);
        const settings = getEmailSettings(effectiveAccommodation, org.id);
        for (const tpl of templates) {
          ensureLease();
          // A janela aplica-se à data de referência do modelo: uma estadia longa
          // entra pela saída, mas não deve receber um email de chegada antigo.
          const anchor = tpl.timing_event === 'checkin' ? res.check_in : res.check_out;
          if (anchor < from || anchor > to) continue;
          if (!canSendTemplate(tpl, res)) continue;
          const sendTime = getSendTime(res, tpl, settings);
          if (!sendTime || sendTime > now) continue;
          const already = db.prepare('SELECT 1 FROM organization_email_log WHERE organization_id=? AND template_slug=? AND reservation_id=?').get(org.id, tpl.slug, res.id);
          if (already) continue;
          try {
            const guest = { name: res.guest_name, email: res.guest_email, first_name: res.first_name };
            const accom = effectiveAccommodation;
            const result = await sendTemplatedEmail(tpl.slug, guest, res, accom);
            if (!result || result.queued) continue; // adiado para a janela de envio — organization_email_queue trata do reenvio
            db.prepare('INSERT OR IGNORE INTO organization_email_log (id,organization_id,template_slug,reservation_id) VALUES (?,?,?,?)')
              .run(crypto.randomUUID(), org.id, tpl.slug, res.id);
            console.log(`📧 Email ${tpl.slug} → reserva ${res.id} (org ${org.id})`);
          } catch (e) {
            console.warn(`⚠️ Falha email ${tpl.slug} → ${res.id}:`, e.message);
          }
        }
      }
    }

    await flushQueuedEmails(ensureLease);
    });
    require('./opsStatus').beat('email');
  } catch (e) {
    require('./opsStatus').beat('email', e);
    console.warn('⚠️ Erro email scheduler:', e.message);
  } finally { running = false; }
}

// Reenvia emails adiados por estarem fora da janela horária configurada,
// assim que a janela do respetivo template voltar a estar aberta.
async function flushQueuedEmails(ensureLease) {
  const pending = db.prepare('SELECT * FROM organization_email_queue').all();
  for (const q of pending) {
    ensureLease();
    try {
      const res = db.prepare(`
        SELECT r.*, g.name as guest_name, g.email as guest_email, g.first_name,
               a.name as accommodation_name, a.wifi_name, a.wifi_password, a.door_code, a.parent_id as accommodation_parent_id,
               a.social_facebook, a.social_instagram, a.social_website, a.logo_url
        FROM reservations r
        JOIN guests g ON r.guest_id = g.id
        JOIN accommodations a ON r.accommodation_id = a.id
        WHERE r.id = ? AND r.organization_id = ?
      `).get(q.reservation_id, q.organization_id);

      if (!res || !res.guest_email || (res.status === 'cancelada' && !CANCELLATION_TEMPLATES.includes(q.template_slug))) {
        db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        continue;
      }

      const guest = { name: res.guest_name, email: res.guest_email, first_name: res.first_name };
      const accom = resolveAccommodationInheritance(db.prepare('SELECT * FROM accommodations WHERE id=? AND organization_id=?').get(res.accommodation_id, q.organization_id), q.organization_id);
      const tpl = db.prepare('SELECT * FROM organization_email_templates WHERE organization_id=? AND slug=? AND active=1').get(q.organization_id, q.template_slug);
      if (!tpl) {
        // Modelo apagado ou desativado: a entrada nunca seria enviada.
        db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        continue;
      }
      if (CANCELLATION_TEMPLATES.includes(tpl.slug) && res.status !== 'cancelada') { db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id); continue; }
      if (!canSendTemplate(tpl, res)) {
        // Deixou de ser elegível e a estadia já terminou: nunca será enviado.
        if (res.check_out < localDateIso(new Date(), -1)) db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        continue;
      }
      const sendTime = getSendTime(res, tpl, getEmailSettings(accom, q.organization_id));
      if (sendTime && sendTime > new Date()) continue;
      const scheduled = ['checkin', 'checkout'].includes(tpl.timing_event);
      if (scheduled && db.prepare('SELECT 1 FROM organization_email_log WHERE organization_id=? AND template_slug=? AND reservation_id=?')
        .get(q.organization_id, q.template_slug, q.reservation_id)) {
        db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        continue;
      }
      const result = await sendTemplatedEmail(q.template_slug, guest, res, accom);
      if (result && !result.queued) {
        db.transaction(() => {
          if (scheduled) db.prepare('INSERT OR IGNORE INTO organization_email_log (id,organization_id,template_slug,reservation_id) VALUES (?,?,?,?)')
            .run(crypto.randomUUID(), q.organization_id, q.template_slug, q.reservation_id);
          db.prepare('DELETE FROM organization_email_queue WHERE id=?').run(q.id);
        })();
        if (result) console.log(`📧 Email ${q.template_slug} → reserva ${res.id} (fila, org ${q.organization_id})`);
      }
    } catch (e) {
      console.warn(`⚠️ Falha ao esvaziar fila de email ${q.template_slug} → ${q.reservation_id}:`, e.message);
    }
  }
}

function startScheduler() {
  if (timer) return;
  console.log('📅 Email scheduler iniciado (verifica de hora em hora)');
  runScheduler();
  timer = setInterval(runScheduler, 60 * 60 * 1000);
  timer.unref?.();
}

function stopScheduler() { clearInterval(timer); timer = null; }
module.exports = { startScheduler, stopScheduler, runScheduler };
