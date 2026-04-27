const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function getAll(req, res) {
  let query = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];
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
  const monthTotal = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE substr(date,1,7)=?").get(thisMonth).t;
  const yearTotal  = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE substr(date,1,4)=?").get(thisYear).t;
  const allTotal   = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses").get().t;
  const byCategory = db.prepare("SELECT category, COALESCE(SUM(amount),0) as total FROM expenses WHERE substr(date,1,4)=? GROUP BY category ORDER BY total DESC").all(thisYear);
  res.json({ success: true, data: { monthTotal, yearTotal, allTotal, byCategory } });
}

function create(req, res) {
  const { date, description, category, amount, payment_method, notes } = req.body;
  if (!date || !description || amount == null) {
    return res.status(400).json({ error: 'Data, descrição e valor são obrigatórios' });
  }
  const id = uuidv4().slice(0, 8);
  db.prepare('INSERT INTO expenses (id,date,description,category,amount,payment_method,notes) VALUES (?,?,?,?,?,?,?)')
    .run(id, date, description, category || 'outro', parseFloat(amount), payment_method || 'numerário', notes || null);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM expenses WHERE id=?').get(id) });
}

function update(req, res) {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Despesa não encontrada' });

  const { date, description, category, amount, payment_method, notes } = req.body;
  db.prepare(`UPDATE expenses SET
    date=COALESCE(?,date), description=COALESCE(?,description), category=COALESCE(?,category),
    amount=COALESCE(?,amount), payment_method=COALESCE(?,payment_method), notes=?
    WHERE id=?`).run(
    date ?? null, description ?? null, category ?? null,
    amount !== undefined ? parseFloat(amount) : null,
    payment_method ?? null, notes ?? null, id
  );
  res.json({ success: true, data: db.prepare('SELECT * FROM expenses WHERE id=?').get(id) });
}

function remove(req, res) {
  if (!db.prepare('SELECT id FROM expenses WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ error: 'Despesa não encontrada' });
  }
  db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  res.json({ success: true });
}

module.exports = { getAll, getSummary, create, update, remove };
