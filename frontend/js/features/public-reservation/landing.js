// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  _turnstileToken: { get: () => _turnstileToken, set: value => { _turnstileToken = value; } },
  allImages: { get: () => allImages },
  availabilityFor: { get: () => availabilityFor },
  selectionAvailability: { get: () => selectionAvailability },
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
    AppModules.booking.state.onlinePayment = payload.data.online_payment_available === true;
    if (AppModules.booking.state.onlinePayment) {
      AppModules.booking.$('pb-payment-note').textContent = `Hoje não paga nada. Depois de o alojamento aceitar o pedido, recebe por email o link para pagar ${payload.data.payment_policy?.enabled ? 'o sinal' : 'a reserva'} online e tem 48 horas para o fazer.` + (payload.data.online_payment_test ? ' Modo de teste: não são efetuadas cobranças reais.' : '');
    }
    const paymentPolicy = payload.data.payment_policy;
    if (paymentPolicy?.enabled && document.getElementById('pb-policy')) {
      const ranges = rows => rows.map(r => `<li>${r.minDays}${r.maxDays === null ? ' ou mais' : ` a ${r.maxDays}`} dias: ${r.percent}%</li>`).join('');
      document.getElementById('pb-policy').hidden = false;
      document.getElementById('pb-policy-details').innerHTML = `<p>Pagamento inicial, pela antecedência da reserva:</p><ul>${ranges(paymentPolicy.depositRules)}</ul>
        <p>O restante vence ${paymentPolicy.balanceDays} dias antes do check-in, às 12:00 de Lisboa. Dentro desse prazo, o pagamento inicial é integral. ${paymentPolicy.automaticCharge ? 'Com autorização, o cartão pode ser cobrado automaticamente.' : ''} Se for necessário pagar por link, terá ${paymentPolicy.graceHours} horas após o aviso; depois, a reserva é cancelada sem reembolso.</p>
        <p>Reembolso do valor pago, pela antecedência ${paymentPolicy.refundBasis === 'booking' ? 'da criação da reserva' : 'do pedido de cancelamento'}:</p><ul>${ranges(paymentPolicy.refundRules)}</ul><p>Os valores e as datas exatas serão apresentados antes do pagamento.</p>`;
    }
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
  renderUnits();
  AppModules.booking.novo?.afterLanding();
  const rgpdBox = AppModules.booking.$('rgpd-text-box');
  if (rgpdBox) {
    const text = p.rgpd_text || 'Os seus dados pessoais são recolhidos e tratados para a gestão da sua reserva e cumprimento das obrigações legais aplicáveis ao alojamento local em Portugal. Os dados são conservados pelo período legalmente exigido. Tem direito de acesso, retificação e apagamento dos seus dados por contacto direto com o estabelecimento.';
    rgpdBox.textContent = text;
    rgpdBox.style.display = '';
  }
}

// Fotografia do cartão; sem fotografia, um fundo liso (nunca uma imagem partida).
// Dentro do site do cliente (iframe) as fotografias carregam logo: o iframe
// tem a altura do conteúdo e o carregamento diferido dentro de um iframe de
// outra origem depende do browser (no telemóvel ficavam por carregar).
function unitPhoto(cover) {
  const attrs = AppModules.booking.imgAttrs(cover?.src, { maxWidth: cover?.maxWidth, sizes: '(max-width: 639px) 100vw, 300px' });
  const loading = AppModules.booking.embed?.active ? 'eager' : 'lazy';
  return attrs
    ? `<img ${attrs} alt="" loading="${loading}" decoding="async" style="object-position:${AppModules.booking.escapeHtml(cover.position)}">`
    : '<img class="unit-photo-empty" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">';
}

function availabilityFor(unitId) {
  return AppModules.booking.state.availability.find(a => a.id === unitId);
}

// Disponibilidade da escolha atual: a casa inteira tem uma entrada própria
// (type 'property'); sem datas não há entrada e devolve undefined.
function selectionAvailability() {
  const id = AppModules.booking.state.selectedUnitId;
  if (!id) return undefined;
  if (id === 'property' || id === AppModules.booking.state.property?.id) {
    return AppModules.booking.state.availability.find(a => a.type === 'property');
  }
  return availabilityFor(id);
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
      ${unitPhoto(AppModules.booking.coverOf(AppModules.booking.state.property, 'landscape'))}
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
        ? `<p class="unit-desc-extra">${baseGuests} incluído${baseGuests !== 1 ? 's' : ''} no preço · cada hóspede a mais ${AppModules.booking.fmtCurrency(extraPrice)}/noite</p>`
        : '';
      // A lotação mostrada é a máxima: quem procura para 3 tem de ver que cabe,
      // mesmo quando o 3.º hóspede não paga extra.
      const maxGuests = Math.max(baseGuests, Number(unit.max_guests) || baseGuests);
      descHtml = `<p>Até ${maxGuests} hóspede${maxGuests !== 1 ? 's' : ''} · ${rooms} quarto${rooms !== 1 ? 's' : ''}</p>${extraLine}`;
    }

    return `
      <div class="unit-card ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}" data-unit="${AppModules.booking.escapeHtml(unit.id)}">
        ${unitPhoto(AppModules.booking.coverOf(unit, 'landscape'))}
        <div>
          <h4>${AppModules.booking.escapeHtml(unit.name)}</h4>
          ${descHtml}
        </div>
        ${unitPriceHtml(unit, unit.pricing_periods)}
        ${AppModules.booking.novo?.unitExtras(unit, { blocked, selected }) || ''}
      </div>`;
  }).join('');

  container.innerHTML = propertyCard + unitCards;
  AppModules.booking.novo?.afterUnits();
}



})();
