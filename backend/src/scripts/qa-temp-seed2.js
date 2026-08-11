// Script temporário só para verificação visual local — cria 2 alojamentos +
// 3 reservas sobrepostas (para testar o empacotamento em lanes na vista de
// paisagem). Apaga tudo depois com qa-temp-teardown2.js.
require('dotenv').config();

const { initDatabase, db } = require('../config/database');
const { createUser, getUserByEmail } = require('../services/authService');
const { createOrganization, createMembership, getPrimaryMembership } = require('../services/orgService');
const crypto = require('crypto');

initDatabase();

const email = 'qa-temp-verify@local.test';
let user = getUserByEmail(email);
if (!user) user = createUser({ name: 'QA Temp', email, password: 'TempPass!2026', role: 'admin' });

let membership = getPrimaryMembership(user.id);
let orgId;
if (!membership) {
  const org = createOrganization('QA Temp Space');
  createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
  orgId = org.id;
} else {
  orgId = membership.organization_id;
}

const accA = crypto.randomUUID();
const accB = crypto.randomUUID();
db.prepare(`INSERT INTO accommodations (id, name, type, price_per_night, max_guests, license_number, color, organization_id, created_at)
  VALUES (?, 'Suite QA A', 'suite', 100, 2, '12345/AL', '#2e7d52', ?, datetime('now'))`).run(accA, orgId);
db.prepare(`INSERT INTO accommodations (id, name, type, price_per_night, max_guests, license_number, color, organization_id, created_at)
  VALUES (?, 'Suite QA B', 'suite', 100, 2, '12345/AL', '#c47820', ?, datetime('now'))`).run(accB, orgId);

function addDays(d, n) { return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10); }
const today = new Date();

function seedReservation(accId, name, ciOffset, coOffset, status) {
  const guestId = crypto.randomUUID();
  db.prepare(`INSERT INTO guests (id, name, email, organization_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))`)
    .run(guestId, name, name.toLowerCase().replace(/\s+/g, '.') + '@local.test', orgId);
  const resId = crypto.randomUUID();
  const ci = addDays(today, ciOffset);
  const co = addDays(today, coOffset);
  db.prepare(`INSERT INTO reservations (id, guest_id, accommodation_id, check_in, check_out, nights, num_guests, total_amount, channel, status, payment_status, organization_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 2, 150, 'direto', ?, 'pendente', ?, datetime('now'), datetime('now'))`)
    .run(resId, guestId, accId, ci, co, coOffset - ciOffset, status, orgId);
  return { resId, ci, co };
}

// 3 reservas que se sobrepõem na mesma semana, em 2 alojamentos diferentes —
// deve dar pelo menos 2 lanes na semana atual.
const r1 = seedReservation(accA, 'Ana Multi Dia', 0, 4, 'confirmada');   // hoje → +4 dias, spans multiple days
const r2 = seedReservation(accB, 'Bruno Sobreposto', 1, 3, 'pendente'); // sobrepõe r1
const r3 = seedReservation(accA, 'Carla Depois', 6, 8, 'confirmada');   // semana seguinte

console.log('OK', JSON.stringify({ orgId, accA, accB, r1, r2, r3 }));
