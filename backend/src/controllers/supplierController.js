const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function getAll(req, res) {
  const rows = db.prepare(
    'SELECT * FROM suppliers WHERE organization_id = ? ORDER BY name COLLATE NOCASE ASC'
  ).all(req.user.organization_id);
  res.json({ success: true, data: rows });
}

function create(req, res) {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'O nome do fornecedor é obrigatório' });

  const orgId = req.user.organization_id;
  const dup = db.prepare(
    'SELECT id FROM suppliers WHERE organization_id = ? AND name = ? COLLATE NOCASE'
  ).get(orgId, name);
  if (dup) return res.status(409).json({ error: 'Já existe um fornecedor com esse nome' });

  const id = uuidv4().slice(0, 8);
  db.prepare('INSERT INTO suppliers (id, organization_id, name) VALUES (?, ?, ?)').run(id, orgId, name);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM suppliers WHERE id=? AND organization_id=?').get(id, orgId) });
}

function update(req, res) {
  const { id } = req.params;
  const orgId = req.user.organization_id;
  const existing = db.prepare('SELECT * FROM suppliers WHERE id=? AND organization_id=?').get(id, orgId);
  if (!existing) return res.status(404).json({ error: 'Fornecedor não encontrado' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'O nome do fornecedor é obrigatório' });

  const dup = db.prepare(
    'SELECT id FROM suppliers WHERE organization_id = ? AND name = ? COLLATE NOCASE AND id != ?'
  ).get(orgId, name, id);
  if (dup) return res.status(409).json({ error: 'Já existe um fornecedor com esse nome' });

  db.prepare("UPDATE suppliers SET name=?, updated_at=datetime('now') WHERE id=? AND organization_id=?").run(name, id, orgId);
  res.json({ success: true, data: db.prepare('SELECT * FROM suppliers WHERE id=? AND organization_id=?').get(id, orgId) });
}

function remove(req, res) {
  const orgId = req.user.organization_id;
  if (!db.prepare('SELECT id FROM suppliers WHERE id=? AND organization_id=?').get(req.params.id, orgId)) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  db.prepare('DELETE FROM suppliers WHERE id=? AND organization_id=?').run(req.params.id, orgId);
  res.json({ success: true });
}

// POST /api/suppliers/seed — insere sugestões que ainda não existam
function seed(req, res) {
  const orgId = req.user.organization_id;
  const suggestions = Array.isArray(req.body.names) ? req.body.names : [];
  const insert = db.prepare('INSERT INTO suppliers (id, organization_id, name) VALUES (?, ?, ?)');
  const exists = db.prepare('SELECT id FROM suppliers WHERE organization_id=? AND name=? COLLATE NOCASE');
  let added = 0;
  const tx = db.transaction(() => {
    for (const raw of suggestions) {
      const name = String(raw || '').trim();
      if (!name || exists.get(orgId, name)) continue;
      insert.run(uuidv4().slice(0, 8), orgId, name);
      added++;
    }
  });
  tx();
  const rows = db.prepare('SELECT * FROM suppliers WHERE organization_id = ? ORDER BY name COLLATE NOCASE ASC').all(orgId);
  res.json({ success: true, added, data: rows });
}

module.exports = { getAll, create, update, remove, seed };
