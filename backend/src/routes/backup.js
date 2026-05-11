const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const requireRole = require('../middleware/requireRole');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ORG_TABLES = [
  'organization_settings',
  'organization_email_templates',
  'organization_email_log',
  'accommodations',
  'guests',
  'expenses',
  'reservations'
];

const DELETE_ORDER = [
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
  'reservations'
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

  const memberships = db.prepare(`
    SELECT * FROM memberships
    WHERE organization_id = ?
  `).all(orgId);

  const invitations = db.prepare(`
    SELECT * FROM invitations
    WHERE organization_id = ?
  `).all(orgId);

  const users = db.prepare(`
    SELECT DISTINCT u.*
    FROM users u
    INNER JOIN memberships m ON m.user_id = u.id
    WHERE m.organization_id = ?
    ORDER BY u.created_at
  `).all(orgId);

  const organization = db.prepare(`
    SELECT id, name, slug, created_at, updated_at
    FROM organizations
    WHERE id = ?
  `).get(orgId);

  return {
    exported_at: new Date().toISOString(),
    version: 2,
    organization,
    tables,
    team: { users, memberships, invitations }
  };
}

function ensureTableRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function upsertImportedUsers(users = []) {
  const map = new Map();
  const findByEmail = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)');
  const findById = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateUser = db.prepare(`
    UPDATE users
    SET name = ?, email = ?, password_hash = ?, role = ?, active = ?, updated_at = ?
    WHERE id = ?
  `);

  for (const imported of users) {
    if (!imported?.email) continue;
    const existingByEmail = findByEmail.get(imported.email);
    const existingById = findById.get(imported.id);
    const target = existingByEmail || existingById;
    const targetId = target?.id || imported.id;

    if (target) {
      updateUser.run(
        imported.name || target.name,
        imported.email,
        target.password_hash,
        imported.role || target.role || 'admin',
        imported.active !== undefined ? imported.active : (target.active ?? 1),
        imported.updated_at || new Date().toISOString(),
        targetId
      );
    } else {
      insertUser.run(
        targetId,
        imported.name || imported.email,
        imported.email,
        imported.password_hash || '',
        imported.role || 'admin',
        imported.active !== undefined ? imported.active : 1,
        imported.created_at || new Date().toISOString(),
        imported.updated_at || new Date().toISOString()
      );
    }

    map.set(imported.id, targetId);
  }

  return map;
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
    const tables = payload.tables;
    const team = payload.team || {};
    if (!tables || typeof tables !== 'object') {
      cleanupTempDir(tempDir);
      return res.status(400).json({ success: false, error: 'Ficheiro inválido: sem dados.' });
    }

    const oldOrgUploads = getOrgUploadUrls(orgId);
    const otherOrgUploads = getOtherOrgUploadUrls(orgId);
    const importedUploadUrls = collectUploadUrlsFromAccommodations(ensureTableRows(tables.accommodations));
    const importedUploadsDir = path.join(extractDir, 'uploads');

    db.transaction(() => {
      const userIdMap = upsertImportedUsers(ensureTableRows(team.users));

      db.prepare('DELETE FROM invitations WHERE organization_id = ?').run(orgId);
      db.prepare('DELETE FROM memberships WHERE organization_id = ?').run(orgId);
      for (const table of DELETE_ORDER) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE organization_id = ?`).run(orgId);
        } catch {}
      }

      if (payload.organization?.name) {
        db.prepare(`
          UPDATE organizations
          SET name = ?, updated_at = ?
          WHERE id = ?
        `).run(payload.organization.name, new Date().toISOString(), orgId);
      }

      const memberships = ensureTableRows(team.memberships);
      if (memberships.length) {
        const cols = Object.keys(memberships[0]);
        const stmt = db.prepare(`INSERT OR REPLACE INTO memberships (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
        for (const row of memberships) {
          const scopedRow = {
            ...row,
            organization_id: orgId,
            user_id: userIdMap.get(row.user_id) || row.user_id,
            invited_by_user_id: row.invited_by_user_id ? (userIdMap.get(row.invited_by_user_id) || row.invited_by_user_id) : null
          };
          stmt.run(cols.map(c => scopedRow[c] ?? null));
        }
      }

      const invitations = ensureTableRows(team.invitations);
      if (invitations.length) {
        const cols = Object.keys(invitations[0]);
        const stmt = db.prepare(`INSERT OR REPLACE INTO invitations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
        for (const row of invitations) {
          const scopedRow = {
            ...row,
            organization_id: orgId,
            invited_by_user_id: row.invited_by_user_id ? (userIdMap.get(row.invited_by_user_id) || row.invited_by_user_id) : null
          };
          stmt.run(cols.map(c => scopedRow[c] ?? null));
        }
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
