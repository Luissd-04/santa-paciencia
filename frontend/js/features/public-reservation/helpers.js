// Estado privado; interface partilhada em AppModules.booking.
(() => {
AppModules.define('booking', {
  api: { get: () => api },
  ccFromFlagEmoji: { get: () => ccFromFlagEmoji },
  effectiveBirthDates: { get: () => effectiveBirthDates },
  flagHtml: { get: () => flagHtml },
  fmtCurrency: { get: () => fmtCurrency },
  fuzzyMatch: { get: () => fuzzyMatch },
  iso: { get: () => iso },
  nights: { get: () => nights },
  ptDate: { get: () => ptDate },
  renderChildAges: { get: () => renderChildAges },
  selectedUnit: { get: () => selectedUnit },
  totalGuests: { get: () => totalGuests },
});

function ccFromFlagEmoji(emoji) {
  const cps = [...String(emoji || '')].map(ch => ch.codePointAt(0));
  if (cps.length !== 2) return '';
  const a = cps[0] - 127397, b = cps[1] - 127397;
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCharCode(a, b).toLowerCase();
}

// Bandeira SVG (flag-icons) — o emoji de bandeira não aparece no Windows.
function flagHtml(codeOrEmoji) {
  let cc = String(codeOrEmoji || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) cc = ccFromFlagEmoji(codeOrEmoji);
  if (!/^[a-z]{2}$/.test(cc)) return '<span class="flag-fallback">🌐</span>';
  return `<span class="fi fi-${cc}" title="${cc.toUpperCase()}"></span>`;
}

function fuzzyMatch(search, target) {
  const s = search.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(s)) return 100 + (100 - t.indexOf(s));
  if (t.includes(s)) return 50;
  let score = 0;
  let si = 0;
  for (let i = 0; i < t.length && si < s.length; i++) {
    if (t[i] === s[si]) { score += 10; si++; }
  }
  return si === s.length ? score : 0;
}

function iso(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}

function ptDate(value) {
  return window.ReservationDates?.formatPtDate(value) || value || '';
}

function fmtCurrency(value) {
  return `€${Number(value || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nights() {
  return window.ReservationDates?.countNights(AppModules.booking.$('pb-checkin').value, AppModules.booking.$('pb-checkout').value) || 0;
}

function totalGuests() {
  return (Number(AppModules.booking.$('pb-adults').value) || 1) + (Number(AppModules.booking.$('pb-children').value) || 0);
}

// ── Idades das crianças (para cálculo por idade logo no seletor) ──
function babyAgeLimit() {
  const unit = selectedUnit();
  return Number(unit?.baby_age_limit ?? AppModules.booking.state.property?.baby_age_limit ?? 2);
}

function renderChildAges() {
  const wrap = AppModules.booking.$('pb-child-ages');
  if (!wrap) return;
  const count = Number(AppModules.booking.$('pb-children').value) || 0;
  if (count <= 0) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const prev = Array.from(wrap.querySelectorAll('select')).map(s => s.value);

  let html = '<div class="child-ages-title">Idade das crianças</div><div class="child-ages-grid">';
  for (let i = 0; i < count; i++) {
    const sel = prev[i] ?? '';
    let opts = '<option value="">Idade</option>';
    for (let a = 0; a <= 17; a++) opts += `<option value="${a}"${String(a) === sel ? ' selected' : ''}>${a} ano${a !== 1 ? 's' : ''}</option>`;
    html += `<label class="child-age-item"><select data-child-age="${i}" data-on-change="helpers-on-child-age-change-cb44413">${opts}</select><small class="child-age-hint"></small></label>`;
  }
  html += '</div>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  updateChildAgeHints();
}

function onChildAgeChange() {
  updateChildAgeHints();
  AppModules.booking.recalc();
}

function updateChildAgeHints() {
  const limit = babyAgeLimit();
  document.querySelectorAll('#pb-child-ages .child-age-item').forEach(item => {
    const sel = item.querySelector('select');
    const hint = item.querySelector('.child-age-hint');
    if (!sel || !hint) return;
    hint.textContent = (sel.value !== '' && Number(sel.value) < limit) ? 'Sem custo' : '';
  });
}

// Converte cada idade escolhida numa data de nascimento aproximada, alinhada ao
// check-in (idade-ao-check-in = idade escolhida). Idade não escolhida => null.
function childBirthDates() {
  const ci = iso(AppModules.booking.$('pb-checkin').value) || new Date().toISOString().slice(0, 10);
  const year = Number(ci.slice(0, 4));
  const monthDay = ci.slice(4); // "-MM-DD"
  return Array.from(document.querySelectorAll('#pb-child-ages select')).map(s =>
    s.value === '' ? null : `${year - Number(s.value)}${monthDay}`
  );
}

// Datas de nascimento efetivas para o cálculo: adultos (sem desconto) primeiro,
// depois as crianças (por idade). Sem crianças, usa as datas dos hóspedes.
function effectiveBirthDates() {
  const adults = Number(AppModules.booking.$('pb-adults').value) || 1;
  const children = Number(AppModules.booking.$('pb-children').value) || 0;
  if (children > 0) return [...Array(adults).fill(null), ...childBirthDates()];
  return AppModules.booking.getBirthDates();
}

function selectedUnit() {
  if (AppModules.booking.state.selectedUnitId === 'property' || !AppModules.booking.state.selectedUnitId) return null;
  return AppModules.booking.state.units.find(u => u.id === AppModules.booking.state.selectedUnitId) || null;
}

async function api(path, options = {}) {
  const res = await fetch(AppModules.booking.API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Erro ${res.status}`);
  return payload;
}


AppActions.register({
  "helpers-on-child-age-change-cb44413": (el, event, args) => { onChildAgeChange() },
}, "change");

})();
