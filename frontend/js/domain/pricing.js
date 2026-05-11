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
    const baseAmount = Number(accommodation.price_per_night || 0) * nights;

    return {
      nights,
      baseAmount,
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
    calculateReservationTotal,
  };
})();
