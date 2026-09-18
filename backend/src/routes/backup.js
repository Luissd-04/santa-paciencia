const router = require('express').Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const archiver = require('archiver');
const requireRole = require('../middleware/requireRole');
const { exportData, prepareImport, restoreData, uploadUrls } = require('../services/backupData');
const { extractArchive } = require('../services/backupArchive');
const { UPLOADS_DIR, uploadPath, removeUnreferencedImage } = require('../services/mediaStorage');
router.use(requireRole('owner'));

router.get('/export', async (req, res, next) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-export-'));
  try {
    const payload = exportData(req.user.organization_id);
    const file = path.join(temporary, 'backup.zip');
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(file, { mode: 0o600 });
      const zip = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve); output.on('error', reject); zip.on('error', reject);
      zip.pipe(output);
      zip.append(JSON.stringify(payload), { name: 'backup.json' });
      for (const url of uploadUrls(payload.tables)) {
        const source = uploadPath(url);
        if (!fs.existsSync(source)) { zip.abort(); reject(new Error('Um ficheiro referenciado está em falta; backup incompleto recusado.')); return; }
        zip.file(source, { name: url.slice(1) });
      }
      zip.finalize().catch(reject);
    });
    res.download(file, `santa_paciencia_${new Date().toISOString().slice(0, 10)}.zip`, () => fs.rmSync(temporary, { recursive: true, force: true }));
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    next(error);
  }
});

router.post('/import', async (req, res) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-import-'));
  const created = [];
  let committed = false;
  try {
    const encoded = req.body?.archiveBase64;
    if (typeof encoded !== 'string' || !encoded || encoded.length > 100 * 1024 * 1024) throw new Error('Ficheiro ZIP em falta ou demasiado grande.');
    const payload = await extractArchive(Buffer.from(encoded, 'base64'), temporary);
    const org = req.user.organization_id;
    const tables = prepareImport(payload, org);
    const previous = uploadUrls(exportData(org).tables);
    const replacements = new Map();
    // Ficheiros novos imutáveis: nunca substituir um caminho de outra organização.
    for (const url of uploadUrls(tables)) {
      const source = path.join(temporary, url.slice(1));
      if (!fs.existsSync(source)) throw new Error('Backup incompleto: ficheiro referenciado em falta.');
      const relative = `${url.startsWith('/uploads/receipts/') ? 'receipts/' : ''}import_${randomUUID()}${path.extname(url)}`;
      const target = path.join(UPLOADS_DIR, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, 0o600); created.push(target);
      replacements.set(url, '/uploads/' + relative);
    }
    for (const row of tables.accommodations) {
      row.cover_image = replacements.get(row.cover_image) || row.cover_image;
      row.logo_url = replacements.get(row.logo_url) || row.logo_url;
      const images = JSON.parse(row.images || '{}');
      for (const [key, list] of Object.entries(images)) if (key !== '_sections' && Array.isArray(list)) images[key] = list.map(url => replacements.get(url) || url);
      row.images = JSON.stringify(images);
    }
    for (const row of tables.expenses) row.receipt_image = replacements.get(row.receipt_image) || row.receipt_image;
    restoreData(tables, org);
    committed = true;
    // A limpeza é posterior ao commit; ficheiros partilhados continuam protegidos.
    for (const url of previous) { try { removeUnreferencedImage(url); } catch (error) { console.warn('Limpeza de upload adiada:', error.code); } }
    res.json({ success: true, message: 'Dados e ficheiros restaurados com sucesso.' });
  } catch (error) {
    if (!committed) for (const file of created) fs.rmSync(file, { force: true });
    res.status(400).json({ success: false, error: error.message });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
module.exports = router;
