// Estado privado; interface partilhada em AppModules.alojamentos.
(() => {
AppModules.define('alojamentos', {
  _servicosTimer: { get: () => _servicosTimer, set: value => { _servicosTimer = value; } },
  alojImagens: { get: () => alojImagens, set: value => { alojImagens = value; } },
  buildImageSections: { get: () => buildImageSections },
  COMMON_AREAS_SECTION: { get: () => COMMON_AREAS_SECTION },
  copyPublicBookingLink: { get: () => copyPublicBookingLink },
  coverDragUrl: { get: () => coverDragUrl, set: value => { coverDragUrl = value; } },
  currentAlojDetail: { get: () => currentAlojDetail, set: value => { currentAlojDetail = value; } },
  dragImgSrc: { get: () => dragImgSrc, set: value => { dragImgSrc = value; } },
  getActiveAlojTab: { get: () => getActiveAlojTab },
  getSelectedAmenitiesFromUi: { get: () => getSelectedAmenitiesFromUi },
  initAlojDrag: { get: () => initAlojDrag },
  openAlojamento: { get: () => openAlojamento },
  openPublicBookingPreview: { get: () => openPublicBookingPreview },
  refreshAmenitiesFilter: { get: () => refreshAmenitiesFilter },
  renderAlojamentos: { get: () => renderAlojamentos },
  renderAmenities: { get: () => renderAmenities },
  showAlojTab: { get: () => showAlojTab },
  updatePublicBookingLink: { get: () => updatePublicBookingLink },
});

const AMENITIES_CATALOG = {
  'Casa de banho': ['Produtos de higiene pessoal','Toalhas','Secador de cabelo','Duche','Banheira','Roupão','Banheira de hidromassagem','Bidé'],
  'Quarto': ['Roupa de cama','Closet','Almofadas','Cabides','Cobertores e almofadas extra','Roupeiro'],
  'Cozinha': ['Utensílios de cozinha','Torradeira','Fogão','Máquina de lavar roupa','Máquina de café','Micro-ondas','Chaleira elétrica','Frigorífico','Máquina de lavar louça','Máquina de secar roupa','Liquidificador','Produtos de limpeza'],
  'Segurança': ['Cofre','Alarme','Kit primeiros socorros','Elevador','Detetores de fumo','Extintor','Videovigilância nas áreas comuns','Alarme de monóxido de carbono'],
  'Outros': ['Aquecimento','Ar condicionado','Wireless','Secretária','TV','Canais por cabo','Ferro e tábua de engomar','Estendal','Estacionamento gratuito','Transfers','Receção 24h','Berço','Varanda','Piscina','Lareira','Wi-Fi gratuito','Terraço','Jardim','Sofá','Área de estar','Área de refeições']
};

const DEFAULT_SECTIONS = [
  { key: 'quarto',    label: 'Fotos do Quarto' },
  { key: 'sala',      label: 'Fotos da Sala de Estar' },
  { key: 'cozinha',   label: 'Fotos da Cozinha' },
  { key: 'casabanho', label: 'Fotos da Casa de Banho' },
  { key: 'outros',    label: 'Outras Fotos' },
];
const COMMON_AREAS_SECTION = { key: 'areas_comuns', label: 'Áreas Comuns' };

let dragSrcId = null;
let dragImgSrc = null; // { section, url } for image drag between sections
let alojImagens = {};
let coverDragUrl = null;
let collapsedAlojParents = new Set();
let currentAlojDetail = null;
// servicosData is declared globally in state.js; keep a local alias reference
let _servicosTimer = null;

function prettifyImageSectionLabel(key) {
  if (!key) return 'Nova Secção';
  if (key === COMMON_AREAS_SECTION.key) return COMMON_AREAS_SECTION.label;
  const fromDefault = DEFAULT_SECTIONS.find(section => section.key === key);
  if (fromDefault) return fromDefault.label;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function buildImageSections(images, explicitSections = [], hasParent = false) {
  const baseSections = Array.isArray(explicitSections) && explicitSections.length
    ? explicitSections.map(section => ({ ...section }))
    : DEFAULT_SECTIONS.map(section => ({ ...section }));

  const knownKeys = new Set(baseSections.map(section => section.key));
  Object.keys(images || {})
    .filter(key => key !== '_sections')
    .forEach(key => {
      if (!knownKeys.has(key)) {
        baseSections.push({ key, label: prettifyImageSectionLabel(key) });
        knownKeys.add(key);
      }
    });

  if (hasParent) {
    return baseSections.filter(section => section.key !== COMMON_AREAS_SECTION.key);
  }

  if (!knownKeys.has(COMMON_AREAS_SECTION.key)) {
    baseSections.unshift({ ...COMMON_AREAS_SECTION });
  }

  return baseSections;
}

function getActiveAlojTab() {
  return ['info', 'comodidades', 'imagens', 'rgpd', 'bloqueios', 'precos'].find(tab =>
    document.getElementById('tab-' + tab)?.classList.contains('active')
  ) || 'info';
}

function getPublicBookingUrl(slug) {
  const cleanSlug = String(slug || '').trim();
  if (!cleanSlug) return '';
  return `${window.location.origin}/reservar/${encodeURIComponent(cleanSlug)}`;
}

function updatePublicBookingLink(accomData = currentAlojDetail) {
  const wrap = document.getElementById('aloj-public-link-wrap');
  const input = document.getElementById('aloj-public-link');
  if (!wrap || !input) return;

  const tipo = document.getElementById('aloj-tipo')?.value || accomData?.type || 'suite';
  const isMainAccommodation = tipo === 'alojamento';
  wrap.style.display = isMainAccommodation ? '' : 'none';

  if (!isMainAccommodation) {
    input.value = '';
    return;
  }

  input.value = getPublicBookingUrl(accomData?.public_slug);
}

function openPublicBookingPreview() {
  const url = document.getElementById('aloj-public-link')?.value;
  if (!url) {
    AppModules.core.toast('Guarda ou reabre o alojamento para gerar o link público.', 'error');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyPublicBookingLink() {
  const url = document.getElementById('aloj-public-link')?.value;
  if (!url) {
    AppModules.core.toast('Ainda não há link público para copiar.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    AppModules.core.toast('Link público copiado!', 'success');
  } catch (_) {
    AppModules.core.toast('Não consegui copiar automaticamente. Podes selecionar o campo e copiar.', 'error');
  }
}

function hasStoredImages(imageState) {
  return Object.entries(imageState || {}).some(([key, value]) =>
    key !== '_sections' && Array.isArray(value) && value.length > 0
  );
}

// ── LISTA DE ALOJAMENTOS ──
function renderAlojamentos() {
  const loading = document.getElementById('aloj-loading');
  const tbody = document.getElementById('aloj-body');
  if (!tbody) return;
  loading.style.display = 'none';
  updateAlojamentoSummary();

  if (AppModules.core.accommodations.length === 0) {
    loading.style.display = 'flex';
    return;
  }

  const filtered = getFilteredAlojamentos();
  const parentMap = {};
  const childrenByParent = {};
  AppModules.core.accommodations.forEach(a => {
    if (a.type === 'alojamento') parentMap[a.id] = a.name;
    if (a.parent_id) {
      if (!childrenByParent[a.parent_id]) childrenByParent[a.parent_id] = [];
      childrenByParent[a.parent_id].push(a);
    }
  });

  const inFiltered = new Set(filtered.map(a => a.id));
  const ordered = [];
  AppModules.core.accommodations.forEach(a => {
    if (a.parent_id) return;
    const includeSelf = inFiltered.has(a.id);
    const visibleChildren = (childrenByParent[a.id] || []).filter(c => inFiltered.has(c.id));
    if (!includeSelf && !visibleChildren.length) return;
    if (includeSelf) ordered.push(a);
    if (visibleChildren.length && !collapsedAlojParents.has(a.id)) ordered.push(...visibleChildren);
  });
  filtered.forEach(a => {
    const already = ordered.some(x => x.id === a.id);
    if (!already) ordered.push(a);
  });

  tbody.innerHTML = ordered.map((a, idx) => {
    const isAlojamento = a.type === 'alojamento';
    const parentName = a.parent_id ? parentMap[a.parent_id] : null;
    const childCount = (childrenByParent[a.id] || []).filter(c => inFiltered.has(c.id)).length;
    const typeLabel = isAlojamento
      ? `<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--marca);">Alojamento</span>`
      : `<span style="font-size:12px;color:var(--cinza);">${AppModules.core.escapeHtml(a.type || '—')}</span>`;
    const hasIcal = !!(a.airbnb_ical_url || a.booking_ical_url);
    const indent = parentName ? 'padding-left:24px;' : '';
    return `
    <tr draggable="true" data-id="${a.id}" data-idx="${idx}" ${AppActions.attrs("click", "alojamentos-open-alojamento-8027257", [String((a.id) ?? '')])} style="${isAlojamento ? 'background:rgba(139,58,36,.03);' : ''}" class="${parentName ? 'aloj-child-row' : 'aloj-parent-row'}">
      <td><span class="drag-handle" data-on-click="alojamentos-stop-propagation-22499e1" title="Arrastar para reordenar">${AppModules.core.lcIcon('grip-vertical', 16)}</span></td>
      <td>
        ${a.cover_image && AppModules.core.safeMediaUrl(a.cover_image)
          ? `<img src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(a.cover_image.startsWith('http') ? a.cover_image : AppModules.core.API_BASE + a.cover_image, 160))}" alt="" loading="lazy" decoding="async" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--cinza-claro);">`
          : `<div style="width:40px;height:40px;border-radius:8px;background:var(--cinza-claro);display:flex;align-items:center;justify-content:center;color:var(--cinza);">${AppModules.core.lcIcon(isAlojamento ? 'building-2' : 'home', 18)}</div>`}
      </td>
      <td style="${indent}">
        <b>${AppModules.core.escapeHtml(a.name)}</b>
        ${isAlojamento && childCount ? `<span class="aloj-child-count">${childCount} alojamento${childCount !== 1 ? 's' : ''}</span>` : ''}
        ${parentName ? `<br><span style="font-size:11px;color:var(--cinza);">${AppModules.core.lcIcon('corner-down-right',11)} ${AppModules.core.escapeHtml(parentName)}</span>` : (a.city ? `<br><span style="font-size:11px;color:var(--cinza)">${AppModules.core.escapeHtml(a.city)}</span>` : '')}
      </td>
      <td>${typeLabel}</td>
      <td style="font-size:12px">${a.max_guests} hósp.</td>
      <td style="font-size:12px">${a.num_rooms || 1}</td>
      <td style="font-size:12px">${a.area ? a.area + ' m²' : '—'}</td>
      <td><b style="color:var(--azul)">€${a.price_per_night}</b></td>
      <td style="font-size:11.5px;color:var(--cinza)">${AppModules.core.escapeHtml(a.license_number || '—')}</td>
      <td data-on-click="alojamentos-stop-propagation-22499e1">
        <button class="btn btn-ghost btn-sm" style="font-size:11px;gap:4px;" ${AppActions.attrs("click", "alojamentos-open-aloj-calendar-direct-309a014", [String((a.id) ?? ''), String((a.google_calendar_id || '') ?? ''), String((a.name) ?? '')])}>
          ${AppModules.core.lcIcon('calendar', 13)} Calendário${a.google_calendar_id ? ' ✓' : ''}${hasIcal ? ' · iCal ✓' : ''}
        </button>
      </td>
    </tr>`;
  }).join('');
  renderAlojamentosMobileCards(ordered, parentMap, childrenByParent, inFiltered);
  if (window.lucide) lucide.createIcons();
}

function renderAlojamentosMobileCards(ordered, parentMap, childrenByParent, inFiltered) {
  const wrap = document.getElementById('aloj-mobile-cards');
  if (!wrap) return;
  wrap.innerHTML = ordered.map(a => {
    const isAlojamento = a.type === 'alojamento';
    const parentName = a.parent_id ? parentMap[a.parent_id] : null;
    const childCount = (childrenByParent[a.id] || []).filter(c => inFiltered.has(c.id)).length;
    const hasIcal = !!(a.airbnb_ical_url || a.booking_ical_url);
    return `<div class="m-accom-card" ${AppActions.attrs("click", "alojamentos-open-alojamento-8027257", [String((a.id) ?? '')])}>
      <div class="mac-top">
        ${a.cover_image
          ? `<img src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(a.cover_image.startsWith('http') ? a.cover_image : AppModules.core.API_BASE + a.cover_image, 160))}" class="mac-thumb" alt="" loading="lazy" decoding="async">`
          : `<div class="mac-thumb mac-thumb-empty">${AppModules.core.lcIcon(isAlojamento ? 'building-2' : 'home', 18)}</div>`}
        <div class="mac-info">
          <div class="mac-name">${AppModules.core.escapeHtml(a.name)}${isAlojamento && childCount ? `<span class="aloj-child-count">${childCount} alojamento${childCount !== 1 ? 's' : ''}</span>` : ''}</div>
          ${parentName ? `<div class="mac-sub">${AppModules.core.lcIcon('corner-down-right', 11)} ${AppModules.core.escapeHtml(parentName)}</div>` : (a.city ? `<div class="mac-sub">${AppModules.core.escapeHtml(a.city)}</div>` : '')}
        </div>
        <span class="mac-price">€${a.price_per_night}</span>
      </div>
      <div class="mac-meta">
        <span>${AppModules.core.lcIcon('users', 13)} ${a.max_guests} hósp.</span>
        <span>${AppModules.core.lcIcon('door-open', 13)} ${a.num_rooms || 1}</span>
        ${a.area ? `<span>${AppModules.core.lcIcon('ruler', 13)} ${a.area} m²</span>` : ''}
        ${a.license_number ? `<span>${AppModules.core.lcIcon('badge-check', 13)} ${AppModules.core.escapeHtml(a.license_number)}</span>` : ''}
      </div>
      <div class="mac-actions" data-on-click="alojamentos-stop-propagation-22499e1">
        <button class="m-card-btn" ${AppActions.attrs("click", "alojamentos-open-aloj-calendar-direct-309a014", [String((a.id) ?? ''), String((a.google_calendar_id || '') ?? ''), String((a.name) ?? '')])}>
          ${AppModules.core.lcIcon('calendar', 13)} Calendário${a.google_calendar_id ? ' ✓' : ''}${hasIcal ? ' · iCal ✓' : ''}
        </button>
      </div>
    </div>`;
  }).join('');
}

function getFilteredAlojamentos() {
  const q = (document.getElementById('aloj-search')?.value || '').trim().toLowerCase();
  const type = document.getElementById('aloj-filter-type')?.value || '';
  const link = document.getElementById('aloj-filter-link')?.value || '';
  AppModules.core.SS.set('aloj:q', document.getElementById('aloj-search')?.value || '');
  AppModules.core.SS.set('aloj:type', type);
  AppModules.core.SS.set('aloj:link', link);

  return AppModules.core.accommodations.filter(a => {
    const parentName = a.parent_id ? (AppModules.core.accommodations.find(p => p.id === a.parent_id)?.name || '') : '';
    const haystack = [
      a.name, a.city, a.license_number, a.type, parentName
    ].filter(Boolean).join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (type && a.type !== type) return false;
    if (link === 'main' && a.type !== 'alojamento') return false;
    if (link === 'linked' && !a.parent_id) return false;
    if (link === 'standalone' && (a.parent_id || a.type === 'alojamento')) return false;
    return true;
  });
}

function updateAlojamentoSummary() {
  const filtered = getFilteredAlojamentos();
  const totalEl = document.getElementById('aloj-count-total');
  const mainEl = document.getElementById('aloj-count-main');
  const linkedEl = document.getElementById('aloj-count-linked');
  if (totalEl) totalEl.textContent = String(filtered.length);
  if (mainEl) mainEl.textContent = String(filtered.filter(a => a.type === 'alojamento').length);
  if (linkedEl) linkedEl.textContent = String(filtered.filter(a => !!a.parent_id).length);
}

function toggleAlojChildren(parentId) {
  if (collapsedAlojParents.has(parentId)) collapsedAlojParents.delete(parentId);
  else collapsedAlojParents.add(parentId);
  renderAlojamentos();
}

function initAlojDrag() {
  const tbody = document.getElementById('aloj-body');
  if (!tbody) return;

  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = row.dataset.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      dragSrcId = null;
      row.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const destId = row.dataset.id;
      if (!dragSrcId || dragSrcId === destId) return;

      const srcIndex = AppModules.core.accommodations.findIndex(a => a.id === dragSrcId);
      const destIndex = AppModules.core.accommodations.findIndex(a => a.id === destId);
      if (srcIndex === -1 || destIndex === -1) {
        dragSrcId = null;
        return;
      }

      const source = AppModules.core.accommodations[srcIndex];
      const target = AppModules.core.accommodations[destIndex];
      const sameParentGroup = (source.parent_id || null) === (target.parent_id || null);
      if (!sameParentGroup) {
        dragSrcId = null;
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
        AppModules.core.toast('Só podes reordenar alojamentos dentro do mesmo grupo.', 'info');
        return;
      }

      const [moved] = AppModules.core.accommodations.splice(srcIndex, 1);
      let insertIndex = AppModules.core.accommodations.findIndex(a => a.id === destId);
      if (insertIndex < 0) {
        AppModules.core.accommodations.push(moved);
      } else {
        AppModules.core.accommodations.splice(insertIndex, 0, moved);
      }

      dragSrcId = null;
      renderAlojamentos();
      initAlojDrag();
    });
  });
}

// ── DETALHE / EDIÇÃO ──
async function openAlojamento(id, preferredTab = 'info') {
  try {
    const previousImageState = alojImagens[id] || {};
    const data = await AppModules.core.apiGet('/api/accommodations/' + id);
    const a = data.data;
    currentAlojDetail = a;
    AppModules.core.SS.set('aloj:id', a.id);

    document.getElementById('aloj-detalhe-nome').textContent = a.name;
    document.getElementById('aloj-editing-id').value = a.id;
    document.getElementById('aloj-nome').value = a.name || '';
    document.getElementById('aloj-licenca').value = (a.license_number || '').replace('/AL', '').trim();
    document.getElementById('aloj-morada').value = a.address || '';
    document.getElementById('aloj-cp').value = a.postal_code || '';
    document.getElementById('aloj-cidade').value = a.city || '';
    document.getElementById('aloj-regiao').value = a.region || 'Continente';
    document.getElementById('aloj-pais').value = a.country || 'Portugal';
    document.getElementById('aloj-tipo').value = a.type || 'suite';

    // Populate parent selector with alojamento-type entries
    const parentSel = document.getElementById('aloj-parent-id');
    if (parentSel) {
      parentSel.innerHTML = '<option value="">— Nenhum —</option>' +
        AppModules.core.accommodations
          .filter(p => p.type === 'alojamento' && p.id !== a.id)
          .map(p => `<option value="${p.id}"${a.parent_id === p.id ? ' selected' : ''}>${p.name}</option>`)
          .join('');
      parentSel.value = a.parent_id || '';
    }
    AppModules.alojamentos.onAlojTipoChange(a);
    updatePublicBookingLink(a);
    AppModules.alojamentos._applyInheritedFields(a);
    document.getElementById('aloj-area').value = a.area || '';
    document.getElementById('aloj-capacidade').value = a.max_guests || 2;
    document.getElementById('aloj-quartos').value = a.num_rooms || 1;
    document.getElementById('aloj-casasbanho').value = a.num_bathrooms || 1;
    document.getElementById('aloj-preco').value = a.price_per_night || '';
    document.getElementById('aloj-min-nights').value = a.min_nights ?? 1;
    document.getElementById('aloj-rgpd-text').value = a.rgpd_text || 'Os seus dados pessoais são recolhidos e tratados para a gestão da sua reserva e cumprimento das obrigações legais aplicáveis ao alojamento local em Portugal. Os dados são conservados pelo período legalmente exigido. Tem direito de acesso, retificação e apagamento dos seus dados por contacto direto com o estabelecimento.';
    document.getElementById('aloj-baby-age-limit').value = a.baby_age_limit ?? 2;
    document.getElementById('aloj-baby-price').value = a.baby_price ?? 0;
    document.getElementById('aloj-child-age-limit').value = a.child_age_limit ?? 12;
    document.getElementById('aloj-child-price').value = a.child_price ?? 0;
    AppModules.alojamentos.setExtraOccupancyFields(a);
    document.getElementById('aloj-gcal-id').value = a.google_calendar_id || '';
    document.getElementById('aloj-gcal-manual').checked = !!a.google_calendar_manual;
    document.getElementById('aloj-airbnb-ical-url').value = a.airbnb_ical_url || '';
    document.getElementById('aloj-booking-ical-url').value = a.booking_ical_url || '';
    document.getElementById('aloj-wifi-nome').value     = a.wifi_name     || '';
    document.getElementById('aloj-wifi-password').value = a.wifi_password || '';
    document.getElementById('aloj-door-code').value     = a.door_code    || '';
    document.getElementById('aloj-checkin-time').value  = a.checkin_time  || '15:00';
    document.getElementById('aloj-checkout-time').value = a.checkout_time || '11:00';
    const fbEl  = document.getElementById('aloj-social-fb');
    const igEl  = document.getElementById('aloj-social-ig');
    const webEl = document.getElementById('aloj-social-web');
    const taEl  = document.getElementById('aloj-social-ta');
    if (fbEl)  fbEl.value  = a.social_facebook    || '';
    if (igEl)  igEl.value  = a.social_instagram   || '';
    if (webEl) webEl.value = a.social_website     || '';
    if (taEl)  taEl.value  = a.social_tripadvisor || '';
    // null (nenhuma preferência guardada) = todos ligados, igual ao
    // comportamento anterior a este campo (mostrar tudo o que está preenchido).
    const enabledLinks = Array.isArray(a.email_social_links) ? a.email_social_links : null;
    const fbEmailEl  = document.getElementById('aloj-social-fb-email');
    const igEmailEl  = document.getElementById('aloj-social-ig-email');
    const webEmailEl = document.getElementById('aloj-social-web-email');
    const taEmailEl  = document.getElementById('aloj-social-ta-email');
    if (fbEmailEl)  fbEmailEl.checked  = !enabledLinks || enabledLinks.includes('facebook');
    if (igEmailEl)  igEmailEl.checked  = !enabledLinks || enabledLinks.includes('instagram');
    if (webEmailEl) webEmailEl.checked = !enabledLinks || enabledLinks.includes('website');
    if (taEmailEl)  taEmailEl.checked  = !enabledLinks || enabledLinks.includes('tripadvisor');
    const colorVal = a.color || '#843424';
    const colorInput = document.getElementById('aloj-color');
    const colorLabel = document.getElementById('aloj-color-label');
    if (colorInput) { colorInput.value = colorVal; colorInput.oninput = () => { if (colorLabel) colorLabel.textContent = colorInput.value; }; }
    if (colorLabel) colorLabel.textContent = colorVal;
    document.getElementById('desc-pt').value = a.description    || '';
    document.getElementById('desc-en').value = a.description_en || '';
    document.getElementById('desc-fr').value = a.description_fr || '';
    document.getElementById('desc-es').value = a.description_es || '';
    document.getElementById('desc-de').value = a.description_de || '';
    document.getElementById('desc-it').value = a.description_it || '';
    document.getElementById('desc-nl').value = a.description_nl || '';
    AppModules.alojamentos.switchDescLang('pt');

    const coverPreview = document.getElementById('aloj-cover-preview');
    const coverPlaceholder = document.getElementById('aloj-cover-placeholder');
    const coverDeleteBtn = document.getElementById('aloj-cover-delete-btn');
    if (coverPreview) {
      if (a.cover_image) {
        const url = a.cover_image.startsWith('http') ? a.cover_image : AppModules.core.API_BASE + a.cover_image;
        coverPreview.src = url + '?t=' + Date.now();
        coverPreview.style.display = 'block';
        if (coverPlaceholder) coverPlaceholder.style.display = 'none';
        if (coverDeleteBtn) coverDeleteBtn.style.display = '';
      } else {
        coverPreview.src = '';
        coverPreview.style.display = 'none';
        if (coverPlaceholder) coverPlaceholder.style.display = 'flex';
        if (coverDeleteBtn) coverDeleteBtn.style.display = 'none';
      }
    }

    const fetchedImageState = { ...(a.own_images || a.images || {}) };
    fetchedImageState._sections = buildImageSections(fetchedImageState, a.image_sections, !!a.parent_id);
    alojImagens[a.id] = fetchedImageState;
    renderAmenities(a.own_amenities || a.amenities || [], a.inherited_amenities || []);
    showAlojTab(preferredTab);
    AppModules.alojamentos.resetAlojMap();

    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.getElementById('view-alojamento-detalhe').classList.add('active');
    document.getElementById('topbar-title').textContent = a.name;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar alojamento.', 'error');
  }
}

function renderAmenities(selectedOwn, inherited = []) {
  const query = (document.getElementById('amenities-search')?.value || '').trim().toLowerCase();
  const container = document.getElementById('amenities-grid');
  const ownSet = new Set(selectedOwn || []);
  const inheritedSet = new Set(inherited || []);
  const knownItems = new Set(Object.values(AMENITIES_CATALOG).flat());
  const blocks = Object.entries(AMENITIES_CATALOG).map(([section, items]) => {
    const matches = items.filter(item => !query || item.toLowerCase().includes(query));
    if (!matches.length) return '';
    return `
      <div class="amenity-section">
        <div class="amenity-section-title">${section}</div>
        <div class="amenity-grid">
          ${matches.map(item => {
            const inheritedItem = inheritedSet.has(item);
            const ownItem = ownSet.has(item);
            const checked = inheritedItem || ownItem;
            return `<label class="amenity-item${checked ? ' checked' : ''}${inheritedItem ? ' amenity-item-inherited' : ''}">
              <input type="checkbox" value="${item}" ${checked ? 'checked' : ''} ${inheritedItem ? 'disabled data-inherited="1"' : ''} data-on-change="alojamentos-toggle-amenity-06dae99">
              <span>${item}</span>
              ${inheritedItem ? `<span class="amenity-badge-inherited">herdado</span>` : ''}
            </label>`;
          }).join('')}
        </div>
      </div>`;
  }).filter(Boolean);

  const customItems = Array.from(new Set([
    ...Array.from(inheritedSet),
    ...Array.from(ownSet)
  ]))
    .filter(item => !knownItems.has(item))
    .filter(item => !query || item.toLowerCase().includes(query));

  if (customItems.length) {
    blocks.push(`
      <div class="amenity-section">
        <div class="amenity-section-title">Outras</div>
        <div class="amenity-grid">
          ${customItems.map(item => {
            const inheritedItem = inheritedSet.has(item);
            const ownItem = ownSet.has(item);
            const checked = inheritedItem || ownItem;
            return `<label class="amenity-item${checked ? ' checked' : ''}${inheritedItem ? ' amenity-item-inherited' : ''}">
              <input type="checkbox" value="${item}" ${checked ? 'checked' : ''} ${inheritedItem ? 'disabled data-inherited="1"' : ''} data-on-change="alojamentos-toggle-amenity-06dae99">
              <span>${item}</span>
              ${inheritedItem ? `<span class="amenity-badge-inherited">herdado</span>` : ''}
            </label>`;
          }).join('')}
        </div>
      </div>
    `);
  }

  container.innerHTML = blocks.join('') || `<div style="padding:18px 20px;color:var(--cinza);font-size:13px;">Nenhuma comodidade encontrada.</div>`;
}

function toggleAmenity(el) {
  el.closest('.amenity-item').classList.toggle('checked', el.checked);
}

function getSelectedAmenitiesFromUi() {
  return Array.from(document.querySelectorAll('#amenities-grid input[type="checkbox"]:checked:not([data-inherited="1"])')).map(el => el.value);
}

function refreshAmenitiesFilter() {
  const inherited = currentAlojDetail?.inherited_amenities || [];
  renderAmenities(getSelectedAmenitiesFromUi(), inherited);
  if (window.lucide) lucide.createIcons();
}

async function showAlojTab(tab) {
  AppModules.core.SS.set('aloj:tab', tab);
  ['info','comodidades','imagens','rgpd','bloqueios','precos'].forEach(t => {
    const el = document.getElementById('aloj-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'precos') {
    const id = document.getElementById('aloj-editing-id')?.value;
    // O editor de preços é a vista Preços Dinâmicos embebida aqui: só chega
    // quando este separador é aberto.
    if (id && await AppModules.core.ensureFeature('precos')) AppModules.precos.mountPrecosWidgetInAloj(id);
  } else if (typeof AppModules.precos.unmountPrecosWidget === 'function') {
    AppModules.precos.unmountPrecosWidget();
  }
  if (tab === 'bloqueios') {
    const id = document.getElementById('aloj-editing-id')?.value;
    if (id) { await AppModules.bloqueios.ensureBlocksLoaded(); AppModules.bloqueios.renderAccommodationBlocks(id); }
  }
  if (tab === 'imagens') {
    // Re-fetch to guarantee fresh images and up-to-date common_area_images from parent
    const id = document.getElementById('aloj-editing-id').value;
    if (id) {
      try {
        const data = await AppModules.core.apiGet('/api/accommodations/' + id);
        const a = data.data;
        currentAlojDetail = a;
        const imgs = { ...(a.own_images || a.images || {}) };
        imgs._sections = buildImageSections(imgs, a.image_sections, !!a.parent_id);
        alojImagens[id] = imgs;
      } catch (_) { /* render with cached data if fetch fails */ }
    }
    AppModules.alojamentos.renderImagens();
  }
}


AppActions.register({
  "alojamentos-toggle-amenity-06dae99": (el, event, args) => { toggleAmenity(el) },
}, "change");

AppActions.register({
  "alojamentos-open-alojamento-8027257": (el, event, args) => { openAlojamento(args[0]) },
  "alojamentos-stop-propagation-22499e1": (el, event, args) => { event.stopPropagation() },
  "alojamentos-open-aloj-calendar-direct-309a014": (el, event, args) => { AppModules.alojamentos.openAlojCalendarDirect(args[0],args[1],args[2]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('alojamentos.js', () => {
  dragSrcId = null;
  dragImgSrc = null;
  alojImagens = {};
  coverDragUrl = null;
  collapsedAlojParents = new Set();
  currentAlojDetail = null;
  clearTimeout(_servicosTimer); clearInterval(_servicosTimer); _servicosTimer = null;
});

})();
