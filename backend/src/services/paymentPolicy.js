// Regras monetárias puras em cêntimos; datas de calendário em Europe/Lisbon.
const { createHash } = require('crypto');
const DEFAULT_POLICY = {
  version: 1, enabled: false, refundBasis: 'cancellation', balanceDays: 15, graceHours: 24, automaticCharge: true,
  depositRules: [{ minDays: 0, maxDays: 14, percent: 100 }, { minDays: 15, maxDays: 90, percent: 50 }, { minDays: 91, maxDays: null, percent: 20 }],
  refundRules: [{ minDays: 0, maxDays: 14, percent: 0 }, { minDays: 15, maxDays: 30, percent: 50 }, { minDays: 31, maxDays: null, percent: 100 }],
};
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const { cents } = require('./money');
function validatePolicy(input) {
  if (!input || typeof input !== 'object') fail('Política inválida.');
  for (const key of ['enabled', 'automaticCharge']) if (typeof input[key] !== 'boolean') fail('Opção inválida: ' + key);
  if (!['booking', 'cancellation'].includes(input.refundBasis)) fail('Escolha a base de cálculo do reembolso.');
  if (!Number.isInteger(input.balanceDays) || input.balanceDays < 1 || input.balanceDays > 365) fail('O prazo do restante deve ser de 1 a 365 dias.');
  if (!Number.isInteger(input.graceHours) || input.graceHours < 1 || input.graceHours > 168) fail('O prazo adicional deve ser de 1 a 168 horas.');
  function rules(rows, label) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 30) fail(`${label}: indique entre 1 e 30 intervalos.`);
    const sorted = rows.map(row => {
      if (!row || !Number.isInteger(row.minDays) || row.minDays < 0 || row.minDays > 36500
        || (row.maxDays !== null && (!Number.isInteger(row.maxDays) || row.maxDays < row.minDays || row.maxDays > 36500))
        || !Number.isFinite(row.percent) || row.percent < (label === 'Pagamento inicial' ? 1 : 0) || row.percent > 100
        || Math.abs(row.percent * 100 - Math.round(row.percent * 100)) > 0.00001) fail(`${label}: limites ou percentagem inválidos.`);
      return { minDays: row.minDays, maxDays: row.maxDays, percent: row.percent };
    }).sort((a, b) => a.minDays - b.minDays);
    let next = 0;
    for (const [i, row] of sorted.entries()) {
      if (row.minDays !== next || (row.maxDays === null && i !== sorted.length - 1)) fail(`${label}: os intervalos devem cobrir todos os dias, sem lacunas nem sobreposições.`);
      next = row.maxDays === null ? null : row.maxDays + 1;
    }
    if (next !== null) fail(`${label}: deixe o último limite superior vazio (sem limite).`);
    return sorted;
  }
  return { version: 1, enabled: input.enabled, refundBasis: input.refundBasis, balanceDays: input.balanceDays,
    graceHours: input.graceHours, automaticCharge: input.automaticCharge,
    depositRules: rules(input.depositRules, 'Pagamento inicial'), refundRules: rules(input.refundRules, 'Reembolso') };
}
function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Data inválida.');
  return value;
}
function localDay(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function daysBetween(from, to) { return Math.round((Date.parse(dateOnly(to)) - Date.parse(dateOnly(from))) / 86400000); }
function shiftDay(day, delta) { return new Date(Date.parse(dateOnly(day)) + delta * 86400000).toISOString().slice(0, 10); }
function noonLisbon(day) {
  const utc = new Date(dateOnly(day) + 'T12:00:00Z');
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(utc));
  return new Date(utc.getTime() - (hour - 12) * 3600000).toISOString();
}
function percentAt(rules, days) { return rules.find(r => days >= r.minDays && (r.maxDays === null || days <= r.maxDays))?.percent ?? 0; }
function calculate(policy, { total, paid = 0, bookedOn, checkIn, cancelOn = bookedOn }) {
  const p = validatePolicy(policy);
  const totalCents = cents(total), paidCents = cents(paid);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 99999999 || !Number.isSafeInteger(paidCents) || paidCents < 0 || paidCents > 99999999) fail('Montante inválido.');
  const leadDays = daysBetween(bookedOn, checkIn);
  if (leadDays < 0 || daysBetween(bookedOn, cancelOn) < 0) fail('As datas devem ser posteriores à criação da reserva.');
  const depositPercent = leadDays <= p.balanceDays ? 100 : percentAt(p.depositRules, leadDays);
  let depositCents = Math.min(totalCents, Math.max(50, Math.round(totalCents * depositPercent / 100)));
  if (totalCents - depositCents < 50) depositCents = totalCents;
  const refundDays = p.refundBasis === 'booking' ? leadDays : daysBetween(cancelOn, checkIn);
  const refundPercent = refundDays < 0 ? 0 : percentAt(p.refundRules, refundDays);
  const dueAt = noonLisbon(shiftDay(checkIn, -p.balanceDays));
  return { leadDays, depositPercent, depositCents, depositAdjusted: depositCents !== Math.round(totalCents * depositPercent / 100), balanceCents: totalCents - depositCents,
    dueAt, deadline: new Date(Date.parse(dueAt) + p.graceHours * 3600000).toISOString(),
    refundPercent, refundCents: Math.round(paidCents * refundPercent / 100), refundBasis: p.refundBasis };
}
function getPolicy(orgId) {
  const { db } = require('../config/database');
  const row = db.prepare("SELECT value FROM organization_settings WHERE organization_id=? AND key='payment_policy'").get(orgId);
  return row ? validatePolicy(JSON.parse(row.value)) : structuredClone(DEFAULT_POLICY);
}
function savePolicy(orgId, input) {
  const policy = validatePolicy(input);
  require('../config/database').db.prepare("INSERT OR REPLACE INTO organization_settings(organization_id,key,value,updated_at) VALUES (?,'payment_policy',?,datetime('now'))")
    .run(orgId, JSON.stringify(policy));
  return policy;
}
// Canais em que o alojamento cobra diretamente. Booking, Airbnb e restantes
// plataformas cobram o hóspede por conta própria.
const POLICY_CHANNELS = ['website', 'direto'];
function attachPolicy(r, now = new Date()) {
  const policy = getPolicy(r.organization_id);
  const stored = (!r.check_in || r.channel === undefined)
    ? require('../config/database').db.prepare('SELECT check_in, channel FROM reservations WHERE id=? AND organization_id=?').get(r.id, r.organization_id) : null;
  const checkIn = r.check_in || stored?.check_in;
  const channel = r.channel !== undefined ? r.channel : stored?.channel;
  if (!policy.enabled || !checkIn || checkIn < localDay(now) || !POLICY_CHANNELS.includes(channel || 'direto')) return;
  const snapshot = { ...policy, bookedOn: localDay(now) };
  require('../config/database').db.prepare('UPDATE reservations SET payment_policy_json=? WHERE id=? AND organization_id=?')
    .run(JSON.stringify(snapshot), r.id, r.organization_id);
  r.payment_policy_json = JSON.stringify(snapshot);
  if (r.status !== undefined) {
    const status = require('./reservationState').statusAfterPayment({ status: r.status, paidCents: cents(r.amount_paid || 0),
      totalCents: cents(r.total_amount || 0), depositCents: planFor(r, now).depositCents });
    if (status !== r.status) require('../config/database').db.prepare('UPDATE reservations SET status=? WHERE id=?').run(status, r.id);
    r.status = status;
  }
}
function policyFor(r) { return r.payment_policy_json ? JSON.parse(r.payment_policy_json) : null; }
function planFor(r, now = new Date()) {
  const p = policyFor(r);
  return p ? calculate(p, { total: r.total_amount, paid: r.amount_paid || 0, bookedOn: p.bookedOn, checkIn: r.check_in, cancelOn: localDay(now) < p.bookedOn ? p.bookedOn : localDay(now) }) : null;
}
function consentKey(r) {
  return createHash('sha256').update(JSON.stringify([r.payment_policy_json, r.check_in, r.check_out, cents(r.total_amount), cents(r.amount_paid || 0), amountDue(r), r.accommodation_id])).digest('hex');
}
function amountDue(r, now = new Date()) {
  const remaining = Math.max(0, cents(r.total_amount) - cents(r.amount_paid || 0));
  const plan = planFor(r, now);
  if (!plan) return remaining;
  const initial = plan.depositCents - cents(r.amount_paid || 0);
  if (initial > 0 && now.getTime() < Date.parse(plan.dueAt)) return Math.min(remaining, initial < 50 ? 50 : initial);
  return remaining;
}
function describe(r, now = new Date()) {
  const policy = policyFor(r), plan = planFor(r, now);
  if (!plan) return null;
  let cancellation = null;
  if (r.policy_cancellation_json) { const c = JSON.parse(r.policy_cancellation_json); cancellation = { amount: c.refundCents / 100, state: c.state, reason: c.reason }; }
  return { policy, ...plan, consentKey: consentKey(r), accepted: Boolean(r.policy_accepted_at),
    automatic: r.policy_auto_consent === '1', balanceNoticeSent: Boolean(r.balance_notice_sent_at), deadline: r.balance_deadline || plan.deadline,
    cancellation, canCancel: !cancellation && ['pendente','aguardar_pagamento','confirmada','pre_checkin','pre_reserva'].includes(r.status) && localDay(now) <= r.check_in };
}
module.exports = { DEFAULT_POLICY, POLICY_CHANNELS, validatePolicy, calculate, getPolicy, savePolicy, attachPolicy, policyFor, planFor, consentKey, amountDue, describe, localDay, cents };
