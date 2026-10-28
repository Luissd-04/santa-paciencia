// Desenho dos emails de 10/2026: o título certo em cada modelo, os códigos
// só com a reserva paga, os avisos à equipa com datas legíveis, os emails de
// conta em português e a migração que aplica o desenho com cópia de segurança.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-email-design-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', PUBLIC_APP_URL: 'https://exemplo.invalid' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const emailService = require('../services/emailService');
const sent = [];
emailService.sendMail = async (org, message) => { sent.push({ org, ...message }); return { id: 'm' }; };
const { TEMPLATES } = require('../config/emailTemplateDefaults');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

const SETTINGS = {
  checkin_time: '15:00', checkout_time: '11:00', website: 'https://exemplo.invalid/', tripadvisor: 'https://tripadvisor.example/sp',
  property_name: 'Santa Paciência', property_address: 'Rua de Évora, 14', license_number: 'RNET 1/AL',
  email_contact: 'reservas@exemplo.invalid', logo_url: 'https://exemplo.invalid/logo.png',
};
const GUEST = { name: 'Rui Marques', first_name: 'Rui', email: 'rui@exemplo.invalid', phone: '+351910000000' };
const UNIT = { name: 'Suite King', city: 'Reguengos', wifi_name: 'SP_WiFi', wifi_password: 'monsaraz', door_code: '1234#' };
const text = html => html.replace(/<span class="sp-g[se]"><span class="sp-gd">([^<]*)<\/span><\/span>/g, '$1');
function render(slug, reservation = {}) {
  const r = { id: 'SP-1', status: 'confirmada', check_in: '2035-11-14', check_out: '2035-11-16', nights: 2, num_guests: 2, total_amount: 250, amount_paid: 80, ...reservation };
  const vars = emailService.sanitizeUrlVars(emailService.buildVars(GUEST, r, UNIT, SETTINGS, { link_pre_checkin: 'https://exemplo.invalid/pre-checkin/x' }));
  const tpl = TEMPLATES[slug];
  return text(emailService.renderEmail({ subject: tpl.subject, body: tpl.body, vars, blocks: emailService.buildBlocks(vars, SETTINGS, r), settings: SETTINGS }).html);
}

test('cada modelo tem o seu título (antes vários diziam "Reserva confirmada")', () => {
  const cases = [
    ['pre_checkin', {}, 'Complete o pré-check-in'],
    ['coordenadas', { amount_paid: 250 }, 'Tudo para a sua chegada'],
    ['antes_checkout', {}, 'Check-out sex, 16 nov 2035, até às 11:00'],
    ['obrigado', {}, 'Obrigado pela visita, Rui'],
    ['apos_checkin', {}, 'Bem-vindo, Rui'],
  ];
  for (const [slug, res, title] of cases) {
    const html = render(slug, res);
    assert.ok(html.includes(title), `${slug}: ${title}`);
    if (slug !== 'confirmacao') assert.ok(!html.includes('RESERVA CONFIRMADA') && !html.includes('Reserva confirmada</td>'), `${slug} não diz reserva confirmada`);
  }
  assert.ok(!render('obrigado').includes('Bem-vindo'), 'o obrigado não diz bem-vindo');
});

test('a confirmação segue o estado: pré-reserva, pedido, à espera do sinal e confirmada', () => {
  assert.ok(render('confirmacao', { status: 'pre_reserva' }).includes('Datas guardadas para si'));
  const pending = render('confirmacao', { status: 'pendente', amount_paid: 0 });
  assert.ok(pending.includes('Recebemos o seu pedido') && pending.includes('Total previsto') && !pending.includes('>Pago</td>'));
  const deposit = render('confirmacao', { status: 'aguardar_pagamento', amount_paid: 0, public_token: 'tok', organization_id: 'x' });
  assert.ok(deposit.includes('Falta o sinal para confirmar') && deposit.includes('Pagar o sinal'));
  const confirmed = render('confirmacao');
  assert.ok(confirmed.includes('Está tudo pronto para 14 de novembro') && confirmed.includes('Falta <strong'));
});

test('chegada: código da porta e Wi-Fi grandes, e sem linhas vazias', () => {
  const paid = render('coordenadas', { amount_paid: 250 });
  assert.ok(paid.includes('1234#') && paid.includes('monsaraz') && paid.includes('>SP_WiFi</div>'), 'nome da rede exato');
  assert.match(paid, /Courier New/);
  // Sem a reserva paga, os códigos não entram no email (nem como linhas vazias).
  const unpaid = render('coordenadas', { amount_paid: 80 });
  assert.ok(!unpaid.includes('CÓDIGO DA PORTA') && !unpaid.includes('1234#'));
  // E o email de chegada só sai com a reserva paga na totalidade.
  const { canSendTemplate } = require('../services/emailEligibility');
  assert.equal(canSendTemplate({ slug: 'coordenadas', body: TEMPLATES.coordenadas.body }, { status: 'confirmada', amount_paid: 80, total_amount: 250 }), false);
});

test('botões em frase normal e redes só nos emails ao hóspede', () => {
  const html = render('pagamento');
  assert.ok(html.includes('>Ver a reserva e os pagamentos</a>') || html.includes('Recebemos'));
  assert.doesNotMatch(html, /CONSULTAR RESERVA|ACOMPANHE-NOS/);
});

test('aviso à equipa: datas legíveis, hóspede sem < >, contactos e botão', async () => {
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('org','Org','org');
    INSERT INTO users(id,name,email,password_hash) VALUES ('u','Dona','dona@exemplo.invalid','x');
    INSERT INTO memberships(id,organization_id,user_id,role) VALUES ('m','org','u','owner');`);
  sent.length = 0;
  await emailService.sendOwnerNewReservationEmail('org', GUEST, { id: 'SP-9', status: 'pendente', channel: 'website', check_in: '2035-11-14', check_out: '2035-11-16', nights: 2, num_guests: 2, total_amount: 250 }, UNIT, 'https://app.exemplo.invalid');
  const html = text(sent[0].html);
  assert.ok(html.includes('NOVO PEDIDO · POR APROVAR') && html.includes('Rui Marques · 14 → 16 nov 2035'));
  assert.ok(html.includes('rui@exemplo.invalid') && html.includes('+351910000000') && html.includes('>Site</td>'));
  assert.doesNotMatch(html, /&lt;rui@|2035-11-14/);
  assert.ok(html.includes('AVISO À EQUIPA') && html.includes('>Abrir no backoffice</a>'));
  assert.doesNotMatch(html, /sp-social-block/);

  sent.length = 0;
  db.exec(`INSERT INTO guests(id,organization_id,name,email) VALUES ('g','org','Rui Marques','rui@exemplo.invalid');
    INSERT INTO accommodations(id,organization_id,name,type,price_per_night) VALUES ('a','org','Suite King','alojamento',100);
    INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status)
      VALUES ('r','org','g','a','2035-11-14','2035-11-16',2,2,250,80,'cancelada');`);
  await require('../services/reservationEffects').runEffect('staff_email_cancelled', { organizationId: 'org', reservationId: 'r', payload: { reason: 'guest' } });
  const cancelled = text(sent[0].html);
  assert.ok(cancelled.includes('RESERVA CANCELADA PELO HÓSPEDE') && cancelled.includes('Rui Marques · 14 → 16 nov 2035'));
  assert.ok(cancelled.includes('AS DATAS FICARAM LIVRES'));
  assert.doesNotMatch(cancelled, /2035-11-14/);
});

test('emails de conta: papel em português e sempre "você"', async () => {
  db.exec(`INSERT INTO google_email_connections(organization_id,email,tokens) VALUES ('org','mail@exemplo.invalid','{}');`);
  const mail = require('../services/accountEmails');
  sent.length = 0;
  await mail.sendTeamInvitation('org', { to: 'x@exemplo.invalid', organizationName: 'Org', role: 'manager', url: 'https://exemplo.invalid/convite/a' });
  await mail.sendPasswordReset(db.prepare("SELECT * FROM users WHERE id='u'").get(), { to: 'dona@exemplo.invalid', url: 'https://exemplo.invalid/?reset=a' });
  const [invite, reset] = sent.map(m => text(require('../services/emailComposer').extractBody(m.html)));
  assert.ok(invite.includes('como <strong>gestor</strong>') && !invite.includes('manager'));
  assert.doesNotMatch(`${invite} ${reset}`, /\bteu\b|\bpediste\b|\bignora\b|Foste/);
  assert.doesNotMatch(sent[0].html, /sp-social-block/);
});

test('migração do desenho: aplica a todas as organizações e guarda a versão anterior', () => {
  db.exec(`INSERT INTO organization_email_templates(organization_id,slug,name,subject,body,active)
    VALUES ('org','obrigado','Obrigado','Antigo','<p>Texto antigo</p>',1)
    ON CONFLICT(organization_id, slug) DO UPDATE SET subject='Antigo', body='<p>Texto antigo</p>'`);
  db.prepare("DELETE FROM schema_migrations WHERE id = '20261028_email_design'").run();
  require('../config/migrations').runMigrations(db);
  const row = db.prepare("SELECT subject, body FROM organization_email_templates WHERE organization_id='org' AND slug='obrigado'").get();
  assert.equal(row.body, TEMPLATES.obrigado.body);
  const backup = db.prepare("SELECT body, reason FROM organization_email_templates_backup WHERE organization_id='org' AND slug='obrigado' ORDER BY id DESC").get();
  assert.deepEqual(backup, { body: '<p>Texto antigo</p>', reason: '20261028_email_design' });
  assert.equal(require('../services/emailDesign').restore(db, 'org', { slugs: ['obrigado'] }), 1);
  assert.equal(db.prepare("SELECT body FROM organization_email_templates WHERE organization_id='org' AND slug='obrigado'").get().body, '<p>Texto antigo</p>');
});
