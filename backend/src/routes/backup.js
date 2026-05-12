const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const requireRole = require('../middleware/requireRole');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ORG_TABLES = [
  'organization_settings',
  'organization_email_templates',
  'organization_email_log',
  'accommodations',
  'guests',
  'expenses',
  'reservations',
  'operational_events'
];

const DELETE_ORDER = [
  'operational_events',
  'reservations',
  'expenses',
  'organization_email_log',
  'organization_email_templates',
  'guests',
  'accommodations',
  'organization_settings'
];

const INSERT_ORDER = [
  'organization_settings',
  'organization_email_templates',
  'organization_email_log',
  'accommodations',
  'guests',
  'expenses',
  'reservations',
  'operational_events'
];

const UPLOADS_DIR = path.resolve('./data/uploads');

router.use(requireRole('owner'));

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function collectUploadUrlsFromAccommodations(rows = []) {
  const urls = new Set();
  for (const row of rows) {
    if (row.cover_image && String(row.cover_image).startsWith('/uploads/')) {
      urls.add(row.cover_image);
    }
    const images = safeJson(row.images, {});
    Object.values(images).forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach(url => {
        if (typeof url === 'string' && url.startsWith('/uploads/')) urls.add(url);
      });
    });
  }
  return urls;
}

function getOrgUploadUrls(orgId) {
  const rows = db.prepare('SELECT cover_image, images FROM accommodations WHERE organization_id = ?').all(orgId);
  return collectUploadUrlsFromAccommodations(rows);
}

function getOtherOrgUploadUrls(orgId) {
  const rows = db.prepare('SELECT cover_image, images FROM accommodations WHERE organization_id != ?').all(orgId);
  return collectUploadUrlsFromAccommodations(rows);
}

function copyReferencedUploads(uploadUrls, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const uploadUrl of uploadUrls) {
    const filename = path.basename(uploadUrl);
    const sourcePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(sourcePath)) continue;
    fs.copyFileSync(sourcePath, path.join(targetDir, filename));
  }
}

function cleanupTempDir(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function buildBackupPayload(orgId) {
  const tables = {};
  for (const table of ORG_TABLES) {
    try {
      tables[table] = db.prepare(`SELECT * FROM ${table} WHERE organization_id = ?`).all(orgId);
    } catch {
      tables[table] = [];
    }
  }

  return {
    exported_at: new Date().toISOString(),
    version: 3,
    scope: 'client-data',
    tables
  };
}

function ensureTableRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function tableHasId(table) {
  try {
    return db.pragma(`table_info(${table})`).some(col => col.name === 'id');
  } catch {
    return false;
  }
}

function idBelongsToOtherOrg(table, id, orgId) {
  if (!id || !tableHasId(table)) return false;
  try {
    const row = db.prepare(`SELECT organization_id FROM ${table} WHERE id = ?`).get(id);
    return !!row && row.organization_id !== orgId;
  } catch {
    return false;
  }
}

function makeImportedId(table, oldId) {
  if (table === 'reservations') return `${oldId}-IMP-${crypto.randomBytes(3).toString('hex')}`;
  return crypto.randomUUID();
}

function remapImportedRowsForOrg(tables, orgId) {
  const next = {};
  for (const table of Object.keys(tables || {})) {
    next[table] = ensureTableRows(tables[table]).map(row => ({ ...row }));
  }

  const maps = {
    accommodations: new Map(),
    guests: new Map(),
    reservations: new Map(),
    expenses: new Map(),
    operational_events: new Map(),
    organization_email_log: new Map(),
  };

  for (const table of Object.keys(maps)) {
    for (const row of ensureTableRows(next[table])) {
      if (idBelongsToOtherOrg(table, row.id, orgId)) {
        const newId = makeImportedId(table, row.id);
        maps[table].set(row.id, newId);
        row.id = newId;
      }
    }
  }

  for (const row of ensureTableRows(next.accommodations)) {
    if (maps.accommodations.has(row.parent_id)) row.parent_id = maps.accommodations.get(row.parent_id);
  }
  for (const row of ensureTableRows(next.reservations)) {
    if (maps.guests.has(row.guest_id)) row.guest_id = maps.guests.get(row.guest_id);
    if (maps.accommodations.has(row.accommodation_id)) row.accommodation_id = maps.accommodations.get(row.accommodation_id);
    if (row.google_event_id) row.google_event_id = null;
    if (row.google_calendar_user_id) row.google_calendar_user_id = null;
  }
  for (const row of ensureTableRows(next.operational_events)) {
    if (maps.accommodations.has(row.accommodation_id)) row.accommodation_id = maps.accommodations.get(row.accommodation_id);
    if (maps.reservations.has(row.reservation_id)) row.reservation_id = maps.reservations.get(row.reservation_id);
    if (row.auto_key && row.reservation_id) {
      const parts = String(row.auto_key).split(':');
      if (parts.length >= 4) {
        parts[0] = row.reservation_id;
        parts[3] = row.accommodation_id || 'geral';
        row.auto_key = parts.join(':');
      }
    }
  }
  for (const row of ensureTableRows(next.organization_email_log)) {
    if (maps.reservations.has(row.reservation_id)) row.reservation_id = maps.reservations.get(row.reservation_id);
  }

  return next;
}

// GET /api/backup/export
router.get('/export', (req, res) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-export-'));
  try {
    const orgId = req.user.organization_id;
    const payload = buildBackupPayload(orgId);
    const jsonPath = path.join(tempDir, 'backup.json');
    const uploadsTempDir = path.join(tempDir, 'uploads');
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    copyReferencedUploads(collectUploadUrlsFromAccommodations(payload.tables.accommodations), uploadsTempDir);

    const zipPath = path.join(tempDir, 'backup.zip');
    execFileSync('/usr/bin/zip', ['-rq', zipPath, 'backup.json', 'uploads'], { cwd: tempDir });

    const filename = `santa_paciencia_${new Date().toISOString().slice(0, 10)}.zip`;
    res.download(zipPath, filename, () => cleanupTempDir(tempDir));
  } catch (e) {
    cleanupTempDir(tempDir);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/backup/import
router.post('/import', (req, res) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-import-'));
  try {
    const orgId = req.user.organization_id;
    const { archiveBase64 } = req.body || {};
    if (!archiveBase64) {
      cleanupTempDir(tempDir);
      return res.status(400).json({ success: false, error: 'Ficheiro ZIP em falta.' });
    }

    const zipPath = path.join(tempDir, 'backup.zip');
    const extractDir = path.join(tempDir, 'unzipped');
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(zipPath, Buffer.from(String(archiveBase64), 'base64'));

    execFileSync('/usr/bin/unzip', ['-oq', zipPath, '-d', extractDir]);

    const jsonPath = path.join(extractDir, 'backup.json');
    if (!fs.existsSync(jsonPath)) {
      cleanupTempDir(tempDir);
      return res.status(400).json({ success: false, error: 'ZIP inválido: falta o ficheiro backup.json.' });
    }

    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let tables = payload.tables;
    if (!tables || typeof tables !== 'object') {
      cleanupTempDir(tempDir);
      return res.status(400).json({ success: false, error: 'Ficheiro inválido: sem dados.' });
    }
    tables = remapImportedRowsForOrg(tables, orgId);

    const oldOrgUploads = getOrgUploadUrls(orgId);
    const otherOrgUploads = getOtherOrgUploadUrls(orgId);
    const importedUploadUrls = collectUploadUrlsFromAccommodations(ensureTableRows(tables.accommodations));
    const importedUploadsDir = path.join(extractDir, 'uploads');

    db.transaction(() => {
      for (const table of DELETE_ORDER) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE organization_id = ?`).run(orgId);
        } catch {}
      }

      for (const table of INSERT_ORDER) {
        const rows = ensureTableRows(tables[table]);
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
        for (const row of rows) {
          const scopedRow = { ...row, organization_id: orgId };
          stmt.run(cols.map(c => scopedRow[c] ?? null));
        }
      }
    })();

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    for (const uploadUrl of oldOrgUploads) {
      if (otherOrgUploads.has(uploadUrl) || importedUploadUrls.has(uploadUrl)) continue;
      const oldPath = path.join(UPLOADS_DIR, path.basename(uploadUrl));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    for (const uploadUrl of importedUploadUrls) {
      const sourcePath = path.join(importedUploadsDir, path.basename(uploadUrl));
      if (!fs.existsSync(sourcePath)) continue;
      fs.copyFileSync(sourcePath, path.join(UPLOADS_DIR, path.basename(uploadUrl)));
    }

    cleanupTempDir(tempDir);
    res.json({ success: true, message: 'Base de dados restaurada com sucesso.' });
  } catch (e) {
    cleanupTempDir(tempDir);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
