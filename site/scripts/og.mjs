#!/usr/bin/env node
// Gera as imagens de partilha (Open Graph / Twitter, 1200×630, JPEG) para todas as páginas.
//
//   npm run og              faz o build e gera as imagens em public/og/
//   node scripts/og.mjs --sem-build   usa o site/dist que já existe
//
// Lê o H1 e o caminho de cada página do dist, desenha-os num HTML com as fontes locais
// (@fontsource-variable) e a calçada do componente Calcada.astro, e tira a captura com Playwright.
// O Playwright NÃO é dependência do projeto: tem de estar instalado (globalmente ou à parte).
// Se o import falhar, indique o caminho: PLAYWRIGHT_PATH=/caminho/para/node_modules/playwright npm run og
// Depois de gerar, volte a construir (`npm run build`) para as imagens irem para o dist.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync, mkdtempSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const saida = join(raiz, 'public', 'og');

if (!process.argv.includes('--sem-build')) {
  execSync('npm run build', { cwd: raiz, stdio: 'inherit' });
}
if (!existsSync(dist)) { console.error('Falta site/dist.'); process.exit(1); }

// Playwright: import normal; se falhar, tenta o caminho global do npm (ou PLAYWRIGHT_PATH).
async function carregarPlaywright() {
  try { return await import('playwright'); } catch {}
  const candidatos = [process.env.PLAYWRIGHT_PATH];
  try { candidatos.push(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch {}
  for (const c of candidatos.filter(Boolean)) {
    try { return createRequire(import.meta.url)(c); } catch {}
  }
  console.error('Não encontrei o Playwright. Instale-o (npm i -g playwright) ou defina PLAYWRIGHT_PATH.');
  process.exit(1);
}
const { chromium } = await carregarPlaywright();

const marcaTs = readFileSync(join(raiz, 'src/config/brand.ts'), 'utf8');
const nomeMarca = (marcaTs.match(/nome:\s*'([^']+)'/) || [])[1] || 'Santa Paciência';
const slogan = (marcaTs.match(/slogan:\s*'([^']+)'/) || [])[1] || '';

const decodifica = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ficheiros = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? ficheiros(p) : [p];
});

const ROTULOS = {
  funcionalidades: 'Funcionalidades', guias: 'Guia', para: 'Para quem', precos: 'Preços',
  'perguntas-frequentes': 'Perguntas frequentes', sobre: 'Sobre', contacto: 'Contacto',
  'acesso-antecipado': 'Acesso antecipado', privacidade: 'Privacidade', termos: 'Termos',
};

const paginas = [];
for (const f of ficheiros(dist).filter((f) => f.endsWith('index.html'))) {
  const caminho = '/' + relative(dist, dirname(f)).split('\\').join('/');
  const html = readFileSync(f, 'utf8');
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) continue;
  const partes = caminho.split('/').filter(Boolean);
  const slug = partes.length ? partes.join('-') : 'inicio';
  const rotulo = partes.length ? (ROTULOS[partes[0]] || '') : slogan;
  paginas.push({ slug, h1: decodifica(m[1]), rotulo });
}

const fontes = join(raiz, 'node_modules/@fontsource-variable');
const url = (p) => pathToFileURL(p).href;
const face = (familia, ficheiro, intervalo) => `@font-face{font-family:'${familia}';font-weight:200 800;font-style:normal;src:url(${url(ficheiro)}) format('woff2');unicode-range:${intervalo}}`;
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATINEXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const bric = join(fontes, 'bricolage-grotesque/files');
const inter = join(fontes, 'inter/files');
const CSS_FONTES = [
  face('Bricolage', join(bric, 'bricolage-grotesque-latin-opsz-normal.woff2'), LATIN),
  face('Bricolage', join(bric, 'bricolage-grotesque-latin-ext-opsz-normal.woff2'), LATINEXT),
  face('Inter', join(inter, 'inter-latin-wght-normal.woff2'), LATIN),
  face('Inter', join(inter, 'inter-latin-ext-wght-normal.woff2'), LATINEXT),
].join('\n');

const LOGO = '<svg viewBox="0 0 26 26" width="52" height="52"><rect width="26" height="26" rx="6" fill="#843424"/><path d="M4 16.5c3-3.2 6-3.2 9 0s6 3.2 9 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M4 10.5c3-3.2 6-3.2 9 0s6 3.2 9 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".5"/></svg>';

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000, 7);

function pagina({ slug, h1, rotulo }) {
  const fase = (hash(slug) / 1000) * 6.28;
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><style>
${CSS_FONTES}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#1E1C1A}
body{position:relative;font-family:Inter,sans-serif;color:#fff}
canvas{position:absolute;left:0;bottom:0;width:1200px;height:210px}
.fade{position:absolute;left:0;bottom:0;width:1200px;height:210px;background:linear-gradient(#1E1C1A 0,rgba(30,28,26,.55) 38%,rgba(30,28,26,0) 100%)}
.marca{position:absolute;left:72px;top:56px;display:flex;align-items:center;gap:16px;font:700 30px/1 Bricolage,sans-serif;letter-spacing:-.01em}
.corpo{position:absolute;left:72px;right:72px;top:128px;height:290px;display:flex;flex-direction:column;justify-content:center}
.rot{font:600 24px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#E3A08C;margin-bottom:26px}
h1{font:800 84px/1.04 Bricolage,sans-serif;font-variation-settings:'opsz' 96;letter-spacing:-.025em;text-wrap:balance;max-width:1010px;color:#fff}
</style></head><body>
<canvas id="c" width="1200" height="210"></canvas><div class="fade"></div>
<div class="marca">${LOGO}<span>${esc(nomeMarca)}</span></div>
<div class="corpo">${rotulo ? `<div class="rot">${esc(rotulo)}</div>` : ''}<h1 id="h">${esc(h1)}</h1></div>
<script>
const alea=(s)=>{const x=Math.sin(s)*10000;return x-Math.floor(x)};
const cv=document.getElementById('c'),c=cv.getContext('2d'),w=1200,h=210,ph=${fase.toFixed(3)};
c.fillStyle='#2B2825';c.fillRect(0,0,w,h);
const s=13,folga=2,faixa=46,amp=30,comp=Math.max(560,w/1.6);
for(let y=-s;y<h+s;y+=s)for(let x=-s;x<w+s;x+=s){
  const i=x*0.37+y*1.91+ph*7,cx=x+(alea(i)-0.5)*3,cy=y+(alea(i+1)-0.5)*3;
  const k=Math.floor((cy+Math.sin(cx/comp*Math.PI*2+ph)*amp+400)/faixa)%2;
  c.fillStyle=k?'#F2EFEA':'#1E1C1A';const q=s-folga;
  c.beginPath();c.moveTo(cx+alea(i+2)*2,cy+alea(i+3)*2);c.lineTo(cx+q-alea(i+4)*2,cy+alea(i+5)*2);
  c.lineTo(cx+q-alea(i+6)*2,cy+q-alea(i+7)*2);c.lineTo(cx+alea(i+8)*2,cy+q-alea(i+9)*2);c.closePath();c.fill();
}
// Ajusta o tamanho do H1 para caber na caixa (máx. 3 linhas ao tamanho máximo, encolhe se for preciso).
const hh=document.getElementById('h'),corpo=hh.parentElement;
let t=84;
while(t>40&&corpo.scrollHeight>corpo.clientHeight+1){t-=2;hh.style.fontSize=t+'px'}
document.fonts.ready.then(()=>{t=84;hh.style.fontSize=t+'px';while(t>40&&corpo.scrollHeight>corpo.clientHeight+1){t-=2;hh.style.fontSize=t+'px'}document.body.dataset.pronto='1'});
</script></body></html>`;
}

mkdirSync(saida, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'og-'));
const browser = await chromium.launch();
try {
  const pag = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const p of paginas) {
    const f = join(tmp, `${p.slug}.html`);
    writeFileSync(f, pagina(p));
    await pag.goto(url(f));
    await pag.evaluate(() => document.fonts.load("800 84px Bricolage"));
    await pag.waitForSelector('body[data-pronto="1"]');
    await pag.screenshot({ path: join(saida, `${p.slug}.jpg`), type: 'jpeg', quality: 80 });
    console.log(`  og/${p.slug}.jpg  «${p.h1}»`);
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`${paginas.length} imagens em public/og/. Corra \`npm run build\` para as incluir no dist.`);
