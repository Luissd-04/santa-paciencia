function normalizeDateValue(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const pt = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return '';
}

function countNights(checkIn, checkOut) {
  const ci = normalizeDateValue(checkIn);
  const co = normalizeDateValue(checkOut);
  if (!ci || !co) return 0;
  return Math.round((new Date(`${co}T12:00:00`) - new Date(`${ci}T12:00:00`)) / 86400000);
}

function getAgeAtDate(birthDate, refDate) {
  const birthIso = normalizeDateValue(birthDate);
  const refIso = normalizeDateValue(refDate);
  if (!birthIso || !refIso) return null;
  const birth = new Date(`${birthIso}T12:00:00`);
  const ref = new Date(`${refIso}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime()) || birth > ref) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

function normalizeExtraOccupancyOptions(accommodation = {}) {
  let options = [];
  const raw = accommodation.extra_occupancy_options;
  if (Array.isArray(raw)) {
    options = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try { options = JSON.parse(raw); } catch { options = []; }
  }

  if (!options.length && accommodation.extra_bed_enabled) {
    options = [{
      type: accommodation.extra_bed_type || 'sofa_cama',
      capacity: Number(accommodation.extra_bed_capacity) || 0,
      price: Number(accommodation.extra_bed_price) || 0,
      charge_type: accommodation.extra_bed_charge_type || 'per_guest_night'
    }];
  }

  return options.map(option => ({
    capacity: Math.max(0, Number(option?.capacity) || 0),
    price: Math.max(0, Number(option?.price) || 0),
    charge_type: option?.charge_type === 'per_bed_night' ? 'per_bed_night' : 'per_guest_night'
  }));
}

function getAgeSpecialRates(accommodation = {}, birthDates = [], checkIn = null) {
  const babyLimit = Number(accommodation.baby_age_limit ?? 2);
  const childLimit = Number(accommodation.child_age_limit ?? 12);
  const babyPrice = Number(accommodation.baby_price ?? 0);
  const childPrice = Number(accommodation.child_price ?? 0);
  return birthDates
    .map(date => {
      const age = getAgeAtDate(date, checkIn);
      if (age === null) return null;
      if (age < babyLimit) return { age, rate: babyPrice };
      if (age >= babyLimit && age < childLimit) return { age, rate: childPrice };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.age - b.age)
    .map(item => item.rate);
}

function getExtraOccupancyCharge(accommodation, guests, nights, birthDates = [], checkIn = null) {
  if (!accommodation) return 0;
  const options = normalizeExtraOccupancyOptions(accommodation);
  const maxGuests = Number(accommodation.max_guests) || guests;
  const included = Math.max(1, Math.min(
    Number(accommodation.base_guests_included) || Math.min(maxGuests, 2),
    maxGuests
  ));
  let remainingGuests = Math.max(0, Number(guests || 0) - included);
  if (!remainingGuests) return 0;

  const specialRates = getAgeSpecialRates(accommodation, birthDates.slice(included), checkIn).slice(0, remainingGuests);
  let total = specialRates.reduce((sum, rate) => sum + (rate * nights), 0);
  remainingGuests -= specialRates.length;

  return options.reduce((runningTotal, option) => {
    if (remainingGuests <= 0) return runningTotal;
    const capacity = Math.max(0, Number(option.capacity) || 0);
    if (!capacity) return runningTotal;
    const guestsCovered = Math.min(remainingGuests, capacity);
    remainingGuests -= guestsCovered;
    const price = Number(option.price) || 0;
    if (option.charge_type === 'per_bed_night') return runningTotal + (price * nights);
    return runningTotal + (price * guestsCovered * nights);
  }, total);
}

function getReservationBirthDates(guest = {}, guestsData = []) {
  const extra = Array.isArray(guestsData) ? guestsData : [];
  return [guest.birth_date, ...extra.map(g => g?.birth_date)].filter(Boolean);
}

function validateReservationBirthDates(numGuests, guest = {}, guestsData = []) {
  const totalGuests = Math.max(1, Number(numGuests) || 1);
  if (!guest.birth_date) return 'A data de nascimento do hóspede principal é obrigatória.';
  const extra = Array.isArray(guestsData) ? guestsData : [];
  for (let i = 0; i < Math.max(0, totalGuests - 1); i++) {
    if (!extra[i]?.birth_date) return `A data de nascimento do hóspede ${i + 2} é obrigatória.`;
  }
  return null;
}

function calcBaseAmountWithPeriods(basePrice, checkIn, checkOut, periods = []) {
  const nights = countNights(checkIn, checkOut);
  if (!nights) return 0;
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let total = 0;
  const d = new Date(`${checkIn}T12:00:00`);
  for (let i = 0; i < nights; i++) {
    const iso = d.toISOString().slice(0, 10);
    const period = sorted.find(p => p.start_date <= iso && p.end_date >= iso);
    total += period ? Number(period.price_per_night) : basePrice;
    d.setDate(d.getDate() + 1);
  }
  return total;
}

function calculateReservationTotals(accommodation, services = [], payload = {}) {
  const checkIn = normalizeDateValue(payload.check_in);
  const checkOut = normalizeDateValue(payload.check_out);
  const guests = Math.max(1, Number(payload.num_guests) || 1);
  const nights = countNights(checkIn, checkOut);
  if (!checkIn || !checkOut || nights <= 0) throw new Error('Datas inválidas.');
  if (guests > Number(accommodation?.max_guests || 0)) {
    throw new Error(`Este alojamento permite no máximo ${accommodation?.max_guests || 0} hóspedes.`);
  }

  const taxSvc = services.find(s => s.id === 'tourist_tax');
  const bkfSvc = services.find(s => s.id === 'breakfast');
  const breakfast = payload.breakfast_included === true || payload.breakfast_included === 'true' || payload.breakfast_included === 1;
  const birthDates = payload.birth_dates || getReservationBirthDates(payload.guest || {}, payload.guests_data || []);
  const touristTax = (taxSvc?.active !== false) ? (Number(taxSvc?.value ?? 3) * guests * nights) : 0;
  const breakfastCost = breakfast ? (Number(bkfSvc?.value ?? 19) * guests * nights) : 0;
  const extraOccupancyCost = getExtraOccupancyCharge(accommodation, guests, nights, birthDates, checkIn);
  const pricingPeriods = payload.pricing_periods || [];
  const baseAmount = calcBaseAmountWithPeriods(Number(accommodation?.price_per_night || 0), checkIn, checkOut, pricingPeriods);

  return {
    checkIn,
    checkOut,
    guests,
    nights,
    breakfastIncluded: breakfast ? 1 : 0,
    baseAmount,
    touristTax,
    breakfastCost,
    extraOccupancyCost,
    totalAmount: baseAmount + touristTax + breakfastCost + extraOccupancyCost
  };
}

function getPaymentStatus(amountPaid, totalAmount, fallback = 'pendente') {
  const paid = Number(amountPaid) || 0;
  const total = Number(totalAmount) || 0;
  if (paid >= total && paid > 0) return 'confirmado';
  if (paid > 0) return 'parcial';
  return fallback || 'pendente';
}

module.exports = {
  normalizeDateValue,
  countNights,
  getAgeAtDate,
  normalizeExtraOccupancyOptions,
  getAgeSpecialRates,
  getExtraOccupancyCharge,
  getReservationBirthDates,
  validateReservationBirthDates,
  calculateReservationTotals,
  getPaymentStatus,
};
