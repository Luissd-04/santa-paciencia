// Gera os ícones da app e das notificações em frontend/img a partir do
// logótipo (frontend/favicon.png) e dos desenhos abaixo. Correr depois de
// mudar um desenho ou uma cor: node scripts/build-icons.cjs
//
// - img/app/: ícone quadrado com o fundo do logótipo, para o ecrã principal do
//   iPhone (que pinta de preto o fundo transparente) e para o manifest.
// - img/push/<tipo>.png: ícone grande de cada notificação (cor + desenho).
// - img/push/<tipo>-badge.png: ícone pequeno da barra do Android, só o
//   desenho em branco (o Android pinta-o de uma cor; só conta a transparência).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const FRONTEND = path.resolve(__dirname, '../../../frontend');
const LOGO = path.join(FRONTEND, 'favicon.png');
// Cor do círculo do logótipo: o fundo do ícone quadrado funde-se com ele.
const LOGO_BACKGROUND = '#813621';

// Desenhos de linha (24×24, traço 2), um por tipo de notificação. As chaves
// são os tipos de staffNotifier.KINDS.
const GLYPHS = {
  reservation: '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  request: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  payment: '<path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
  cancellation: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>',
  precheckin: '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
  summary: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  app: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
};
// Cores com contraste para o desenho branco; diferem também em claridade.
const COLORS = {
  reservation: '#843424', request: '#a15c07', payment: '#2f7a4f',
  cancellation: '#3f3a36', precheckin: '#2f5f86', summary: '#1f6f6b',
};

const glyph = (name, { size, stroke, inset }) => {
  const scale = (size - inset * 2) / 24;
  return `<g transform="translate(${inset} ${inset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</g>`;
};
const svg = (size, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${content}</svg>`);

async function write(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(file);
  console.log(path.relative(FRONTEND, file), fs.statSync(file).size, 'bytes');
}

// Logótipo sobre um quadrado da cor do círculo, a `scale` do lado.
async function appIcon(file, size, scale) {
  const logo = await sharp(LOGO).resize(Math.round(size * scale)).toBuffer();
  const offset = Math.round((size - size * scale) / 2);
  await write(file, sharp({ create: { width: size, height: size, channels: 4, background: LOGO_BACKGROUND } })
    .composite([{ input: logo, left: offset, top: offset }]));
}

async function main() {
  await appIcon(path.join(FRONTEND, 'img/app/apple-touch-icon.png'), 180, 1);
  await appIcon(path.join(FRONTEND, 'img/app/icon-192.png'), 192, 1);
  await appIcon(path.join(FRONTEND, 'img/app/icon-512.png'), 512, 1);
  // Android recorta os ícones «maskable» em várias formas: o logótipo fica na zona segura.
  await appIcon(path.join(FRONTEND, 'img/app/icon-maskable-512.png'), 512, 0.84);
  // Notificações sem tipo (envio de teste): o logótipo.
  await write(path.join(FRONTEND, 'img/push/app.png'), sharp(LOGO).resize(192));
  for (const name of Object.keys(GLYPHS)) {
    if (COLORS[name]) {
      await write(path.join(FRONTEND, `img/push/${name}.png`), sharp(svg(192,
        `<rect width="192" height="192" rx="44" fill="${COLORS[name]}"/>${glyph(name, { size: 192, stroke: 2, inset: 44 })}`)));
    }
    await write(path.join(FRONTEND, `img/push/${name}-badge.png`), sharp(svg(96, glyph(name, { size: 96, stroke: 2.4, inset: 12 }))));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
