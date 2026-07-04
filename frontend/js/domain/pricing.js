(function () {
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
        const age = window.ReservationDates?.ageAtDate(date, checkIn);
        if (age === null || age === undefined) return null;
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

  function periodMatchesDay(period, iso) {
    if (period.start_date > iso || period.end_date < iso) return false;
    if (!period.days_of_week) return true;
    const dow = typeof period.days_of_week === 'string'
      ? JSON.parse(period.days_of_week)
      : (period.days_of_week || []);
    return dow.includes(new Date(iso + 'T12:00:00').getDay());
  }

  function calcBaseAmountWithPeriods(basePrice, checkIn, checkOut, periods = []) {
    const nights = window.ReservationDates?.countNights(checkIn, checkOut) || 0;
    if (!nights) return 0;
    const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    let total = 0;
    const d = new Date(`${checkIn}T12:00:00`);
    for (let i = 0; i < nights; i++) {
      const iso = d.toISOString().slice(0, 10);
      const period = sorted.find(p => periodMatchesDay(p, iso));
      total += period ? Number(period.price_per_night) : basePrice;
      d.setDate(d.getDate() + 1);
    }
    return total;
  }

  // Array [{ date, price }] com uma entrada por noite. Prioridade por noite:
  // override para a data → período aplicável → preço-base.
  function buildNightlyPrices(basePrice, checkIn, checkOut, periods = [], override = null) {
    const nights = window.ReservationDates?.countNights(checkIn, checkOut) || 0;
    if (!nights) return [];
    const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const overrideMap = {};
    if (Array.isArray(override)) {
      override.forEach(o => {
        if (o && o.date != null && o.price != null && !isNaN(Number(o.price))) {
          overrideMap[o.date] = Math.max(0, Number(o.price));
        }
      });
    }
    const result = [];
    const d = new Date(`${checkIn}T12:00:00`);
    for (let i = 0; i < nights; i++) {
      const iso = d.toISOString().slice(0, 10);
      let price;
      if (overrideMap[iso] != null) {
        price = overrideMap[iso];
      } else {
        const period = sorted.find(p => periodMatchesDay(p, iso));
        price = period ? Number(period.price_per_night) : Number(basePrice);
      }
      result.push({ date: iso, price: Math.max(0, Number(price) || 0) });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }

  function calculateReservationTotal(accommodation, services = [], payload = {}) {
    const nights = window.ReservationDates?.countNights(payload.check_in, payload.check_out) || 0;
    const guests = Math.max(1, Number(payload.num_guests) || 1);
    if (!accommodation || !nights) {
      return { nights, baseAmount: 0, extraOccupancyCost: 0, touristTax: 0, breakfastCost: 0, totalAmount: 0 };
    }

    const breakfast = payload.breakfast_included === true || payload.breakfast_included === 'true' || payload.breakfast_included === 1;
    const taxSvc = services.find(s => s.id === 'tourist_tax');
    const bkfSvc = services.find(s => s.id === 'breakfast');
    const touristTax = (taxSvc?.active !== false) ? (Number(taxSvc?.value ?? 3) * guests * nights) : 0;
    const breakfastCost = breakfast ? (Number(bkfSvc?.value ?? 19) * guests * nights) : 0;
    const extraOccupancyCost = getExtraOccupancyCharge(accommodation, guests, nights, payload.birth_dates || [], payload.check_in);
    const pricingPeriods = payload.pricing_periods || [];
    const override = Array.isArray(payload.nightly_prices) ? payload.nightly_prices : null;
    const nightlyPrices = buildNightlyPrices(Number(accommodation.price_per_night || 0), payload.check_in, payload.check_out, pricingPeriods, override);
    const baseAmount = nightlyPrices.reduce((sum, n) => sum + (Number(n.price) || 0), 0);

    return {
      nights,
      baseAmount,
      nightlyPrices,
      extraOccupancyCost,
      touristTax,
      breakfastCost,
      totalAmount: baseAmount + extraOccupancyCost + touristTax + breakfastCost
    };
  }

  window.ReservationPricing = {
    normalizeExtraOccupancyOptions,
    getAgeSpecialRates,
    getExtraOccupancyCharge,
    buildNightlyPrices,
    calculateReservationTotal,
  };
})();
