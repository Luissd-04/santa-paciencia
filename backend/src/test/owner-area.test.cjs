// Área do proprietário (/api/owner): só o proprietário, dados da empresa (NIF),
// marca herdada pelos emails, portal e cabeçalho dos documentos, pedidos à
// plataforma (plano, encerramento), transferência de propriedade e registo de
// atividade de cada organização. HTTP real, SQLite em memória, sem rede.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-owner-area-'));
const previous = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'https://app.example.invalid' });
const app = require('../app');
const { db } = require('../config/database');
const auth = require('../services/authService');
const orgs = require('../services/orgService');
const ownerArea = require('../services/ownerArea');
const transfers = require('../services/ownershipTransfer');
const { runFrontend } = require('../test-support/frontend.cjs');
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

let seq = 0;
function person(org, role, name = `Pessoa ${++seq}`) {
  const email = `p${++seq}@example.invalid`;
  const user = auth.createUser({ name, email, password: 'SyntheticOwner123!' });
  orgs.createMembership({ organizationId: org.id, userId: user.id, role });
  return { ...user, email, role, organization_id: org.id, cookie: `${auth.SESSION_COOKIE}=${auth.createSession(user.id, org.id).sessionId}` };
}
const membershipOf = (who) => db.prepare('SELECT * FROM memberships WHERE user_id = ? AND organization_id = ?').get(who.id, who.organization_id);

async function call(who, method, url, body) {
  const res = await fetch(base + url, {
    method, headers: { Cookie: who.cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}

const orgA = orgs.createOrganization('Casa A');
const orgB = orgs.createOrganization('Casa B');
const ownerA = person(orgA, 'owner', 'Ana Dona');
const managerA = person(orgA, 'manager', 'Rui Gestor');
const staffA = person(orgA, 'staff', 'Sara Equipa');
const ownerB = person(orgB, 'owner', 'Bruno Dono');

const OWNER_ENDPOINTS = [
  ['GET', '/api/owner/summary'], ['GET', '/api/owner/company'], ['PUT', '/api/owner/company', { name: 'X' }],
  ['GET', '/api/owner/brand'], ['POST', '/api/owner/brand/logo', { image: 'x' }], ['DELETE', '/api/owner/brand/logo'],
  ['POST', '/api/owner/brand/logo/trim', {}], ['PUT', '/api/owner/brand/logo/crops', {}], ['PUT', '/api/owner/brand/color', { brand_color: '#123456' }],
  ['GET', '/api/owner/plans'], ['GET', '/api/owner/invoices'], ['POST', '/api/owner/plan-request', {}],
  ['GET', '/api/owner/audit'], ['GET', '/api/owner/audit.csv'],
  ['GET', '/api/owner/transfer'], ['POST', '/api/owner/transfer', {}], ['DELETE', '/api/owner/transfer'],
  ['GET', '/api/owner/closure'], ['POST', '/api/owner/closure', {}],
];

test('só o proprietário entra nos endpoints da Área do proprietário', async () => {
  for (const who of [managerA, staffA]) {
    for (const [method, url, body] of OWNER_ENDPOINTS) {
      const res = await call(who, method, url, body);
      assert.equal(res.status, 403, `${who.name} ${method} ${url}`);
    }
  }
  const anonymous = await fetch(base + '/api/owner/summary');
  assert.equal(anonymous.status, 401);
  // A transferência recebida é do gestor (o funcionário não chega lá).
  assert.equal((await call(staffA, 'GET', '/api/owner/incoming')).status, 403);
  assert.equal((await call(managerA, 'GET', '/api/owner/incoming')).status, 200);
  assert.equal((await call(ownerA, 'GET', '/api/owner/summary')).status, 200);
});

test('NIF português: dígito de controlo', () => {
  assert.equal(ownerArea.isValidPortugueseNif('123456789'), true);
  assert.equal(ownerArea.isValidPortugueseNif('501964843'), true);
  assert.equal(ownerArea.isValidPortugueseNif('123456780'), false);
  assert.equal(ownerArea.isValidPortugueseNif('12345678'), false);
  assert.equal(ownerArea.isValidPortugueseNif('023456789'), false);
  assert.equal(ownerArea.normalizeTaxId('PT 123 456 789', 'PT'), '123456789');
  // Fora de Portugal não se aplica o controlo português.
  assert.equal(ownerArea.normalizeTaxId('es-b12345678', 'ES'), 'ESB12345678');
});

test('dados da empresa: validação, nome editável e email para hóspedes nas definições', async () => {
  const bad = await call(ownerA, 'PUT', '/api/owner/company', { name: 'Casa A', tax_id: '123456780', tax_country: 'PT' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /NIF/);
  assert.equal((await call(ownerA, 'PUT', '/api/owner/company', { name: '  ' })).status, 400);
  assert.equal((await call(ownerA, 'PUT', '/api/owner/company', { name: 'Casa A', billing_email: 'não-é-email' })).status, 400);
  assert.equal((await call(ownerA, 'PUT', '/api/owner/company', { name: 'Casa A', phone: 'liga-me' })).status, 400);

  const ok = await call(ownerA, 'PUT', '/api/owner/company', {
    name: 'Casa do Monte', legal_name: 'Monte Turismo, Lda.', tax_country: 'PT', tax_id: '501 964 843',
    fiscal_address: 'Rua do Monte 1, 7000-123 Évora', billing_email: 'Faturas@Example.invalid', phone: '+351 912 000 000',
    guest_email: 'reservas@example.invalid',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.tax_id, '501964843');
  assert.equal(ok.body.data.billing_email, 'faturas@example.invalid');
  assert.equal(db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgA.id).name, 'Casa do Monte');
  // O email para hóspedes é o `email_contact` que os emails e o RGPD já usam.
  assert.equal(require('../services/settingsService').get(orgA.id, 'email_contact'), 'reservas@example.invalid');
  assert.equal(require('../services/emailService').getEmailSettings(null, orgA.id).email_contact, 'reservas@example.invalid');
  const rgpd = require('../services/rgpdService').generateRgpdDocument({ name: 'Hóspede' }, { id: 'r1' }, orgA.id);
  assert.match(rgpd.html, /Monte Turismo, Lda\. \(NIF 501964843\)/);
  // /auth/me leva o nome novo e os dados que entram nos documentos.
  const me = await call(ownerA, 'GET', '/auth/me');
  assert.equal(me.body.data.user.organization_name, 'Casa do Monte');
  assert.equal(me.body.data.user.organization.nif, '501964843');
  assert.equal(me.body.data.user.organization.legal_name, 'Monte Turismo, Lda.');
  const audit = db.prepare("SELECT meta FROM audit_events WHERE organization_id = ? AND action = 'organization.company_updated'").all(orgA.id);
  assert.ok(audit.length >= 1);
});

test('logótipo da organização: upload, recortes, /auth/me e herança no email, portal e documentos', async () => {
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 2000, height: 674, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: await sharp({ create: { width: 1400, height: 400, channels: 4, background: '#843424' } }).png().toBuffer(), left: 300, top: 137 }])
    .png().toBuffer();
  const up = await call(ownerA, 'POST', '/api/owner/brand/logo', { image: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const logo = up.body.data.logo_url;
  assert.match(logo, /^\/uploads\/orglogo_/);
  const trim = await call(ownerA, 'POST', '/api/owner/brand/logo/trim', {});
  assert.equal(trim.status, 200);
  assert.ok(trim.body.data.crop.w < 0.9, 'as margens brancas deviam ser detetadas');
  const square = { x: 0.3, y: 0.1, w: 674 * 0.8 / 2000, h: 0.8 };
  const saved = await call(ownerA, 'PUT', '/api/owner/brand/logo/crops', { crop: trim.body.data.crop, square });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.logo_original_url, logo);
  assert.match(saved.body.data.logo_mark_url, /\?crop=mark&w=160&v=/);
  // O quadrado da barra recolhida sai do original guardado na organização.
  const mark = await fetch(base + saved.body.data.logo_mark_url);
  assert.equal(mark.status, 200);
  assert.equal((await call(ownerA, 'PUT', '/api/owner/brand/color', { brand_color: 'vermelho' })).status, 400);
  assert.equal((await call(ownerA, 'PUT', '/api/owner/brand/color', { brand_color: '#2F5F86' })).body.data.brand_color, '#2f5f86');

  const me = await call(managerA, 'GET', '/auth/me');
  assert.equal(me.body.data.user.organization.logo_url, saved.body.data.logo_url);
  assert.equal(me.body.data.user.organization.logo_mark_url, saved.body.data.logo_mark_url);

  // Alojamento sem logótipo nem cor própria herda os da organização…
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests) VALUES ('casa', ?, 'Casa', 'alojamento', 100, 4)`).run(orgA.id);
  const emailService = require('../services/emailService');
  const acc = db.prepare("SELECT * FROM accommodations WHERE id = 'casa'").get();
  assert.equal(emailService.getEmailSettings(acc, orgA.id).logo_url, `https://app.example.invalid${saved.body.data.logo_url}`);
  db.prepare("INSERT INTO guests(id, organization_id, name, email) VALUES ('g', ?, 'Célia', 'c@example.invalid')").run(orgA.id);
  db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, amount_paid, status, public_token)
    VALUES ('r1', ?, 'g', 'casa', '2030-01-10', '2030-01-12', 2, 2, 200, 0, 'confirmada', ?)`).run(orgA.id, 'd'.repeat(64));
  const portal = require('../services/guestPortal').build(db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get());
  assert.equal(portal.logo_url, saved.body.data.logo_url);
  assert.equal(portal.color, '#2f5f86');
  // …e o email incorpora-o como anexo (CID), como os dos alojamentos.
  const mime = await require('../services/emailMime').buildEmailMimeBody(orgA.id, `<img src="https://app.example.invalid${saved.body.data.logo_url}">`);
  assert.match(mime, /Content-ID: <logo-/);
  // …mas o logótipo e a cor do alojamento prevalecem.
  db.prepare("UPDATE accommodations SET logo_url = '/uploads/proprio.png', color = '#111111' WHERE id = 'casa'").run();
  const own = db.prepare("SELECT * FROM accommodations WHERE id = 'casa'").get();
  assert.equal(emailService.getEmailSettings(own, orgA.id).logo_url, 'https://app.example.invalid/uploads/proprio.png');
  const portalOwn = require('../services/guestPortal').build(db.prepare("SELECT * FROM reservations WHERE id = 'r1'").get());
  assert.equal(portalOwn.color, '#111111');
  assert.equal(portalOwn.logo_url, '/uploads/proprio.png');
  db.exec("DELETE FROM reservations; DELETE FROM guests; DELETE FROM accommodations WHERE id = 'casa'");

  // A limpeza de órfãos não apaga o logótipo da organização (nem o original).
  const orphans = require('../services/uploadOrphans').findOrphans({ minAgeHours: 0 });
  assert.ok(!orphans.files.some(f => saved.body.data.logo_url.endsWith(f.path) || logo.endsWith(f.path)), JSON.stringify(orphans.files));
});

test('cabeçalho dos documentos: sem NIF nem logótipo no alojamento, os da empresa', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/features/documentos/dados.js'), 'utf8');
  const context = vm.createContext({ window: {}, console });
  context.window = context;
  // O marcador expõe as funções internas do ficheiro ao teste (test-support/frontend.cjs).
  runFrontend(`// Estado privado; (só no teste)\n${source}`, context);
  context.AppModules.define('core', {
    currentUser: { value: { organization_name: 'Casa do Monte', organization: { name: 'Casa do Monte', nif: '501964843', legal_name: 'Monte Turismo, Lda.', logo_url: '/uploads/orglogo_x.png' } } },
    accommodations: { value: [{ id: 'a', name: 'Suite Oliveira', address: 'Rua 1' }, { id: 'b', name: 'Quarto', nif: '123456789', logo_url: '/uploads/b.png' }] },
  });
  const header = context.cabecalho({ accommodation_id: 'a' });
  assert.equal(header.logo, '/uploads/orglogo_x.png');
  assert.ok(header.linhas.some(l => l.includes('Monte Turismo, Lda.') && l.includes('NIF 501964843')), JSON.stringify(header.linhas));
  const own = context.cabecalho({ accommodation_id: 'b' });
  assert.equal(own.logo, '/uploads/b.png');
  assert.ok(own.linhas.some(l => l === 'NIF 123456789'), JSON.stringify(own.linhas));
});

test('mudar de plano cria um pedido de suporte; só um aberto de cada vez', async () => {
  const plans = await call(ownerA, 'GET', '/api/owner/plans');
  assert.equal(plans.status, 200);
  assert.equal(plans.body.data.plans.length, 3);
  const premium = plans.body.data.plans.find(p => p.name === 'Premium');
  assert.equal((await call(ownerA, 'POST', '/api/owner/plan-request', { plan_id: 'nao-existe' })).status, 400);
  const created = await call(ownerA, 'POST', '/api/owner/plan-request', { plan_id: premium.id, note: 'Vamos abrir mais duas casas.' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(created.body.data.ticket.id);
  assert.equal(ticket.organization_id, orgA.id);
  assert.equal(ticket.subject, 'Mudança de plano: Premium');
  assert.match(db.prepare('SELECT body FROM support_messages WHERE ticket_id = ?').get(ticket.id).body, /Plano pedido: Premium[\s\S]*Vamos abrir/);
  assert.equal((await call(ownerA, 'POST', '/api/owner/plan-request', { plan_id: premium.id })).status, 409);
  assert.equal((await call(ownerA, 'GET', '/api/owner/plans')).body.data.request.plan_name, 'Premium');
  // Resolvido o pedido, pode pedir outro.
  db.prepare("UPDATE support_tickets SET status = 'resolved' WHERE id = ?").run(ticket.id);
  assert.equal((await call(ownerA, 'GET', '/api/owner/plans')).body.data.request, null);
  // Já no plano atual: recusado.
  db.prepare('UPDATE organizations SET plan_id = ? WHERE id = ?').run(premium.id, orgA.id);
  assert.equal((await call(ownerA, 'POST', '/api/owner/plan-request', { plan_id: premium.id })).status, 400);
  db.prepare('UPDATE organizations SET plan_id = NULL WHERE id = ?').run(orgA.id);
});

test('faturas da subscrição: só recebimentos com valor e data desta organização', async () => {
  const insert = db.prepare("INSERT INTO platform_records(id, kind, title, status, organization_id, related_id, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run('sub-a', 'subscription', 'Sub A', 'active', orgA.id, null, JSON.stringify({ amount_cents: 4900, billing: 'monthly', next_date: '2026-12-01', notes: 'interno' }));
  insert.run('e1', 'entry', 'Novembro', 'paid', orgA.id, 'sub-a', JSON.stringify({ direction: 'income', amount_cents: 4900, date: '2026-11-01', paid_date: '2026-11-02', notes: 'interno' }));
  insert.run('e2', 'entry', 'Despesa', 'paid', orgA.id, null, JSON.stringify({ direction: 'expense', amount_cents: 100, date: '2026-11-03' }));
  insert.run('e3', 'entry', 'Sem valor', 'pending', orgA.id, null, JSON.stringify({ direction: 'income', date: '2026-11-04' }));
  insert.run('e4', 'entry', 'Anulado', 'cancelled', orgA.id, null, JSON.stringify({ direction: 'income', amount_cents: 10, date: '2026-11-05' }));
  insert.run('e5', 'entry', 'Outra org', 'paid', orgB.id, null, JSON.stringify({ direction: 'income', amount_cents: 999, date: '2026-11-06' }));
  const res = await call(ownerA, 'GET', '/api/owner/invoices');
  assert.deepEqual(res.body.data.invoices, [{ id: 'e1', date: '2026-11-01', amount_cents: 4900, status: 'paid', paid_date: '2026-11-02' }]);
  assert.ok(!JSON.stringify(res.body).includes('interno'));
  const summary = await call(ownerA, 'GET', '/api/owner/summary');
  assert.equal(summary.body.data.subscription.next_date, '2026-12-01');
  assert.equal((await call(ownerB, 'GET', '/api/owner/invoices')).body.data.invoices[0].amount_cents, 999);
});

test('transferência de propriedade: só para gestores, aceitar troca os papéis numa só transação', async () => {
  const org = orgs.createOrganization('Casa T');
  const owner = person(org, 'owner', 'Teresa Dona');
  const manager = person(org, 'manager', 'Miguel Gestor');
  const staff = person(org, 'staff', 'Sofia Equipa');
  const other = person(orgB, 'manager', 'Gestor de outra');
  const ids = who => membershipOf(who).id;

  assert.equal((await call(owner, 'POST', '/api/owner/transfer', { membership_id: ids(staff) })).status, 400);
  assert.equal((await call(owner, 'POST', '/api/owner/transfer', { membership_id: ids(other) })).status, 404);
  const started = await call(owner, 'POST', '/api/owner/transfer', { membership_id: ids(manager) });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.data.transfer.to.name, 'Miguel Gestor');
  assert.equal((await call(owner, 'POST', '/api/owner/transfer', { membership_id: ids(manager) })).status, 409);
  // Nada mudou ainda; o gestor vê o pedido no sino e na rota própria.
  assert.equal(membershipOf(owner).role, 'owner');
  const bell = await call(manager, 'GET', '/api/reservations/notifications');
  assert.ok(bell.body.data.notifications.some(n => n.type === 'ownership_transfer'));
  assert.equal((await call(manager, 'GET', '/api/owner/incoming')).body.data.transfer.from.name, 'Teresa Dona');
  // Outra pessoa não o pode aceitar.
  const transferId = started.body.data.transfer.id;
  assert.equal((await call(staff, 'POST', '/api/owner/incoming/accept', { id: transferId })).status, 403);

  // Cancelar.
  assert.equal((await call(owner, 'DELETE', '/api/owner/transfer')).status, 200);
  assert.equal((await call(manager, 'POST', '/api/owner/incoming/accept', { id: transferId })).status, 409);

  // Novo pedido, aceite: o gestor passa a proprietário e o antigo a gestor.
  const again = await call(owner, 'POST', '/api/owner/transfer', { membership_id: ids(manager) });
  assert.equal(again.status, 201);
  const accepted = await call(manager, 'POST', '/api/owner/incoming/accept', { id: again.body.data.transfer.id });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(membershipOf(manager).role, 'owner');
  assert.equal(membershipOf(owner).role, 'manager');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE organization_id = ? AND role = 'owner'").get(org.id).n, 1);
  const actions = db.prepare('SELECT action FROM audit_events WHERE organization_id = ? ORDER BY created_at').all(org.id).map(r => r.action);
  assert.ok(actions.includes('ownership.transfer_started') && actions.includes('ownership.transfer_cancelled') && actions.includes('ownership.transfer_accepted'));
  assert.equal(actions.filter(a => a === 'team.role_changed').length, 2);
  // O antigo proprietário já não entra na Área; o novo sim.
  assert.equal((await call(owner, 'GET', '/api/owner/summary')).status, 403);
  assert.equal((await call(manager, 'GET', '/api/owner/summary')).status, 200);
});

test('transferência: aceitar falha se o destinatário deixou de ser gestor; expira ao fim de 7 dias', async () => {
  const org = orgs.createOrganization('Casa E');
  const owner = person(org, 'owner');
  const manager = person(org, 'manager');
  const started = await call(owner, 'POST', '/api/owner/transfer', { membership_id: membershipOf(manager).id });
  db.prepare("UPDATE memberships SET role = 'staff' WHERE id = ?").run(membershipOf(manager).id);
  // Como funcionário já não chega à rota (gestor no mínimo)…
  assert.equal((await call(manager, 'POST', '/api/owner/incoming/accept', { id: started.body.data.transfer.id })).status, 403);
  // …e mesmo pelo serviço a troca é recusada sem mexer em nada.
  assert.throws(() => transfers.accept({ id: manager.id, organization_id: org.id }, { id: started.body.data.transfer.id }), /gestor ativo/);
  assert.equal(membershipOf(owner).role, 'owner');
  db.prepare("UPDATE memberships SET role = 'manager' WHERE id = ?").run(membershipOf(manager).id);

  // Expira: passa a «expired», sai do sino e não se pode aceitar.
  db.prepare("UPDATE ownership_transfers SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(started.body.data.transfer.id);
  assert.equal((await call(owner, 'GET', '/api/owner/transfer')).body.data.transfer, null);
  assert.equal(db.prepare('SELECT status FROM ownership_transfers WHERE id = ?').get(started.body.data.transfer.id).status, 'expired');
  const bell = await call(manager, 'GET', '/api/reservations/notifications');
  assert.ok(!bell.body.data.notifications.some(n => n.type === 'ownership_transfer'));
  assert.equal((await call(manager, 'POST', '/api/owner/incoming/accept', { id: started.body.data.transfer.id })).status, 410);
  assert.equal(membershipOf(owner).role, 'owner');
  assert.ok(db.prepare("SELECT 1 FROM audit_events WHERE organization_id = ? AND action = 'ownership.transfer_expired'").get(org.id));
  // A equipa continua a não aceitar «owner» pelos papéis normais.
  const patch = await call(owner, 'PATCH', `/api/team/members/${membershipOf(manager).id}`, { role: 'owner' });
  assert.equal(patch.status, 400);
  assert.match(patch.body.error, /Área do proprietário/);
});

test('pedir encerramento exige cópia nas últimas 24 h (ou confirmação) e cria um pedido de suporte', async () => {
  const org = orgs.createOrganization('Casa F');
  const owner = person(org, 'owner');
  const refused = await call(owner, 'POST', '/api/owner/closure', {});
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'backup_required');
  // Cópia antiga não conta.
  db.prepare("INSERT INTO audit_events(id, organization_id, user_id, action, created_at) VALUES ('old', ?, ?, 'backup.exported', '2000-01-01T00:00:00.000Z')").run(org.id, owner.id);
  assert.equal((await call(owner, 'POST', '/api/owner/closure', {})).status, 409);
  // Cópia descarregada agora: passa.
  const zip = await fetch(base + '/api/backup/export', { headers: { Cookie: owner.cookie } });
  assert.equal(zip.status, 200);
  await zip.arrayBuffer();
  const created = await call(owner, 'POST', '/api/owner/closure', { reason: 'Vamos vender a casa.' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(created.body.data.ticket.id);
  assert.equal(ticket.subject, 'Pedido de encerramento da conta');
  assert.equal(ticket.organization_id, org.id);
  assert.equal((await call(owner, 'POST', '/api/owner/closure', { confirm_without_backup: true })).status, 409);
  // Nada foi apagado.
  assert.ok(db.prepare('SELECT 1 FROM organizations WHERE id = ?').get(org.id));

  const other = orgs.createOrganization('Casa G');
  const owner2 = person(other, 'owner');
  assert.equal((await call(owner2, 'POST', '/api/owner/closure', { confirm_without_backup: true })).status, 201);
});

test('registo de atividade: só desta organização, filtros, páginas e CSV sem fórmulas', async () => {
  const org = orgs.createOrganization('Casa H');
  const owner = person(org, 'owner', '=SOMA(A1)');
  const manager = person(org, 'manager', 'Gestor H');
  const { recordAudit } = require('../services/auditLog');
  for (let i = 0; i < 60; i++) recordAudit({ organizationId: org.id, userId: owner.id, action: 'backup.exported', meta: { reservations: i, guests: 1 } });
  recordAudit({ organizationId: org.id, userId: owner.id, action: 'team.role_changed', targetType: 'user', targetId: manager.id, meta: { from: 'staff', to: 'manager' } });
  recordAudit({ organizationId: orgB.id, userId: ownerB.id, action: 'backup.exported', meta: { reservations: 1, guests: 1 } });

  const first = await call(owner, 'GET', '/api/owner/audit');
  assert.equal(first.status, 200);
  assert.equal(first.body.data.events.length, 50);
  assert.ok(first.body.data.next);
  assert.ok(first.body.data.people.some(p => p.name === '=SOMA(A1)'));
  assert.ok(!first.body.data.people.some(p => p.id === ownerB.id));
  const second = await call(owner, 'GET', `/api/owner/audit?before=${encodeURIComponent(first.body.data.next)}`);
  assert.equal(second.body.data.events.length, 11);
  assert.equal(second.body.data.next, null);
  const ids = new Set([...first.body.data.events, ...second.body.data.events].map(e => e.id));
  assert.equal(ids.size, 61);
  const team = await call(owner, 'GET', '/api/owner/audit?type=team');
  assert.equal(team.body.data.events.length, 1);
  assert.equal(team.body.data.events[0].text, 'mudou o papel de Gestor H de Funcionário para Gestor');
  assert.equal((await call(owner, 'GET', `/api/owner/audit?user=${manager.id}`)).body.data.events.length, 0);
  assert.equal((await call(owner, 'GET', '/api/owner/audit?type=nada')).status, 400);
  // A outra organização não aparece.
  const b = await call(ownerB, 'GET', '/api/owner/audit');
  assert.ok(b.body.data.events.every(e => e.actor?.id !== owner.id));

  const csv = await call(owner, 'GET', '/api/owner/audit.csv?type=team');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.body, /"'=SOMA\(A1\)"/);
  assert.ok(!/;"=/.test(csv.body));
});
