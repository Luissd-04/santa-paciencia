const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_TASK_SETTINGS_KEY = 'auto_task_settings';
const DEFAULT_AUTO_TASK_SETTINGS = {
  breakfast: true,
  cleaning: true,
  checkin: true,
  checkout: true,
};

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isActiveReservation(reservation) {
  return reservation && reservation.status !== 'cancelada';
}

function buildAutoKey(reservationId, kind, date, accommodationId) {
  return `${reservationId}:${kind}:${date}:${accommodationId || 'geral'}`;
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function getAutoTaskSettings(organizationId) {
  const row = db.prepare(`
    SELECT value FROM organization_settings
    WHERE organization_id = ? AND key = ?
  `).get(organizationId, AUTO_TASK_SETTINGS_KEY);
  return { ...DEFAULT_AUTO_TASK_SETTINGS, ...safeJson(row?.value, {}) };
}

function saveAutoTaskSettings(organizationId, settings = {}) {
  const next = { ...DEFAULT_AUTO_TASK_SETTINGS };
  Object.keys(next).forEach(key => {
    if (settings[key] !== undefined) next[key] = !!settings[key];
  });
  db.prepare(`
    INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(organizationId, AUTO_TASK_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function getAccommodationName(organizationId, accommodationId) {
  return db.prepare('SELECT name FROM accommodations WHERE id = ? AND organization_id = ?')
    .get(accommodationId, organizationId)?.name || 'alojamento';
}

function getGuestName(organizationId, guestId) {
  return db.prepare('SELECT name FROM guests WHERE id = ? AND organization_id = ?')
    .get(guestId, organizationId)?.name || 'hóspede';
}

function buildReservationTasks(reservation, settings = null) {
  if (!isActiveReservation(reservation)) return [];
  const taskSettings = settings || getAutoTaskSettings(reservation.organization_id);

  const organizationId = reservation.organization_id;
  const accommodationId = reservation.accommodation_id;
  const accommodationName = reservation.accommodation_name || getAccommodationName(organizationId, accommodationId);
  const guestName = reservation.guest_name || getGuestName(organizationId, reservation.guest_id);
  const baseNotes = `Reserva ${reservation.id} · ${guestName}`;
  const tasks = [];

  if (taskSettings.checkin) {
    tasks.push({
      kind: 'checkin',
      type: 'checkin',
      title: `Check-in · ${accommodationName}`,
      date: reservation.check_in,
      start_time: '09:00',
      end_time: '12:00',
      important: 0,
      notes: baseNotes,
    });
  }

  if (taskSettings.checkout) {
    tasks.push({
      kind: 'checkout',
      type: 'checkout',
      title: `Check-out · ${accommodationName}`,
      date: reservation.check_out,
      start_time: '09:00',
      end_time: '11:00',
      important: 0,
      notes: baseNotes,
    });
  }

  if (taskSettings.cleaning) {
    tasks.push({
      kind: 'cleaning',
      type: 'limpeza',
      title: `Limpeza · ${accommodationName}`,
      date: reservation.check_out,
      start_time: '14:00',
      end_time: '18:00',
      important: 1,
      notes: `${baseNotes} · limpeza após check-out`,
    });
  }

  if (taskSettings.breakfast && Number(reservation.breakfast_included)) {
    for (let date = addDays(reservation.check_in, 1); date <= reservation.check_out; date = addDays(date, 1)) {
      tasks.push({
        kind: 'breakfast',
        type: 'pequeno_almoco',
        title: `Pequeno-almoço · ${accommodationName}`,
        date,
        start_time: '08:00',
        end_time: '10:30',
        important: 0,
        notes: baseNotes,
      });
    }
  }

  return tasks.map(task => ({
    ...task,
    organization_id: organizationId,
    accommodation_id: accommodationId,
    reservation_id: reservation.id,
    auto_key: buildAutoKey(reservation.id, task.kind, task.date, accommodationId),
  }));
}

let insertTaskStmt = null;

function getInsertTaskStmt() {
  if (!insertTaskStmt) {
    insertTaskStmt = db.prepare(`
      INSERT OR IGNORE INTO operational_events (
        id, organization_id, title, type, date, start_time, end_time, accommodation_id,
        status, responsible, notes, reservation_id, created_by_user_id, completed_at,
        auto_generated, auto_kind, auto_key, important
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planeado', NULL, ?, ?, ?, NULL, 1, ?, ?, ?)
    `);
  }
  return insertTaskStmt;
}

// UPSERT por auto_key em vez de apagar+recriar. Crucial: preserva o google_event_id
// das tarefas existentes — se apagarmos e recriarmos com novo id, o Google perde o
// vínculo e cria eventos duplicados a cada sincronização.
const syncReservationTx = db.transaction((reservation, userId = null) => {
  const orgId = reservation.organization_id;
  const settings = getAutoTaskSettings(orgId);
  const desired = buildReservationTasks(reservation, settings);
  const desiredKeys = new Set(desired.map(t => t.auto_key));

  const existingRows = db.prepare(`
    SELECT id, auto_key, status FROM operational_events
    WHERE organization_id = ? AND reservation_id = ? AND auto_generated = 1
  `).all(orgId, reservation.id);
  const byKey = new Map(existingRows.map(r => [r.auto_key, r]));

  // Remover as auto-tarefas que já não fazem sentido (ex.: datas mudaram, opção
  // desligada), exceto as concluídas (mantidas para histórico).
  const delStmt = db.prepare('DELETE FROM operational_events WHERE id = ? AND organization_id = ?');
  for (const row of existingRows) {
    if (!desiredKeys.has(row.auto_key) && row.status !== 'concluido') {
      delStmt.run(row.id, orgId);
    }
  }

  // Atualizar as existentes (preservando id/google_event_id/estado) e inserir as novas.
  const updStmt = db.prepare(`
    UPDATE operational_events
    SET title = ?, type = ?, date = ?, start_time = ?, end_time = ?,
        accommodation_id = ?, notes = ?, important = ?, updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `);
  for (const task of desired) {
    const existing = byKey.get(task.auto_key);
    if (existing) {
      updStmt.run(
        task.title, task.type, task.date, task.start_time, task.end_time,
        task.accommodation_id, task.notes, task.important, existing.id, orgId
      );
    } else {
      getInsertTaskStmt().run(
        uuidv4(), task.organization_id, task.title, task.type, task.date,
        task.start_time, task.end_time, task.accommodation_id, task.notes,
        task.reservation_id, userId, task.kind, task.auto_key, task.important
      );
    }
  }
});

function syncReservationOperationalTasks(reservation, userId = null) {
  if (!reservation?.id || !reservation.organization_id) return;
  syncReservationTx(reservation, userId);
}

function syncOrganizationOperationalTasks(organizationId) {
  const reservations = db.prepare(`
    SELECT r.*, g.name AS guest_name, a.name AS accommodation_name
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
    JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
    WHERE r.organization_id = ?
  `).all(organizationId);

  const tx = db.transaction(rows => {
    rows.forEach(row => syncReservationTx(row, null));
  });
  tx(reservations);
}

module.exports = {
  syncReservationOperationalTasks,
  syncOrganizationOperationalTasks,
  buildReservationTasks,
  getAutoTaskSettings,
  saveAutoTaskSettings,
};
