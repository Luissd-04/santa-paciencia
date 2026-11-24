#!/usr/bin/env node
// Verificação do site construído (corre depois de `npm run build`, sobre site/dist).
// Sai com código ≠ 0 se alguma verificação falhar. Os avisos não falham.
//
//   - title único (≤ 65 caracteres; acima disso só avisa) e description única (70–160)
//   - um só <h1>, canonical absoluto, imagens com alt
//   - ligações internas sem 404 (e âncoras #id que existam na página de destino)
//   - og:image aponta para um ficheiro existente em dist
//   - JSON-LD válido (JSON.parse)
//   - noindex coerente com INDEXAR; robots.txt e sitemap.xml coerentes
//   - línguas: <html lang> certo (pt-PT na raiz, en em /en/), hreflang recíproco (cada página aponta para a
//     equivalente, que existe e aponta de volta; x-default = PT), sem ligações internas que misturem línguas,
//     `inLanguage` do JSON-LD certo, preços em inglês no formato «€19» e sem palavras portuguesas soltas no EN
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
const ehEN = (u) => u === '/en/' || u.startsWith('/en/');
const LANG_HTML = (u) => (ehEN(u) ? 'en' : 'pt-PT');
const E404 = new Set(['/404.html', '/en/404/']);
// Prefixos de ficheiros que não são páginas (as ligações para eles servem as duas línguas).
const ATIVOS = ['/img/', '/og/', '/_astro/', '/robots.txt', '/sitemap.xml'];
// Palavras portuguesas que não devem aparecer num texto EN (as palavras dos nomes próprios de exemplo não contam).
const PT_SOLTO = /\b(não|para|uma|você|hóspedes?|alojamentos?|reservas?|gratuito|obrigado)\b/i;
const pendente = (u) => PENDENTES.some((p) => u === p || u.startsWith(p));
const existe = (u) => {
  const sem = u.split('#')[0].split('?')[0];
  if (paginas.has(sem)) return true;
  return existsSync(join(dist, sem)) && statSync(join(dist, sem)).isFile();
};

for (const [url, html] of paginas) {
  const e404 = E404.has(url);
  const pg = e404 ? (ehEN(url) ? '404 (en)' : '404') : url;

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
  if (!new RegExp(`<html[^>]*\\slang="${LANG_HTML(url)}"`).test(html)) falha(pg, `falta <html lang="${LANG_HTML(url)}">`);

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

  // hreflang: pt-PT, en e x-default (= PT); a página é uma delas; a equivalente existe e aponta de volta
  const alts = [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  if (e404) { if (alts.length) falha(pg, 'a 404 não deve ter hreflang'); }
  else {
    const mapa = new Map(alts);
    const pt = mapa.get('pt-PT'), en = mapa.get('en'), xd = mapa.get('x-default');
    if (alts.length !== 3 || !pt || !en || !xd) falha(pg, `hreflang incompleto (esperado pt-PT, en e x-default): ${alts.map((a) => a[0]).join(', ') || 'nenhum'}`);
    else {
      if (xd !== pt) falha(pg, `hreflang x-default «${xd}» devia ser o da PT «${pt}»`);
      if (ehEN(url) && ehEN(pt.replace(SITE_URL, ''))) falha(pg, 'hreflang pt-PT aponta para uma página EN');
      if (!ehEN(en.replace(SITE_URL, ''))) falha(pg, 'hreflang en não aponta para /en/');
      const proprio = ehEN(url) ? en : pt;
      if (proprio !== SITE_URL + url) falha(pg, `hreflang da própria língua «${proprio}» devia ser «${SITE_URL + url}»`);
      const outraUrl = (ehEN(url) ? pt : en).replace(SITE_URL, '');
      const outra = paginas.get(outraUrl);
      if (!outra) falha(pg, `hreflang aponta para uma página que não existe: ${outraUrl}`);
      else {
        const dela = [...outra.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`).sort().join('|');
        const nossa = alts.map((a) => `${a[0]}=${a[1]}`).sort().join('|');
        if (dela !== nossa) falha(pg, `hreflang não é recíproco com ${outraUrl}`);
      }
    }
  }

  // seletor de língua: no cabeçalho e no rodapé, leva à página equivalente (ou ao início da outra língua na 404)
  {
    const ligacoesLang = (html.match(/<a\b[^>]*\shreflang="[^"]*"[^>]*>/g) || []).map((a) => atributo(a, 'href')).filter((h) => h && h.startsWith('/'));
    const esperado = e404 ? (ehEN(url) ? '/' : '/en/') : (alts.find((a) => a[0] === (ehEN(url) ? 'pt-PT' : 'en')) || [])[1]?.replace(SITE_URL, '');
    if (ligacoesLang.length < 2) falha(pg, `seletor de língua em falta (cabeçalho e rodapé): ${ligacoesLang.length} ligação(ões)`);
    else if (esperado && ligacoesLang.some((h) => h !== esperado)) falha(pg, `seletor de língua devia levar a ${esperado}: ${ligacoesLang.join(', ')}`);
  }

  // imagem de partilha: og:image existe em dist
  const og = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/);
  if (!og) falha(pg, 'sem og:image');
  else if (!og[1].startsWith(SITE_URL + '/')) falha(pg, `og:image «${og[1]}» não começa por ${SITE_URL}/`);
  else if (!existe(og[1].slice(SITE_URL.length))) falha(pg, `og:image aponta para ficheiro inexistente: ${og[1]}`);

  // imagens com alt
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    if (atributo(img, 'alt') === null) falha(pg, `imagem sem alt: ${img.slice(0, 80)}`);
  }

  // JSON-LD
  const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  blocos.forEach((m, i) => {
    try {
      const dados = JSON.parse(m[1]);
      // inLanguage certo em todos os objetos que o declaram
      const procura = (o) => {
        if (Array.isArray(o)) o.forEach(procura);
        else if (o && typeof o === 'object') {
          if (o.inLanguage !== undefined && o.inLanguage !== LANG_HTML(url)) falha(pg, `JSON-LD com inLanguage «${o.inLanguage}» (esperado «${LANG_HTML(url)}»)`);
          Object.values(o).forEach(procura);
        }
      };
      procura(dados);
    } catch (err) { falha(pg, `JSON-LD nº ${i + 1} inválido: ${err.message}`); }
  });
  if (!e404 && !blocos.length) falha(pg, 'sem JSON-LD');

  // texto EN: preços como «€19» (nunca «19 €») e sem palavras portuguesas soltas
  if (ehEN(url)) {
    const texto = decodifica(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '));
    const euro = texto.match(/\d\s?€/);
    if (euro) falha(pg, `preço em formato português («${texto.slice(Math.max(0, euro.index - 8), euro.index + 6).trim()}»): em inglês escreve-se «€19»`);
    const pt = texto.replace(/Alojamento Local|Livro de Reclamações/g, ' ').match(PT_SOLTO);
    if (pt) falha(pg, `palavra portuguesa no texto EN: «${pt[0]}» (…${texto.slice(Math.max(0, pt.index - 30), pt.index + 30).replace(/\s+/g, ' ')}…)`);
  }

  // ligações internas
  for (const a of html.match(/<a\b[^>]*>/g) || []) {
    const href = atributo(a, 'href');
    if (!href || /^(mailto:|tel:|https?:|\/\/|javascript:)/i.test(href)) continue;
    const alvo = href.startsWith('#') ? url : href;
    if (!alvo.startsWith('/')) { falha(pg, `ligação relativa «${href}» (usar endereços a partir da raiz)`); continue; }
    // as duas línguas não se misturam: só o seletor de língua (com hreflang) liga à outra
    if (!ATIVOS.some((p) => alvo.startsWith(p)) && ehEN(alvo) !== ehEN(url) && atributo(a, 'hreflang') === null) {
      falha(pg, `ligação para a outra língua sem hreflang: ${href}`);
    }
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
  for (const [url, html] of paginas) {
    if (E404.has(url)) continue;
    if (!locs.includes(SITE_URL + url)) falha('sitemap.xml', `falta ${SITE_URL + url}`);
    // alternativas de língua (xhtml:link) iguais às do hreflang da página
    const bloco = (sm.match(new RegExp(`<url><loc>${(SITE_URL + url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>(.*?)</url>`)) || [])[1] || '';
    const noSitemap = [...bloco.matchAll(/hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`).sort().join('|');
    const naPagina = [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`).sort().join('|');
    if (noSitemap !== naPagina) falha('sitemap.xml', `alternativas de ${url} diferentes das do hreflang da página`);
  }
  for (const l of locs) if (!paginas.has(l.replace(SITE_URL, ''))) falha('sitemap.xml', `endereço sem página: ${l}`);
}

console.log(`${paginas.size} páginas verificadas (INDEXAR=${INDEXAR}, SITE_URL=${SITE_URL}).`);
for (const a of avisos) console.log(`  aviso  ${a}`);
for (const e of erros) console.log(`  ERRO   ${e}`);
if (erros.length) { console.log(`\n${erros.length} erro(s).`); process.exit(1); }
console.log('Tudo certo.');
