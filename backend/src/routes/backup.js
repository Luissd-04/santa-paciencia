const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

const TABLES = ['accommodations', 'guests', 'reservations', 'email_templates', 'expenses', 'settings'];

// GET /api/backup/export
router.get('/export', (req, res) => {
  try {
    const data = {};
    for (const t of TABLES) {
      try { data[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch { data[t] = []; }
    }
    const filename = `santa_paciencia_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json({ exported_at: new Date().toISOString(), version: 1, tables: data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/backup/import
router.post('/import', (req, res) => {
  try {
    const { tables, version } = req.body;
    if (!tables) return res.status(400).json({ success: false, error: 'Ficheiro inválido: sem dados.' });

    const deleteOrder = ['reservations', 'expenses', 'email_templates', 'guests', 'accommodations', 'settings'];
    const insertOrder = ['settings', 'accommodations', 'guests', 'email_templates', 'expenses', 'reservations'];

    db.transaction(() => {
      for (const t of deleteOrder) {
        try { db.exec(`DELETE FROM ${t}`); } catch {}
      }
      for (const t of insertOrder) {
        const rows = tables[t];
        if (!rows || !rows.length) continue;
        const cols = Object.keys(rows[0]);
        const stmt = db.prepare(
          `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
        );
        for (const row of rows) stmt.run(cols.map(c => row[c] ?? null));
      }
    })();

    res.json({ success: true, message: 'Base de dados restaurada com sucesso.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
