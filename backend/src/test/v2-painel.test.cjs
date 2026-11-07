// V2: aspeto escolhido por cada pessoa e dados do painel novo (hoje, atenção,
// por receber e ocupação do mês anterior).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-v2-painel-'));
const originalCwd = process.cwd();
process.chdir(temp);
Object.assign(process.env, { DB_PATH: ':memory:', NODE_ENV: 'test' });
const { db, initDatabase } = require('../config/database');
initDatabase();
const orgs = require('../services/orgService');
const auth = require('../services/authService');
const appearance = require('../services/appearancePrefs');
const { dashboardToday } = require('../services/dashboardToday');
const { addDays } = require('../services/dates');
const org = orgs.createOrganization('Painel');
const user = auth.createUser({ name: 'Célia', email: 'celia@example.invalid', password: 'SyntheticPainel123!' });
orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

test('aspeto: atual por omissão, guarda escolhas válidas e recusa as outras', () => {
  assert.deepEqual(appearance.get(user.id), { look: 'atual', mode: 'auto' });
  assert.deepEqual(appearance.save(user.id, { look: 'vidro', mode: 'escuro' }), { look: 'vidro', mode: 'escuro' });
  assert.deepEqual(appearance.get(user.id), { look: 'vidro', mode: 'escuro' });
  assert.throws(() => appearance.save(user.id, { look: 'neon' }), /Aspeto inválido/);
  assert.throws(() => appearance.save(user.id, { look: 'vidro', mode: 'sepia' }), /Modo inválido/);
  assert.throws(() => appearance.save(user.id, null), /Aparência inválida/);
  assert.deepEqual(appearance.get(user.id), { look: 'vidro', mode: 'escuro' }, 'uma escolha inválida não apaga a anterior');
});

test('painel: hoje por hora, o que precisa de atenção e o valor por receber', () => {
  const today = '2030-07-06';
  db.prepare(`INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests,checkin_time,checkout_time) VALUES('u',?,'Suite','alojamento',100,2,'15:00','11:00')`).run(org.id);
  const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
  const res = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,amount_paid,status,arrival_time,precheckin_submitted_at)
    VALUES(?,?,?,'u',?,?,2,2,?,?,?,?,?)`);
  const rows = [
    ['chega', 'Beatriz', today, addDays(today, 2), 280, 80, 'aguardar_pagamento', '16:30', null],
    ['sai', 'Ana', addDays(today, -2), today, 200, 200, 'check_in', null, '2030-07-01'],
    ['pedido', 'Rui', addDays(today, 5), addDays(today, 7), 190, 0, 'pendente', null, null],
    ['semdados', 'Carlos', addDays(today, 3), addDays(today, 4), 100, 100, 'confirmada', null, null],
    ['longe', 'Joana', addDays(today, 20), addDays(today, 22), 100, 30, 'confirmada', null, null],
    ['cancelada', 'Pedro', today, addDays(today, 1), 500, 0, 'cancelada', null, null],
  ];
  for (const [id, name, ci, co, total, paid, status, arrival, pc] of rows) {
    guest.run(`g-${id}`, org.id, name, `${id}@example.invalid`);
    res.run(id, org.id, `g-${id}`, ci, co, total, paid, status, arrival, pc);
  }
  db.prepare(`INSERT INTO operational_events(id,organization_id,title,type,date,start_time,status) VALUES('t1',?,'Limpeza','limpeza',?,'12:00','planeado')`).run(org.id, today);
  db.prepare(`INSERT INTO operational_events(id,organization_id,title,type,date,status,reservation_id,auto_kind) VALUES('t2',?,'Check-out','checkout',?,'concluido','sai','checkout')`).run(org.id, today);

  const painel = dashboardToday(org.id, today, new Date('2030-07-06T10:00:00Z'));
  assert.deepEqual(painel.today.map(i => [i.kind, i.time, i.guest_name || i.title]),
    [['checkout', '11:00', 'Ana'], ['task', '12:00', 'Limpeza'], ['checkin', '16:30', 'Beatriz']], 'por hora, sem a reserva cancelada');
  assert.equal(painel.today[0].done, true, 'check-out já marcado como feito');
  assert.equal(painel.today[2].missing, 200);
  assert.deepEqual(painel.attention.pendingApproval.map(r => r.id), ['pedido']);
  assert.deepEqual(painel.attention.awaitingDeposit.map(r => r.id), ['chega']);
  assert.deepEqual(painel.attention.precheckinMissing.map(r => r.id), ['semdados'], 'só confirmadas dos próximos 7 dias sem pré-check-in');
  assert.deepEqual(painel.receivable, { count: 3, amount: 200 + 190 + 70 });
  assert.equal(typeof painel.previousOccupancyRate, 'number');
});
