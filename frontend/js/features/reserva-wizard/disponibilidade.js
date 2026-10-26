// Estado privado; interface partilhada em AppModules.reservas.
(() => {
AppModules.define('reservas', {
  _wizBuildAccommodationsData: { get: () => _wizBuildAccommodationsData },
  fetchSuiteAvailability: { get: () => fetchSuiteAvailability },
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

function _wizExtraRoomNights() {
  const ci = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkin')?.value);
  const co = AppModules.core.normalizeIsoDateValue(document.getElementById('f-checkout')?.value);
  return window.ReservationDates?.countNights(ci, co) || 0;
}

// O subtotal de cada quarto extra é o preço por noite × noites da estadia,
// calculado sempre a partir das datas atuais.
function _wizExtraRoomsWithNights() {
  const nights = AppModules.reservas._nightlyPrices.length || _wizExtraRoomNights() || 1;
  return AppModules.reservas._wizExtraRooms.map(r => {
    const price = Number(r.price_per_night) || 0;
    return { ...r, price_per_night: price, nights, subtotal: Math.round(price * nights * 100) / 100 };
  });
}

function wizExtraRoomsSubtotal() {
  return _wizExtraRoomsWithNights().reduce((sum, r) => sum + r.subtotal, 0);
}

// Monta o array accommodations_data (suite principal + quartos extra) no mesmo
// formato já usado pelo painel "Editar Alojamento" (reserva-lista.js), para o
// backend persistir e recalcular exatamente da mesma forma.
function _wizBuildAccommodationsData(primaryId, primaryName) {
  const nights = AppModules.reservas._nightlyPrices.length || _wizExtraRoomNights() || 1;
  const primarySubtotal = AppModules.reservas._nightlyPrices.reduce((sum, n) => sum + (Number(n.price) || 0), 0);
  const primaryRoom = {
    accommodation_id: primaryId,
    name: primaryName || '',
    price_per_night: nights > 0 ? primarySubtotal / nights : 0,
    nights,
    subtotal: primarySubtotal,
  };
  return [primaryRoom, ..._wizExtraRoomsWithNights()];
}

})();
