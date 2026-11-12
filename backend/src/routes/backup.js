const router = require('express').Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const archiver = require('archiver');
const requireRole = require('../middleware/requireRole');
const { exportData, prepareImport, restoreData, uploadUrls, supportFileNames } = require('../services/backupData');
const { SUPPORT_DIR, MAX_BYTES, STORED_NAME, detectType } = require('../services/supportAttachments');
const { organizationPlan } = require('../services/plansService');
const { extractArchive } = require('../services/backupArchive');
const { UPLOADS_DIR, uploadPath, removeUnreferencedImage, detectImageMagicType } = require('../services/mediaStorage');
const { recordAudit } = require('../services/auditLog');
const { validateImage } = require('../services/imageOptimizer');
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
      for (const name of supportFileNames(payload.tables)) {
        const source = path.join(SUPPORT_DIR, name);
        if (!STORED_NAME.test(name) || !fs.existsSync(source)) { zip.abort(); reject(new Error('Um anexo de suporte está em falta; backup incompleto recusado.')); return; }
        zip.file(source, { name: `uploads/support/${name}` });
      }
      zip.finalize().catch(reject);
    });
    recordAudit({ organizationId: req.user.organization_id, userId: req.user.id, action: 'backup.exported',
      meta: { reservations: payload.tables.reservations.length, guests: payload.tables.guests.length, support_tickets: payload.tables.support_tickets.length } });
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
    // O restauro não pode deixar a organização acima do pacote: alojamentos
    // passam a ser os do backup; os membros não mudam (o backup não os traz).
    const plan = organizationPlan(org);
    if (plan) {
      const result = { accommodations: tables.accommodations.length, members: plan.usage.members };
      for (const [kind, label] of [['accommodations', 'alojamentos'], ['members', 'membros']]) {
        const max = plan[`max_${kind}`];
        if (max !== null && max !== undefined && result[kind] > max) {
          throw Object.assign(new Error(`O backup ultrapassa o limite de ${max} ${label} do pacote «${plan.name}». Nada foi restaurado.`), { status: 403, limit: kind });
        }
      }
    }
    const previousData = exportData(org);
    const previous = uploadUrls(previousData.tables);
    const previousSupport = tables.support_tickets ? supportFileNames(previousData.tables) : [];
    const replacements = new Map();
    // Validar TODAS as imagens antes de copiar ou gravar o que quer que seja:
    // um ficheiro corrompido recusa o restauro inteiro, sem tocar no que já existe.
    for (const url of uploadUrls(tables)) {
      const source = path.join(temporary, url.slice(1));
      if (!fs.existsSync(source)) throw new Error('Backup incompleto: ficheiro referenciado em falta.');
      // Os uploads são servidos na origem da aplicação: só imagens verdadeiras,
      // nunca HTML/SVG ou outro conteúdo com extensão arbitrária.
      const content = fs.readFileSync(source);
      if (!/\.(jpe?g|png|gif|webp|avif)$/i.test(url) || !detectImageMagicType(content)) {
        throw new Error('Backup inválido: ficheiro que não é uma imagem suportada.');
      }
      // Mesma validação dos uploads normais: descodificação completa e limite de pixéis.
      try { await validateImage(content); } catch {
        throw new Error('Backup inválido: imagem corrompida, incompleta ou com dimensões excessivas.');
      }
    }
    // Anexos de suporte: mesmas regras de quando são enviados (tipo real pelos
    // primeiros bytes, até 10 MB, extensão coerente), tudo antes de gravar.
    for (const item of tables.support_files || []) {
      const source = path.join(temporary, 'uploads/support', item.from);
      if (!fs.existsSync(source)) throw new Error('Backup incompleto: anexo de suporte em falta.');
      const size = fs.statSync(source).size;
      if (!size || size > MAX_BYTES) throw new Error('Backup inválido: anexo de suporte vazio ou com mais de 10 MB.');
      const type = detectType(fs.readFileSync(source));
      if (!type || path.extname(item.from) !== `.${type.ext}`) throw new Error('Backup inválido: anexo de suporte com formato não suportado ou corrompido.');
      item.row.mime = type.mime; item.row.size = size;
    }
    // Ficheiros novos imutáveis: nunca substituir um caminho de outra organização.
    for (const url of uploadUrls(tables)) {
      const source = path.join(temporary, url.slice(1));
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
    for (const item of tables.support_files || []) {
      fs.mkdirSync(SUPPORT_DIR, { recursive: true });
      const target = path.join(SUPPORT_DIR, item.to);
      fs.copyFileSync(path.join(temporary, 'uploads/support', item.from), target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, 0o600); created.push(target);
    }
    for (const row of tables.expenses) row.receipt_image = replacements.get(row.receipt_image) || row.receipt_image;
    restoreData(tables, org);
    committed = true;
    recordAudit({ organizationId: org, userId: req.user.id, action: 'backup.restored',
      meta: { version: payload.version, reservations: tables.reservations.length, guests: tables.guests.length, uploads: replacements.size, support_tickets: tables.support_tickets?.length ?? null } });
    // A limpeza é posterior ao commit; ficheiros partilhados continuam protegidos.
    for (const name of previousSupport) { try { fs.rmSync(path.join(SUPPORT_DIR, name), { force: true }); } catch (error) { console.warn('Limpeza de anexo adiada:', error.code); } }
    for (const url of previous) { try { removeUnreferencedImage(url); } catch (error) { console.warn('Limpeza de upload adiada:', error.code); } }
    res.json({ success: true, message: 'Dados e ficheiros restaurados com sucesso.' });
  } catch (error) {
    if (!committed) for (const file of created) fs.rmSync(file, { force: true });
    if (!committed) recordAudit({ organizationId: req.user.organization_id, userId: req.user.id, action: 'backup.restore_rejected' });
    res.status(error.status === 403 ? 403 : 400).json({ success: false, error: error.message, ...(error.status === 403 ? { limit: error.limit } : {}) });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
module.exports = router;
