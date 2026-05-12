const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  getAutoTaskSettings,
  saveAutoTaskSettings,
  syncOrganizationOperationalTasks,
} = require('../services/operationalTasksService');

const VALID_TYPES = new Set(['limpeza', 'reuniao', 'pequeno_almoco', 'checkin', 'checkout', 'manutencao', 'outro']);
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

function getAll(req, res) {
  const orgId = req.user.organization_id;
  syncOrganizationOperationalTasks(orgId);
  let query = `
    SELECT e.*, a.name AS accommodation_name, u.name AS created_by_name
    FROM operational_events e
    LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
    LEFT JOIN users u ON u.id = e.created_by_user_id
    WHERE e.organization_id = ?
  `;
  const params = [orgId];
  if (req.query.type) { query += ' AND e.type = ?'; params.push(req.query.type); }
  if (req.query.status) { query += ' AND e.status = ?'; params.push(req.query.status); }
  if (req.query.accommodation_id) { query += ' AND e.accommodation_id = ?'; params.push(req.query.accommodation_id); }
  if (req.query.from) { query += ' AND e.date >= ?'; params.push(req.query.from); }
  if (req.query.to) { query += ' AND e.date <= ?'; params.push(req.query.to); }
  query += " ORDER BY e.date ASC, COALESCE(e.start_time, '99:99') ASC, e.created_at ASC";
  res.json({ success: true, data: db.prepare(query).all(...params) });
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

  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(id, orgId) });
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

  res.json({ success: true, data: db.prepare('SELECT * FROM operational_events WHERE id = ? AND organization_id = ?').get(req.params.id, orgId) });
}

function remove(req, res) {
  const orgId = req.user.organization_id;
  const existing = db.prepare('SELECT id FROM operational_events WHERE id = ? AND organization_id = ?').get(req.params.id, orgId);
  if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });
  db.prepare('DELETE FROM operational_events WHERE id = ? AND organization_id = ?').run(req.params.id, orgId);
  res.json({ success: true });
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
