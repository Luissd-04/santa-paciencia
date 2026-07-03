const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { scanReceipt: scanReceiptAI } = require('../services/receiptScanService');

const RECEIPTS_DIR = path.resolve('./data/uploads/receipts');
if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const RECEIPT_MIME_EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };

// Analisa uma data URI de imagem -> { mediaType, base64, buffer, ext } ou null.
function parseReceiptImage(dataUri) {
  const m = String(dataUri || '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const ext = RECEIPT_MIME_EXT[type];
  if (!ext) return null;
  return { mediaType: `image/${type === 'jpg' ? 'jpeg' : type}`, base64: m[2], buffer: Buffer.from(m[2], 'base64'), ext };
}

// Guarda a imagem do talão em disco e devolve o URL público, ou null.
function saveReceiptImage(dataUri) {
  const parsed = parseReceiptImage(dataUri);
  if (!parsed) return null;
  const filename = `receipt_${uuidv4().slice(0, 8)}_${Date.now()}.${parsed.ext}`;
  fs.writeFileSync(path.join(RECEIPTS_DIR, filename), parsed.buffer);
  return `/uploads/receipts/${filename}`;
}

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
  const { date, description, category, amount, payment_method, notes, invoice_ref, supplier, image } = req.body;
  if (!date || !description || amount == null) {
    return res.status(400).json({ error: 'Data, descrição e valor são obrigatórios' });
  }
  const receiptImage = image ? saveReceiptImage(image) : null;
  const id = uuidv4().slice(0, 8);
  db.prepare('INSERT INTO expenses (id,organization_id,date,description,category,amount,payment_method,notes,invoice_ref,supplier,receipt_image) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.organization_id, date, description, category || 'outro', parseFloat(amount), payment_method || 'numerário', notes || null, invoice_ref || null, (supplier || '').trim() || null, receiptImage);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM expenses WHERE id=? AND organization_id = ?').get(id, req.user.organization_id) });
}

// POST /api/expenses/scan-receipt — lê a foto do talão via IA e devolve os campos.
async function scanReceipt(req, res, next) {
  try {
    const parsed = parseReceiptImage(req.body.image);
    if (!parsed) return res.status(400).json({ error: 'Imagem inválida. Envia uma foto (JPEG, PNG ou WebP).' });
    const data = await scanReceiptAI({ base64: parsed.base64, mediaType: parsed.mediaType });
    if (!data.items.length) {
      return res.status(422).json({ error: 'Não foram encontrados artigos no talão. Tenta uma foto mais nítida.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

// POST /api/expenses/bulk — grava várias despesas de uma vez (ex.: linhas de um talão),
// guardando a foto uma vez e associando-a a todas.
function bulkCreate(req, res) {
  const orgId = req.user.organization_id;
  const expenses = Array.isArray(req.body.expenses) ? req.body.expenses : [];
  if (!expenses.length) return res.status(400).json({ error: 'Sem despesas para gravar.' });
  for (const e of expenses) {
    if (!e.date || !e.description || e.amount == null) {
      return res.status(400).json({ error: 'Cada despesa precisa de data, descrição e valor.' });
    }
  }
  const receiptImage = req.body.image ? saveReceiptImage(req.body.image) : null;
  const insert = db.prepare('INSERT INTO expenses (id,organization_id,date,description,category,amount,payment_method,notes,invoice_ref,supplier,receipt_image) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const ids = [];
  db.transaction(() => {
    for (const e of expenses) {
      const id = uuidv4().slice(0, 8);
      insert.run(id, orgId, e.date, e.description, e.category || 'outro', parseFloat(e.amount),
        e.payment_method || 'numerário', e.notes || null, e.invoice_ref || null,
        (e.supplier || '').trim() || null, receiptImage);
      ids.push(id);
    }
  })();
  const rows = ids.map(id => db.prepare('SELECT * FROM expenses WHERE id=? AND organization_id = ?').get(id, orgId));
  res.status(201).json({ success: true, data: rows, count: rows.length });
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

module.exports = { getAll, getSummary, create, update, remove, scanReceipt, bulkCreate };
