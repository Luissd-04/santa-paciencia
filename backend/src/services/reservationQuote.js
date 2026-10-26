// Preço de uma reserva nova ou alterada. A gravação (POST/PUT) e a
// pré-visualização do wizard usam estas funções: o total mostrado ao operador
// é o que o servidor grava, incluindo o voucher. Nada aqui escreve na base.
const { db } = require('../config/database');
const { calculateReservationTotals, getReservationBirthDates, normalizeDateValue } = require('./reservationRules');
const { findUsableVoucher, voucherDiscount: calculateVoucherDiscount, activeRedemption } = require('./voucherService');
const { assertMoneyLimit } = require('./reservationValidation');
const { safeJson, computeStandardTotals, getOrganizationServices } = require('./reservationSupport');

const { httpError } = require('./httpError');

// Os formulários enviam tipos diferentes dos guardados (true vs 1, "2" vs 2,
// datas dd/mm/aaaa): comparar valores normalizados evita tratar uma edição de
// notas ou de contacto como uma alteração da estadia.
const asFlag = value => (value === true || value === 1 || value === '1' || value === 'true') ? 1 : 0;
const STAY_FIELDS = {
  check_in: value => normalizeDateValue(value),
  check_out: value => normalizeDateValue(value),
  accommodation_id: value => String(value ?? ''),
  num_guests: value => Number(value ?? 0),
  num_adults: value => Number(value ?? 0),
  num_children: value => Number(value ?? 0),
  breakfast_included: asFlag,
};
function nightlyKey(value) {
  const rows = Array.isArray(value) ? value : safeJson(value, []);
  return JSON.stringify((Array.isArray(rows) ? rows : []).map(n => [normalizeDateValue(n?.date), Math.round(Number(n?.price) * 100)]));
}
function unitsKey(value) {
  const rows = Array.isArray(value) ? value : safeJson(value, []);
  return JSON.stringify((Array.isArray(rows) ? rows : []).map(item => item?.accommodation_id).sort());
}
function stayChanged(body, existing) {
  return Object.entries(STAY_FIELDS).some(([key, norm]) => body[key] !== undefined && norm(body[key]) !== norm(existing[key]))
    || (body.nightly_prices !== undefined && nightlyKey(body.nightly_prices) !== nightlyKey(existing.nightly_prices))
    || (body.accommodations_data !== undefined && unitsKey(body.accommodations_data) !== unitsKey(existing.accommodations_data));
}

function loadAccommodation(organizationId, id) {
  const accommodation = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(id, organizationId);
  if (!accommodation) throw httpError('Alojamento não encontrado', 404);
  const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
    .all(id, organizationId);
  return { accommodation, periods };
}
function totalsOrBadRequest(...args) {
  try { return calculateReservationTotals(...args); } catch (error) { throw httpError(error.message, 400); }
}

// Reserva nova. Um voucher inválido não é lançado aqui: a criação recusa-o
// depois das verificações de disponibilidade e a pré-visualização explica-o.
function priceCreate(organizationId, body) {
  const { accommodation_id, check_in, check_out, num_guests, num_adults, num_children, breakfast_included,
    guest, guests_data, voucher_code, total_amount: manualTotal, nightly_prices } = body;
  const totalGuests = (num_adults != null || num_children != null)
    ? (Number(num_adults ?? 1) + Number(num_children ?? 0))
    : (num_guests || 1);
  const { accommodation, periods } = loadAccommodation(organizationId, accommodation_id);
  if (totalGuests > Number(accommodation.max_guests || 0)) {
    throw httpError(`Este alojamento permite no máximo ${accommodation.max_guests} hóspedes.`, 400);
  }
  const services = getOrganizationServices(organizationId);
  const totals = totalsOrBadRequest(accommodation, services, {
    check_in, check_out, num_guests: totalGuests, pricing_periods: periods, breakfast_included,
    guest, guests_data: guests_data || [], nightly_prices,
  });
  let voucher = null, voucherError = null, discount = 0;
  if (voucher_code) {
    try {
      ({ voucher, discount } = applyVoucher(organizationId, voucher_code, totals, accommodation));
    } catch (error) {
      if (!error.status) throw error;
      voucherError = error;
    }
  }
  const finalTotal = manualTotal !== undefined ? Number(manualTotal) : Math.max(0, totals.totalAmount - discount);
  assertMoneyLimit(finalTotal);
  // Edição manual = total gravado difere do padrão do calendário dinâmico
  // (sem overrides por noite), descontado o voucher.
  let standardTotal = null;
  try {
    const standard = calculateReservationTotals(accommodation, services, {
      check_in, check_out, num_guests: totalGuests, pricing_periods: periods, breakfast_included,
      guest, guests_data: guests_data || [],
    });
    standardTotal = Math.max(0, standard.totalAmount - discount);
  } catch { /* referência indisponível — não marcar */ }
  return {
    accommodation, totals, totalGuests, voucher, voucherError, voucherDiscount: discount, finalTotal, standardTotal,
    priceEdited: standardTotal != null && Math.abs(finalTotal - standardTotal) > 0.01,
  };
}

// Voucher sobre uma estadia: a mesma validação (noites, alojamento, estado,
// validade) na criação no backoffice e no pedido público.
function applyVoucher(organizationId, code, totals, accommodation) {
  const voucher = findUsableVoucher(organizationId, code, { nights: totals.nights, accommodation_id: accommodation.id, parent_id: accommodation.parent_id });
  return { voucher, discount: calculateVoucherDiscount(voucher, totals.totalAmount, totals.nightlyPrices) };
}

// Pedido do site público: o preço vem só das tarifas (sem preços por noite nem
// total manual, que o hóspede não pode impor) e um voucher inválido recusa o
// pedido. Chamar também dentro da transação, para revalidar o voucher.
function pricePublic(organizationId, accommodation, payload) {
  const periods = db.prepare('SELECT * FROM pricing_periods WHERE accommodation_id = ? AND organization_id = ? ORDER BY start_date ASC')
    .all(accommodation.id, organizationId);
  const totals = calculateReservationTotals(accommodation, getOrganizationServices(organizationId), {
    check_in: payload.check_in, check_out: payload.check_out, num_guests: payload.num_guests, breakfast_included: payload.breakfast_included,
    guest: payload.guest, guests_data: payload.guests_data, pricing_periods: periods,
  });
  let voucher = null, discount = 0, voucherCode = null;
  if (payload.voucher_code) {
    voucherCode = String(payload.voucher_code).toUpperCase().trim();
    if (!/^[A-Z0-9]{3,20}$/.test(voucherCode)) throw httpError('Formato de código de voucher inválido.');
    ({ voucher, discount } = applyVoucher(organizationId, voucherCode, totals, accommodation));
  }
  const finalTotal = Math.max(0, totals.totalAmount - discount);
  assertMoneyLimit(finalTotal);
  return { totals, voucher, voucherCode, voucherDiscount: discount, finalTotal };
}

// Alteração de uma reserva existente. `confirmation` indica que a nova estadia
// exige um total explícito do operador (o PUT recusa-a com 409 sem esse total).
function priceUpdate(organizationId, existing, body) {
  const { check_in, check_out, num_guests, num_adults, num_children, breakfast_included, guests_data, guest,
    accommodation_id, total_amount: manualTotal, accommodations_data, nightly_prices: nightlyPricesUpdate } = body;
  const newAccommodationId = accommodation_id || existing.accommodation_id;
  const { accommodation, periods } = loadAccommodation(organizationId, newAccommodationId);
  const newCheckIn = check_in || existing.check_in;
  const newCheckOut = check_out || existing.check_out;
  if (existing.payment_policy_json && normalizeDateValue(newCheckIn) < JSON.parse(existing.payment_policy_json).bookedOn) {
    throw httpError('O check-in não pode ser anterior à criação da política desta reserva.', 400);
  }
  const newAdults = num_adults != null ? Number(num_adults) : existing.num_adults;
  const newChildren = num_children != null ? Number(num_children) : (existing.num_children ?? 0);
  const guests = (num_adults != null || num_children != null) ? (newAdults + newChildren) : (num_guests || existing.num_guests);
  const breakfast = breakfast_included !== undefined ? (breakfast_included ? 1 : 0) : existing.breakfast_included;
  const incomingGuestsData = guests_data !== undefined ? guests_data : safeJson(existing.guests_data, []);
  const existingGuest = db.prepare('SELECT birth_date FROM guests WHERE id = ? AND organization_id = ?').get(existing.guest_id, organizationId) || {};
  const birthDates = getReservationBirthDates({ ...existingGuest, ...guest }, incomingGuestsData);
  const services = getOrganizationServices(organizationId);
  const stay = { check_in: newCheckIn, check_out: newCheckOut, num_guests: guests, breakfast_included: breakfast, birth_dates: birthDates, pricing_periods: periods };
  // Preço por noite: usa o enviado; senão preserva o guardado (reconciliado por data).
  let totals = totalsOrBadRequest(accommodation, services, {
    ...stay, nightly_prices: nightlyPricesUpdate !== undefined ? nightlyPricesUpdate : safeJson(existing.nightly_prices, []),
  });
  const newAccData = accommodations_data !== undefined ? JSON.stringify(accommodations_data) : (existing.accommodations_data || '[]');
  const pricingChanged = stayChanged(body, existing);
  // Multi-suite ou total editado à mão: o recálculo só conhece a suite principal
  // e o padrão, e destruiria o valor acordado.
  let confirmation = pricingChanged && manualTotal === undefined && (existing.price_edited_at || safeJson(newAccData, []).length > 1)
    ? { code: 'total_confirmation', message: 'Confirme o total da reserva após alterar a estadia.' }
    : null;
  // Reserva com voucher: o desconto volta a ser aplicado à nova estadia, a
  // partir dos preços atuais (os preços por noite guardados podem já refletir
  // o desconto distribuído pelo editor e seriam descontados duas vezes).
  const redemption = pricingChanged && manualTotal === undefined ? activeRedemption(organizationId, existing.id) : null;
  let voucherTotal = null, voucherDiscount = null, voucherIssue = null;
  if (redemption) {
    if (totals.nights < Number(redemption.min_nights || 0)) {
      voucherIssue = { code: 'voucher_min_nights', message: `O voucher ${redemption.code} exige pelo menos ${redemption.min_nights} noites. Confirme o total da reserva.` };
    } else if (redemption.voucher_accommodation_id && ![newAccommodationId, accommodation.parent_id].includes(redemption.voucher_accommodation_id)) {
      voucherIssue = { code: 'voucher_accommodation', message: `O voucher ${redemption.code} não é válido para este alojamento. Confirme o total da reserva.` };
    } else {
      const fresh = totalsOrBadRequest(accommodation, services, { ...stay, nightly_prices: nightlyPricesUpdate !== undefined ? nightlyPricesUpdate : null });
      voucherDiscount = calculateVoucherDiscount(redemption, fresh.totalAmount, fresh.nightlyPrices);
      voucherTotal = Math.max(0, fresh.totalAmount - voucherDiscount);
      totals = { ...totals, nightlyPrices: fresh.nightlyPrices, touristTax: fresh.touristTax };
    }
  }
  confirmation = confirmation || voucherIssue;
  const effectiveTotal = manualTotal !== undefined
    ? Number(manualTotal)
    : (!pricingChanged ? Number(existing.total_amount) : (voucherTotal ?? totals.totalAmount));
  assertMoneyLimit(effectiveTotal);
  // Como na criação, o desconto do voucher faz parte do padrão.
  let standardTotal = null;
  try {
    const standard = computeStandardTotals(organizationId, { ...stay, accommodations_data: newAccData }, accommodation, periods, services, birthDates);
    const voucherRow = redemption || activeRedemption(organizationId, existing.id);
    standardTotal = voucherRow
      ? Math.max(0, standard.totalAmount - calculateVoucherDiscount(voucherRow, standard.totalAmount, standard.nightlyPrices))
      : standard.totalAmount;
  } catch { /* referência indisponível — manter registo atual */ }
  return {
    accommodation, periods, newAccommodationId, newCheckIn, newCheckOut, newAdults, newChildren, guests, breakfast,
    incomingGuestsData, newAccData, totals, pricingChanged, redemption, voucherDiscount, voucherIssue, confirmation,
    effectiveTotal, standardTotal,
  };
}

// O wizard envia o total que mostrou. Se o servidor calcular outro (resposta
// antiga, períodos de preço ou voucher alterados entretanto), não grava.
function assertExpectedTotal(expected, total) {
  if (expected === undefined || expected === null) return;
  if (Math.round(Number(expected) * 100) === Math.round(Number(total) * 100)) return;
  throw httpError(`O total da reserva é agora ${require('./money').formatEUR(total)}. Reveja o valor antes de guardar.`, 409,
    { code: 'total_changed', details: { total_amount: Number(total) } });
}

function voucherSummary(voucher, discount) {
  return voucher ? { code: voucher.code, type: voucher.type, value: Number(voucher.value), discount_amount: discount } : null;
}

// Resposta da pré-visualização: o mesmo total que a gravação usaria.
function createQuote(organizationId, body) {
  const pricing = priceCreate(organizationId, body);
  const manual = body.total_amount !== undefined;
  return {
    total_amount: pricing.finalTotal,
    standard_total: pricing.standardTotal,
    nights: pricing.totals.nights,
    nightly_prices: pricing.totals.nightlyPrices,
    voucher: body.voucher_code ? {
      ...(voucherSummary(pricing.voucher, pricing.voucherDiscount) || { code: String(body.voucher_code).trim().toUpperCase() }),
      applied: !!pricing.voucher && !manual,
      issue: pricing.voucherError
        ? { code: 'voucher_invalid', message: pricing.voucherError.message, blocking: true }
        : (manual ? { code: 'manual_total', message: 'O total manual substitui o desconto do voucher.' } : null),
    } : null,
    confirmation: null,
    status_options: require('./reservationLifecycle').statusOptions({ organization_id: organizationId,
      channel: body.channel || 'direto', total_amount: pricing.finalTotal, check_in: pricing.totals.checkIn }),
  };
}
function updateQuote(organizationId, existing, body) {
  const pricing = priceUpdate(organizationId, existing, body);
  const current = pricing.redemption || activeRedemption(organizationId, existing.id);
  return {
    total_amount: pricing.effectiveTotal,
    standard_total: pricing.standardTotal,
    nights: pricing.totals.nights,
    nightly_prices: pricing.totals.nightlyPrices,
    pricing_changed: pricing.pricingChanged,
    voucher: current ? {
      ...voucherSummary(current, pricing.voucherDiscount ?? current.discount_amount),
      // Sem alteração da estadia o total guardado (já com o desconto) mantém-se.
      applied: body.total_amount === undefined && !pricing.voucherIssue && (!!pricing.redemption || !pricing.pricingChanged),
      issue: pricing.voucherIssue,
    } : null,
    confirmation: body.total_amount === undefined ? pricing.confirmation : null,
    status_options: require('./reservationLifecycle').statusOptions({ ...existing,
      channel: body.channel || existing.channel, total_amount: pricing.effectiveTotal, check_in: pricing.totals.checkIn }),
  };
}

module.exports = { stayChanged, priceCreate, pricePublic, priceUpdate, assertExpectedTotal, createQuote, updateQuote };
