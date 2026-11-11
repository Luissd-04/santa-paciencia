// Anexos dos pedidos de suporte: até 3 por mensagem, ≤10 MB cada, só PNG,
// JPEG, WEBP, GIF e PDF reconhecidos pelos primeiros bytes (a extensão e o tipo
// declarados não contam). Ficam em data/uploads/support/<uuid>.<ext>, fora do
// /uploads público, e só se servem por rotas que já confirmaram o acesso.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { UPLOADS_DIR, detectImageMagicType } = require('./mediaStorage');

const SUPPORT_DIR = path.join(UPLOADS_DIR, 'support');
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_NAME = 120;
const TYPES = {
  png: { mime: 'image/png', ext: 'png', exts: ['png'] },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', exts: ['jpg', 'jpeg'] },
  webp: { mime: 'image/webp', ext: 'webp', exts: ['webp'] },
  gif: { mime: 'image/gif', ext: 'gif', exts: ['gif'] },
  pdf: { mime: 'application/pdf', ext: 'pdf', exts: ['pdf'] },
};
const BY_MIME = Object.fromEntries(Object.values(TYPES).map(t => [t.mime, t]));
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp|gif|pdf)$/;
const FORMATS_MSG = 'Formatos aceites: PNG, JPEG, WEBP, GIF e PDF.';

function detectType(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return TYPES.pdf;
  const image = detectImageMagicType(buf);
  return image && TYPES[image] ? TYPES[image] : null;
}

// Sem caminhos, caracteres de controlo nem de direção do texto; ≤120 caracteres
// e com a extensão do tipo real (para o ficheiro abrir com o programa certo).
function sanitizeName(name, type) {
  const clean = String(name ?? '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  const dot = clean.lastIndexOf('.');
  let stem = dot >= 0 ? clean.slice(0, dot) : clean;
  let ext = dot >= 0 ? clean.slice(dot + 1) : '';
  if (!type.exts.includes(ext.toLowerCase())) { stem = clean; ext = type.ext; }
  stem = Array.from(stem.replace(/^[.\s]+/, '')).slice(0, MAX_NAME - ext.length - 1).join('').trimEnd() || 'anexo';
  return `${stem}.${ext}`;
}

function decode(item, index) {
  const label = `Anexo ${index + 1}`;
  if (!item || typeof item !== 'object' || typeof item.data_base64 !== 'string') throw httpError(`${label}: ficheiro em falta.`, 400);
  const raw = item.data_base64.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  // Rejeitar antes de descodificar o que já se sabe ser grande demais.
  if (Math.floor(raw.length * 3 / 4) - 2 > MAX_BYTES) throw httpError(`${label}: o ficheiro tem mais de 10 MB.`, 400);
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw httpError(`${label}: ficheiro inválido.`, 400);
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw httpError(`${label}: o ficheiro está vazio.`, 400);
  if (buffer.length > MAX_BYTES) throw httpError(`${label}: o ficheiro tem mais de 10 MB.`, 400);
  const type = detectType(buffer);
  if (!type) throw httpError(`${label}: formato não suportado. ${FORMATS_MSG}`, 400);
  return { buffer, type };
}

function removeStored(stored = []) {
  for (const item of stored) {
    if (!STORED_NAME.test(item?.stored_name || '')) continue;
    try { fs.unlinkSync(path.join(SUPPORT_DIR, item.stored_name)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}

// list: [{name, data_base64}] → [{original_name, mime, size, stored_name}].
// Tudo ou nada: se um falha, os já gravados nesta chamada são apagados.
function validateAndStore(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw httpError('Anexos inválidos.', 400);
  if (list.length > MAX_FILES) throw httpError(`No máximo ${MAX_FILES} anexos por mensagem.`, 400);
  const stored = [];
  try {
    list.forEach((item, index) => {
      const { buffer, type } = decode(item, index);
      fs.mkdirSync(SUPPORT_DIR, { recursive: true });
      const storedName = `${crypto.randomUUID()}.${type.ext}`;
      fs.writeFileSync(path.join(SUPPORT_DIR, storedName), buffer, { flag: 'wx' });
      stored.push({ original_name: sanitizeName(item.name, type), mime: type.mime, size: buffer.length, stored_name: storedName });
    });
  } catch (err) {
    removeStored(stored);
    throw err;
  }
  return stored;
}

function findAttachment(id) {
  return typeof id === 'string' ? db.prepare('SELECT * FROM support_attachments WHERE id = ?').get(id) || null : null;
}

// filename* com UTF-8 e um filename ASCII de recurso, sem aspas nem barras.
function contentDisposition(name) {
  const fallback = String(name).replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// Só depois de verificado o acesso. O tipo vem da lista fechada; o ficheiro
// abre isolado (sem scripts, sem pedidos) mesmo que alguém o abra diretamente.
function streamAttachment(res, row) {
  const type = BY_MIME[row?.mime];
  const notFound = () => res.status(404).json({ success: false, error: 'Anexo não encontrado.' });
  if (!type || !STORED_NAME.test(row.stored_name || '')) return notFound();
  const file = path.join(SUPPORT_DIR, row.stored_name);
  let stat;
  try { stat = fs.statSync(file); } catch { return notFound(); }
  if (!stat.isFile()) return notFound();
  res.set({
    'Content-Type': type.mime,
    'Content-Length': String(stat.size),
    'Content-Disposition': contentDisposition(row.original_name || `anexo.${type.ext}`),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

module.exports = {
  SUPPORT_DIR, MAX_FILES, MAX_BYTES,
  validateAndStore, removeStored, findAttachment, streamAttachment, sanitizeName, detectType,
};
