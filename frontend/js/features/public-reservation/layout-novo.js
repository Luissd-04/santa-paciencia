// Versão nova da página de reservas (?layout=novo; ver js/domain/public-layout.js).
// Só desenha: disponibilidade, preços, validação e envio são os da versão atual,
// que chama estes ganchos através de AppModules.booking.novo.
(() => {
if (!window.PublicLayout?.isNew) return;
const B = AppModules.booking;
const esc = value => B.escapeHtml(value);
const money = value => B.fmtCurrency(value);
const day = (value, options) => window.ReservationDates.formatDayLabel(value, options);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
let plan = null;
let planKey = '';
let planTimer = null;
let lastInfo = null;

AppModules.define('booking', {
  novo: { get: () => Object.freeze({ companionsNameOnly: true, afterLanding, unitExtras, afterUnits, afterRecalc, afterStep }) },
});

function dates() {
  return { checkIn: B.iso(B.$('pb-checkin').value), checkOut: B.iso(B.$('pb-checkout').value) };
}

function stayLine() {
  const { checkIn, checkOut } = dates();
  const n = B.nights();
  return checkIn && checkOut && n > 0 ? `${day(checkIn)} → ${day(checkOut)} · ${plural(n, 'noite', 'noites')}` : '';
}

// ── Topo: foto grande, descrição e destaques ─────────────────────────────
function afterLanding() {
  const p = B.state.property;
  B.$('pn-brand').textContent = p.name;
  B.$('pn-name').textContent = p.name;
  B.$('pn-location').textContent = [p.city, p.region].filter(Boolean).join(' · ');
  B.$('pn-description').textContent = p.description || '';
  const images = B.allImages();
  const cover = B.mediaThumb(p.cover_image || images[0], 1600);
  if (cover) B.$('pn-hero').style.backgroundImage = `url(${JSON.stringify(cover)})`;
  B.$('pn-hero').classList.toggle('no-photo', !cover);
  const photos = B.$('pn-photos-btn');
  photos.hidden = images.length < 2;
  photos.textContent = `Ver as ${images.length} fotos`;
  photos.addEventListener('click', () => openGallery(p.name, images));
  const minNights = Number(p.min_nights || 1);
  const chips = [`Check-in ${p.checkin_time}`, `Check-out ${p.checkout_time}`, ...(p.amenities || []).slice(0, 4)];
  if (minNights > 1) chips.push(`Mínimo ${minNights} noites`);
  B.$('pn-chips').innerHTML = chips.map(c => `<li>${esc(c)}</li>`).join('');

  // Entrada e saída numa só caixa; hóspedes com botões − e +.
  B.$('pb-checkin').closest('label').querySelector('span').textContent = 'Entrada';
  B.$('pb-checkout').closest('label').querySelector('span').textContent = 'Saída';
  B.$('pb-checkin').closest('.field-grid').classList.add('pn-dates');
  ['pb-adults', 'pb-children'].forEach(addStepper);
  B.$('pb-adults').closest('.field-grid').classList.add('pn-guests');

  // Os pedidos especiais passam para o passo dos dados; o voucher fica num link.
  const notes = B.$('pb-notes').closest('label');
  notes.querySelector('span').textContent = 'Algum pedido especial?';
  B.$('pb-notes').rows = 3;
  B.$('pb-notes').placeholder = 'Por exemplo: chegada depois das 20:00, berço, alergias';
  notes.classList.add('pn-notes');
  document.querySelector('.form-step[data-step="2"]').append(notes);
  const voucher = B.$('voucher-row');
  const details = document.createElement('details');
  details.className = 'pn-voucher';
  details.innerHTML = '<summary>Tenho um código de desconto</summary>';
  voucher.before(details);
  details.append(voucher);
  document.querySelector('.form-step[data-step="2"] .step-heading h2').textContent = 'Os seus dados';
  document.querySelector('.form-step[data-step="3"] .step-heading h2').textContent = 'Confirme a reserva';
  document.addEventListener('click', onUnitDetails, true);
}

function addStepper(id) {
  const input = B.$(id);
  const wrap = document.createElement('div');
  wrap.className = 'pn-stepper';
  input.before(wrap);
  const button = (delta, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = delta < 0 ? '−' : '+';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      const min = Number(input.min) || 0;
      const max = Number(input.max) || 20;
      const next = Math.min(max, Math.max(min, (Number(input.value) || 0) + delta));
      if (String(next) === input.value) return;
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return b;
  };
  const name = input.closest('label').querySelector('span').textContent.toLowerCase();
  wrap.append(button(-1, `Menos ${name}`), input, button(1, `Mais ${name}`));
}

// ── Quartos ───────────────────────────────────────────────────────────────
function unitExtras(unit, { blocked }) {
  const chips = [`Até ${plural(Number(unit.max_guests) || 1, 'hóspede', 'hóspedes')}`, ...(unit.amenities || []).slice(0, 3)];
  return `<div class="pn-unit-extra">
    <ul class="pn-chips small">${chips.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    ${unit.description && !blocked ? `<p class="pn-unit-desc">${esc(unit.description)}</p>` : ''}
    <button type="button" class="pn-link" data-pn-unit="${esc(unit.id)}">Ver quarto</button>
  </div>`;
}

function afterUnits() {
  const { checkIn, checkOut } = dates();
  const sub = B.$('pn-units-sub');
  if (!checkIn || !checkOut || B.nights() <= 0 || !B.state.availability.length) {
    sub.textContent = 'Escolha as datas para ver os quartos livres.';
    return;
  }
  const free = B.state.units.filter(u => B.availabilityFor(u.id)?.available).length;
  const total = B.state.units.length;
  sub.textContent = `${free} de ${total} ${total === 1 ? 'quarto livre' : 'quartos livres'} de ${day(checkIn, { weekday: false })} a ${day(checkOut, { weekday: false })}.`;
}

function onUnitDetails(event) {
  const trigger = event.target.closest('[data-pn-unit]');
  if (!trigger) return;
  event.stopPropagation();
  event.preventDefault();
  const unit = B.state.units.find(u => u.id === trigger.dataset.pnUnit);
  if (unit) openUnit(unit);
}

function dialog(className, html) {
  const el = document.createElement('dialog');
  el.className = `pn-dialog ${className}`;
  el.innerHTML = `<button type="button" class="pn-dialog-close" aria-label="Fechar">×</button>${html}`;
  el.querySelector('.pn-dialog-close').addEventListener('click', () => el.close());
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  document.body.append(el);
  el.showModal();
  return el;
}

function photosHtml(images, name) {
  return images.map((url, i) => `<img src="${esc(B.mediaThumb(url, 1024) || url)}" alt="${esc(`${name}, fotografia ${i + 1}`)}" loading="lazy" decoding="async">`).join('');
}

function openGallery(name, images) {
  dialog('pn-gallery', `<h2>${esc(name)}</h2><div class="pn-gallery-grid">${photosHtml(images, name)}</div>`);
}

function openUnit(unit) {
  const av = B.availabilityFor(unit.id);
  const blocked = av && !av.available;
  const images = [...new Set((unit.images || []).map(img => B.safeMediaUrl(img?.url)).filter(Boolean))];
  const facts = [
    `Até ${plural(Number(unit.max_guests) || 1, 'hóspede', 'hóspedes')}`,
    unit.area ? `${unit.area} m²` : '',
    plural(Number(unit.num_rooms) || 1, 'quarto', 'quartos'),
    plural(Number(unit.num_bathrooms) || 1, 'casa de banho', 'casas de banho'),
  ].filter(Boolean);
  const list = items => items.length ? `<ul class="pn-amenities">${items.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
  const n = B.nights();
  let price = '';
  if (n > 0 && !blocked) {
    const totals = B.quote(unit);
    price = `<dl class="pn-lines">
      <div><dt>${esc(stayLine())}</dt><dd></dd></div>
      ${linesHtml(totals, n, 0)}
      <div class="pn-total"><dt>Total</dt><dd>${money(totals.totalAmount)}</dd></div>
    </dl>`;
  }
  const el = dialog('pn-unit', `
    ${images.length ? `<div class="pn-unit-photos">${photosHtml(images.slice(0, 3), unit.name)}</div>` : ''}
    <h2>${esc(unit.name)}</h2>
    <ul class="pn-chips">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    ${unit.description ? `<p>${esc(unit.description)}</p>` : ''}
    ${(unit.amenities || []).length ? `<h3>No quarto</h3>${list(unit.amenities)}` : ''}
    ${(B.state.property?.amenities || []).length ? `<h3>Na casa</h3>${list(B.state.property.amenities)}` : ''}
    ${price}
    <button type="button" class="primary-btn pn-choose" ${blocked ? 'disabled' : ''}>${blocked ? 'Ocupado nestas datas' : 'Escolher este quarto'}</button>`);
  el.querySelector('.pn-choose').addEventListener('click', () => {
    B.state.selectedUnitId = unit.id;
    B.renderUnits();
    B.recalc();
    el.close();
  });
}

// ── Resumo, barra fixa e plano de pagamento ───────────────────────────────
function linesHtml(totals, n, discount) {
  const rows = [[plural(n, 'noite', 'noites'), totals.baseAmount]];
  if (totals.extraOccupancyCost > 0) rows.push(['Ocupação extra', totals.extraOccupancyCost]);
  if (totals.breakfastCost > 0) rows.push(['Pequeno-almoço', totals.breakfastCost]);
  if (totals.touristTax > 0) rows.push(['Taxa turística', totals.touristTax]);
  const html = rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${money(value)}</dd></div>`).join('');
  return html + (discount > 0 ? `<div class="pn-discount"><dt>Desconto</dt><dd>−${money(discount)}</dd></div>` : '');
}

function afterRecalc(info) {
  lastInfo = info;
  renderConfirm();
  renderBar();
  schedulePlan();
}

function renderBar() {
  const total = B.$('pn-bar-total');
  const sub = B.$('pn-bar-sub');
  const info = lastInfo;
  if (!info) {
    total.textContent = B.nights() > 0 ? 'Escolha um quarto' : 'Escolha as datas';
    sub.textContent = '';
    return;
  }
  if (B.state.step === 3 && plan && plan.depositPercent < 100) {
    total.textContent = money(plan.depositCents / 100);
    sub.textContent = `sinal · total ${money(info.finalTotal)}`;
    return;
  }
  total.textContent = money(info.finalTotal);
  sub.textContent = `${plural(info.nights, 'noite', 'noites')} · ${info.unit?.name || ''}`;
}

function renderConfirm() {
  const box = B.$('pn-confirm');
  const info = lastInfo;
  if (!info) { box.innerHTML = ''; return; }
  const thumb = B.mediaThumb(info.unit?.cover_image || info.unit?.images?.[0]?.url, 480);
  box.innerHTML = `
    <div class="pn-stay">
      ${thumb ? `<img src="${esc(thumb)}" alt="" decoding="async">` : ''}
      <div><strong>${esc(info.unit?.name || '')}</strong><small>${esc(stayLine())}</small><small>${esc(plural(info.guests, 'hóspede', 'hóspedes'))}</small></div>
    </div>
    <dl class="pn-lines">
      ${linesHtml(info.totals, info.nights, info.discountAmount)}
      <div class="pn-total"><dt>Total</dt><dd>${money(info.finalTotal)}</dd></div>
    </dl>
    ${planHtml()}`;
}

function refundLabel(rule) {
  if (rule.maxDays === null) return `${rule.minDays} ou mais dias antes`;
  if (rule.minDays === 0) return `Menos de ${rule.maxDays + 1} dias antes`;
  return `${rule.minDays} a ${rule.maxDays} dias antes`;
}

function planHtml() {
  if (!plan) return `<p class="pn-note">${esc(B.$('pb-payment-note').textContent)}</p>`;
  const due = plan.dueAt ? day(plan.dueAt.slice(0, 10)) : '';
  const rows = plan.depositPercent >= 100 || !plan.balanceCents
    ? `<div><span><strong>Hoje</strong> · pagamento total</span><strong>${money(plan.depositCents / 100)}</strong></div>`
    : `<div><span><strong>Hoje</strong> · sinal de ${plan.depositPercent}%</span><strong>${money(plan.depositCents / 100)}</strong></div>
       <div><span>Até ${esc(due)} · restante</span><span>${money(plan.balanceCents / 100)}</span></div>`;
  const refunds = [...plan.refundRules].sort((a, b) => b.minDays - a.minDays).map(r => `<div><dt>${esc(refundLabel(r))}</dt><dd>${
    r.percent >= 100 ? 'Reembolso total' : r.percent <= 0 ? 'Sem reembolso' : `${r.percent}% do pago`}</dd></div>`).join('');
  return `<section class="pn-plan-box">
    <h3>Como paga</h3>
    <div class="pn-plan">${rows}</div>
    <p class="pn-note">Paga com cartão ou MB WAY, na página seguinte.${plan.balanceCents && plan.automaticCharge ? ' Se autorizar, o restante é cobrado no cartão na data indicada; senão, enviamos um link.' : ''}</p>
    <h3>Se precisar de cancelar</h3>
    <dl class="pn-lines pn-refunds">${refunds}</dl>
    ${plan.refundBasis === 'booking' ? '<p class="pn-note">Os dias contam-se desde a data da reserva até à chegada.</p>' : ''}
  </section>`;
}

function schedulePlan() {
  const { checkIn } = dates();
  const key = lastInfo && checkIn && B.state.onlinePayment ? `${checkIn}|${lastInfo.finalTotal}` : '';
  if (key === planKey) return;
  planKey = key;
  clearTimeout(planTimer);
  if (!key) { plan = null; renderConfirm(); renderBar(); return; }
  planTimer = setTimeout(async () => {
    const result = await B.api(`/api/public/booking/${encodeURIComponent(B.state.slug)}/payment-plan?check_in=${checkIn}&total=${lastInfo.finalTotal}`).catch(() => null);
    if (planKey !== key) return;
    plan = result?.data || null;
    renderConfirm();
    renderBar();
  }, 250);
}

function afterStep() {
  const step = B.state.step;
  B.$('next-btn').textContent = step < 3 ? 'Continuar' : (B.state.onlinePayment ? 'Reservar e pagar' : 'Enviar pedido');
  renderBar();
}

})();
