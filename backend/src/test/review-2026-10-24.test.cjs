// Regressões da revisão de 24/10/2026: SQLite em memória, HTTP local e
// fornecedores desligados (sem Gmail, Stripe ou Google reais).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const previousCwd = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-review-1024-'));
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test', EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'http://localhost:3001' });
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'TOKEN_ENCRYPTION_KEY']) delete process.env[key];
const originalFetch = global.fetch;
global.fetch = (url, options) => {
  if (!String(url).startsWith('http://127.0.0.1:')) throw new Error('External request blocked');
  return originalFetch(url, options);
};

const app = require(path.join(root, 'app'));
const { db } = require(path.join(root, 'config/database'));
const auth = require(path.join(root, 'services/authService'));
const orgs = require(path.join(root, 'services/orgService'));
const vouchers = require(path.join(root, 'services/voucherService'));
const policy = require(path.join(root, 'services/paymentPolicy'));
const { localDateIso, getPaymentStatus } = require(path.join(root, 'services/reservationRules'));

let server, base, org;
const sessions = {};
const row = id => db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
const voucherRow = id => vouchers.getVoucher(org.id, id);

async function req(method, url, body, role = 'owner') {
  const response = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `${auth.SESSION_COOKIE}=${sessions[role]}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
let seq = 0;
const isoPlus = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
// Cada reserva recebe um intervalo próprio de 2 noites: nunca se sobrepõem.
async function create(extra = {}) {
  seq++;
  const checkIn = isoPlus('2036-01-01', seq * 4);
  const result = await req('POST', '/api/reservations', {
    accommodation_id: 'a', check_in: checkIn, check_out: isoPlus(checkIn, 2),
    num_adults: 1, num_children: 0, guest: { name: `Guest ${seq}`, email: `guest-${seq}@example.invalid` }, ...extra,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}
function addVoucher(id, type, value, maxUses = 1, extra = {}) {
  db.prepare(`INSERT INTO vouchers(id, organization_id, code, type, value, status, max_uses, min_nights, accommodation_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(id, org.id, id.toUpperCase(), type, value, maxUses, extra.min_nights || 0, extra.accommodation_id || null);
}

before(async () => {
  org = orgs.createOrganization('Review 1024');
  for (const role of ['owner', 'manager', 'staff']) {
    const user = auth.createUser({ name: role, email: `${role}-1024@example.invalid`, password: 'Synthetic123!' });
    orgs.createMembership({ organizationId: org.id, userId: user.id, role });
    sessions[role] = auth.createSession(user.id, org.id).sessionId;
  }
  db.prepare(`INSERT INTO organization_settings(organization_id, key, value) VALUES (?, 'services', ?)
    ON CONFLICT(organization_id, key) DO UPDATE SET value = excluded.value`).run(org.id, JSON.stringify([{ id: 'tourist_tax', active: false }]));
  db.prepare(`INSERT INTO accommodations(id, organization_id, name, type, price_per_night, max_guests, public_slug)
    VALUES ('a', ?, 'A', 'alojamento', 100, 4, 'casa-review')`).run(org.id);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  db.close();
  process.chdir(previousCwd);
  fs.rmSync(temp, { recursive: true, force: true });
  global.fetch = originalFetch;
});

test('mover as datas de uma reserva com voucher volta a aplicar o desconto', async () => {
  addVoucher('move10', 'discount_pct', 10);
  const r = await create({ voucher_code: 'MOVE10' });
  assert.equal(r.total_amount, 180);
  const moved = await req('PUT', `/api/reservations/${r.id}`, { check_in: '2037-02-24', check_out: '2037-02-26' });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(row(r.id).total_amount, 180);
  assert.equal(row(r.id).price_edited_at, null);
  assert.equal(voucherRow('move10').status, 'used');
  // Estadia que deixa de cumprir o voucher: o operador tem de confirmar o total.
  addVoucher('long10', 'discount_pct', 10, 1, { min_nights: 2 });
  const longStay = await create({ voucher_code: 'LONG10' });
  const shorter = await req('PUT', `/api/reservations/${longStay.id}`, { check_out: isoPlus(longStay.check_in, 1) });
  assert.equal(shorter.status, 409);
  assert.equal(row(longStay.id).total_amount, 180);
});

test('a edição completa do wizard com o total visível não aplica o voucher duas vezes', async () => {
  addVoucher('wiz10', 'discount_pct', 10);
  const r = await create({ voucher_code: 'WIZ10' });
  const nights = JSON.parse(row(r.id).nightly_prices).map(n => ({ date: n.date, price: 90 }));
  const saved = await req('PUT', `/api/reservations/${r.id}`, {
    check_in: r.check_in, check_out: r.check_out, num_adults: 1, num_children: 0, num_guests: 1,
    breakfast_included: false, nightly_prices: nights, total_amount: 180, notes: 'wizard',
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(row(r.id).total_amount, 180);
});

test('crédito de estadia vale as primeiras N noites; percentagens arredondam ao cêntimo', async () => {
  addVoucher('free1', 'credit_stay', 1);
  const r = await create({ voucher_code: 'FREE1' });
  assert.equal(r.total_amount, 100);
  assert.equal(vouchers.voucherDiscount({ type: 'discount_pct', value: 7 }, 123.45), 8.64);
  assert.equal(vouchers.voucherDiscount({ type: 'credit_stay', value: 5 }, 150, [{ price: 100 }, { price: 50 }]), 150);
  assert.equal(getPaymentStatus(0, 0), 'confirmado');
  assert.equal(getPaymentStatus(0, 0, 'reembolsado'), 'reembolsado');
});

test('acompanhantes gravados não se duplicam e não renomeiam o titular', async () => {
  const r = await create({ num_adults: 2, guests_data: [{ name: 'Companion Review', email: '' }] });
  const count = () => db.prepare("SELECT COUNT(*) AS n FROM guests WHERE name = 'Companion Review'").get().n;
  assert.equal(count(), 1);
  for (let i = 0; i < 3; i++) {
    const stored = JSON.parse(row(r.id).guests_data);
    assert.equal((await req('PUT', `/api/reservations/${r.id}`, { notes: `n${i}`, guests_data: stored })).status, 200);
  }
  assert.equal(count(), 1);
  const main = db.prepare('SELECT * FROM guests WHERE id = ?').get(r.guest_id);
  await req('PUT', `/api/reservations/${r.id}`, { guests_data: [{ name: 'Family Member', email: main.email }] });
  assert.equal(db.prepare('SELECT name FROM guests WHERE id = ?').get(r.guest_id).name, main.name);
});

test('migração: reservas em pré-check-in passam a ativas, com o pré-check-in enviado à parte', () => {
  const lifecycle = require(path.join(root, 'services/reservationLifecycle'));
  const { precheckinState } = require(path.join(root, 'services/reservationState'));
  const g = require(path.join(root, 'services/publicGuestService')).createReservationGuest(org.id, { name: 'Arrival', email: 'arrival@example.invalid' });
  const insert = (id, channel, paid, submitted = null) => db.prepare(`INSERT INTO reservations(id, organization_id, guest_id, accommodation_id, check_in, check_out, nights,
      num_guests, total_amount, status, payment_status, amount_paid, channel, precheckin_submitted_at)
    VALUES (?, ?, ?, 'a', '2035-07-01', '2035-07-03', 2, 1, 200, 'pre_checkin', 'pendente', ?, ?, ?)`).run(id, org.id, g.id, paid, channel, submitted);
  insert('PC-DIRECT', 'direto', 0);
  insert('PC-AIRBNB', 'airbnb', 0, '2035-06-01 10:00:00');
  insert('PC-DEPOSIT', 'direto', 50);
  db.exec("DELETE FROM schema_migrations WHERE id IN ('20261025_reservation_states', '20261025_reservation_states_ledger')");
  require(path.join(root, 'config/migrations')).runMigrations(db);
  assert.equal(row('PC-DIRECT').status, 'aguardar_pagamento');
  assert.equal(precheckinState(row('PC-DIRECT')), 'enviado');
  assert.equal(row('PC-AIRBNB').status, 'confirmada');
  assert.equal(precheckinState(row('PC-AIRBNB')), 'preenchido');
  assert.equal(row('PC-DEPOSIT').status, 'aguardar_pagamento');
  // O sinal já pago (50 de 200, sinal de 20%) confirma no acerto pelo ledger.
  assert.ok(lifecycle.reconcileLegacyStatuses() >= 2);
  assert.equal(row('PC-DEPOSIT').status, 'confirmada');
  assert.equal(row('PC-DEPOSIT').amount_paid, 50);
  assert.equal(row('PC-DIRECT').status, 'aguardar_pagamento');
  assert.equal(lifecycle.reconcileLegacyStatuses(), 0);
});

test('expiração por TTL só cancela pedidos nunca aceites, regista-o e liberta o voucher', async () => {
  const scheduler = require(path.join(root, 'services/reservationScheduler'));
  addVoucher('ttl10', 'discount_pct', 10);
  const pending = await create({ voucher_code: 'TTL10', status: 'pendente', channel: 'website' });
  const approved = await create({ status: 'pendente', channel: 'website' });
  assert.equal((await req('POST', `/api/reservations/${approved.id}/approve`, {})).status, 200);
  db.prepare("UPDATE reservations SET status = 'aguardar_pagamento' WHERE id = ?").run(approved.id);
  // Pedido por aprovar a quem a equipa já enviou o link do pré-check-in.
  const linked = await create({ status: 'pendente', channel: 'website' });
  assert.equal((await req('POST', `/api/reservations/${linked.id}/send-precheckin`, { send: false })).status, 200);
  db.prepare("UPDATE reservations SET created_at = datetime('now', '-72 hours') WHERE id IN (?, ?, ?)").run(pending.id, approved.id, linked.id);
  scheduler.expirePendingReservations();
  assert.equal(row(linked.id).status, 'pendente');
  assert.equal(row(pending.id).status, 'cancelada');
  assert.equal(row(pending.id).cancelled_previous_status, 'pendente');
  assert.equal(row(approved.id).status, 'aguardar_pagamento');
  assert.ok(db.prepare("SELECT 1 FROM reservation_history WHERE reservation_id = ? AND action = 'cancelled' AND meta LIKE '%ttl%'").get(pending.id));
  assert.equal(voucherRow('ttl10').used_count, 0);
  assert.equal(voucherRow('ttl10').status, 'active');
});

test('cancelar liberta o voucher só sem pagamentos; reativar volta a consumi-lo', async () => {
  addVoucher('cancel10', 'discount_pct', 10);
  const unpaid = await create({ voucher_code: 'CANCEL10' });
  assert.equal((await req('DELETE', `/api/reservations/${unpaid.id}`, {})).status, 200);
  assert.equal(voucherRow('cancel10').used_count, 0);
  // Repetir o cancelamento não volta a notificar nem altera o estado anterior.
  assert.equal((await req('DELETE', `/api/reservations/${unpaid.id}`, {})).body.message, 'A reserva já estava cancelada.');
  assert.equal((await req('PUT', `/api/reservations/${unpaid.id}`, { status: 'confirmada' })).status, 200);
  assert.equal(voucherRow('cancel10').used_count, 1);
  assert.equal(voucherRow('cancel10').status, 'used');

  addVoucher('paid10', 'discount_pct', 10);
  const paid = await create({ voucher_code: 'PAID10' });
  assert.equal((await req('POST', `/api/reservations/${paid.id}/payments`, { amount: 20 })).status, 200);
  assert.equal((await req('DELETE', `/api/reservations/${paid.id}`, {})).status, 200);
  assert.equal(voucherRow('paid10').used_count, 1);

  // Voucher entretanto usado noutra reserva: a reativação é recusada.
  addVoucher('race10', 'discount_pct', 10);
  const first = await create({ voucher_code: 'RACE10' });
  await req('DELETE', `/api/reservations/${first.id}`, {});
  await create({ voucher_code: 'RACE10' });
  const reactivated = await req('PUT', `/api/reservations/${first.id}`, { status: 'confirmada' });
  assert.equal(reactivated.status, 409);
  assert.equal(row(first.id).status, 'cancelada');
});

test('apagar definitivamente conserva reservas com movimentos de pagamento', async () => {
  const r = await create({});
  const payment = await req('POST', `/api/reservations/${r.id}/payments`, { amount: 30 });
  await req('DELETE', `/api/reservations/${r.id}`, {});
  assert.equal((await req('DELETE', `/api/reservations/${r.id}/permanent`, {})).status, 409);
  assert.ok(row(r.id));
  await req('DELETE', `/api/reservations/${r.id}/payments/${payment.body.data.id}`);
  db.prepare("UPDATE reservations SET status = 'cancelada' WHERE id = ?").run(r.id);
  assert.equal((await req('DELETE', `/api/reservations/${r.id}/permanent`, {})).status, 200);
  assert.equal(row(r.id), undefined);
});

test('staff consulta hóspedes mas não os cria nem edita', async () => {
  const r = await create({});
  assert.equal((await req('GET', `/api/guests/${r.guest_id}`, undefined, 'staff')).status, 200);
  assert.equal((await req('PUT', `/api/guests/${r.guest_id}`, { is_vip: true }, 'staff')).status, 403);
  assert.equal((await req('POST', '/api/guests', { name: 'Staff Guest' }, 'staff')).status, 403);
  assert.equal((await req('PUT', `/api/guests/${r.guest_id}`, { is_vip: true }, 'manager')).status, 200);
});

test('notas não interrompem um pagamento online em curso; alterar a estadia sim', async () => {
  const r = await create({});
  db.prepare(`INSERT INTO stripe_payment_attempts(id, reservation_id, organization_id, amount_cents, livemode, state, snapshot, request_json, checkout_session_id)
    VALUES ('att-notes', ?, ?, 20000, 0, 'open', 'x', '{}', 'cs_test_notes')`).run(r.id, org.id);
  const notes = await req('PUT', `/api/reservations/${r.id}`, { notes: 'Chega tarde', arrival_time: '22:00', breakfast_included: false, num_adults: '1' });
  assert.equal(notes.status, 200, JSON.stringify(notes.body));
  assert.equal(db.prepare("SELECT state FROM stripe_payment_attempts WHERE id = 'att-notes'").get().state, 'open');
  const dates = await req('PUT', `/api/reservations/${r.id}`, { check_out: isoPlus(r.check_in, 3) });
  assert.notEqual(dates.status, 200);
  db.prepare("DELETE FROM stripe_payment_attempts WHERE id = 'att-notes'").run();
});

test('aprovar não faz recuar estadias em curso; totais acima do limite comum são recusados', async () => {
  const r = await create({});
  db.prepare("UPDATE reservations SET status = 'check_out' WHERE id = ?").run(r.id);
  assert.equal((await req('POST', `/api/reservations/${r.id}/approve`, {})).status, 409);
  assert.equal(row(r.id).status, 'check_out');
  assert.equal((await req('PUT', `/api/reservations/${r.id}`, { total_amount: 1000000 })).status, 400);
  assert.equal((await req('PUT', `/api/reservations/${r.id}`, { total_amount: ' ' })).status, 400);
});

test('reserva pública recusa e marca indisponíveis datas passadas', async () => {
  const yesterday = localDateIso(new Date(), -1);
  const today = localDateIso();
  const availability = await fetch(`${base}/api/public/booking/casa-review/availability?check_in=${yesterday}&check_out=${today}`).then(r => r.json());
  assert.ok(availability.data.every(unit => unit.available === false));
  const booked = await fetch(`${base}/api/public/booking/casa-review/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accommodation_id: 'a', check_in: yesterday, check_out: today, num_guests: 1, elapsed_ms: 9000,
      guest: { name: 'Past Guest', email: 'past@example.invalid' }, rgpd_consent: true }),
  });
  assert.equal(booked.status, 400);
  assert.match((await booked.json()).error, /já passou/);
});

test('política de pagamentos só para o site e o canal direto', async () => {
  policy.savePolicy(org.id, { ...structuredClone(policy.DEFAULT_POLICY), enabled: true });
  try {
    const airbnb = await create({ channel: 'airbnb' });
    assert.equal(row(airbnb.id).payment_policy_json, null);
    assert.equal(row(airbnb.id).status, 'confirmada');
    const direct = await create({ channel: 'direto' });
    assert.ok(row(direct.id).payment_policy_json);
    assert.equal(row(direct.id).status, 'aguardar_pagamento');
  } finally {
    policy.savePolicy(org.id, structuredClone(policy.DEFAULT_POLICY));
  }
});

test('emails: endereços de marcador e reservas por aceitar não recebem mensagens agendadas', () => {
  const { isDeliverableEmail } = require(path.join(root, 'services/emailAddress'));
  const { canSendTemplate } = require(path.join(root, 'services/emailEligibility'));
  assert.equal(isDeliverableEmail('sp-interno-x@reserva.local'), false);
  assert.equal(isDeliverableEmail('guest_x@sem-email.local'), false);
  assert.equal(isDeliverableEmail('hospede@example.com'), true);
  for (const status of ['pendente', 'pre_reserva', 'aguardar_pagamento']) {
    assert.equal(canSendTemplate({ slug: 'boas_vindas', timing_event: 'checkin' }, { status }), false, status);
  }
  assert.equal(canSendTemplate({ slug: 'boas_vindas', timing_event: 'checkin' }, { status: 'confirmada' }), true);
  assert.equal(canSendTemplate({ slug: 'confirmacao', timing_event: null }, { status: 'pendente' }), true);
});

test('envio incerto bloqueia versões novas da mesma mensagem até ser resolvido', async () => {
  const delivery = require(path.join(root, 'services/emailDelivery'));
  const r = await create({});
  const reservation = row(r.id);
  let sends = 0;
  const failing = async () => { sends++; throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); };
  await assert.rejects(delivery.deliverTemplate({ orgId: org.id, slug: 'pagamento', reservation, to: 'h@example.com', rendered: { subject: 'A', html: 'a' } }, failing));
  const ok = async () => { sends++; return { id: 'gmail-1' }; };
  const blocked = await delivery.deliverTemplate({ orgId: org.id, slug: 'pagamento', reservation: { ...reservation, amount_paid: 50 }, to: 'h@example.com', rendered: { subject: 'B', html: 'b' } }, ok);
  assert.deepEqual(blocked, { queued: true, delivery_status: 'uncertain' });
  assert.equal(sends, 1);
  const notifications = await req('GET', '/api/reservations/notifications');
  assert.ok(notifications.body.data.notifications.some(n => n.type === 'email_review' && n.template_slug === 'pagamento' && n.reservation_id === r.id));
  assert.equal((await req('POST', `/api/reservations/${r.id}/email-deliveries/resolve`, { template_slug: 'pagamento', resolution: 'sent' }, 'staff')).status, 403);
  assert.equal((await req('POST', `/api/reservations/${r.id}/email-deliveries/resolve`, { template_slug: 'pagamento', resolution: 'sent' })).status, 200);
  const sent = await delivery.deliverTemplate({ orgId: org.id, slug: 'pagamento', reservation: { ...reservation, amount_paid: 50 }, to: 'h@example.com', rendered: { subject: 'B', html: 'b' } }, ok);
  assert.equal(sent.id, 'gmail-1');
  assert.equal(sends, 2);
});

test('pré-visualização do total: igual ao que o PUT grava e sem escrever na base', async () => {
  addVoucher('quote10', 'discount_pct', 10);
  const r = await create({ voucher_code: 'QUOTE10' });
  const before = { reservation: row(r.id), redemption: db.prepare('SELECT * FROM voucher_redemptions WHERE reservation_id = ?').get(r.id) };
  const body = { check_in: '2038-03-01', check_out: '2038-03-04' };
  const quoted = await req('POST', `/api/reservations/${r.id}/quote`, body);
  assert.equal(quoted.status, 200, JSON.stringify(quoted.body));
  assert.equal(quoted.body.data.total_amount, 270);
  assert.equal(quoted.body.data.voucher.code, 'QUOTE10');
  assert.equal(quoted.body.data.voucher.applied, true);
  assert.equal(quoted.body.data.voucher.discount_amount, 30);
  assert.deepEqual(row(r.id), before.reservation);
  assert.deepEqual(db.prepare('SELECT * FROM voucher_redemptions WHERE reservation_id = ?').get(r.id), before.redemption);
  const saved = await req('PUT', `/api/reservations/${r.id}`, { ...body, expected_total: quoted.body.data.total_amount });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(row(r.id).total_amount, 270);
  assert.equal((await req('POST', `/api/reservations/${r.id}/quote`, {}, 'staff')).status, 403);
});

test('total mostrado desatualizado: o servidor recusa e devolve o novo total', async () => {
  addVoucher('stale10', 'discount_pct', 10, 5);
  const r = await create({ voucher_code: 'STALE10' });
  const stale = await req('PUT', `/api/reservations/${r.id}`, { check_in: '2038-05-01', check_out: '2038-05-04', expected_total: 300 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'total_changed');
  assert.equal(stale.body.details.total_amount, 270);
  assert.equal(row(r.id).total_amount, 180);
  const created = await req('POST', '/api/reservations', {
    accommodation_id: 'a', check_in: '2038-06-01', check_out: '2038-06-03', num_adults: 1,
    guest: { name: 'Stale', email: 'stale@example.invalid' }, voucher_code: 'STALE10', expected_total: 200,
  });
  assert.equal(created.status, 409);
  assert.equal(created.body.details.total_amount, 180);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE email = 'stale@example.invalid'").get().n, 0, 'a transação foi anulada');
});

test('voucher que deixa de valer: a pré-visualização explica e o PUT exige o total confirmado', async () => {
  addVoucher('min2', 'discount_pct', 10, 1, { min_nights: 2 });
  const r = await create({ voucher_code: 'MIN2' });
  const body = { check_out: isoPlus(r.check_in, 1) };
  const quoted = await req('POST', `/api/reservations/${r.id}/quote`, body);
  assert.equal(quoted.body.data.total_amount, 100);
  assert.equal(quoted.body.data.voucher.applied, false);
  assert.equal(quoted.body.data.voucher.issue.code, 'voucher_min_nights');
  assert.equal(quoted.body.data.confirmation.code, 'voucher_min_nights');
  const refused = await req('PUT', `/api/reservations/${r.id}`, body);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'voucher_min_nights');
  assert.equal(refused.body.details.total_amount, 100);
  const confirmed = await req('PUT', `/api/reservations/${r.id}`, { ...body, total_amount: 100, expected_total: 100 });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(row(r.id).total_amount, 100);
});

test('pré-visualização de reserva nova: aplica o voucher sem o consumir e explica um código inválido', async () => {
  addVoucher('new10', 'discount_pct', 10);
  const stay = { accommodation_id: 'a', check_in: '2038-07-01', check_out: '2038-07-03', num_adults: 1 };
  const valid = await req('POST', '/api/reservations/quote', { ...stay, voucher_code: 'new10' });
  assert.equal(valid.status, 200, JSON.stringify(valid.body));
  assert.equal(valid.body.data.total_amount, 180);
  assert.equal(valid.body.data.voucher.applied, true);
  assert.equal(voucherRow('new10').used_count, 0);
  const invalid = await req('POST', '/api/reservations/quote', { ...stay, voucher_code: 'NAOEXISTE' });
  assert.equal(invalid.body.data.total_amount, 200);
  assert.equal(invalid.body.data.voucher.issue.blocking, true);
  const manual = await req('POST', '/api/reservations/quote', { ...stay, voucher_code: 'NEW10', total_amount: 150 });
  assert.equal(manual.body.data.total_amount, 150);
  assert.equal(manual.body.data.voucher.issue.code, 'manual_total');
});

test('criação repetida com a mesma chave devolve a reserva já criada, sem duplicar', async () => {
  const body = { accommodation_id: 'a', check_in: '2038-09-01', check_out: '2038-09-03', num_adults: 1,
    guest: { name: 'Repetição', email: 'repeticao@example.invalid' }, idempotency_key: 'intent-repeticao-0001' };
  const first = await req('POST', '/api/reservations', body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const again = await req('POST', '/api/reservations', body);
  assert.equal(again.status, 200);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.data.id, first.body.data.id);
  const changed = await req('POST', '/api/reservations', { ...body, notes: 'outra coisa' });
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, new RegExp(first.body.data.id));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.email = 'repeticao@example.invalid'").get().n, 1);
  // Pedidos simultâneos com a mesma chave: uma reserva.
  const parallel = { ...body, check_in: '2038-10-01', check_out: '2038-10-03', idempotency_key: 'intent-repeticao-0002' };
  const results = await Promise.all([req('POST', '/api/reservations', parallel), req('POST', '/api/reservations', parallel)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  assert.equal(results[0].body.data.id, results[1].body.data.id);
  assert.equal((await req('POST', '/api/reservations', { ...body, idempotency_key: 'curta' })).status, 400);
});
