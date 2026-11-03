// Alertas operacionais: quando o «Estado do sistema» (opsStatus) encontra um
// problema, avisa o proprietário e os gestores por push e por email. Cada
// problema é avisado quando aparece; se continuar, volta a ser avisado ao fim
// de 24 horas; depois de resolvido, um novo aparecimento é avisado outra vez.
// Corre de 15 em 15 minutos (scheduledTasks).
const { db } = require('../config/database');

const REPEAT_MS = 24 * 60 * 60 * 1000;
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

// Decide o que avisar e regista-o: problemas novos ou por avisar há 24 h.
// Os que desapareceram ficam resolvidos (um regresso volta a ser avisado).
function due(organizationId, found, now = new Date()) {
  const rows = new Map(db.prepare('SELECT * FROM ops_alerts WHERE organization_id = ?').all(organizationId).map(r => [r.key, r]));
  const keys = new Set(found.map(p => p.key));
  const resolve = db.prepare("UPDATE ops_alerts SET resolved_at = ? WHERE organization_id = ? AND key = ? AND resolved_at IS NULL");
  for (const [key, row] of rows) if (!keys.has(key) && !row.resolved_at) resolve.run(now.toISOString(), organizationId, key);
  const toNotify = found.filter(p => {
    const row = rows.get(p.key);
    return !row || row.resolved_at || now - new Date(row.notified_at) >= REPEAT_MS;
  });
  const upsert = db.prepare(`INSERT INTO ops_alerts (organization_id, key, notified_at, resolved_at) VALUES (?, ?, ?, NULL)
    ON CONFLICT (organization_id, key) DO UPDATE SET notified_at = excluded.notified_at, resolved_at = NULL`);
  for (const p of toNotify) upsert.run(organizationId, p.key, now.toISOString());
  return toNotify;
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

async function checkOrganization(organizationId) {
  const found = problems(require('./opsStatus').opsStatus(organizationId));
  const alerts = db.transaction(() => due(organizationId, found)).immediate();
  if (alerts.length) await notify(organizationId, alerts);
  return alerts;
}

async function checkAll() {
  for (const { id } of db.prepare('SELECT id FROM organizations').all()) {
    try { await checkOrganization(id); }
    catch (error) { console.error(`Alertas do sistema (${id}):`, error.message); }
  }
}

module.exports = { problems, due, checkOrganization, checkAll };
