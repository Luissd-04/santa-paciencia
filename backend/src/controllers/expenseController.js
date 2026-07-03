const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function getAll(req, res) {
  let query = 'SELECT * FROM expenses WHERE organization_id = ?';
  const params = [req.user.organization_id];
  if (req.query.month) { query += ' AND substr(date,1,7) = ?'; params.push(req.query.month); }
  if (req.query.year)  { query += ' AND substr(date,1,4) = ?'; params.push(req.query.year); }
  if (req.query.category) { query += ' AND category = ?'; params.push(req.query.category); }
  query += ' ORDER BY date DESC, created_at DESC';
  res.json({ success: true, data: db.prepare(query).all(...params) });
}

function getSummary(req, res) {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const thisYear  = now.toISOString().slice(0, 4);
  const orgId = req.user.organization_id;
  const monthTotal = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE organization_id = ? AND substr(date,1,7)=?").get(orgId, thisMonth).t;
  const yearTotal  = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE organization_id = ? AND substr(date,1,4)=?").get(orgId, thisYear).t;
  const allTotal   = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE organization_id = ?").get(orgId).t;
  const byCategory = db.prepare("SELECT category, COALESCE(SUM(amount),0) as total FROM expenses WHERE organization_id = ? AND substr(date,1,4)=? GROUP BY category ORDER BY total DESC").all(orgId, thisYear);
  res.json({ success: true, data: { monthTotal, yearTotal, allTotal, byCategory } });
}

function create(req, res) {
  const { date, description, category, amount, payment_method, notes, invoice_ref, supplier } = req.body;
  if (!date || !description || amount == null) {
    return res.status(400).json({ error: 'Data, descrição e valor são obrigatórios' });
  }
  const id = uuidv4().slice(0, 8);
  db.prepare('INSERT INTO expenses (id,organization_id,date,description,category,amount,payment_method,notes,invoice_ref,supplier) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.organization_id, date, description, category || 'outro', parseFloat(amount), payment_method || 'numerário', notes || null, invoice_ref || null, (supplier || '').trim() || null);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM expenses WHERE id=? AND organization_id = ?').get(id, req.user.organization_id) });
}

function update(req, res) {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id=? AND organization_id = ?').get(id, req.user.organization_id);
  if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

  const { date, description, category, amount, payment_method, notes, invoice_ref, supplier } = req.body;
  db.prepare(`UPDATE expenses SET
    date=COALESCE(?,date), description=COALESCE(?,description), category=COALESCE(?,category),
    amount=COALESCE(?,amount), payment_method=COALESCE(?,payment_method), notes=?, invoice_ref=?, supplier=?
    WHERE id=? AND organization_id = ?`).run(
    date ?? null, description ?? null, category ?? null,
    amount !== undefined ? parseFloat(amount) : null,
    payment_method ?? null, notes ?? null, invoice_ref ?? null,
    supplier !== undefined ? ((supplier || '').trim() || null) : existing.supplier,
    id, req.user.organization_id
  );
  res.json({ success: true, data: db.prepare('SELECT * FROM expenses WHERE id=? AND organization_id = ?').get(id, req.user.organization_id) });
}

function remove(req, res) {
  if (!db.prepare('SELECT id FROM expenses WHERE id=? AND organization_id = ?').get(req.params.id, req.user.organization_id)) {
    return res.status(404).json({ error: 'Despesa não encontrada' });
  }
  db.prepare('DELETE FROM expenses WHERE id=? AND organization_id = ?').run(req.params.id, req.user.organization_id);
  res.json({ success: true });
}

module.exports = { getAll, getSummary, create, update, remove };
