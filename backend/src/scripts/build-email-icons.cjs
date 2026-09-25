#!/usr/bin/env node
// Gera os PNG dos ícones usados nos botões sociais dos emails.
//
// Porquê PNG e não SVG: a app do Gmail (Android/iOS) remove <svg> do corpo do
// email por completo, e vários clientes não carregam SVG por <img>. PNG é o
// único formato que todos desenham. Os ícones são gerados a partir do SVG que
// está aqui para a origem do desenho ficar legível e reproduzível.
//
// Os ficheiros resultantes são estáticos e ficam versionados; correr este
// script só é preciso se o desenho mudar:
//   node scripts/build-email-icons.cjs
//
// Nos emails as imagens aparecem sempre ao lado do rótulo de texto, por isso
// um cliente que bloqueie imagens continua a mostrar "Instagram"/"Facebook"/
// "Website" de forma compreensível.

const path = require('path');
const fs = require('fs');

const COLOR = '#843424';
const SIZE = 48;            // 3× os 16px de apresentação, para ecrãs densos
const OUT_DIR = path.resolve(__dirname, '../../../frontend/img/email');

const ICONS = {
  instagram: `
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="${COLOR}" stroke="none" />`,
  facebook: `
    <path d="M14.5 8.5h2.2V5.4h-2.6c-2.3 0-3.8 1.5-3.8 3.9v1.9H8v3.1h2.3V21h3.3v-6.7h2.4l.4-3.1h-2.8V9.6c0-.7.3-1.1.9-1.1z"
          fill="${COLOR}" stroke="none" />`,
  website: `
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" />`,
  // Duas "lentes" com pupila e uma sobrancelha em arco — versão simplificada
  // e não a marca registada, na mesma linguagem de traço dos outros três.
  tripadvisor: `
    <path d="M9 8.5c1.2-1.3 4.8-1.3 6 0" />
    <circle cx="7.6" cy="13.2" r="4.1" />
    <circle cx="16.4" cy="13.2" r="4.1" />
    <circle cx="7.6" cy="13.2" r="1.3" fill="${COLOR}" stroke="none" />
    <circle cx="16.4" cy="13.2" r="1.3" fill="${COLOR}" stroke="none" />`,
};

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}"
    fill="none" stroke="${COLOR}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

async function main() {
  const { chromium } = require('@playwright/test');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

  for (const [name, body] of Object.entries(ICONS)) {
    // Fundo transparente: os botões têm o creme do email por trás.
    await page.setContent(
      `<body style="margin:0;background:transparent;">${svg(body)}</body>`,
      { waitUntil: 'load' }
    );
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.locator('svg').screenshot({ path: file, omitBackground: true });
    console.log(`${file} (${fs.statSync(file).size} bytes)`);
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
