// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  getBirthDates: { get: () => getBirthDates },
  recalc: { get: () => recalc },
});

function specialRate(unit, birthDate, index) {
  const ci = AppModules.booking.iso(AppModules.booking.$('pb-checkin').value) || new Date().toISOString().slice(0, 10);
  const age = ageAt(AppModules.booking.iso(birthDate), ci);
  if (age === null) return null;
  const included = Math.max(1, Math.min(unit.base_guests_included || 2, unit.max_guests || 2));
  if (index < included) return null;
  if (age <= unit.baby_age_limit) return { label: 'Preço de bebé aplicado', price: unit.baby_price || 0 };
  if (age > unit.baby_age_limit && age < unit.child_age_limit) return { label: 'Preço de criança aplicado', price: unit.child_price || 0 };
  return null;
}

function ageAt(birthIso, refIso) {
  return window.ReservationDates?.ageAtDate(birthIso, refIso) ?? null;
}

function getBirthDates() {
  return [
    AppModules.booking.iso(AppModules.booking.$('pb-birth').value),
    ...Array.from(document.querySelectorAll('.extra-guest-box [data-field="birth_date"]')).map(input => AppModules.booking.iso(input.value))
  ].filter(Boolean);
}

function extraCharge(unit, n) {
  return window.ReservationPricing?.getExtraOccupancyCharge(
    unit,
    AppModules.booking.totalGuests(),
    n,
    AppModules.booking.effectiveBirthDates(),
    AppModules.booking.iso(AppModules.booking.$('pb-checkin').value)
  ) || 0;
}

function recalc() {
  const unit = AppModules.booking.selectedUnit();
  const n = AppModules.booking.nights();
  const adults = Number(AppModules.booking.$('pb-adults').value) || 1;
  const children = Number(AppModules.booking.$('pb-children').value) || 0;
  const guests = adults + children;
  const isPropertySelected = AppModules.booking.state.selectedUnitId === 'property' || AppModules.booking.state.selectedUnitId === AppModules.booking.state.property?.id;
  const hasDates = !!n;

  AppModules.booking.$('summary-guests').textContent = children > 0
    ? `${adults} adulto${adults !== 1 ? 's' : ''} · ${children} criança${children !== 1 ? 's' : ''}`
    : `${adults} adulto${adults !== 1 ? 's' : ''}`;
  AppModules.booking.$('summary-dates').textContent = AppModules.booking.iso(AppModules.booking.$('pb-checkin').value) && AppModules.booking.iso(AppModules.booking.$('pb-checkout').value) ? `${AppModules.booking.ptDate(AppModules.booking.$('pb-checkin').value)} - ${AppModules.booking.ptDate(AppModules.booking.$('pb-checkout').value)}` : '-';
  AppModules.booking.$('summary-nights').textContent = n ? `${n} noite${n !== 1 ? 's' : ''}` : '-';

  document.querySelectorAll('.summary-row.muted:not(#summary-discount-row)').forEach(row => row.style.display = hasDates ? '' : 'none');
  const totalRow = document.querySelector('.summary-total');
  if (totalRow) totalRow.style.display = hasDates ? '' : 'none';
  const note = AppModules.booking.$('summary-dates-note');
  if (note) note.style.display = hasDates ? '' : 'none';

  if (isPropertySelected) {
    AppModules.booking.$('summary-unit').textContent = AppModules.booking.state.property?.name || 'Alojamento completo';
    AppModules.booking.$('summary-media').style.backgroundImage = `url(${JSON.stringify(AppModules.booking.mediaThumb(AppModules.booking.state.property?.images?.[0]?.url, 1024))})`;
  } else if (unit) {
    AppModules.booking.$('summary-unit').textContent = unit.name;
    AppModules.booking.$('summary-media').style.backgroundImage = `url(${JSON.stringify(AppModules.booking.mediaThumb(unit.cover_image || unit.images?.[0]?.url, 1024))})`;
  } else {
    return;
  }

  if (!n) return;

  let totals;
  if (isPropertySelected) {
    const rawTotals = window.ReservationPricing.calculateReservationTotal(AppModules.booking.state.property, AppModules.booking.state.services, {
      check_in: AppModules.booking.iso(AppModules.booking.$('pb-checkin').value),
      check_out: AppModules.booking.iso(AppModules.booking.$('pb-checkout').value),
      num_guests: guests,
      breakfast_included: false,
      birth_dates: [],
      pricing_periods: AppModules.booking.state.property?.pricing_periods || []
    });
    totals = {
      ...rawTotals,
      extraOccupancyCost: 0,
      totalAmount: rawTotals.baseAmount + rawTotals.breakfastCost + rawTotals.touristTax
    };
  } else {
    totals = window.ReservationPricing.calculateReservationTotal(unit, AppModules.booking.state.services, {
      check_in: AppModules.booking.iso(AppModules.booking.$('pb-checkin').value),
      check_out: AppModules.booking.iso(AppModules.booking.$('pb-checkout').value),
      num_guests: guests,
      breakfast_included: false,
      birth_dates: AppModules.booking.effectiveBirthDates(),
      pricing_periods: unit.pricing_periods || []
    });
    updateRateHints(unit);
  }

  const discountAmount = AppModules.booking._voucherData ? (
    AppModules.booking._voucherData.type === 'discount_pct'
      ? totals.totalAmount * (AppModules.booking._voucherData.value / 100)
      : Math.min(AppModules.booking._voucherData.value, totals.totalAmount)
  ) : 0;
  const finalTotal = Math.max(0, totals.totalAmount - discountAmount);

  AppModules.booking.$('summary-base').textContent = AppModules.booking.fmtCurrency(totals.baseAmount);
  AppModules.booking.$('summary-extras').textContent = AppModules.booking.fmtCurrency(totals.extraOccupancyCost);
  AppModules.booking.$('summary-services').textContent = AppModules.booking.fmtCurrency(totals.breakfastCost + totals.touristTax);

  const discRow = AppModules.booking.$('summary-discount-row');
  if (discRow) {
    discRow.style.display = discountAmount > 0 ? '' : 'none';
    if (AppModules.booking.$('summary-discount')) AppModules.booking.$('summary-discount').textContent = `−${AppModules.booking.fmtCurrency(discountAmount)}`;
  }

  AppModules.booking.$('summary-total').textContent = AppModules.booking.fmtCurrency(finalTotal);
}

function updateRateHints(unit) {
  const main = specialRate(unit, AppModules.booking.$('pb-birth').value, 0);
  AppModules.booking.$('pb-main-rate').textContent = main ? `${main.label} · ${AppModules.booking.fmtCurrency(main.price)}/noite` : '';
  document.querySelectorAll('.extra-guest-box').forEach((box, idx) => {
    const hint = box.querySelector('.rate-hint');
    const info = specialRate(unit, box.querySelector('[data-field="birth_date"]').value, idx + 1);
    hint.textContent = info ? `${info.label} · ${AppModules.booking.fmtCurrency(info.price)}/noite` : '';
  });
}


})();
