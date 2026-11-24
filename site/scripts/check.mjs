#!/usr/bin/env node
// Verificação do site construído (corre depois de `npm run build`, sobre site/dist).
// Sai com código ≠ 0 se alguma verificação falhar. Os avisos não falham.
//
//   - title único (≤ 65 caracteres; acima disso só avisa) e description única (70–160)
//   - um só <h1>, canonical absoluto, imagens com alt
//   - ligações internas sem 404 (e âncoras #id que existam na página de destino)
//   - JSON-LD válido (JSON.parse)
//   - noindex coerente com INDEXAR; robots.txt e sitemap.xml coerentes
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const INDEXAR = process.env.INDEXAR === 'true';
const SITE_URL = (process.env.SITE_URL || 'https://santapaciencia.xyz').replace(/\/+$/, '');

// Páginas ainda por criar (as ligações para elas não contam como erro). Cada entrada é um
// prefixo de endereço. Quando uma página passar a existir, remover a entrada daqui.
// Páginas ainda por criar: as ligações para elas não falham a verificação. Vazio = todas existem.
const PENDENTES = [];

const erros = [];
const avisos = [];
const falha = (pg, msg) => erros.push(`${pg}: ${msg}`);
const avisa = (pg, msg) => avisos.push(`${pg}: ${msg}`);

if (!existsSync(dist)) { console.error('Falta site/dist: corra `npm run build` primeiro.'); process.exit(1); }

const ficheiros = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? ficheiros(p) : [p];
});
const todos = ficheiros(dist);
const htmls = todos.filter((f) => f.endsWith('.html'));
const urlDe = (f) => {
  const r = '/' + relative(dist, f).split('\\').join('/');
  return r.endsWith('/index.html') ? r.slice(0, -'index.html'.length) : r;
};
const paginas = new Map(htmls.map((f) => [urlDe(f), readFileSync(f, 'utf8')]));

const atributo = (tag, nome) => {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
};
const decodifica = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const titulos = new Map();
const descricoes = new Map();
const pendente = (u) => PENDENTES.some((p) => u === p || u.startsWith(p));
const existe = (u) => {
  const sem = u.split('#')[0].split('?')[0];
  if (paginas.has(sem)) return true;
  return existsSync(join(dist, sem)) && statSync(join(dist, sem)).isFile();
};

for (const [url, html] of paginas) {
  const pg = url === '/404.html' ? '404' : url;
  const e404 = url === '/404.html';

  // title
  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!t) falha(pg, 'sem <title>');
  else {
    const titulo = decodifica(t[1].trim());
    if (titulo.length > 65) avisa(pg, `title com ${titulo.length} caracteres (recomendado ≤ 65): «${titulo}»`);
    if (titulos.has(titulo)) falha(pg, `title repetido (igual a ${titulos.get(titulo)})`);
    titulos.set(titulo, pg);
  }

  // description
  const md = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  if (!md) falha(pg, 'sem meta description');
  else {
    const d = decodifica(md[1]);
    if (d.length < 70 || d.length > 160) falha(pg, `description com ${d.length} caracteres (esperado 70–160)`);
    if (descricoes.has(d)) falha(pg, `description repetida (igual a ${descricoes.get(d)})`);
    descricoes.set(d, pg);
  }

  // h1
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) falha(pg, `${h1} elementos <h1> (esperado 1)`);

  // lang
  if (!/<html[^>]*\slang="pt-PT"/.test(html)) falha(pg, 'falta <html lang="pt-PT">');

  // canonical
  const cn = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/);
  if (e404) { if (cn) falha(pg, 'a 404 não deve ter canonical'); }
  else if (!cn) falha(pg, 'sem canonical');
  else if (cn[1] !== SITE_URL + url) falha(pg, `canonical «${cn[1]}» devia ser «${SITE_URL + url}»`);

  // noindex coerente com INDEXAR
  const rb = (html.match(/<meta\s+name="robots"\s+content="([^"]*)"/) || [])[1] || '';
  const noindex = /noindex/.test(rb);
  if (!rb) falha(pg, 'sem meta robots');
  else if (!INDEXAR && !noindex) falha(pg, 'INDEXAR=false mas a página não tem noindex');
  else if (INDEXAR && !e404 && noindex) falha(pg, 'INDEXAR=true mas a página tem noindex');
  else if (INDEXAR && e404 && !noindex) falha(pg, 'a 404 deve ter noindex');

  // imagens com alt
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    if (atributo(img, 'alt') === null) falha(pg, `imagem sem alt: ${img.slice(0, 80)}`);
  }

  // JSON-LD
  const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  blocos.forEach((m, i) => {
    try { JSON.parse(m[1]); } catch (err) { falha(pg, `JSON-LD nº ${i + 1} inválido: ${err.message}`); }
  });
  if (!e404 && !blocos.length) falha(pg, 'sem JSON-LD');

  // ligações internas
  for (const a of html.match(/<a\b[^>]*>/g) || []) {
    const href = atributo(a, 'href');
    if (!href || /^(mailto:|tel:|https?:|\/\/|javascript:)/i.test(href)) continue;
    const alvo = href.startsWith('#') ? url : href;
    if (!alvo.startsWith('/')) { falha(pg, `ligação relativa «${href}» (usar endereços a partir da raiz)`); continue; }
    if (!existe(alvo)) {
      if (!pendente(alvo.split('#')[0].split('?')[0])) falha(pg, `ligação interna partida: ${href}`);
      continue;
    }
    const ancora = href.includes('#') ? href.split('#')[1] : '';
    if (ancora) {
      const dest = paginas.get(alvo.split('#')[0].split('?')[0]);
      if (dest && !new RegExp(`\\sid="${ancora}"`).test(dest)) falha(pg, `âncora inexistente: ${href}`);
    }
  }
}

// robots.txt e sitemap.xml
const robots = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : null;
if (robots === null) falha('robots.txt', 'não existe');
else if (!INDEXAR && !/Disallow:\s*\/\s*$/m.test(robots)) falha('robots.txt', 'INDEXAR=false mas não bloqueia tudo');
else if (INDEXAR && (/Disallow:\s*\/\s*$/m.test(robots) || !robots.includes(`${SITE_URL}/sitemap.xml`))) falha('robots.txt', 'INDEXAR=true mas bloqueia ou não aponta para o sitemap');

const sm = existsSync(join(dist, 'sitemap.xml')) ? readFileSync(join(dist, 'sitemap.xml'), 'utf8') : null;
if (sm === null) falha('sitemap.xml', 'não existe');
else {
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const [url] of paginas) {
    if (url === '/404.html') continue;
    if (!locs.includes(SITE_URL + url)) falha('sitemap.xml', `falta ${SITE_URL + url}`);
  }
  for (const l of locs) if (!paginas.has(l.replace(SITE_URL, ''))) falha('sitemap.xml', `endereço sem página: ${l}`);
}

console.log(`${paginas.size} páginas verificadas (INDEXAR=${INDEXAR}, SITE_URL=${SITE_URL}).`);
for (const a of avisos) console.log(`  aviso  ${a}`);
for (const e of erros) console.log(`  ERRO   ${e}`);
if (erros.length) { console.log(`\n${erros.length} erro(s).`); process.exit(1); }
console.log('Tudo certo.');
