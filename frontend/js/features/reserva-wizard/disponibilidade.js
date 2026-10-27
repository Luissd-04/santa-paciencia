// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _wizBuildAccommodationsData: { get: () => _wizBuildAccommodationsData },
  fetchSuiteAvailability: { get: () => fetchSuiteAvailability },
  wizExtraRoom: { get: () => wizExtraRoom },
  wizExtraRoomsPricing: { get: () => wizExtraRoomsPricing },
  wizExtraRoomsSubtotal: { get: () => wizExtraRoomsSubtotal },
});

async function fetchSuiteAvailability() {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  if (!ci || !co || new Date(co) <= new Date(ci)) {
    AppModules.reservas._unavailableSuites = new Set();
    AppModules.reservas.renderSuiteCards();
    return;
  }
  try {
    const excludeParam = AppModules.core.editingId ? `&exclude_id=${encodeURIComponent(AppModules.core.editingId)}` : '';
    const data = await AppModules.core.apiGet(`/api/reservations/availability?check_in=${ci}&check_out=${co}${excludeParam}`);
    AppModules.reservas._unavailableSuites = new Set(data.data?.unavailable || []);
  } catch (e) {
    AppModules.reservas._unavailableSuites = new Set();
  }
  // Quartos que deixaram de estar livres nas novas datas saem da reserva.
  const extras = AppModules.reservas._wizExtraRooms;
  AppModules.reservas._wizExtraRooms = extras.filter(r => !AppModules.reservas._unavailableSuites.has(r.accommodation_id));
  let changed = AppModules.reservas._wizExtraRooms.length !== extras.length;
  // If currently selected suite became unavailable, deselect it
  const selEl = document.getElementById('f-aloj');
  if (selEl?.value && AppModules.reservas._unavailableSuites.has(selEl.value)) {
    selEl.value = '';
    changed = true;
  }
  AppModules.reservas.renderSuiteCards();
  if (changed) {
    AppModules.reservas.updateWizSummary();
    AppModules.reservas.calcTotal();
  }
}

// ── Quartos extra na mesma reserva (multi-suite) ──
// Escolhem-se na própria lista de alojamentos (passos.js: toggleSuiteCard).
// Cada quarto extra tem o seu preço noite a noite, como a suite principal:
// `overrides` são as noites editadas ({ data: preço }); `flatPrice` é o preço
// único dos quartos guardados antes de haver preço por noite (aplica-se às
// noites não editadas). Sem nenhum dos dois vale o preço do calendário.

// Quarto extra no formato do wizard a partir do guardado (reserva ou rascunho).
function wizExtraRoom(item) {
  const overrides = {};
  const nightly = Array.isArray(item?.nightly_prices) ? item.nightly_prices : [];
  nightly.forEach(n => { if (n?.date && n.price != null && !isNaN(Number(n.price))) overrides[n.date] = Math.max(0, Number(n.price)); });
  Object.entries(item?.overrides || {}).forEach(([date, price]) => { if (!isNaN(Number(price))) overrides[date] = Math.max(0, Number(price)); });
  const legacy = !nightly.length && !item?.overrides && item?.price_per_night != null;
  return {
    accommodation_id: item.accommodation_id,
    name: item.name || '',
    overrides,
    flatPrice: item?.flatPrice != null ? Number(item.flatPrice) : (legacy ? Math.max(0, Number(item.price_per_night) || 0) : null),
  };
}

// Noites de um quarto extra com as datas atuais: [{ date, price, standard, edited }].
function wizExtraRoomNights(room) {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  const acc = AppModules.core.accommodations.find(a => a.id === room.accommodation_id);
  const standard = window.ReservationPricing.buildNightlyPrices(Number(acc?.price_per_night || 0), ci, co,
    AppModules.reservas._cachedPricingPeriods[room.accommodation_id] || []);
  return standard.map(n => {
    const edited = room.overrides[n.date] != null;
    const price = edited ? room.overrides[n.date] : (room.flatPrice != null ? room.flatPrice : n.price);
    return { date: n.date, price, standard: n.price, edited };
  });
}

// Quartos extra com noites, média e subtotal: a mesma conta para o total, a
// grelha do passo do preço e o que se grava.
function wizExtraRoomsPricing() {
  return AppModules.reservas._wizExtraRooms.map(room => {
    const nights = wizExtraRoomNights(room);
    const subtotalCents = nights.reduce((sum, n) => sum + Math.round(n.price * 100), 0);
    return { ...room, nights, subtotal: subtotalCents / 100, price_per_night: nights.length ? Math.round(subtotalCents / nights.length) / 100 : 0 };
  });
}

function wizExtraRoomsSubtotal() {
  return wizExtraRoomsPricing().reduce((sum, r) => sum + r.subtotal, 0);
}

// Monta o array accommodations_data (suite principal + quartos extra) no mesmo
// formato já usado pelo painel "Editar Alojamento" (reserva-lista.js), mais o
// preço de cada noite de cada quarto.
function _wizBuildAccommodationsData(primaryId, primaryName) {
  const primaryNightly = AppModules.reservas._nightlyPrices.map(n => ({ date: n.date, price: Number(n.price) || 0 }));
  const primarySubtotal = primaryNightly.reduce((sum, n) => sum + n.price, 0);
  const nights = primaryNightly.length;
  const primaryRoom = {
    accommodation_id: primaryId,
    name: primaryName || '',
    price_per_night: nights > 0 ? primarySubtotal / nights : 0,
    nights,
    subtotal: primarySubtotal,
    nightly_prices: primaryNightly,
  };
  return [primaryRoom, ...wizExtraRoomsPricing().map(r => ({
    accommodation_id: r.accommodation_id,
    name: r.name,
    price_per_night: r.price_per_night,
    nights: r.nights.length,
    subtotal: r.subtotal,
    nightly_prices: r.nights.map(n => ({ date: n.date, price: n.price })),
  }))];
}

})();
