// O preview pode carregar /uploads do servidor local; o destinatário não.
// Incorporar só logótipos da organização como partes MIME relacionadas (CID),
// sem pedidos de rede nem leitura de caminhos indicados livremente no HTML.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { db } = require('../config/database');
const { uploadPath } = require('./mediaStorage');
const { escapeHtml } = require('./emailComposer');

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const base64Lines = value => Buffer.from(value).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';

async function buildEmailMimeBody(organizationId, html) {
  let content = String(html || '');
  const images = [];
  const replacements = new Map();
  const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  const sources = new Set([...content.matchAll(/<img\b[^>]*\ssrc="([^"]*)"[^>]*>/gi)].map(match => match[1]));
  const logos = organizationId ? db.prepare(`SELECT DISTINCT logo_url FROM accommodations
    WHERE organization_id = ? AND logo_url IS NOT NULL`).all(organizationId) : [];

  for (const { logo_url: url } of logos) {
    const file = uploadPath(url);
    const type = file && TYPES[path.extname(file).toLowerCase()];
    const candidates = file ? [escapeHtml(base + url), escapeHtml(url)].filter(source => sources.has(source)) : [];
    if (!type || !candidates.length) continue;
    let data;
    try { data = await fs.promises.readFile(file); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const cid = `logo-${randomUUID()}@santapaciencia`;
    images.push({ cid, type, data, filename: `logo${path.extname(file).toLowerCase()}` });
    for (const source of candidates) replacements.set(source, cid);
  }

  content = content.replace(/<img\b[^>]*\ssrc="([^"]*)"[^>]*>/gi, (tag, source) => {
    const cid = replacements.get(source);
    return cid ? tag.replace(/(\ssrc=")[^"]*"/i, `$1cid:${cid}"`) : tag;
  });
  const htmlPart = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(content)];
  if (!images.length) return htmlPart.join('\r\n');

  const boundary = `sp-related-${randomUUID()}`;
  return [
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`, '',
    `--${boundary}`, ...htmlPart,
    ...images.flatMap(img => [
      `--${boundary}`, `Content-Type: ${img.type}`,
      'Content-Transfer-Encoding: base64', `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${img.filename}"`, '', base64Lines(img.data),
    ]),
    `--${boundary}--`, '',
  ].join('\r\n');
}

module.exports = { buildEmailMimeBody };
