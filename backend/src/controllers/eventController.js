const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  getAutoTaskSettings,
  saveAutoTaskSettings,
  syncOrganizationOperationalTasks,
} = require('../services/operationalTasksService');
const { deleteTaskCalendarEvent, syncOperationalEventsToGoogle } = require('../services/calendarService');
const { deleteSyncedTask } = require('../config/googleTasks');
const { listEvents } = require('../services/listQueries');

// Sincroniza um evento operacional com o Google Calendar e/ou o Google Tasks — ver
// syncOperationalEventsToGoogle em services/calendarService.js (cada destino tem a
// sua própria definição de organização, "Sincronizar com o Google Calendar/Tasks").
function syncTaskToGoogle(task, userId, orgId) {
  syncOperationalEventsToGoogle([task], { userId, organizationId: orgId })
    .catch(err => console.error('Erro ao sincronizar evento com o Google:', err.message));
}

const { VALID_EVENT_TYPES: VALID_TYPES } = require('../config/eventTypes');
const VALID_STATUS = new Set(['planeado', 'concluido']);

function normalizeDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeTime(value) {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
}

function normalizePayload(body = {}, existing = {}) {
  const status = VALID_STATUS.has(body.status) ? body.status : (existing.status || 'planeado');
  return {
    title: String(body.title ?? existing.title ?? '').trim(),
    type: VALID_TYPES.has(body.type) ? body.type : (existing.type || 'outro'),
    date: normalizeDate(body.date ?? existing.date),
    start_time: normalizeTime(body.start_time ?? existing.start_time),
    end_time: normalizeTime(body.end_time ?? existing.end_time),
    accommodation_id: body.accommodation_id !== undefined ? (body.accommodation_id || null) : (existing.accommodation_id || null),
    status,
    responsible: body.responsible !== undefined ? (String(body.responsible || '').trim() || null) : (existing.responsible || null),
    notes: body.notes !== undefined ? (String(body.notes || '').trim() || null) : (existing.notes || null),
    reservation_id: body.reservation_id !== undefined ? (body.reservation_id || null) : (existing.reservation_id || null),
    important: body.important !== undefined ? (body.important ? 1 : 0) : (existing.important || 0),
    completed_at: status === 'concluido'
      ? (existing.completed_at || new Date().toISOString())
      : null,
  };
}

// GET /api/events — filtros, pesquisa, ordenação e paginação no servidor.
// Devolve { data, pagination, summary }; os consumidores que só querem os
// eventos de uma reserva continuam a ler `data`.
function getAll(req, res, next) {
  try {
    res.json({ success: true, ...listEvents(req.user.organization_id, req.query) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
}

function create(req, res) {
  const orgId = req.user.organization_id;
  const data = normalizePayload(req.body);
  if (!data.title || !data.date) return res.status(400).json({ error: 'Título e data são obrigatórios' });

  if (data.accommodation_id) {
    const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(data.accommodation_id, orgId);
    if (!acc) return res.status(404).json({ error: 'Alojamento não encontrado' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO operational_events (
      id, organization_id, title, type, date, start_time, end_time, accommodation_id,
      status, responsible, notes, reservation_id, created_by_user_id, completed_at, important
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orgId, data.title, data.type, data.date, data.start_time, data.end_time,
    data.accommodation_id, data.status, data.responsible, data.notes, data.reservation_id,
    req.user.id, data.completed_at, data.important
  );

  const created = db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(id, orgId);
  res.status(201).json({ success: true, data: created });
  syncTaskToGoogle(created, req.user.id, orgId);
}

function update(req, res) {
  const orgId = req.user.organization_id;
  const existing = db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });

  const data = normalizePayload(req.body, existing);
  if (!data.title || !data.date) return res.status(400).json({ error: 'Título e data são obrigatórios' });

  if (data.accommodation_id) {
    const acc = db.prepare('SELECT id FROM accommodations WHERE id = ? AND organization_id = ?').get(data.accommodation_id, orgId);
    if (!acc) return res.status(404).json({ error: 'Alojamento não encontrado' });
  }

  db.prepare(`
    UPDATE operational_events SET
      title = ?, type = ?, date = ?, start_time = ?, end_time = ?, accommodation_id = ?,
      status = ?, responsible = ?, notes = ?, reservation_id = ?, completed_at = ?, important = ?,
      updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(
    data.title, data.type, data.date, data.start_time, data.end_time, data.accommodation_id,
    data.status, data.responsible, data.notes, data.reservation_id, data.completed_at, data.important,
    req.params.id, orgId
  );

  const updated = db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  res.json({ success: true, data: updated });
  syncTaskToGoogle(updated, req.user.id, orgId);
}

function remove(req, res) {
  const orgId = req.user.organization_id;
  const existing = db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });
  db.prepare('DELETE FROM operational_events WHERE id = ? AND organization_id = ?').run(req.params.id, orgId);
  res.json({ success: true });
  if (existing.google_event_id) {
    deleteTaskCalendarEvent(existing, { userId: existing.google_calendar_user_id, organizationId: orgId })
      .catch(err => console.error('Erro ao remover evento de tarefa do Google Calendar:', err.message));
  }
  if (existing.google_task_id) {
    deleteSyncedTask(orgId, existing.google_task_id)
      .catch(err => console.error('Erro ao remover tarefa do Google Tasks:', err.message));
  }
}

function getSettings(req, res) {
  try {
    res.json({ success: true, data: getAutoTaskSettings(req.user.organization_id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao carregar definições.' });
  }
}

function saveSettings(req, res) {
  try {
    const settings = saveAutoTaskSettings(req.user.organization_id, req.body || {});
    syncOrganizationOperationalTasks(req.user.organization_id);
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Erro ao guardar definições.' });
  }
}

module.exports = { getAll, create, update, remove, getSettings, saveSettings };
