// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  _turnstileToken: { get: () => _turnstileToken, set: value => { _turnstileToken = value; } },
  availabilityFor: { get: () => availabilityFor },
  init: { get: () => init },
  renderTurnstile: { get: () => renderTurnstile },
  renderUnits: { get: () => renderUnits },
  resetTurnstile: { get: () => resetTurnstile },
});

async function init() {
  if (!AppModules.booking.state.slug) return showFatal('Link inválido.');
  try {
    const payload = await AppModules.booking.api(`/api/public/booking/${AppModules.booking.state.slug}`);
    AppModules.booking.state.property = payload.data.property;
    AppModules.booking.state.units = payload.data.units || [];
    AppModules.booking.state.services = payload.data.services || [];
    AppModules.booking.state.captcha = payload.data.captcha || null;
    AppModules.booking.state.selectedUnitId = 'property';
    renderLanding();
    AppModules.booking.bindEvents();
    AppModules.booking.renderStep();
    AppModules.booking.recalc();
  } catch (err) {
    showFatal(err.message);
  }
}

// ── Cloudflare Turnstile ──────────────────────────────────────────────
// O script da Cloudflare chama `onTurnstileReady` quando carrega.
let _turnstileWidgetId = null;
let _turnstileToken = '';

window.onTurnstileReady = function () {
  // Render diferido até estarmos no passo 3 (renderTurnstile faz isso).
  renderTurnstile();
};

function renderTurnstile() {
  if (!AppModules.booking.state.captcha?.site_key) return;
  if (!window.turnstile) return;
  if (AppModules.booking.state.step !== 3) return;
  const container = document.getElementById('pb-captcha');
  if (!container || _turnstileWidgetId !== null) return;
  _turnstileWidgetId = window.turnstile.render(container, {
    sitekey: AppModules.booking.state.captcha.site_key,
    callback: (token) => { _turnstileToken = token; },
    'expired-callback': () => { _turnstileToken = ''; },
    'error-callback': () => { _turnstileToken = ''; },
  });
}

function resetTurnstile() {
  if (window.turnstile && _turnstileWidgetId !== null) {
    window.turnstile.reset(_turnstileWidgetId);
  }
  _turnstileToken = '';
}

function showFatal(message) {
  document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#17120f;color:#fff;font-family:Inter,sans-serif;padding:24px;text-align:center;"><div><h1>Não foi possível abrir a página</h1><p>${AppModules.booking.escapeHtml(message)}</p></div></div>`;
}

function allImages() {
  const imgs = [
    ...(AppModules.booking.state.property?.images || []),
    ...AppModules.booking.state.units.flatMap(u => u.images || [])
  ].map(img => AppModules.booking.safeMediaUrl(img?.url)).filter(Boolean);
  return Array.from(new Set(imgs));
}

function renderLanding() {
  const p = AppModules.booking.state.property;
  document.title = `Reservar ${p.name}`;
  AppModules.booking.$('property-name').textContent = p.name;
  const location = [p.city, p.country].filter(Boolean).join(' · ') || 'Reserva online';
  AppModules.booking.$('property-location').textContent = location;
  AppModules.booking.$('property-description').textContent = p.description || 'Escolha as datas e envie o pedido de reserva. Confirmaremos a disponibilidade o mais rapidamente possível.';
  const imgs = allImages();
  const fallback = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80';
  AppModules.booking.$('ambient-bg').style.backgroundImage = `url(${JSON.stringify(imgs[0] || fallback)})`;
  renderRail('gallery-top', imgs.length ? imgs : [fallback]);
  renderRail('gallery-bottom', imgs.length ? imgs.slice().reverse() : [fallback]);
  rotateBackground();
  renderUnits();
  const rgpdBox = AppModules.booking.$('rgpd-text-box');
  if (rgpdBox) {
    const text = p.rgpd_text || 'Os seus dados pessoais são recolhidos e tratados para a gestão da sua reserva e cumprimento das obrigações legais aplicáveis ao alojamento local em Portugal. Os dados são conservados pelo período legalmente exigido. Tem direito de acesso, retificação e apagamento dos seus dados por contacto direto com o estabelecimento.';
    rgpdBox.textContent = text;
    rgpdBox.style.display = '';
  }
}

function rotateBackground() {
  const now = Date.now();
  if (now - AppModules.booking.state.lastBgChange < 8000) return;
  const pool = allImages();
  if (!pool.length) return;
  AppModules.booking.state.bgIndex = (AppModules.booking.state.bgIndex + 1) % pool.length;
  AppModules.booking.$('ambient-bg').style.backgroundImage = `url(${JSON.stringify(pool[AppModules.booking.state.bgIndex])})`;
  AppModules.booking.state.lastBgChange = now;
  setTimeout(rotateBackground, 8000);
}

function renderRail(id, imgs) {
  const rail = AppModules.booking.$(id);
  if (!imgs.length) return;
  const doubled = [...imgs, ...imgs, ...imgs, ...imgs].slice(0, Math.max(16, imgs.length * 3));
  rail.innerHTML = doubled.map(url => `<img class="rail-img" src="${AppModules.booking.escapeHtml(url)}" alt="" loading="lazy">`).join('');
  rail.classList.remove('paused');
  void rail.offsetHeight;
  rail.style.animation = 'none';
  void rail.offsetHeight;
  rail.style.animation = '';
}

function availabilityFor(unitId) {
  return AppModules.booking.state.availability.find(a => a.id === unitId);
}

function renderUnits() {
  const container = AppModules.booking.$('unit-list');
  const propertyAv = AppModules.booking.state.availability.find(a => a.type === 'property');
  const propertyBlocked = propertyAv && !propertyAv.available;
  const propertySelected = AppModules.booking.state.selectedUnitId === 'property' || AppModules.booking.state.selectedUnitId === AppModules.booking.state.property?.id;
  const propertyReason = propertyAv?.occupied
    ? 'Indisponível nas datas selecionadas'
    : propertyAv?.over_capacity
    ? `Capacidade máxima: ${propertyAv.max_guests} hóspedes`
    : 'Propriedade inteira para sua exclusividade';

  const n = AppModules.booking.nights();
  const hasDates = n > 0;
  const checkIn = AppModules.booking.iso(AppModules.booking.$('pb-checkin').value);
  const checkOut = AppModules.booking.iso(AppModules.booking.$('pb-checkout').value);
  const guests = AppModules.booking.totalGuests();

  function unitPriceHtml(unit, pricingPeriods) {
    if (!hasDates || !window.ReservationPricing) return '';
    const totals = window.ReservationPricing.calculateReservationTotal(unit, [], {
      check_in: checkIn,
      check_out: checkOut,
      num_guests: guests,
      pricing_periods: pricingPeriods || [],
      birth_dates: AppModules.booking.effectiveBirthDates()
    });
    if (!totals || !totals.baseAmount) return '';
    const avgPerNight = totals.baseAmount / n;
    const extraHtml = totals.extraOccupancyCost > 0
      ? `<div class="unit-price-extra">+ ${AppModules.booking.fmtCurrency(totals.extraOccupancyCost)} ocupação extra</div>`
      : '';
    return `<div class="unit-price">${AppModules.booking.fmtCurrency(avgPerNight)}<small>/ noite</small><div class="unit-price-total">${AppModules.booking.fmtCurrency(totals.baseAmount + totals.extraOccupancyCost)} total</div>${extraHtml}</div>`;
  }

  const propertyPrice = Number(AppModules.booking.state.property?.price_per_night) || 0;
  const priceHtml = propertyPrice > 0 ? unitPriceHtml(AppModules.booking.state.property, AppModules.booking.state.property?.pricing_periods) : '';

  const propertyCard = `
    <div class="unit-card ${propertySelected ? 'selected' : ''} ${propertyBlocked ? 'blocked' : ''} property-card" data-unit="property">
      <img src="${AppModules.booking.escapeHtml(AppModules.booking.safeMediaUrl(AppModules.booking.state.property?.images?.[0]?.url))}" alt="" loading="lazy">
      <div>
        <h4>${AppModules.booking.escapeHtml(AppModules.booking.state.property?.name || 'Alojamento completo')}</h4>
        <p>${AppModules.booking.escapeHtml(propertyReason)}</p>
      </div>
      ${priceHtml}
    </div>`;

  const unitCards = AppModules.booking.state.units.map(unit => {
    const av = availabilityFor(unit.id);
    const blocked = av && !av.available;
    const selected = AppModules.booking.state.selectedUnitId === unit.id && !blocked;

    let descHtml;
    if (av?.over_capacity) {
      descHtml = `<p>Capacidade máxima: ${unit.max_guests} hóspedes</p>`;
    } else if (av?.occupied) {
      descHtml = `<p>Indisponível nas datas selecionadas</p>`;
    } else {
      const baseGuests = Number(unit.base_guests_included) || Number(unit.max_guests) || 1;
      const extraCapacity = Math.max(0, Number(unit.max_guests) - baseGuests);
      const extraOpts = window.ReservationPricing?.normalizeExtraOccupancyOptions(unit) || [];
      const extraPrice = extraOpts[0]?.price || 0;
      const rooms = unit.num_rooms || 1;
      const extraLine = extraCapacity > 0 && extraPrice > 0
        ? `<p class="unit-desc-extra">${extraCapacity} hóspede${extraCapacity !== 1 ? 's' : ''} adiciona${extraCapacity !== 1 ? 'is' : 'l'} · ${AppModules.booking.fmtCurrency(extraPrice)}/noite</p>`
        : '';
      descHtml = `<p>${baseGuests} hóspede${baseGuests !== 1 ? 's' : ''} · ${rooms} quarto${rooms !== 1 ? 's' : ''}</p>${extraLine}`;
    }

    return `
      <div class="unit-card ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-unit="${AppModules.booking.escapeHtml(unit.id)}">
        <img src="${AppModules.booking.escapeHtml(AppModules.booking.safeMediaUrl(unit.cover_image || unit.images?.[0]?.url))}" alt="" loading="lazy">
        <div>
          <h4>${AppModules.booking.escapeHtml(unit.name)}</h4>
          ${descHtml}
        </div>
        ${unitPriceHtml(unit, unit.pricing_periods)}
      </div>`;
  }).join('');

  container.innerHTML = propertyCard + unitCards;
}



})();
