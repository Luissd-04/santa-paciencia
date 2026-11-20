#!/usr/bin/env node
// Gera as imagens de partilha (1200×630) de cada página em src/assets/og.
// Precisa do Playwright: correr só quando os títulos mudarem. `node site/og.cjs`
const fs = require('fs');
const path = require('path');
const { pages, ogName } = require('./build.cjs');

const b64 = (f) => fs.readFileSync(path.join(__dirname, 'src/assets', f)).toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = (headline, label) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(data:font/woff2;base64,${b64('fonts/playfair-display-latin-wght-normal.woff2')});font-weight:400 900}
@font-face{font-family:P;font-style:italic;src:url(data:font/woff2;base64,${b64('fonts/playfair-display-latin-wght-italic.woff2')});font-weight:400 900}
@font-face{font-family:D;src:url(data:font/woff2;base64,${b64('fonts/dm-sans-latin-wght-normal.woff2')});font-weight:100 1000}
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:#843424;color:#f7f1e7;font-family:D;position:relative;overflow:hidden}
.pat{position:absolute;inset:0;background:url(data:image/svg+xml;base64,${b64('img/azulejo-claro.svg')}) 0 0/96px;opacity:.14}
.in{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;align-items:center;gap:18px;font:600 34px P}.top img{width:64px;height:64px;border-radius:14px;border:2px solid rgba(247,241,231,.5)}.top em{color:#e6c877;font-weight:500}
h1{font:600 ${headline.length > 48 ? 62 : 76}px/1.06 P;letter-spacing:-.02em;max-width:880px;text-wrap:balance}
.lab{font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:#e6c877;font-weight:600}
svg{position:absolute;right:40px;bottom:-2px;width:260px;color:rgba(247,241,231,.42)}
</style><div class="pat"></div>
<svg viewBox="0 0 120 150" fill="none"><path d="M10 150V62a50 50 0 0 1 100 0v88" stroke="currentColor" stroke-width="2"/><path d="M26 150V64a34 34 0 0 1 68 0v86" stroke="currentColor" stroke-width="2" opacity=".5"/></svg>
<div class="in"><div class="top"><img src="data:image/png;base64,${b64('img/logo-192.png')}"><span>Santa <em>Paciência</em></span></div><h1>${esc(headline)}</h1><div class="lab">${esc(label)}</div></div>`;

(async () => {
  const { chromium } = require('playwright');
  const out = path.join(__dirname, 'src/assets/og');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const p of pages.filter((x) => !x.noindex)) {
    await page.setContent(html(p.ogHeadline || p.title.split(' | ')[0], 'Software de gestão de alojamento local'));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${ogName(p)}.jpg`), type: 'jpeg', quality: 68 });
  }
  await browser.close();
  console.log(`Imagens de partilha geradas em ${path.relative(process.cwd(), out)}`);
})();
