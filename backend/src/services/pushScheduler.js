const { db } = require('../config/database');
const { localDateIso } = require('./reservationRules');

// Hora local a partir da qual o resumo diário é enviado (0-23).
const SUMMARY_HOUR = process.env.PUSH_SUMMARY_HOUR !== undefined
  ? Number(process.env.PUSH_SUMMARY_HOUR)
  : 8;

// Intervalo entre passagens (ms). 15 minutos por defeito.
const SCHEDULER_INTERVAL_MS = Number(process.env.PUSH_SUMMARY_INTERVAL_MS) || 15 * 60 * 1000;

const SENT_KEY = 'push_daily_summary_sent';


// Hóspedes com check-in e check-out hoje ainda por fazer (mesma regra do
// sino: tarefas operacionais concluídas não contam).
function pendingToday(orgId, today) {
  const notDone = kind => `
    AND NOT EXISTS (
      SELECT 1 FROM operational_events e
      WHERE e.organization_id = r.organization_id
        AND e.reservation_id = r.id
        AND e.auto_kind = '${kind}'
        AND e.status = 'concluido'
    )`;
  const guests = (column, kind) => db.prepare(`
    SELECT COALESCE(NULLIF(g.name, ''), 'Hóspede') AS name FROM reservations r
    LEFT JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    WHERE r.organization_id = ? AND r.${column} = ? AND r.status != 'cancelada' ${notDone(kind)}
    ORDER BY r.created_at
  `).all(orgId, today).map(row => row.name);
  return { checkins: guests('check_in', 'checkin'), checkouts: guests('check_out', 'checkout') };
}

// «Ana», «Ana e Rui», «Ana, Rui e Marta», «Ana, Rui, Marta e mais 2».
function names(list) {
  const shown = list.length > 4 ? [...list.slice(0, 3), `mais ${list.length - 3}`] : list;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : shown[0];
}

// Título com as contagens e corpo com quem chega e quem sai.
function summaryMessage({ checkins, checkouts }) {
  const count = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`;
  const title = [checkins.length && count(checkins.length, 'check-in'), checkouts.length && count(checkouts.length, 'check-out')].filter(Boolean).join(' e ');
  const body = [
    checkins.length && `${checkins.length === 1 ? 'Chega' : 'Chegam'} ${names(checkins)}`,
    checkouts.length && `${checkouts.length === 1 ? 'Sai' : 'Saem'} ${names(checkouts)}`,
  ].filter(Boolean).join(' · ');
  return { title: `Hoje: ${title}`, body };
}

async function sendDailySummaries() {
  try {
    if (new Date().getHours() < SUMMARY_HOUR) return;
    const today = localDateIso();

    // Só organizações com dispositivos subscritos
    const orgs = db.prepare('SELECT DISTINCT organization_id FROM push_subscriptions').all();
    for (const { organization_id: orgId } of orgs) {
      if (require('./settingsService').get(orgId, SENT_KEY) === today) continue;

      const pending = pendingToday(orgId, today);

      // Marcar como enviado mesmo sem nada a reportar — evita reavaliar o dia todo
      require('./settingsService').set(orgId, SENT_KEY, today);

      if (!pending.checkins.length && !pending.checkouts.length) continue;

      await require('./staffNotifier').push(orgId, 'daily_summary', {
        kind: 'summary', ...summaryMessage(pending), url: '/reservas', tag: 'sp-daily-summary',
      });
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

module.exports = { sendDailySummaries, summaryMessage, startScheduler, stopScheduler };
