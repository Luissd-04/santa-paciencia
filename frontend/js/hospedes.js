let hospedes = [];
let hospedesViewMode = 'cards';
let hospedesSortCol = 'name';
let hospedesSortAsc = true;
let editingGuestId = null;

// ── COUNTRIES ──
const COUNTRIES = [
  { code: 'af', name: 'Afeganistão' }, { code: 'za', name: 'África do Sul' },
  { code: 'al', name: 'Albânia' }, { code: 'de', name: 'Alemanha' },
  { code: 'ad', name: 'Andorra' }, { code: 'ao', name: 'Angola' },
  { code: 'sa', name: 'Arábia Saudita' }, { code: 'dz', name: 'Argélia' },
  { code: 'ar', name: 'Argentina' }, { code: 'am', name: 'Arménia' },
  { code: 'au', name: 'Austrália' }, { code: 'at', name: 'Áustria' },
  { code: 'az', name: 'Azerbaijão' }, { code: 'be', name: 'Bélgica' },
  { code: 'bh', name: 'Bahrein' }, { code: 'bd', name: 'Bangladesh' },
  { code: 'by', name: 'Bielorrússia' }, { code: 'bo', name: 'Bolívia' },
  { code: 'ba', name: 'Bósnia e Herzegovina' }, { code: 'br', name: 'Brasil' },
  { code: 'bg', name: 'Bulgária' }, { code: 'cv', name: 'Cabo Verde' },
  { code: 'ca', name: 'Canadá' }, { code: 'cl', name: 'Chile' },
  { code: 'cn', name: 'China' }, { code: 'cy', name: 'Chipre' },
  { code: 'co', name: 'Colômbia' }, { code: 'cr', name: 'Costa Rica' },
  { code: 'hr', name: 'Croácia' }, { code: 'cu', name: 'Cuba' },
  { code: 'dk', name: 'Dinamarca' }, { code: 'eg', name: 'Egito' },
  { code: 'ae', name: 'Emirados Árabes' }, { code: 'sk', name: 'Eslováquia' },
  { code: 'si', name: 'Eslovénia' }, { code: 'es', name: 'Espanha' },
  { code: 'us', name: 'Estados Unidos' }, { code: 'ee', name: 'Estónia' },
  { code: 'et', name: 'Etiópia' }, { code: 'ph', name: 'Filipinas' },
  { code: 'fi', name: 'Finlândia' }, { code: 'fr', name: 'França' },
  { code: 'ge', name: 'Geórgia' }, { code: 'gh', name: 'Gana' },
  { code: 'gr', name: 'Grécia' }, { code: 'gt', name: 'Guatemala' },
  { code: 'hu', name: 'Hungria' }, { code: 'in', name: 'Índia' },
  { code: 'id', name: 'Indonésia' }, { code: 'iq', name: 'Iraque' },
  { code: 'ir', name: 'Irão' }, { code: 'ie', name: 'Irlanda' },
  { code: 'is', name: 'Islândia' }, { code: 'il', name: 'Israel' },
  { code: 'it', name: 'Itália' }, { code: 'jp', name: 'Japão' },
  { code: 'jo', name: 'Jordânia' }, { code: 'kz', name: 'Cazaquistão' },
  { code: 'ke', name: 'Quénia' }, { code: 'kw', name: 'Kuwait' },
  { code: 'lv', name: 'Letónia' }, { code: 'lb', name: 'Líbano' },
  { code: 'ly', name: 'Líbia' }, { code: 'li', name: 'Listenstaine' },
  { code: 'lt', name: 'Lituânia' }, { code: 'lu', name: 'Luxemburgo' },
  { code: 'mo', name: 'Macau' }, { code: 'mk', name: 'Macedónia do Norte' },
  { code: 'my', name: 'Malásia' }, { code: 'ma', name: 'Marrocos' },
  { code: 'mx', name: 'México' }, { code: 'md', name: 'Moldávia' },
  { code: 'mc', name: 'Mónaco' }, { code: 'mz', name: 'Moçambique' },
  { code: 'na', name: 'Namíbia' }, { code: 'ng', name: 'Nigéria' },
  { code: 'no', name: 'Noruega' }, { code: 'nz', name: 'Nova Zelândia' },
  { code: 'nl', name: 'Países Baixos' }, { code: 'pk', name: 'Paquistão' },
  { code: 'pe', name: 'Peru' }, { code: 'pl', name: 'Polónia' },
  { code: 'pt', name: 'Portugal' }, { code: 'qa', name: 'Qatar' },
  { code: 'gb', name: 'Reino Unido' }, { code: 'cz', name: 'República Checa' },
  { code: 'ro', name: 'Roménia' }, { code: 'ru', name: 'Rússia' },
  { code: 'rw', name: 'Ruanda' }, { code: 'sm', name: 'San Marino' },
  { code: 'sn', name: 'Senegal' }, { code: 'rs', name: 'Sérvia' },
  { code: 'sg', name: 'Singapura' }, { code: 'so', name: 'Somália' },
  { code: 'lk', name: 'Sri Lanka' }, { code: 'se', name: 'Suécia' },
  { code: 'ch', name: 'Suíça' }, { code: 'th', name: 'Tailândia' },
  { code: 'tw', name: 'Taiwan' }, { code: 'tz', name: 'Tanzânia' },
  { code: 'tr', name: 'Turquia' }, { code: 'ua', name: 'Ucrânia' },
  { code: 'ug', name: 'Uganda' }, { code: 'uy', name: 'Uruguai' },
  { code: 've', name: 'Venezuela' }, { code: 'vn', name: 'Vietname' },
  { code: 'zm', name: 'Zâmbia' }, { code: 'zw', name: 'Zimbabwe' },
];

// Nationality free-text → ISO2 fallback for older records
const NATIONALITY_FALLBACK = {
  'portuguesa': 'pt', 'portuguese': 'pt', 'portugal': 'pt',
  'espanhola': 'es', 'espanhol': 'es', 'española': 'es', 'spain': 'es',
  'francesa': 'fr', 'francês': 'fr', 'french': 'fr',
  'britânica': 'gb', 'british': 'gb', 'inglesa': 'gb', 'inglês': 'gb',
  'alemã': 'de', 'alemão': 'de', 'german': 'de',
  'italiana': 'it', 'italiano': 'it', 'italian': 'it',
  'neerlandesa': 'nl', 'holandesa': 'nl', 'dutch': 'nl',
  'americana': 'us', 'americano': 'us', 'estados unidos': 'us',
  'brasileira': 'br', 'brasileiro': 'br', 'brazil': 'br',
  'japonesa': 'jp', 'japonês': 'jp', 'japanese': 'jp',
  'chinesa': 'cn', 'chinês': 'cn', 'chinese': 'cn',
  'canadiana': 'ca', 'canadiano': 'ca', 'canadian': 'ca',
  'australiana': 'au', 'australiano': 'au', 'australian': 'au',
  'suíça': 'ch', 'suíço': 'ch', 'swiss': 'ch',
  'austríaca': 'at', 'austríaco': 'at', 'austrian': 'at',
  'belga': 'be', 'belgian': 'be',
  'sueca': 'se', 'sueco': 'se', 'swedish': 'se',
  'norueguesa': 'no', 'norueguês': 'no', 'norwegian': 'no',
  'dinamarquesa': 'dk', 'dinamarquês': 'dk', 'danish': 'dk',
  'finlandesa': 'fi', 'finlandês': 'fi', 'finnish': 'fi',
  'polaca': 'pl', 'polaco': 'pl', 'polish': 'pl',
  'checa': 'cz', 'checo': 'cz', 'czech': 'cz',
  'húngara': 'hu', 'húngaro': 'hu', 'hungarian': 'hu',
  'romena': 'ro', 'romeno': 'ro', 'romanian': 'ro',
  'grega': 'gr', 'grego': 'gr', 'greek': 'gr',
  'turca': 'tr', 'turco': 'tr', 'turkish': 'tr',
  'mexicana': 'mx', 'mexicano': 'mx', 'mexican': 'mx',
  'argentina': 'ar', 'argentino': 'ar', 'argentinian': 'ar',
  'indiana': 'in', 'indiano': 'in', 'indian': 'in',
  'irlandesa': 'ie', 'irlandês': 'ie', 'irish': 'ie',
  'russa': 'ru', 'russo': 'ru', 'russian': 'ru',
  'ucraniana': 'ua', 'ucraniano': 'ua', 'ukrainian': 'ua',
  'israelita': 'il', 'israelense': 'il', 'israeli': 'il',
  'singapuriana': 'sg', 'singapuriano': 'sg', 'singaporean': 'sg',
  'coreana': 'kr', 'coreano': 'kr', 'korean': 'kr', 'coreia do sul': 'kr',
  'tailandesa': 'th', 'tailandês': 'th', 'thai': 'th',
  'filipina': 'ph', 'filipino': 'ph', 'filipino': 'ph',
  'marroquina': 'ma', 'marroquino': 'ma', 'moroccan': 'ma',
};

function resolveCountryCode(g) {
  // Prefer standardized country field
  if (g.country) {
    const found = COUNTRIES.find(c => c.name.toLowerCase() === g.country.toLowerCase().trim());
    if (found) return found.code;
  }
  // Fallback: nationality free text
  if (g.nationality) {
    const key = g.nationality.toLowerCase().trim();
    // Try exact country name match
    const found = COUNTRIES.find(c => c.name.toLowerCase() === key);
    if (found) return found.code;
    // Try fallback map
    return NATIONALITY_FALLBACK[key] || null;
  }
  return null;
}

function flagImg(g, size = 64) {
  const code = resolveCountryCode(g);

  if (size <= 40) {
    const h = Math.round(size * 0.72);
    const fallback = `<span style="font-size:${Math.round(size * 0.65)}px;width:${size}px;height:${h}px;display:inline-flex;align-items:center;justify-content:center;background:var(--cinza-claro);border-radius:4px;flex-shrink:0;">🌐</span>`;
    if (!code) return fallback;
    return `<img src="https://flagcdn.com/w${size <= 32 ? 32 : 48}/${code}.png"
                 width="${size}" height="${h}"
                 style="border-radius:4px;object-fit:cover;flex-shrink:0;display:block;"
                 onerror="this.outerHTML='${fallback.replace(/'/g, '&#39;')}'"
                 alt="${code}">`;
  }

  const w = size <= 48 ? 48 : size <= 64 ? 64 : 80;
  const h = Math.round(size * 0.67);
  const fs = Math.round(size * 0.45);
  const base = `width:${size}px;height:${h}px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--cinza-claro);font-size:${fs}px;overflow:hidden;position:relative;`;
  if (!code) return `<div style="${base}">🌐</div>`;
  return `<div style="${base}">
    <span style="line-height:1;flex-shrink:0;">🌐</span>
    <img src="https://flagcdn.com/w${w}/${code}.png" alt="${code}"
         style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"
         onerror="this.style.display='none'">
  </div>`;
}

function formatShortDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

function guestTagsHtml(g) {
  const tags = [];
  if (g.is_favorite) tags.push(`<span class="htag htag-favorito">⭐ Favorito</span>`);
  if (g.is_vip) tags.push(`<span class="htag htag-vip">👑 VIP</span>`);
  if (g.is_unwanted) tags.push(`<span class="htag htag-nao-desejado">🚫 Não desejado</span>`);
  return tags.length ? `<div class="hospede-tags">${tags.join('')}</div>` : '';
}

// ── LOAD ──
async function loadHospedes() {
  document.getElementById('hospedes-loading').style.display = 'flex';
  document.getElementById('hospedes-cards-grid').innerHTML = '';
  document.getElementById('hospedes-empty').style.display = 'none';
  try {
    const data = await apiGet('/api/guests');
    hospedes = data.data || [];
    renderHospedes();
  } catch (e) {
    toast('❌ Erro ao carregar hóspedes.', 'error');
    document.getElementById('hospedes-loading').style.display = 'none';
  }
}

function setHospedesView(mode) {
  hospedesViewMode = mode;
  document.getElementById('hvt-cards').classList.toggle('active', mode === 'cards');
  document.getElementById('hvt-lista').classList.toggle('active', mode === 'lista');
  document.getElementById('hospedes-cards-view').style.display = mode === 'cards' ? '' : 'none';
  document.getElementById('hospedes-lista-view').style.display = mode === 'lista' ? '' : 'none';
  renderHospedes();
}

function renderHospedes() {
  if (hospedesViewMode === 'cards') renderHospedesCards();
  else renderHospedesList();
}

function filteredHospedes() {
  const q = (document.getElementById('hospedes-search') || { value: '' }).value.toLowerCase();
  if (!q) return hospedes;
  return hospedes.filter(g =>
    (g.name + ' ' + (g.email || '') + ' ' + (g.nationality || '') + ' ' + (g.phone || '') + ' ' + (g.country || '')).toLowerCase().includes(q)
  );
}

// ── CARDS VIEW ──
function renderHospedesCards() {
  const loading = document.getElementById('hospedes-loading');
  const grid = document.getElementById('hospedes-cards-grid');
  const empty = document.getElementById('hospedes-empty');
  loading.style.display = 'none';

  const data = filteredHospedes();
  if (data.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = data.map(g => `
    <div class="hospede-card">
      <div class="hospede-card-top">
        ${flagImg(g, 72)}
        <button class="hospede-menu-btn" onclick="showHospedeDetail('${g.id}')" title="Ver detalhes">
          ${lcIcon('external-link', 16)}
        </button>
      </div>
      <div class="hospede-name">${g.name}</div>
      <div class="hospede-info-row">
        ${lcIcon('briefcase', 14)}
        <span>${g.reservation_count || 0} reserva${g.reservation_count !== 1 ? 's' : ''}</span>
        ${g.last_check_in ? `<span class="hospede-dot">·</span><span>${formatShortDate(g.last_check_in)}</span>` : ''}
      </div>
      ${g.phone ? `<div class="hospede-info-row">${lcIcon('smartphone', 14)} <span>${g.phone}</span></div>` : ''}
      ${g.email ? `<div class="hospede-info-row">${lcIcon('mail', 14)} <span class="hospede-email">${g.email}</span></div>` : ''}
      ${(g.country || g.nationality) ? `<div class="hospede-info-row">${lcIcon('map-pin', 14)} <span>${g.country || g.nationality}</span></div>` : ''}
      ${guestTagsHtml(g)}
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

// ── LIST VIEW ──
function sortHospedes(col) {
  if (hospedesSortCol === col) {
    hospedesSortAsc = !hospedesSortAsc;
  } else {
    hospedesSortCol = col;
    hospedesSortAsc = true;
  }
  document.querySelectorAll('[id^="hsort-"]').forEach(el => el.textContent = '');
  const icon = document.getElementById('hsort-' + col);
  if (icon) icon.textContent = hospedesSortAsc ? '↑' : '↓';
  renderHospedesList();
}

function renderHospedesList() {
  const data = filteredHospedes().slice().sort((a, b) => {
    let va = a[hospedesSortCol] ?? '';
    let vb = b[hospedesSortCol] ?? '';
    if (hospedesSortCol === 'last_check_in') {
      va = va ? new Date(va) : new Date(0);
      vb = vb ? new Date(vb) : new Date(0);
    } else if (hospedesSortCol === 'reservation_count') {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    if (va < vb) return hospedesSortAsc ? -1 : 1;
    if (va > vb) return hospedesSortAsc ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('hospedes-lista-body');
  const empty = document.getElementById('hospedes-lista-empty');

  if (data.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(g => `
    <tr onclick="showHospedeDetail('${g.id}')" style="cursor:pointer;">
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${flagImg(g, 32)}
          <div>
            <b>${g.name}</b>
            <div style="display:inline-flex;gap:4px;margin-left:6px;">${guestTagsHtml(g)}</div>
          </div>
        </div>
      </td>
      <td style="font-size:12.5px;color:var(--cinza);">${g.email || '—'}</td>
      <td style="font-size:12.5px;">${g.phone || '—'}</td>
      <td style="font-size:12.5px;">${g.country || g.nationality || '—'}</td>
      <td style="text-align:center;"><b>${g.reservation_count || 0}</b></td>
      <td style="font-size:12.5px;">${g.last_check_in ? formatDate(g.last_check_in) : '—'}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="openGuestEdit('${g.id}')" title="Editar">
          ${lcIcon('pencil', 13)}
        </button>
        <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho)" onclick="deleteGuest('${g.id}','${g.name.replace(/'/g, "\\'")}')" title="Remover">
          ${lcIcon('trash-2', 13)}
        </button>
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

// ── DETAIL MODAL ──
async function showHospedeDetail(id) {
  try {
    const data = await apiGet(`/api/guests/${id}`);
    const g = data.data;
    const reservations = g.reservations || [];

    document.getElementById('detail-title').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:8px;">${g.name}${guestTagsHtml(g)}</span>
    `;
    document.getElementById('detail-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;">
        ${flagImg(g, 80)}
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--azul);font-family:'Playfair Display',serif;">${g.name}</div>
          ${(g.country || g.nationality) ? `<div style="font-size:13px;color:var(--cinza);margin-top:4px;display:flex;align-items:center;gap:4px;">${lcIcon('map-pin', 12)} ${g.country || g.nationality}</div>` : ''}
        </div>
      </div>
      <div class="detail-grid">
        ${g.email ? `<div class="detail-row"><div class="detail-label">Email (canal)</div><div class="detail-val">${g.email}</div></div>` : ''}
        ${g.email_personal ? `<div class="detail-row"><div class="detail-label">Email (pessoal)</div><div class="detail-val">${g.email_personal}</div></div>` : ''}
        ${g.phone ? `<div class="detail-row"><div class="detail-label">Telefone</div><div class="detail-val">${g.phone}</div></div>` : ''}
        ${g.birth_date ? `<div class="detail-row"><div class="detail-label">Nascimento</div><div class="detail-val">${formatDate(g.birth_date)}</div></div>` : ''}
        ${g.nif ? `<div class="detail-row"><div class="detail-label">NIF</div><div class="detail-val">${g.nif}</div></div>` : ''}
        ${g.address ? `<div class="detail-row"><div class="detail-label">Morada</div><div class="detail-val">${g.address}${g.postal_code ? ', ' + g.postal_code : ''}${g.city ? ' ' + g.city : ''}</div></div>` : ''}
        <div class="detail-row"><div class="detail-label">Reservas</div><div class="detail-val"><b>${reservations.length}</b></div></div>
        <div class="detail-row"><div class="detail-label">Desde</div><div class="detail-val">${formatDate(g.created_at)}</div></div>
      </div>
      ${reservations.length > 0 ? `
      <div style="margin-top:20px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--cinza);margin-bottom:10px;">Histórico de reservas</div>
        ${reservations.map(r => `
          <div onclick="document.getElementById('detail-bg').classList.remove('open');showDetail('${r.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--cinza-claro);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='var(--creme)'" onmouseout="this.style.background='var(--cinza-claro)'">
            <div>
              <span style="font-size:12px;color:var(--azul-claro);font-family:monospace;">${r.id}</span>
              <span style="font-size:13px;color:var(--texto);margin-left:8px;">${r.accommodation_name}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:12px;color:var(--cinza);">${formatDate(r.check_in)} → ${formatDate(r.check_out)}</span>
              <b>€${Number(r.total_amount||0).toFixed(2)}</b>
              ${badgeEstado(r.status)}
            </div>
          </div>`).join('')}
      </div>` : ''}
    `;
    document.getElementById('detail-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="document.getElementById('detail-bg').classList.remove('open')">Fechar</button>
      <button class="btn btn-danger" onclick="document.getElementById('detail-bg').classList.remove('open');deleteGuest('${g.id}','${g.name.replace(/'/g, "\\'")}')">
        ${lcIcon('trash-2', 13)} Remover
      </button>
      <button class="btn btn-primary" onclick="document.getElementById('detail-bg').classList.remove('open');openGuestEdit('${g.id}')">
        ${lcIcon('pencil', 13)} Editar
      </button>
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('detail-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar hóspede.', 'error');
  }
}

// ── EDIT MODAL ──
function populateCountrySelect() {
  const sel = document.getElementById('gedit-country');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sem país —</option>' +
    COUNTRIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

async function openGuestEdit(id) {
  try {
    const data = await apiGet(`/api/guests/${id}`);
    const g = data.data;
    editingGuestId = id;

    populateCountrySelect();

    // Split name into first/last if not already stored separately
    const parts = (g.name || '').trim().split(' ');
    document.getElementById('gedit-first-name').value = g.first_name || parts[0] || '';
    document.getElementById('gedit-last-name').value = g.last_name || parts.slice(1).join(' ') || '';
    document.getElementById('gedit-email').value = g.email || '';
    document.getElementById('gedit-email-personal').value = g.email_personal || '';
    document.getElementById('gedit-phone').value = g.phone || '';
    document.getElementById('gedit-birth-date').value = g.birth_date || '';
    document.getElementById('gedit-nif').value = g.nif || '';
    document.getElementById('gedit-address').value = g.address || '';
    document.getElementById('gedit-postal-code').value = g.postal_code || '';
    document.getElementById('gedit-city').value = g.city || '';
    document.getElementById('gedit-favorito').checked = !!g.is_favorite;
    document.getElementById('gedit-vip').checked = !!g.is_vip;
    document.getElementById('gedit-nao-desejado').checked = !!g.is_unwanted;

    const sel = document.getElementById('gedit-country');
    if (g.country) sel.value = g.country;

    if (window.lucide) lucide.createIcons();
    document.getElementById('guest-modal-bg').classList.add('open');
  } catch (e) {
    toast('❌ Erro ao carregar hóspede.', 'error');
  }
}

function closeGuestModal() {
  document.getElementById('guest-modal-bg').classList.remove('open');
  editingGuestId = null;
}

// ── DELETE ──
async function deleteGuest(id, name) {
  if (!confirm(`Tem a certeza que quer remover o hóspede "${name}"?\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    const res = await apiDelete(`/api/guests/${id}`);
    if (res.success) {
      toast('🗑 Hóspede removido.', 'info');
      await loadHospedes();
    } else {
      toast('❌ ' + (res.error || 'Erro ao remover hóspede.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── EXPORT ──
function exportHospedesXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const rows = hospedes.map(g => ({
    'Nome':        g.name,
    'Email':       g.email || '',
    'Email pessoal': g.email_personal || '',
    'Telefone':    g.phone || '',
    'País':        g.country || g.nationality || '',
    'NIF':         g.nif || '',
    'Morada':      g.address || '',
    'CP':          g.postal_code || '',
    'Localidade':  g.city || '',
    'Reservas':    g.reservation_count || 0,
    'Última visita': g.last_check_in || '',
    'Favorito':    g.is_favorite ? 'Sim' : 'Não',
    'VIP':         g.is_vip ? 'Sim' : 'Não',
    'Não desejado': g.is_unwanted ? 'Sim' : 'Não',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hóspedes');
  XLSX.writeFile(wb, `hospedes_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('📊 Excel exportado!', 'success');
}

function exportHospedesPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Hóspedes — Santa Paciência', 14, 18);
  doc.setFontSize(10);
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')}`, 14, 26);

  const head = [['Nome', 'Email', 'Telefone', 'País', 'Reservas', 'Última visita', 'Tags']];
  const body = hospedes.map(g => [
    g.name,
    g.email || '—',
    g.phone || '—',
    g.country || g.nationality || '—',
    String(g.reservation_count || 0),
    g.last_check_in ? new Date(g.last_check_in + 'T12:00:00').toLocaleDateString('pt-PT') : '—',
    [g.is_favorite?'⭐':'', g.is_vip?'👑':'', g.is_unwanted?'🚫':''].filter(Boolean).join(' ') || '—',
  ]);

  doc.autoTable({ head, body, startY: 32, styles: { fontSize: 9 }, headStyles: { fillColor: [132, 52, 36] } });
  doc.save(`hospedes_${new Date().toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exportado!', 'success');
}

async function saveGuestEdit() {
  const firstName = document.getElementById('gedit-first-name').value.trim();
  const lastName = document.getElementById('gedit-last-name').value.trim();
  const phone = document.getElementById('gedit-phone').value.trim();
  const email = document.getElementById('gedit-email').value.trim();

  if (!firstName) { toast('Insira o primeiro nome.', 'error'); return; }
  if (!lastName)  { toast('Insira o apelido.', 'error'); return; }
  if (!phone)     { toast('Insira o telefone.', 'error'); return; }
  if (!email)     { toast('Insira o email.', 'error'); return; }

  const btn = document.getElementById('btn-guardar-hospede');
  btn.disabled = true; btn.textContent = '⏳ A guardar...';

  try {
    const body = {
      first_name: firstName,
      last_name: lastName,
      email,
      email_personal: document.getElementById('gedit-email-personal').value.trim() || null,
      phone,
      birth_date: document.getElementById('gedit-birth-date').value || null,
      nif: document.getElementById('gedit-nif').value.trim() || null,
      country: document.getElementById('gedit-country').value || null,
      address: document.getElementById('gedit-address').value.trim() || null,
      postal_code: document.getElementById('gedit-postal-code').value.trim() || null,
      city: document.getElementById('gedit-city').value.trim() || null,
      is_favorite: document.getElementById('gedit-favorito').checked,
      is_vip: document.getElementById('gedit-vip').checked,
      is_unwanted: document.getElementById('gedit-nao-desejado').checked,
    };

    const res = await apiPut(`/api/guests/${editingGuestId}`, body);
    if (res.success) {
      toast('✅ Hóspede guardado!', 'success');
      closeGuestModal();
      await loadHospedes();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${lcIcon('save', 14)} Guardar`;
    if (window.lucide) lucide.createIcons();
  }
}
