#!/usr/bin/env node
// Verifica o site construído: `node site/check.cjs`. Sai com erro se algo falhar.
// Cobre: metas únicas, um só h1, hierarquia de títulos, canonical, JSON-LD válido,
// imagens com alt e dimensões, ligações internas e recursos existentes, páginas
// órfãs, profundidade de cliques, sitemap e robots.
const fs = require('fs');
const path = require('path');
const { build, OUT } = require('./build.cjs');
const { cfg } = require('./src/layout.cjs');

const { pages } = build();
const errors = [];
const fail = (page, msg) => errors.push(`${page}: ${msg}`);
const read = (p) => fs.readFileSync(path.join(OUT, p.endsWith('/') ? p + 'index.html' : p), 'utf8');
const exists = (href) => { const f = path.join(OUT, href); return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html'))); };

const seen = { title: new Map(), description: new Map() };
const links = new Map();

for (const p of pages) {
  const html = read(p.path);
  const one = (re) => (html.match(re) || [])[1];
  const title = one(/<title>([^<]*)<\/title>/);
  const desc = one(/<meta name="description" content="([^"]*)"/);
  if (!title) fail(p.path, 'sem <title>');
  else if (title.length > 65) fail(p.path, `title com ${title.length} caracteres (máx. 65)`);
  if (!desc) fail(p.path, 'sem meta description');
  else if (desc.length < 70 || desc.length > 165) { if (!p.noindex) fail(p.path, `description com ${desc.length} caracteres (70–165)`); }
  for (const [k, v] of [['title', title], ['description', desc]]) {
    if (seen[k].has(v)) fail(p.path, `${k} repetido de ${seen[k].get(v)}`); else seen[k].set(v, p.path);
  }
  const h1 = html.match(/<h1[\s>]/g) || [];
  if (h1.length !== 1) fail(p.path, `${h1.length} elementos h1`);
  let last = 0;
  for (const m of html.matchAll(/<h([1-6])[\s>]/g)) { const n = +m[1]; if (n > last + 1 && last !== 0) fail(p.path, `salto de h${last} para h${n}`); last = n; }
  if (!/<html lang="pt-PT">/.test(html)) fail(p.path, 'sem lang="pt-PT"');
  if (!p.noindex) {
    if (one(/<link rel="canonical" href="([^"]*)"/) !== cfg.siteUrl + p.path) fail(p.path, 'canonical errado');
    if (/noindex/.test(one(/<meta name="robots" content="([^"]*)"/) || '') === cfg.indexar) fail(p.path, cfg.indexar ? 'noindex inesperado' : 'devia ter noindex (indexação desligada)');
  }
  const og = one(/<meta property="og:image" content="([^"]*)"/);
  if (!og || !exists(og.replace(cfg.siteUrl, ''))) fail(p.path, 'og:image em falta');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const d = JSON.parse(m[1]); if (!d['@context'] || !Array.isArray(d['@graph'])) fail(p.path, 'JSON-LD sem @context/@graph'); }
    catch (e) { fail(p.path, `JSON-LD inválido: ${e.message}`); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="/.test(m[0])) fail(p.path, `imagem sem alt: ${m[0].slice(0, 60)}`);
    if (!/\bwidth="/.test(m[0]) || !/\bheight="/.test(m[0])) fail(p.path, `imagem sem dimensões: ${m[0].slice(0, 60)}`);
  }
  const out = new Set();
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|#)/.test(href)) { if (href.startsWith(cfg.siteUrl)) { const rel = href.slice(cfg.siteUrl.length) || '/'; if (!exists(rel)) fail(p.path, `URL absoluto sem destino: ${href}`); } continue; }
    const clean = href.split(/[?#]/)[0];
    if (!clean.startsWith('/')) { fail(p.path, `ligação relativa: ${href}`); continue; }
    if (!exists(clean)) fail(p.path, `ligação partida: ${href}`);
    else if (!path.extname(clean) && !clean.endsWith('/')) fail(p.path, `ligação sem barra final: ${href}`);
    if (clean.endsWith('/')) out.add(clean);
  }
  links.set(p.path, out);
}

// Páginas órfãs e profundidade a partir do início.
const depth = new Map([['/', 0]]);
const queue = ['/'];
while (queue.length) { const cur = queue.shift(); for (const to of links.get(cur) || []) if (!depth.has(to)) { depth.set(to, depth.get(cur) + 1); queue.push(to); } }
for (const p of pages.filter((x) => !x.noSitemap)) {
  if (!depth.has(p.path)) fail(p.path, 'página órfã (nenhuma ligação chega aqui)');
  else if (depth.get(p.path) > 3) fail(p.path, `a ${depth.get(p.path)} cliques do início`);
}

const sitemap = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const p of pages) {
  const inMap = locs.includes(cfg.siteUrl + p.path);
  if (!p.noindex && !p.noSitemap && !inMap) fail(p.path, 'falta no sitemap');
  if ((p.noindex || p.noSitemap) && inMap) fail(p.path, 'não devia estar no sitemap');
}
const robots = fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8');
if (cfg.indexar ? !robots.includes(`Sitemap: ${cfg.siteUrl}/sitemap.xml`) : !/Disallow: \/\n/.test(robots)) fail('robots.txt', cfg.indexar ? 'não aponta para o sitemap' : 'devia bloquear tudo (indexação desligada)');

if (errors.length) { console.error(`${errors.length} problema(s):\n` + errors.map((e) => '  ✗ ' + e).join('\n')); process.exit(1); }
console.log(`✓ ${pages.length} páginas verificadas: metas únicas, um h1 por página, JSON-LD válido, sem ligações partidas, sem páginas órfãs, sitemap com ${locs.length} URLs. Indexação ${cfg.indexar ? 'ligada' : 'desligada'}.`);
