// Acontecimentos de uma reserva e o despacho dos seus efeitos.
//
// emit() grava o acontecimento e os efeitos pedidos (reservationEffects) na
// transação de quem o chama: se a alteração for desfeita, nada é enviado.
// Depois do commit, dispatchPending() corre cada efeito uma vez; uma falha é
// repetida mais tarde (também pelo scheduler das reservas) sem repetir os
// efeitos que já correram.
const { randomUUID } = require('crypto');
const { db } = require('../config/database');

const MAX_ATTEMPTS = 6;
// Espera antes de cada nova tentativa, em minutos.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];

function emit(type, { organizationId, reservationId, actorUserId = null, payload = {} }) {
  const effects = require('./reservationEffects').effectsFor(type, payload);
  if (!effects.length) return null;
  const id = randomUUID();
  db.prepare('INSERT INTO reservation_events (id, organization_id, reservation_id, type, actor_user_id, payload) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, organizationId, reservationId, type, actorUserId, JSON.stringify(payload));
  const insert = db.prepare('INSERT INTO reservation_event_effects (event_id, effect) VALUES (?, ?)');
  for (const effect of effects) insert.run(id, effect);
  scheduleDispatch();
  // Pedidos do site, pagamentos online, expirações…: o sino das páginas abertas atualiza-se.
  require('./liveUpdates').publish(organizationId);
  return id;
}

let scheduled = false;
function scheduleDispatch() {
  if (scheduled || process.env.RESERVATION_EVENTS_DISPATCH === 'manual') return;
  scheduled = true;
  // Corre depois do commit da transação síncrona que emitiu o acontecimento.
  setImmediate(() => {
    scheduled = false;
    dispatchPending().catch(err => console.warn('Efeitos de reserva pendentes:', err.message));
  });
}

let running = null;
// Uma só passagem de cada vez; quem chamar durante uma passagem espera por ela
// e faz outra a seguir, para apanhar efeitos entretanto gravados.
async function dispatchPending() {
  if (running) {
    await running.catch(() => {});
    if (running) return running;
  }
  running = runPending().finally(() => { running = null; });
  return running;
}

async function runPending() {
  if (!db.open) return 0;
  const due = db.prepare(`SELECT f.event_id, f.effect, f.attempts, e.*
    FROM reservation_event_effects f JOIN reservation_events e ON e.id = f.event_id
    WHERE f.state = 'pending' AND f.next_attempt_at <= datetime('now')
    ORDER BY e.created_at, e.rowid, f.rowid LIMIT 200`).all();
  const { runEffect } = require('./reservationEffects');
  let done = 0;
  for (const row of due) {
    if (!db.open) break;
    const claimed = db.prepare(`UPDATE reservation_event_effects SET state = 'running', attempts = attempts + 1, updated_at = datetime('now')
      WHERE event_id = ? AND effect = ? AND state = 'pending'`).run(row.event_id, row.effect).changes;
    if (!claimed) continue;
    try {
      await runEffect(row.effect, {
        id: row.event_id, type: row.type, organizationId: row.organization_id, reservationId: row.reservation_id,
        actorUserId: row.actor_user_id, payload: JSON.parse(row.payload || '{}'),
      });
      if (!db.open) break;
      db.prepare("UPDATE reservation_event_effects SET state = 'done', last_error = NULL, updated_at = datetime('now') WHERE event_id = ? AND effect = ?")
        .run(row.event_id, row.effect);
      done++;
    } catch (err) {
      if (!db.open) break;
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      db.prepare(`UPDATE reservation_event_effects SET state = ?, last_error = ?,
        next_attempt_at = datetime('now', ?), updated_at = datetime('now') WHERE event_id = ? AND effect = ?`)
        .run(failed ? 'failed' : 'pending', String(err.message || err).slice(0, 500),
          `+${BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]} minutes`, row.event_id, row.effect);
      console.warn(JSON.stringify({ event: 'reservation_effect_failed', effect: row.effect, bookingId: row.reservation_id, attempts, final: failed }));
      if (failed) require('./liveUpdates').publish(row.organization_id);
    }
  }
  return done;
}

// Um reinício a meio de um efeito deixa-o «running»: volta à fila. Os emails
// ao hóspede têm o seu próprio registo de entrega e não são repetidos às cegas.
function recoverInterrupted() {
  db.prepare("UPDATE reservation_event_effects SET state = 'pending' WHERE state = 'running' AND updated_at < datetime('now', '-10 minutes')").run();
}

module.exports = { emit, dispatchPending, recoverInterrupted, MAX_ATTEMPTS };
