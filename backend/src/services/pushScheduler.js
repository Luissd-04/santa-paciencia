const { db } = require('../config/database');
const { sendToOrganization } = require('./pushService');

// Hora local a partir da qual o resumo diário é enviado (0-23).
const SUMMARY_HOUR = process.env.PUSH_SUMMARY_HOUR !== undefined
  ? Number(process.env.PUSH_SUMMARY_HOUR)
  : 8;

// Intervalo entre passagens (ms). 15 minutos por defeito.
const SCHEDULER_INTERVAL_MS = Number(process.env.PUSH_SUMMARY_INTERVAL_MS) || 15 * 60 * 1000;

const SENT_KEY = 'push_daily_summary_sent';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Check-ins/outs de hoje ainda por fazer (mesma regra do sino: tarefas
// operacionais concluídas não contam).
function countPendingToday(orgId, today) {
  const notDone = kind => `
    AND NOT EXISTS (
      SELECT 1 FROM operational_events e
      WHERE e.organization_id = r.organization_id
        AND e.reservation_id = r.id
        AND e.auto_kind = '${kind}'
        AND e.status = 'concluido'
    )`;
  const checkins = db.prepare(`
    SELECT COUNT(*) AS c FROM reservations r
    WHERE r.organization_id = ? AND r.check_in = ? AND r.status != 'cancelada' ${notDone('checkin')}
  `).get(orgId, today).c;
  const checkouts = db.prepare(`
    SELECT COUNT(*) AS c FROM reservations r
    WHERE r.organization_id = ? AND r.check_out = ? AND r.status != 'cancelada' ${notDone('checkout')}
  `).get(orgId, today).c;
  return { checkins, checkouts };
}

async function sendDailySummaries() {
  try {
    if (new Date().getHours() < SUMMARY_HOUR) return;
    const today = localToday();

    // Só organizações com dispositivos subscritos
    const orgs = db.prepare('SELECT DISTINCT organization_id FROM push_subscriptions').all();
    for (const { organization_id: orgId } of orgs) {
      const sent = db.prepare('SELECT value FROM organization_settings WHERE organization_id = ? AND key = ?')
        .get(orgId, SENT_KEY);
      if (sent?.value === today) continue;

      const { checkins, checkouts } = countPendingToday(orgId, today);

      // Marcar como enviado mesmo sem nada a reportar — evita reavaliar o dia todo
      db.prepare(`
        INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(orgId, SENT_KEY, today);

      if (!checkins && !checkouts) continue;

      const parts = [];
      if (checkins) parts.push(`${checkins} check-in${checkins !== 1 ? 's' : ''}`);
      if (checkouts) parts.push(`${checkouts} check-out${checkouts !== 1 ? 's' : ''}`);
      await sendToOrganization(orgId, {
        title: '📅 Resumo do dia',
        body: `Hoje: ${parts.join(' e ')}`,
        url: '/reservas',
        tag: 'sp-daily-summary',
      }, { type: 'daily_summary' });
    }
  } catch (err) {
    console.error('Erro no resumo diário push:', err.message);
  }
}

let timer = null;

function startScheduler() {
  if (timer) return;
  sendDailySummaries();
  timer = setInterval(sendDailySummaries, SCHEDULER_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏰ Push scheduler ativo (resumo diário a partir das ${SUMMARY_HOUR}h, cada ${Math.round(SCHEDULER_INTERVAL_MS / 60000)}min)`);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { sendDailySummaries, startScheduler, stopScheduler };
