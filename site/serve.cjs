#!/usr/bin/env node
// Servidor local para ver o site: `node site/serve.cjs` (porta 4173 ou PORT).
// Imita um alojamento estático: URLs com barra final, 301 das variantes, 404 verdadeiro, gzip.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { build, OUT } = require('./build.cjs');

if (!process.argv.includes('--no-build')) build();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const redirects = fs.readFileSync(path.join(OUT, '_redirects'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/));

function send(req, res, status, file) {
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (/\.(html|css|js|svg|xml|txt)$/.test(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  const go = (to) => { res.writeHead(301, { Location: to + url.search }); res.end(); };
  if (p !== p.toLowerCase()) return go(p.toLowerCase());
  for (const [from, to] of redirects) {
    if (from.endsWith('/*')) { const base = from.slice(0, -1); if (p.startsWith(base)) return go(to.replace(':splat', p.slice(base.length))); }
    else if (p === from || p === from + '/') return go(to);
  }
  const file = path.join(OUT, p);
  if (!file.startsWith(OUT)) { res.writeHead(400); return res.end(); }
  if (p.endsWith('/') && fs.existsSync(path.join(file, 'index.html'))) return send(req, res, 200, path.join(file, 'index.html'));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(req, res, 200, file);
  if (fs.existsSync(path.join(file, 'index.html'))) return go(p + '/');
  send(req, res, 404, path.join(OUT, '404.html'));
});
const port = Number(process.env.PORT) || 4173;
server.listen(port, () => console.log(`Site em http://localhost:${port}`));
