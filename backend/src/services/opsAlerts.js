// Alertas operacionais: quando o «Estado do sistema» (opsStatus) encontra um
// problema, avisa por push e por email. Cada problema é avisado quando
// aparece; se continuar, volta a ser avisado ao fim de 24 horas; depois de
// resolvido, um novo aparecimento é avisado outra vez. Corre de 15 em 15
// minutos (scheduledTasks).
// - Problemas da organização: proprietário e gestores (ops_alerts).
// - Problemas da instância (task_*, disk_low) e pedidos de suporte com a última
//   mensagem do cliente há mais de 24 horas: só os admins da plataforma, uma
//   vez para toda a instância (platform_alerts, platformNotifier). Um pedido
//   sem resposta é avisado uma só vez, até a plataforma responder.
const { db } = require('../config/database');

const REPEAT_MS = 24 * 60 * 60 * 1000;
const UNANSWERED_MS = 24 * 60 * 60 * 1000;
const SUPPORT_PREFIX = 'support_unanswered:';
const isInstanceKey = key => require('./platformService').isInstanceKey(key);
const HOUR = 60 * 60 * 1000;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Datas do SQLite (UTC, «AAAA-MM-DD HH:MM:SS») e ISO.
const ageMs = value => {
  if (!value) return 0;
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(date.getTime()) ? 0 : Date.now() - date.getTime();
};

// Problemas encontrados no estado: { key, title, detail }. A chave identifica
// o problema (uma tarefa automática tem a sua).
function problems(status) {
  const found = [];
  const add = (key, title, detail) => found.push({ key, title, detail });
  const email = status.email || {};
  if (email.deliveries_needing_decision > 0) {
    add('email_decision', 'Emails por decidir',
      `${plural(email.deliveries_needing_decision, 'email ficou', 'emails ficaram')} com o envio incerto. Decida em Notificações se já foi entregue ou se deve ser enviado de novo.`);
  }
  if (email.failed > 0) {
    add('effects_failed', 'Avisos automáticos falharam',
      `${plural(email.failed, 'email ou aviso automático desistiu', 'emails ou avisos automáticos desistiram')} depois de várias tentativas.`);
  }
  const calendar = status.google?.calendar_queue;
  if (calendar?.failing > 0 && ageMs(calendar.oldest) > HOUR) {
    add('calendar_queue', 'Google Calendar por sincronizar',
      `${plural(calendar.pending, 'alteração está', 'alterações estão')} à espera há mais de uma hora. Confirme a ligação ao Google em Definições.`);
  }
  const tasks = status.google?.tasks_cleanup_queue;
  if (tasks?.n > 0 && ageMs(tasks.oldest) > 6 * HOUR) {
    add('tasks_queue', 'Google Tasks por limpar',
      `${plural(tasks.n, 'tarefa antiga continua', 'tarefas antigas continuam')} no Google Tasks há mais de 6 horas.`);
  }
  const payments = status.payments || {};
  if (payments.stripe_stuck_over_1h > 0) {
    add('stripe_stuck', 'Pagamentos Stripe parados',
      `${plural(payments.stripe_stuck_over_1h, 'pagamento está', 'pagamentos estão')} em processamento há mais de uma hora.`);
  }
  if (payments.cancellations_manual_review > 0) {
    add('cancellation_review', 'Cancelamentos para rever',
      `${plural(payments.cancellations_manual_review, 'cancelamento precisa', 'cancelamentos precisam')} de revisão manual (reembolso).`);
  }
  for (const task of status.tasks || []) {
    if (task.last_error_at && (!task.last_ok_at || task.last_error_at > task.last_ok_at)) {
      add(`task_${task.name}`, `Tarefa automática a falhar: ${task.label}`, `Último erro: ${task.last_error || 'sem detalhe'}.`);
    }
  }
  const disk = status.storage?.disk;
  if (disk?.total_bytes > 0 && disk.free_bytes / disk.total_bytes < 0.1) {
    add('disk_low', 'Pouco espaço em disco', `Restam ${Math.round((disk.free_bytes / disk.total_bytes) * 100)}% do disco onde está a base de dados.`);
  }
  return found;
}

// Decide o que avisar a partir das linhas já registadas: problemas novos, de
// volta depois de resolvidos ou por avisar há 24 h (só os que `repeats`).
// Devolve { toNotify, toResolve } (chaves registadas que desapareceram).
function pick(rows, found, now, repeats = () => true) {
  const keys = new Set(found.map(p => p.key));
  const toResolve = [...rows.values()].filter(r => !keys.has(r.key) && !r.resolved_at).map(r => r.key);
  const toNotify = found.filter(p => {
    const row = rows.get(p.key);
    return !row || row.resolved_at || (repeats(p.key) && now - new Date(row.notified_at) >= REPEAT_MS);
  });
  return { toNotify, toResolve };
}

// Regista o que avisar numa organização e devolve-o.
function due(organizationId, found, now = new Date()) {
  const rows = new Map(db.prepare('SELECT * FROM ops_alerts WHERE organization_id = ?').all(organizationId).map(r => [r.key, r]));
  const { toNotify, toResolve } = pick(rows, found, now);
  const resolve = db.prepare("UPDATE ops_alerts SET resolved_at = ? WHERE organization_id = ? AND key = ? AND resolved_at IS NULL");
  for (const key of toResolve) resolve.run(now.toISOString(), organizationId, key);
  const upsert = db.prepare(`INSERT INTO ops_alerts (organization_id, key, notified_at, resolved_at) VALUES (?, ?, ?, NULL)
    ON CONFLICT (organization_id, key) DO UPDATE SET notified_at = excluded.notified_at, resolved_at = NULL`);
  for (const p of toNotify) upsert.run(organizationId, p.key, now.toISOString());
  return toNotify;
}

// O mesmo para os admins da plataforma (platform_alerts). Os pedidos sem
// resposta não se repetem: um aviso por pedido até haver resposta.
function duePlatform(found, now = new Date()) {
  const rows = new Map(db.prepare('SELECT * FROM platform_alerts').all().map(r => [r.key, r]));
  const { toNotify, toResolve } = pick(rows, found, now, key => !key.startsWith(SUPPORT_PREFIX));
  const resolve = db.prepare('UPDATE platform_alerts SET resolved_at = ? WHERE key = ? AND resolved_at IS NULL');
  for (const key of toResolve) resolve.run(now.toISOString(), key);
  const upsert = db.prepare(`INSERT INTO platform_alerts (key, notified_at, resolved_at) VALUES (?, ?, NULL)
    ON CONFLICT (key) DO UPDATE SET notified_at = excluded.notified_at, resolved_at = NULL`);
  for (const p of toNotify) upsert.run(p.key, now.toISOString());
  return toNotify;
}

// Pedidos por resolver cuja última mensagem é do cliente e tem mais de 24 h.
// Só número e assunto, como os outros avisos do Suporte (nunca o texto).
function unansweredTickets(now = new Date()) {
  const limit = new Date(now.getTime() - UNANSWERED_MS).toISOString();
  return db.prepare(`SELECT t.id, t.number, t.subject FROM support_tickets t
    JOIN support_messages m ON m.id = (SELECT id FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
    WHERE t.status != 'resolved' AND m.side = 'customer' AND m.created_at <= ?
    ORDER BY t.number`).all(limit).map(t => {
    const label = 'SP-' + String(t.number).padStart(4, '0');
    return { key: SUPPORT_PREFIX + t.id, ticketId: t.id, label, title: `${label} sem resposta há mais de 24 horas`, detail: t.subject };
  });
}

async function notify(organizationId, alerts) {
  const staff = require('./staffNotifier');
  const esc = require('./emailComposer').escapeHtml;
  const url = require('./publicLinks').absoluteUrl('/definicoes');
  const title = alerts.length === 1 ? `Alerta: ${alerts[0].title}` : `${alerts.length} alertas do sistema`;
  const results = await Promise.allSettled([
    staff.push(organizationId, 'ops_alert', {
      kind: 'alert', title, body: alerts.length === 1 ? alerts[0].detail : alerts.map(a => a.title).join(' · '),
      url: '/definicoes', tag: 'sp-ops-alert', requireInteraction: true, roles: ['owner', 'manager'],
    }),
    staff.email(organizationId, {
      subject: `${title} — Santa Paciência`,
      eyebrow: 'Alerta do sistema', tone: 'warn',
      headline: alerts.length === 1 ? alerts[0].title : `${alerts.length} problemas precisam de atenção`,
      note: { tone: 'warn', heading: 'O que se passa', html: alerts.map(a => `<strong>${esc(a.title)}</strong><br>${esc(a.detail)}`).join('<br><br>') },
      url, footnote: 'Veja o detalhe em Definições → Base de dados → Estado do sistema.',
    }),
  ]);
  for (const r of results) if (r.status === 'rejected') console.error('Alerta do sistema:', r.reason?.message || r.reason);
}

// Os problemas da instância ficam de fora: vão só para os admins (checkPlatform).
async function checkOrganization(organizationId) {
  const found = problems(require('./opsStatus').opsStatus(organizationId)).filter(p => !isInstanceKey(p.key));
  const alerts = db.transaction(() => due(organizationId, found)).immediate();
  if (alerts.length) await notify(organizationId, alerts);
  return alerts;
}

// Um aviso por tipo: problemas da instância juntos, pedidos sem resposta juntos.
async function notifyPlatform(alerts) {
  const notifier = require('./platformNotifier');
  const { pushPayload } = require('./staffNotifier');
  const accountEmails = require('./accountEmails');
  const esc = require('./emailComposer').escapeHtml;
  const absolute = require('./publicLinks').absoluteUrl;
  const instance = alerts.filter(a => !a.ticketId);
  const tickets = alerts.filter(a => a.ticketId);
  const groups = [];
  if (instance.length) {
    groups.push({
      title: instance.length === 1 ? `Instância: ${instance[0].title}` : `${instance.length} problemas na instância`,
      body: instance.length === 1 ? instance[0].detail : instance.map(a => a.title).join(' · '),
      url: '/plataforma/incidentes', tag: 'sp-platform-instance', items: instance, cta: 'Ver incidentes',
    });
  }
  if (tickets.length) {
    groups.push({
      title: tickets.length === 1 ? tickets[0].title : `${tickets.length} pedidos sem resposta há mais de 24 horas`,
      body: tickets.length === 1 ? tickets[0].detail : tickets.map(a => a.label).join(' · '),
      url: tickets.length === 1 ? `/plataforma/suporte/${tickets[0].ticketId}` : '/plataforma/suporte',
      tag: 'sp-platform-support', items: tickets, cta: tickets.length === 1 ? 'Abrir pedido' : 'Ver pedidos',
    });
  }
  for (const g of groups) {
    await notifier.notifyAdmins({
      push: pushPayload({ kind: 'alert', title: g.title, body: g.body, url: g.url, tag: g.tag, requireInteraction: true }),
      email: orgId => accountEmails.compose(orgId, {
        subject: `${g.title} — Santa Paciência`, title: g.title, eyebrow: 'Alerta da plataforma', tone: 'warn',
        note: { tone: 'warn', heading: 'O que se passa', html: g.items.map(a => `<strong>${esc(a.title)}</strong><br>${esc(a.detail)}`).join('<br><br>') },
        cta: { url: absolute(g.url), label: g.cta },
      }),
      onError: (step, err) => console.error('Alerta da plataforma:', step, err?.message || err),
    });
  }
}

// Problemas da instância (vistos uma vez, sem organização) e pedidos sem
// resposta, só para os admins da plataforma. Sem admins, não regista nada.
async function checkPlatform(now = new Date()) {
  if (!require('./platformNotifier').admins().length) return [];
  const found = [
    ...problems(require('./opsStatus').opsStatus('')).filter(p => isInstanceKey(p.key)),
    ...unansweredTickets(now),
  ];
  const alerts = db.transaction(() => duePlatform(found, now)).immediate();
  if (alerts.length) await notifyPlatform(alerts);
  return alerts;
}

async function checkAll() {
  for (const { id } of db.prepare('SELECT id FROM organizations').all()) {
    try { await checkOrganization(id); }
    catch (error) { console.error(`Alertas do sistema (${id}):`, error.message); }
  }
  try { await checkPlatform(); }
  catch (error) { console.error('Alertas da plataforma:', error.message); }
}

module.exports = { problems, due, duePlatform, checkOrganization, checkPlatform, checkAll };
