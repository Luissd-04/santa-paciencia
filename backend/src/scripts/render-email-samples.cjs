#!/usr/bin/env node
// Renderiza os modelos de email com dados fictícios e guarda HTML + capturas
// em computador e telemóvel.
//
//   node scripts/render-email-samples.cjs [pasta-de-saida]
//
// Usa exatamente a mesma composição do envio (emailService.renderEmail) e os
// modelos por omissão de config/emailTemplateDefaults.js — as capturas mostram
// o que o hóspede receberia, não uma reconstrução à parte.
//
// Dados: hóspede, reserva e alojamento inventados. Não lê a base de dados e
// não envia nada.
//
// AVISO: um browser não demonstra compatibilidade com Gmail ou Outlook. Estas
// capturas servem para verificar o desenho, não para certificar clientes.

const path = require('path');
const fs = require('fs');

// A base pública tem de ser HTTPS para o compositor emitir os <img> dos
// ícones; os pedidos são intercetados abaixo e servidos dos ficheiros locais,
// por isso o script não depende da rede para os ícones.
const ASSET_ORIGIN = 'https://exemplo.santapaciencia.test';
process.env.PUBLIC_APP_URL = ASSET_ORIGIN;

const { renderEmail, baseTemplate, buildVars, buildBlocks, sanitizeUrlVars } = require('../services/emailService');
const { TEMPLATES } = require('../config/emailTemplateDefaults');

const OUT_DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../../browser-artifacts/emails'));
const FRONTEND_DIR = path.resolve(__dirname, '../../../frontend');

const SETTINGS = {
  checkin_time: '15:00',
  checkout_time: '11:00',
  facebook: 'https://www.facebook.com/al.santapaciencia/',
  instagram: 'https://www.instagram.com/al_santapaciencia/',
  website: 'https://santapaciencia.pt/suites/',
  property_name: 'Santa Paciência',
  property_address: 'Rua de Évora, 14 · 7200-347 Reguengos de Monsaraz',
  license_number: 'RNET 000000/AL',
  email_contact: 'reservas.exemplo@example.org',
  logo_url: 'https://santapaciencia.pt/wp-content/uploads/2024/04/cropped-Logo-Transparente-Cinza-280x60-1.png',
};

const GUEST = { name: 'Rui Marques Silva', first_name: 'Rui', email: 'hospede.exemplo@example.org' };
const ACCOMMODATION = {
  name: 'Suite Mezzanine Deluxe',
  city: 'Reguengos de Monsaraz',
  wifi_name: 'SantaPaciencia_WiFi',
  wifi_password: 'exemplo-1234',
  door_code: '1234#',
};

function reservationWith(status) {
  return {
    id: 'SP-1778013512761',
    status,
    check_in: '2026-05-29',
    check_out: '2026-05-31',
    nights: 2,
    num_guests: 1,
    total_amount: 240,
  };
}

// Casos guardados: os dois dos prints, mais o estado pendente (que era a falha
// de fundo do modelo "confirmacao") e um caso de dados longos/acentuados.
const CASES = [
  { id: 'mensagem-manual', body: '<p>teste</p>' },
  { id: 'boas-vindas',            slug: 'apos_checkin', status: 'confirmada' },
  { id: 'confirmacao',            slug: 'confirmacao',  status: 'confirmada' },
  { id: 'confirmacao-pendente',   slug: 'confirmacao',  status: 'pendente' },
  {
    id: 'confirmacao-dados-longos',
    slug: 'confirmacao',
    status: 'aguardar_pagamento',
    guest: { name: 'María Ángeles de Oliveira "Nita" Gonçalves-Schäfer', first_name: 'María Ángeles', email: 'maria@example.org' },
    accommodation: { ...ACCOMMODATION, name: 'Suite Familiar Deluxe com Varanda e Vista sobre a Praça — Piso 2' },
    total: 12345.6,
  },
];

function renderCase(c) {
  const settings = { ...SETTINGS };
  if (c.body) return { subject: 'Teste de aparência', html: baseTemplate(c.body, settings) };
  const guest = c.guest || GUEST;
  const accommodation = c.accommodation || ACCOMMODATION;
  const reservation = { ...reservationWith(c.status), ...(c.total ? { total_amount: c.total } : {}) };
  const tpl = TEMPLATES[c.slug];

  const vars = sanitizeUrlVars(buildVars(guest, reservation, accommodation, settings, {
    link_pre_checkin: `${ASSET_ORIGIN}/pre-checkin/exemplo`,
  }));
  const blocks = buildBlocks(vars, settings, reservation);
  return renderEmail({ subject: tpl.subject, body: tpl.body, vars, blocks, settings });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rendered = CASES.map(c => ({ ...c, ...renderCase(c) }));

  for (const r of rendered) {
    // O HTML exportado abre também por file://, sem domínio fictício para
    // as imagens. As capturas abaixo continuam a usar o HTML real composto.
    const assetPath = path.relative(OUT_DIR, FRONTEND_DIR).split(path.sep).join('/');
    fs.writeFileSync(path.join(OUT_DIR, `${r.id}.html`), r.html.replaceAll(`${ASSET_ORIGIN}/img/`, `${assetPath}/img/`));
    console.log(`${r.id}.html — assunto: ${r.subject}`);
  }

  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();

  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
    // Extremo inferior pedido: confirma que não há corte nem deslocamento
    // horizontal no ecrã mais estreito em uso.
    { name: 'mobile-320', width: 320, height: 720 },
    // Envolvente escura para avaliar a moldura transparente. Isto NÃO emula
    // a transformação de cores do Gmail: apenas o contexto visual exterior.
    { name: 'mobile-dark-surround', width: 390, height: 844, surround: '#121212' },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // Ícones servidos do disco em vez da rede.
    await page.route(`${ASSET_ORIGIN}/**`, route => {
      const file = path.join(FRONTEND_DIR, new URL(route.request().url()).pathname);
      if (fs.existsSync(file)) return route.fulfill({ path: file });
      return route.abort();
    });

    for (const r of rendered) {
      await page.setContent(r.html, { waitUntil: 'networkidle' });
      if (vp.surround) await page.addStyleTag({ content: `html { background-color:${vp.surround} !important; }` });
      const scroll = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scroll.overflowX) {
        throw new Error(`${r.id} @ ${vp.name}: deslocamento horizontal (${scroll.scrollWidth} > ${scroll.clientWidth})`);
      }
      const file = path.join(OUT_DIR, `${r.id}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ${path.basename(file)}`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nSem deslocamento horizontal em 1440, 390 e 320 px. Saída: ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
