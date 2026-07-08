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
    toast('Guarda ou reabre o alojamento para gerar o link público.', 'error');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyPublicBookingLink() {
  const url = document.getElementById('aloj-public-link')?.value;
  if (!url) {
    toast('Ainda não há link público para copiar.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link público copiado!', 'success');
  } catch (_) {
    toast('Não consegui copiar automaticamente. Podes selecionar o campo e copiar.', 'error');
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

  if (accommodations.length === 0) {
    loading.style.display = 'flex';
    return;
  }

  const filtered = getFilteredAlojamentos();
  const parentMap = {};
  const childrenByParent = {};
  accommodations.forEach(a => {
    if (a.type === 'alojamento') parentMap[a.id] = a.name;
    if (a.parent_id) {
      if (!childrenByParent[a.parent_id]) childrenByParent[a.parent_id] = [];
      childrenByParent[a.parent_id].push(a);
    }
  });

  const inFiltered = new Set(filtered.map(a => a.id));
  const ordered = [];
  accommodations.forEach(a => {
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
      : `<span style="font-size:12px;color:var(--cinza);">${escapeHtml(a.type || '—')}</span>`;
    const hasIcal = !!(a.airbnb_ical_url || a.booking_ical_url);
    const indent = parentName ? 'padding-left:24px;' : '';
    return `
    <tr draggable="true" data-id="${a.id}" data-idx="${idx}" onclick="openAlojamento('${a.id}')" style="${isAlojamento ? 'background:rgba(139,58,36,.03);' : ''}" class="${parentName ? 'aloj-child-row' : 'aloj-parent-row'}">
      <td><span class="drag-handle" onclick="event.stopPropagation()" title="Arrastar para reordenar">${lcIcon('grip-vertical', 16)}</span></td>
      <td>
        ${a.cover_image
          ? `<img src="${a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--cinza-claro);">`
          : `<div style="width:40px;height:40px;border-radius:8px;background:var(--cinza-claro);display:flex;align-items:center;justify-content:center;color:var(--cinza);">${lcIcon(isAlojamento ? 'building-2' : 'home', 18)}</div>`}
      </td>
      <td style="${indent}">
        <b>${a.name}</b>
        ${isAlojamento && childCount ? `<span class="aloj-child-count">${childCount} alojamento${childCount !== 1 ? 's' : ''}</span>` : ''}
        ${parentName ? `<br><span style="font-size:11px;color:var(--cinza);">${lcIcon('corner-down-right',11)} ${parentName}</span>` : (a.city ? `<br><span style="font-size:11px;color:var(--cinza)">${a.city}</span>` : '')}
      </td>
      <td>${typeLabel}</td>
      <td style="font-size:12px">${a.max_guests} hósp.</td>
      <td style="font-size:12px">${a.num_rooms || 1}</td>
      <td style="font-size:12px">${a.area ? a.area + ' m²' : '—'}</td>
      <td><b style="color:var(--azul)">€${a.price_per_night}</b></td>
      <td style="font-size:11.5px;color:var(--cinza)">${a.license_number || '—'}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" style="font-size:11px;gap:4px;" onclick="openAlojCalendarDirect('${a.id}','${a.google_calendar_id || ''}','${a.name}')">
          ${lcIcon('calendar', 13)} Calendário${a.google_calendar_id ? ' ✓' : ''}${hasIcal ? ' · iCal ✓' : ''}
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
    return `<div class="m-accom-card" onclick="openAlojamento('${a.id}')">
      <div class="mac-top">
        ${a.cover_image
          ? `<img src="${a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image}" class="mac-thumb">`
          : `<div class="mac-thumb mac-thumb-empty">${lcIcon(isAlojamento ? 'building-2' : 'home', 18)}</div>`}
        <div class="mac-info">
          <div class="mac-name">${escapeHtml(a.name)}${isAlojamento && childCount ? `<span class="aloj-child-count">${childCount} alojamento${childCount !== 1 ? 's' : ''}</span>` : ''}</div>
          ${parentName ? `<div class="mac-sub">${lcIcon('corner-down-right', 11)} ${escapeHtml(parentName)}</div>` : (a.city ? `<div class="mac-sub">${escapeHtml(a.city)}</div>` : '')}
        </div>
        <span class="mac-price">€${a.price_per_night}</span>
      </div>
      <div class="mac-meta">
        <span>${lcIcon('users', 13)} ${a.max_guests} hósp.</span>
        <span>${lcIcon('door-open', 13)} ${a.num_rooms || 1}</span>
        ${a.area ? `<span>${lcIcon('ruler', 13)} ${a.area} m²</span>` : ''}
        ${a.license_number ? `<span>${lcIcon('badge-check', 13)} ${escapeHtml(a.license_number)}</span>` : ''}
      </div>
      <div class="mac-actions" onclick="event.stopPropagation()">
        <button class="m-card-btn" onclick="openAlojCalendarDirect('${a.id}','${a.google_calendar_id || ''}','${escapeHtml(a.name)}')">
          ${lcIcon('calendar', 13)} Calendário${a.google_calendar_id ? ' ✓' : ''}${hasIcal ? ' · iCal ✓' : ''}
        </button>
      </div>
    </div>`;
  }).join('');
}

function getFilteredAlojamentos() {
  const q = (document.getElementById('aloj-search')?.value || '').trim().toLowerCase();
  const type = document.getElementById('aloj-filter-type')?.value || '';
  const link = document.getElementById('aloj-filter-link')?.value || '';
  SS.set('aloj:q', document.getElementById('aloj-search')?.value || '');
  SS.set('aloj:type', type);
  SS.set('aloj:link', link);

  return accommodations.filter(a => {
    const parentName = a.parent_id ? (accommodations.find(p => p.id === a.parent_id)?.name || '') : '';
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

      const srcIndex = accommodations.findIndex(a => a.id === dragSrcId);
      const destIndex = accommodations.findIndex(a => a.id === destId);
      if (srcIndex === -1 || destIndex === -1) {
        dragSrcId = null;
        return;
      }

      const source = accommodations[srcIndex];
      const target = accommodations[destIndex];
      const sameParentGroup = (source.parent_id || null) === (target.parent_id || null);
      if (!sameParentGroup) {
        dragSrcId = null;
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
        toast('Só podes reordenar alojamentos dentro do mesmo grupo.', 'info');
        return;
      }

      const [moved] = accommodations.splice(srcIndex, 1);
      let insertIndex = accommodations.findIndex(a => a.id === destId);
      if (insertIndex < 0) {
        accommodations.push(moved);
      } else {
        accommodations.splice(insertIndex, 0, moved);
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
    const data = await apiGet('/api/accommodations/' + id);
    const a = data.data;
    currentAlojDetail = a;
    SS.set('aloj:id', a.id);

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
        accommodations
          .filter(p => p.type === 'alojamento' && p.id !== a.id)
          .map(p => `<option value="${p.id}"${a.parent_id === p.id ? ' selected' : ''}>${p.name}</option>`)
          .join('');
      parentSel.value = a.parent_id || '';
    }
    onAlojTipoChange(a);
    updatePublicBookingLink(a);
    _applyInheritedFields(a);
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
    setExtraOccupancyFields(a);
    document.getElementById('aloj-gcal-id').value = a.google_calendar_id || '';
    document.getElementById('aloj-airbnb-ical-url').value = a.airbnb_ical_url || '';
    document.getElementById('aloj-booking-ical-url').value = a.booking_ical_url || '';
    document.getElementById('aloj-wifi-nome').value     = a.wifi_name     || '';
    document.getElementById('aloj-wifi-password').value = a.wifi_password || '';
    document.getElementById('aloj-checkin-time').value  = a.checkin_time  || '15:00';
    document.getElementById('aloj-checkout-time').value = a.checkout_time || '11:00';
    const fbEl  = document.getElementById('aloj-social-fb');
    const igEl  = document.getElementById('aloj-social-ig');
    const webEl = document.getElementById('aloj-social-web');
    if (fbEl)  fbEl.value  = a.social_facebook  || '';
    if (igEl)  igEl.value  = a.social_instagram || '';
    if (webEl) webEl.value = a.social_website   || '';
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
    switchDescLang('pt');

    const coverPreview = document.getElementById('aloj-cover-preview');
    const coverPlaceholder = document.getElementById('aloj-cover-placeholder');
    const coverDeleteBtn = document.getElementById('aloj-cover-delete-btn');
    if (coverPreview) {
      if (a.cover_image) {
        const url = a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image;
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
    resetAlojMap();

    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.getElementById('view-alojamento-detalhe').classList.add('active');
    document.getElementById('topbar-title').textContent = a.name;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    toast('❌ Erro ao carregar alojamento.', 'error');
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
              <input type="checkbox" value="${item}" ${checked ? 'checked' : ''} ${inheritedItem ? 'disabled data-inherited="1"' : ''} onchange="toggleAmenity(this)">
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
              <input type="checkbox" value="${item}" ${checked ? 'checked' : ''} ${inheritedItem ? 'disabled data-inherited="1"' : ''} onchange="toggleAmenity(this)">
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
  SS.set('aloj:tab', tab);
  ['info','comodidades','imagens','rgpd','bloqueios','precos'].forEach(t => {
    const el = document.getElementById('aloj-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'precos') {
    const id = document.getElementById('aloj-editing-id')?.value;
    if (id && typeof mountPrecosWidgetInAloj === 'function') mountPrecosWidgetInAloj(id);
  } else if (typeof unmountPrecosWidget === 'function') {
    unmountPrecosWidget();
  }
  if (tab === 'bloqueios') {
    const id = document.getElementById('aloj-editing-id')?.value;
    if (id && typeof renderAccommodationBlocks === 'function') renderAccommodationBlocks(id);
  }
  if (tab === 'imagens') {
    // Re-fetch to guarantee fresh images and up-to-date common_area_images from parent
    const id = document.getElementById('aloj-editing-id').value;
    if (id) {
      try {
        const data = await apiGet('/api/accommodations/' + id);
        const a = data.data;
        currentAlojDetail = a;
        const imgs = { ...(a.own_images || a.images || {}) };
        imgs._sections = buildImageSections(imgs, a.image_sections, !!a.parent_id);
        alojImagens[id] = imgs;
      } catch (_) { /* render with cached data if fetch fails */ }
    }
    renderImagens();
  }
}

// ── IMAGENS ──
function getImgSections(id) {
  const imgs = alojImagens[id] || {};
  const hasParent = !!currentAlojDetail?.parent_id;
  return buildImageSections(imgs, imgs._sections, hasParent);
}

function renderImagens() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = alojImagens[id] || {};
  const sections = getImgSections(id);
  const container = document.getElementById('img-sections');
  const hasParent = !!currentAlojDetail?.parent_id;
  const commonAreaImages = currentAlojDetail?.common_area_images?.length
    ? currentAlojDetail.common_area_images
    : currentAlojDetail?._parent?.images?.[COMMON_AREAS_SECTION.key] || [];

  const inheritedCommonAreas = hasParent ? `
    <div class="img-section img-section-inherited">
      <div class="img-section-header">
        <div>
          <div class="img-section-title-static">${COMMON_AREAS_SECTION.label}</div>
          <div class="img-section-subtitle">Herdado de ${currentAlojDetail?._parent_name || 'alojamento principal'} · só leitura</div>
        </div>
      </div>
      <div class="img-row img-row-inherited">
        ${commonAreaImages.length
          ? commonAreaImages.map(url => `
            <div class="img-thumb-wrap">
              <img class="img-thumb" src="${API_BASE}${url}" alt="" onclick="openImageLightbox('${API_BASE}${url}')">
            </div>`).join('')
          : `<div class="img-inherited-empty">Sem fotos de áreas comuns no alojamento principal.</div>`}
      </div>
    </div>
  ` : '';

  container.innerHTML = inheritedCommonAreas + sections.map((sec, idx) => {
    const key = sec.key;
    const label = sec.label;
    const urls = imgs[key] || [];
    const isCommonAreas = key === COMMON_AREAS_SECTION.key;

    const thumbs = urls.map(url => `
      <div class="img-thumb-wrap" draggable="true"
           data-section="${key}" data-url="${url}"
           ondragstart="imgDragStart(event,'${key}','${url}')"
           ondragend="imgDragEnd(event)">
        <img class="img-thumb" src="${API_BASE}${url}" alt="" onclick="openImageLightbox('${API_BASE}${url}')">
        <button class="img-remove" onclick="removeImg('${key}','${url}')">✕</button>
      </div>`).join('');

    return `
      <div class="img-section" data-section-idx="${idx}">
        <div class="img-section-header">
          ${isCommonAreas
            ? `<div>
                <div class="img-section-title-static">${label}</div>
                <div class="img-section-subtitle">Visível em todas as suites associadas</div>
              </div>`
            : `<input class="img-section-label-input" value="${label}"
                 onchange="renameImgSection(${idx}, this.value)"
                 title="Clique para renomear" autocomplete="off">`}
          <div class="img-section-actions">
            <button class="img-section-btn add" onclick="triggerImgUpload('${key}')" title="Adicionar fotos">
              ${lcIcon('image-plus', 14)}
            </button>
            ${isCommonAreas ? '' : `<button class="img-section-btn" onclick="removeImgSection(${idx})" title="Remover divisão">
              ${lcIcon('trash-2', 13)}
            </button>`}
          </div>
        </div>
        <div class="img-row" id="imgs-${key}"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="imgDropInSection(event,'${key}')">
          ${thumbs}
          <div class="img-empty" style="cursor:pointer;" onclick="triggerImgUpload('${key}')">＋</div>
        </div>
      </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ── IMAGE DRAG BETWEEN SECTIONS ──
function imgDragStart(e, section, url) {
  dragImgSrc = { section, url };
  coverDragUrl = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({ section, url }));
  e.currentTarget.style.opacity = '0.5';
}

function imgDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('.img-row').forEach(r => r.classList.remove('drag-over'));
  document.getElementById('aloj-cover-dropzone')?.classList.remove('drag-over');
}

async function imgDropInSection(e, targetSection) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const id = document.getElementById('aloj-editing-id').value;
  const imgs = alojImagens[id] || {};

  if (coverDragUrl) {
    if (!imgs[targetSection]) imgs[targetSection] = [];
    if (!imgs[targetSection].includes(coverDragUrl)) imgs[targetSection].push(coverDragUrl);
    alojImagens[id] = imgs;
    coverDragUrl = null;
    renderImagens();
    await saveImgSections(id, imgs);
    return;
  }

  if (!dragImgSrc || dragImgSrc.section === targetSection) {
    dragImgSrc = null;
    return;
  }

  const { section: srcSection, url } = dragImgSrc;
  dragImgSrc = null;

  if (!imgs[srcSection]) return;
  imgs[srcSection] = imgs[srcSection].filter(u => u !== url);
  if (!imgs[targetSection]) imgs[targetSection] = [];
  imgs[targetSection].push(url);

  alojImagens[id] = imgs;
  renderImagens();

  try {
    await fetch(`${API_BASE}/api/accommodations/${id}/images`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imgs })
    });
  } catch (err) {
    toast('❌ Erro ao mover imagem.', 'error');
  }
}

// ── SECTION MANAGEMENT ──
function renameImgSection(idx, newLabel) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = alojImagens[id] || {};
  const sectionsBase = getImgSections(id);
  if (sectionsBase[idx]?.key === COMMON_AREAS_SECTION.key) return;
  const sections = sectionsBase.map((s, i) =>
    i === idx ? { ...s, label: newLabel } : s
  );
  imgs._sections = sections;
  alojImagens[id] = imgs;
  saveImgSections(id, imgs);
}

async function removeImgSection(idx) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = alojImagens[id] || {};
  const sections = getImgSections(id);
  const sec = sections[idx];
  if (!sec) return;
  if (sec.key === COMMON_AREAS_SECTION.key) return;

  const imgCount = (imgs[sec.key] || []).length;
  if (imgCount > 0 && !confirm(`A divisão "${sec.label}" tem ${imgCount} foto(s). Remover mesmo assim? As fotos serão eliminadas.`)) return;

  const prevImgs = JSON.parse(JSON.stringify(imgs));
  const newSections = sections.filter((_, i) => i !== idx);
  if (imgs[sec.key]) delete imgs[sec.key];
  imgs._sections = newSections;
  alojImagens[id] = imgs;
  renderImagens();
  try {
    await saveImgSections(id, imgs);
  } catch {
    alojImagens[id] = prevImgs;
    renderImagens();
  }
}

async function addImgSection() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const nameEl = document.getElementById('new-section-name');
  const name = (nameEl.value || '').trim();
  if (!name) { toast('Escreve o nome da divisão.', 'error'); return; }

  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now().toString().slice(-4);

  const imgs = alojImagens[id] || {};
  const prevImgs = JSON.parse(JSON.stringify(imgs));
  const sections = getImgSections(id);
  sections.push({ key, label: name });
  imgs._sections = sections;
  imgs[key] = [];
  alojImagens[id] = imgs;
  nameEl.value = '';
  renderImagens();
  try {
    await saveImgSections(id, imgs);
  } catch {
    alojImagens[id] = prevImgs;
    nameEl.value = name;
    renderImagens();
  }
}

async function saveImgSections(id, imgs) {
  try {
    await fetch(`${API_BASE}/api/accommodations/${id}/images`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imgs })
    });
  } catch (err) {
    toast('❌ Erro ao guardar secções.', 'error');
    throw err;
  }
}

function triggerImgUpload(section) {
  const inp = document.getElementById('img-input');
  inp.dataset.section = section;
  inp.click();
}

function handleImgSelect(e) {
  const section = e.target.dataset.section || 'outros';
  Array.from(e.target.files).forEach(f => processImgFile(f, section));
  e.target.value = '';
}

function handleImgDrop(e) {
  e.preventDefault();
  document.getElementById('img-dropzone').style.background = '';
  Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => processImgFile(f, 'outros'));
}

async function processImgFile(file, section) {
  const id = document.getElementById('aloj-editing-id').value;
  const imgs = alojImagens[id] || {};
  const sections = getImgSections(id);

  // If section key doesn't exist in current sections, use first available section key
  const validKey = sections.find(s => s.key === section) ? section : (sections[sections.length - 1]?.key || 'outros');

  section = validKey;
  if (file.size > 5 * 1024 * 1024) { toast('Imagem demasiado grande (máx. 5MB)', 'error'); return; }
  if (!id) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const res = await apiPost(`/api/accommodations/${id}/images`, { section, image: e.target.result });
      if (res.success) {
        if (!alojImagens[id]) alojImagens[id] = {};
        const prevSections = alojImagens[id]?._sections;
        alojImagens[id] = { ...res.images };
        alojImagens[id]._sections = prevSections
          || alojImagens[id]._sections
          || buildImageSections(alojImagens[id], null, !!currentAlojDetail?.parent_id);
        renderImagens();
        toast('✅ Imagem guardada!', 'success');
      } else {
        toast('❌ Erro ao guardar imagem.', 'error');
      }
    } catch (err) {
      toast('❌ Erro ao guardar imagem.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function removeImg(sec, url) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/api/accommodations/${id}/images`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: sec, url })
    });
    const data = await res.json();
    if (data.success) {
      const prevSections = alojImagens[id]?._sections;
      alojImagens[id] = { ...data.images };
      alojImagens[id]._sections = prevSections
        || alojImagens[id]._sections
        || buildImageSections(alojImagens[id], null, !!currentAlojDetail?.parent_id);
      renderImagens();
    }
  } catch (e) {
    toast('❌ Erro ao remover imagem.', 'error');
  }
}

async function uploadCoverImage(file) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  if (file.size > 5 * 1024 * 1024) { toast('Imagem demasiado grande (máx. 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const res = await apiPost(`/api/accommodations/${id}/cover`, { image: e.target.result });
      if (res.success) {
        const url = res.url.startsWith('http') ? res.url : API_BASE + res.url;
        const preview = document.getElementById('aloj-cover-preview');
        const placeholder = document.getElementById('aloj-cover-placeholder');
        const deleteBtn = document.getElementById('aloj-cover-delete-btn');
        preview.src = url + '?t=' + Date.now();
        preview.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = '';
        const acc = accommodations.find(a => a.id === id);
        if (acc) acc.cover_image = res.url;
        toast('✅ Foto de capa guardada!', 'success');
      }
    } catch (e) {
      toast('❌ Erro ao guardar capa.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function handleCoverZoneClick(event) {
  const preview = document.getElementById('aloj-cover-preview');
  if (preview && preview.style.display !== 'none' && preview.src) {
    openImageLightbox(preview.src.split('?')[0]);
    return;
  }
  document.getElementById('cover-input')?.click();
}

async function removeCoverImage() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/api/accommodations/${id}/cover`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.success) throw new Error();
    const preview = document.getElementById('aloj-cover-preview');
    const placeholder = document.getElementById('aloj-cover-placeholder');
    const deleteBtn = document.getElementById('aloj-cover-delete-btn');
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (deleteBtn) deleteBtn.style.display = 'none';
    const acc = accommodations.find(a => a.id === id);
    if (acc) acc.cover_image = null;
    toast('🗑 Foto de capa removida.', 'info');
  } catch (e) {
    toast('❌ Erro ao remover capa.', 'error');
  }
}

function coverDragStart(event) {
  const preview = document.getElementById('aloj-cover-preview');
  const src = preview?.src ? preview.src.split('?')[0] : '';
  if (!src) return;
  coverDragUrl = src.replace(API_BASE, '');
  dragImgSrc = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ section: '__cover__', url: coverDragUrl }));
  event.currentTarget.style.opacity = '0.55';
}

function coverDragEnd(event) {
  coverDragUrl = null;
  event.currentTarget.style.opacity = '';
  document.getElementById('aloj-cover-dropzone')?.classList.remove('drag-over');
  document.querySelectorAll('.img-row').forEach(r => r.classList.remove('drag-over'));
}

async function handleCoverDrop(event) {
  event.preventDefault();
  const zone = document.getElementById('aloj-cover-dropzone');
  zone?.classList.remove('drag-over');
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;

  if (event.dataTransfer?.files?.length) {
    const file = Array.from(event.dataTransfer.files).find(f => f.type.startsWith('image/'));
    if (file) {
      await uploadCoverImage(file);
    }
    return;
  }

  const url = dragImgSrc?.url || coverDragUrl;
  if (!url) return;
  if (dragImgSrc?.section === '__cover__') return;

  try {
    const res = await apiPost(`/api/accommodations/${id}/cover`, { url });
    if (!res.success) throw new Error();
    const preview = document.getElementById('aloj-cover-preview');
    const placeholder = document.getElementById('aloj-cover-placeholder');
    const deleteBtn = document.getElementById('aloj-cover-delete-btn');
    if (preview) {
      preview.src = `${API_BASE}${url}?t=${Date.now()}`;
      preview.style.display = 'block';
      preview.setAttribute('draggable', 'true');
    }
    if (placeholder) placeholder.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = '';
    const acc = accommodations.find(a => a.id === id);
    if (acc) acc.cover_image = url;
    toast('✅ Capa atualizada.', 'success');
  } catch (e) {
    toast('❌ Erro ao atualizar capa.', 'error');
  } finally {
    dragImgSrc = null;
    coverDragUrl = null;
  }
}

function openImageLightbox(url) {
  const bg = document.getElementById('image-lightbox-bg');
  const img = document.getElementById('image-lightbox-img');
  if (!bg || !img || !url) return;
  img.src = url;
  bg.classList.add('open');
  if (window.lucide) lucide.createIcons();
}

function closeImageLightbox() {
  const bg = document.getElementById('image-lightbox-bg');
  const img = document.getElementById('image-lightbox-img');
  if (bg) bg.classList.remove('open');
  if (img) img.src = '';
}

// ── SERVIÇOS E TAXAS ──
async function loadServicos() {
  try {
    const res = await apiGet('/api/accommodations/settings');
    servicosData = res.data || servicosData;
    renderServicos();
  } catch (e) {
    renderServicos();
  }
}

function autoSaveServicos() {
  clearTimeout(_servicosTimer);
  _servicosTimer = setTimeout(async () => {
    try {
      const res = await apiPost('/api/accommodations/settings', { services: servicosData });
      if (res.success) toast('💾 Serviços guardados', 'success');
    } catch (e) { /* silencioso */ }
  }, 800);
}

function renderServicos() {
  const tbody = document.getElementById('servicos-body');
  if (!tbody) return;
  const BUILTIN = ['breakfast', 'tourist_tax'];
  tbody.innerHTML = servicosData.map((s, i) => {
    const isBuiltin = BUILTIN.includes(s.id);
    return `
    <tr>
      <td>
        ${isBuiltin
          ? `<span style="font-size:13px;color:var(--cinza);">${s.type === 'service' ? 'Serviço' : 'Taxa'}</span>`
          : `<select class="form-control" style="font-size:12px;padding:5px 8px;" onchange="servicosData[${i}].type=this.value;autoSaveServicos()">
               <option value="service" ${s.type === 'service' ? 'selected' : ''}>Serviço</option>
               <option value="tax"     ${s.type === 'tax'     ? 'selected' : ''}>Taxa</option>
             </select>`}
      </td>
      <td>
        ${isBuiltin
          ? `<span style="font-size:13px;color:var(--cinza);">${s.name}</span>`
          : `<input class="form-control" style="font-size:13px;padding:6px 10px;" value="${s.name}" onchange="servicosData[${i}].name=this.value;autoSaveServicos()" autocomplete="off">`}
      </td>
      <td><input class="form-control" type="number" step="0.01" style="font-size:13px;padding:6px 10px;-moz-appearance:textfield;width:90px;" value="${s.value}" onchange="servicosData[${i}].value=parseFloat(this.value)||0;autoSaveServicos()" autocomplete="off"></td>
      <td><span style="font-size:13px;color:var(--cinza);">€/hóspede/noite</span></td>
      <td><label class="toggle-switch"><input type="checkbox" ${s.active !== false ? 'checked' : ''} onchange="servicosData[${i}].active=this.checked;autoSaveServicos()"><span class="toggle-slider"></span></label></td>
      <td>
        ${isBuiltin ? '<span style="width:32px;display:inline-block;"></span>' : `
        <button onclick="removeServico(${i})" style="background:none;border:none;cursor:pointer;color:var(--vermelho);display:flex;align-items:center;" title="Remover">
          ${lcIcon('trash-2', 15)}
        </button>`}
      </td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function addServico() {
  servicosData.push({ id: 'sv-' + Date.now(), name: 'Novo serviço', type: 'service', value: 0, unit: '€/hóspede/noite', active: true });
  renderServicos();
  autoSaveServicos();
}

function removeServico(i) {
  servicosData.splice(i, 1);
  renderServicos();
  autoSaveServicos();
}

async function saveServicos() {
  try {
    const res = await apiPost('/api/accommodations/settings', { services: servicosData });
    if (res.success) {
      toast('✅ Serviços e taxas guardados!', 'success');
    } else {
      toast('❌ Erro ao guardar.', 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação.', 'error');
  }
}

// ── HERANÇA DE CAMPOS DO ALOJAMENTO PRINCIPAL ──
const INHERITED_FIELDS_MAP = {
  'aloj-morada':        'address',
  'aloj-cp':            'postal_code',
  'aloj-cidade':        'city',
  'aloj-regiao':        'region',
  'aloj-pais':          'country',
  'aloj-wifi-nome':     'wifi_name',
  'aloj-wifi-password': 'wifi_password',
  'aloj-checkin-time':  'checkin_time',
  'aloj-checkout-time': 'checkout_time',
  'aloj-social-fb':     'social_facebook',
  'aloj-social-ig':     'social_instagram',
  'aloj-social-web':    'social_website',
};

function onAlojTipoChange(accomData) {
  const tipo = document.getElementById('aloj-tipo')?.value;
  const parentWrap = document.getElementById('aloj-parent-wrap');
  // Alojamento type never has a parent; other types can optionally have one
  if (parentWrap) parentWrap.style.display = (tipo && tipo !== 'alojamento') ? '' : 'none';
  updatePublicBookingLink(accomData || currentAlojDetail);
  if (tipo === 'alojamento') {
    const parentSel = document.getElementById('aloj-parent-id');
    if (parentSel) parentSel.value = '';
    _applyInheritedFields(accomData || null);
  }
}

function onAlojParentChange() {
  const parentId = document.getElementById('aloj-parent-id')?.value;
  if (!parentId) {
    currentAlojDetail = { ...(currentAlojDetail || {}), parent_id: null, _parent: null, _parent_name: null, inherited_amenities: [], common_area_images: [] };
    _applyInheritedFields(null);
    renderAmenities(getSelectedAmenitiesFromUi(), []);
    if (document.getElementById('tab-imagens')?.classList.contains('active')) renderImagens();
    return;
  }
  const parent = accommodations.find(p => p.id === parentId);
  currentAlojDetail = {
    ...(currentAlojDetail || {}),
    parent_id: parentId,
    _parent: parent || null,
    _parent_name: parent?.name || null,
    inherited_amenities: parent?.effective_amenities || [],
    common_area_images: parent?.images?.[COMMON_AREAS_SECTION.key] || []
  };
  _applyInheritedFields({ parent_id: parentId, _parent: parent });
  // Fill in inherited values from parent immediately
  if (parent) {
    Object.entries(INHERITED_FIELDS_MAP).forEach(([elId, field]) => {
      const el = document.getElementById(elId);
      if (el) el.value = parent[field] || '';
    });
    renderAmenities(getSelectedAmenitiesFromUi(), parent.effective_amenities || []);
    if (document.getElementById('tab-imagens')?.classList.contains('active')) renderImagens();
  }
}

function _applyInheritedFields(accomData) {
  const hasParent = !!(accomData?.parent_id);
  const parent = accomData?._parent || (accomData?.parent_id ? accommodations.find(p => p.id === accomData.parent_id) : null);
  const banner = document.getElementById('aloj-inherited-banner');
  const msg = document.getElementById('aloj-inherited-msg');

  if (hasParent && parent) {
    if (banner) banner.style.display = '';
    if (msg) msg.innerHTML = `${lcIcon('link',13)} Os campos marcados são herdados de <b>${parent.name}</b> e só podem ser editados a partir desse alojamento.`;
  } else {
    if (banner) banner.style.display = 'none';
  }

  Object.keys(INHERITED_FIELDS_MAP).forEach(elId => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.disabled = hasParent;
    el.style.opacity = hasParent ? '.55' : '';
    el.style.cursor = hasParent ? 'not-allowed' : '';
    // Ensure label shows inherited badge
    const label = el.closest('.form-group')?.querySelector('.form-label');
    const badgeId = elId + '-inherited-badge';
    const existing = document.getElementById(badgeId);
    if (hasParent && !existing && label) {
      const badge = document.createElement('span');
      badge.id = badgeId;
      badge.style.cssText = 'margin-left:6px;font-size:10px;color:var(--dourado);font-weight:600;text-transform:uppercase;letter-spacing:.3px;';
      badge.textContent = '↑ herdado';
      label.appendChild(badge);
    } else if (!hasParent && existing) {
      existing.remove();
    }
    // For password field, also affect the wrapper
    if (elId === 'aloj-wifi-password') {
      const btn = el.closest('.password-field')?.querySelector('.password-eye');
      if (btn) btn.disabled = hasParent;
    }
  });
}

// ── ADICIONAR ALOJAMENTO ──
async function addAlojamento() {
  const nome = prompt('Nome do novo alojamento:');
  if (!nome || !nome.trim()) return;
  try {
    const res = await apiPost('/api/accommodations', { name: nome.trim() });
    if (res.success) {
      toast('✅ Alojamento criado! Clique para configurar.', 'success');
      await loadAccommodations();
      renderAlojamentos();
      initAlojDrag();
    } else {
      toast('❌ ' + (res.error || 'Erro ao criar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── EXPORTAR ALOJAMENTOS ──
async function importAlojamentosXLS(input) {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  showOperationProgress('A importar alojamentos', 'A ler ficheiro...', 8);

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      updateOperationProgress(20, 'A interpretar Excel...');
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); hideOperationProgress(); return; }

      const pick = (row, ...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]); return ''; };

      let created = 0, skipped = 0;
      for (const [idx, row] of rows.entries()) {
        const nome = pick(row, 'Nome', 'name', 'Name');
        if (!nome) { skipped++; continue; }
        try {
          await apiPost('/api/accommodations', {
            name:          nome,
            type:          pick(row, 'Tipo', 'type') || 'suite',
            price_per_night: parseFloat(pick(row, 'Preço/noite', 'price_per_night')) || 100,
            max_guests:    parseInt(pick(row, 'Capacidade', 'max_guests')) || 2,
            license_number:pick(row, 'Licença', 'license_number') || '00000/AL',
            address:       pick(row, 'Morada', 'address'),
            city:          pick(row, 'Cidade', 'city'),
            region:        pick(row, 'Região', 'region'),
            country:       pick(row, 'País', 'country') || 'Portugal',
            checkin_time:  pick(row, 'Check-in', 'checkin_time') || '15:00',
            checkout_time: pick(row, 'Check-out', 'checkout_time') || '11:00',
          });
          created++;
        } catch { skipped++; }
        updateOperationProgress(25 + ((idx + 1) / rows.length) * 65, `A importar ${idx + 1}/${rows.length} alojamentos...`);
      }
      updateOperationProgress(95, 'A atualizar lista...');
      toast(`✅ ${created} alojamentos importados${skipped ? `, ${skipped} ignorados` : ''}.`, 'success');
      await loadAccommodations();
      updateOperationProgress(100, 'Concluído.');
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    } finally {
      hideOperationProgress();
    }
  };
  reader.readAsArrayBuffer(file);
}

function absoluteAssetUrl(url) {
  if (!url) return '';
  try { return new URL(url, window.location.origin).href; } catch { return String(url); }
}

function getAlojamentoImageUrls(a) {
  const urls = [];
  const add = url => {
    const abs = absoluteAssetUrl(url);
    if (abs && !urls.includes(abs)) urls.push(abs);
  };
  add(a.cover_image);
  Object.values(a.own_images || a.images || {}).forEach(list => {
    if (Array.isArray(list)) list.forEach(add);
  });
  (a.common_area_images || []).forEach(add);
  return urls;
}

function getAlojamentoCoverUrl(a) {
  return absoluteAssetUrl(a.cover_image) || getAlojamentoImageUrls(a)[0] || '';
}

function hexToRgb(hex, fallback = [132, 52, 36]) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

async function imageUrlToDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function exportAlojamentosXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  showOperationProgress('A exportar alojamentos XLS', 'A preparar dados...', 15);
  const rows = accommodations.map(a => ({
    'Nome':           a.name,
    'Tipo':           a.type || '',
    'Cor':            a.color || '',
    'Imagem capa':    getAlojamentoCoverUrl(a),
    'Imagens':        getAlojamentoImageUrls(a).join('\n'),
    'Preço/noite':    a.price_per_night || 0,
    'Capacidade':     a.max_guests || '',
    'Hóspedes incluídos': a.base_guests_included || Math.min(a.max_guests || 2, 2),
    'Bebé até (incl.)': a.baby_age_limit ?? 2,
    'Preço bebé': a.baby_price ?? 0,
    'Crianças abaixo de': a.child_age_limit ?? 12,
    'Preço criança': a.child_price ?? 0,
    'Ocupação adicional': normalizeExtraOccupancyOptions(a).length ? 'Sim' : 'Não',
    'Extras': normalizeExtraOccupancyOptions(a).map(extra => `${extra.type === 'outro' ? (extra.custom_name || 'Outro') : extra.type} (${extra.capacity} hósp., €${extra.price})`).join('; '),
    'Quartos':        a.num_rooms || '',
    'Casas de banho': a.num_bathrooms || '',
    'Área (m²)':      a.area || '',
    'Licença':        a.license_number || '',
    'Morada':         a.address || '',
    'Cidade':         a.city || '',
    'Região':         a.region || '',
    'País':           a.country || '',
    'Check-in':       a.checkin_time || '',
    'Check-out':      a.checkout_time || '',
    'Wi-Fi':          a.wifi_name || '',
    'Airbnb iCal':    a.airbnb_ical_url || '',
    'Booking iCal':   a.booking_ical_url || '',
  }));
  updateOperationProgress(55, 'A gerar Excel...');
  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = 1; r <= range.e.r; r++) {
    ['D', 'E'].forEach(col => {
      const cell = ws[`${col}${r + 1}`];
      if (cell?.v) cell.l = { Target: String(cell.v).split('\n')[0], Tooltip: 'Abrir imagem' };
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alojamentos');
  updateOperationProgress(90, 'A iniciar download...');
  XLSX.writeFile(wb, `alojamentos_${new Date().toISOString().slice(0,10)}.xlsx`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📊 Excel exportado!', 'success');
}

async function exportAlojamentosPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  showOperationProgress('A exportar alojamentos PDF', 'A preparar documento...', 10);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Alojamentos — Santa Paciência', 14, 18);
  doc.setFontSize(10);
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')}`, 14, 26);

  const head = [['Nome', 'Tipo', 'Cor', '€/noite', 'Capac.', 'Licença', 'Cidade', 'Check-in', 'Check-out']];
  const body = accommodations.map(a => [
    a.name,
    a.type || '—',
    a.color || '—',
    `€${a.price_per_night || 0}`,
    String(a.max_guests || '—'),
    a.license_number || '—',
    a.city || '—',
    a.checkin_time || '—',
    a.checkout_time || '—',
  ]);

  doc.autoTable({ head, body, startY: 32, styles: { fontSize: 9 }, headStyles: { fillColor: [132, 52, 36] } });
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(13);
  doc.text('Imagens dos alojamentos', 14, y);
  y += 8;

  for (const [idx, a] of accommodations.entries()) {
    if (y > 178) { doc.addPage(); y = 18; }
    const color = a.color || '#843424';
    doc.setFontSize(10);
    doc.setTextColor(40);
    doc.text(a.name || 'Alojamento', 14, y + 6);
    doc.setFillColor(...hexToRgb(color));
    doc.rect(72, y + 1, 12, 7, 'F');
    doc.setTextColor(95);
    doc.text(color, 88, y + 6);

    const cover = getAlojamentoCoverUrl(a);
    const imageData = await imageUrlToDataUrl(cover);
    if (imageData) {
      try { doc.addImage(imageData, 'JPEG', 130, y, 32, 22); }
      catch {
        try { doc.addImage(imageData, 'PNG', 130, y, 32, 22); } catch {}
      }
    } else {
      doc.setTextColor(120);
      doc.text('Sem imagem', 130, y + 6);
    }
    const galleryCount = getAlojamentoImageUrls(a).length;
    doc.setTextColor(95);
    doc.text(`${galleryCount} imagem${galleryCount !== 1 ? 's' : ''}`, 170, y + 6);
    y += 28;
    updateOperationProgress(25 + ((idx + 1) / Math.max(accommodations.length, 1)) * 60, `A inserir imagens ${idx + 1}/${accommodations.length}...`);
  }
  doc.setTextColor(40);
  updateOperationProgress(92, 'A iniciar download...');
  doc.save(`alojamentos_${new Date().toISOString().slice(0,10)}.pdf`);
  updateOperationProgress(100, 'Concluído.');
  hideOperationProgress();
  toast('📄 PDF exportado!', 'success');
}

// ── CALENDÁRIO DO ALOJAMENTO ──
function openAlojCalendar() {
  const gcalId = document.getElementById('aloj-gcal-id').value.trim();
  if (gcalId) {
    const url = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(gcalId);
    window.open(url, '_blank');
  } else {
    const id = document.getElementById('aloj-editing-id').value;
    showView('calendario');
    setTimeout(() => {
      const sel = document.getElementById('cal-suite-filter');
      if (sel) { sel.value = id; renderCal(); }
    }, 100);
  }
}

function openAlojCalendarDirect(id, gcalId, nome) {
  if (gcalId) {
    window.open('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(gcalId), '_blank');
  } else {
    showView('calendario');
    setTimeout(() => {
      const sel = document.getElementById('cal-suite-filter');
      if (sel) { sel.value = id; renderCal(); }
    }, 150);
  }
}

async function deleteAlojamento() {
  const id = document.getElementById('aloj-editing-id').value;
  const name = document.getElementById('aloj-nome').value || id;
  if (!id) return;
  if (!confirm(`Apagar o alojamento "${name}"?\n\nEsta ação é irreversível. Todas as reservas canceladas associadas serão apagadas.`)) return;
  try {
    const res = await apiDelete(`/api/accommodations/${id}`);
    if (res.success) {
      toast('🗑 Alojamento apagado.', 'info');
      currentAlojDetail = null;
      SS.set('aloj:id', null);
      showView('alojamentos');
      await loadAccommodations();
    } else {
      toast('❌ ' + (res.error || 'Erro ao apagar alojamento.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || e?.message || 'Erro de ligação ao servidor.'), 'error');
  }
}

function toggleWifiPass(btn) {
  const input = btn.previousElementSibling;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const icon = btn.querySelector('i[data-lucide]');
  icon.setAttribute('data-lucide', showing ? 'eye' : 'eye-off');
  if (window.lucide) lucide.createIcons();
}

function setExtraOccupancyFields(a = {}) {
  const maxGuests = Number(a.max_guests) || 2;
  const includedEl = document.getElementById('aloj-hospedes-incluidos');
  if (includedEl) includedEl.value = a.base_guests_included || Math.min(maxGuests, 2);
  renderExtraOccupancyOptions(normalizeExtraOccupancyOptions(a));
}

function normalizeExtraOccupancyOptions(a = {}) {
  let options = [];
  if (Array.isArray(a.extra_occupancy_options)) {
    options = a.extra_occupancy_options;
  } else if (typeof a.extra_occupancy_options === 'string' && a.extra_occupancy_options.trim()) {
    try { options = JSON.parse(a.extra_occupancy_options); } catch { options = []; }
  }

  if (!options.length && a.extra_bed_enabled) {
    options = [{
      type: a.extra_bed_type || 'sofa_cama',
      capacity: Number(a.extra_bed_capacity) || 0,
      price: Number(a.extra_bed_price) || 0,
      charge_type: a.extra_bed_charge_type || 'per_guest_night',
      notes: a.extra_bed_notes || ''
    }];
  }

  return options.map(option => ({
    type: option.type || 'sofa_cama',
    custom_name: option.custom_name || '',
    capacity: Math.max(0, Number(option.capacity) || 0),
    price: Math.max(0, Number(option.price) || 0),
    charge_type: option.charge_type || 'per_guest_night',
    notes: option.notes || ''
  }));
}

function escapeExtraOccupancyText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function renderExtraOccupancyOptions(options = []) {
  const list = document.getElementById('aloj-extra-occupancy-list');
  if (!list) return;
  if (!options.length) {
    list.innerHTML = `<div style="padding:12px 14px;border:1px dashed var(--borda);border-radius:8px;color:var(--cinza);font-size:13px;">Sem ocupação adicional configurada.</div>`;
    return;
  }

  list.innerHTML = options.map((option, index) => `
    <div class="extra-occupancy-row" style="border:1px solid var(--borda);border-radius:8px;padding:12px;background:#fff;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Tipo</label>
          <select class="form-control" data-field="type" onchange="onExtraOccupancyTypeChange(this)">
            <option value="cama_extra" ${option.type === 'cama_extra' ? 'selected' : ''}>Cama extra</option>
            <option value="sofa_cama" ${option.type === 'sofa_cama' ? 'selected' : ''}>Sofá-cama</option>
            <option value="berco" ${option.type === 'berco' ? 'selected' : ''}>Berço</option>
            <option value="outro" ${option.type === 'outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="form-group" data-custom-extra-wrap style="margin:0;display:${option.type === 'outro' ? '' : 'none'};">
          <label class="form-label">Nome do extra</label>
          <input class="form-control" data-field="custom_name" value="${escapeExtraOccupancyText(option.custom_name)}" placeholder="Ex: Colchão no chão" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Capacidade</label>
          <input class="form-control" data-field="capacity" type="number" min="0" max="20" value="${option.capacity}" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Preço (€)</label>
          <input class="form-control" data-field="price" type="number" min="0" step="0.01" value="${option.price}" autocomplete="off">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Cobrança</label>
          <select class="form-control" data-field="charge_type">
            <option value="per_guest_night" ${option.charge_type === 'per_guest_night' ? 'selected' : ''}>Por hóspede/noite</option>
            <option value="per_bed_night" ${option.charge_type === 'per_bed_night' ? 'selected' : ''}>Por cama/noite</option>
          </select>
        </div>
        <button type="button" onclick="removeExtraOccupancyOption(${index})" title="Remover extra" style="height:32px;width:32px;padding:0;border:0;background:transparent;color:var(--vermelho);cursor:pointer;display:flex;align-items:center;justify-content:center;justify-self:end;">
          ${lcIcon('trash-2', 14)}
        </button>
      </div>
      <div class="form-group" style="margin:10px 0 0;">
        <label class="form-label">Notas</label>
        <textarea class="form-control" data-field="notes" rows="2" placeholder="Ex: mediante verificação de disponibilidade prévia">${escapeExtraOccupancyText(option.notes)}</textarea>
      </div>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

function collectExtraOccupancyOptions() {
  return Array.from(document.querySelectorAll('#aloj-extra-occupancy-list .extra-occupancy-row')).map(row => ({
    type: row.querySelector('[data-field="type"]')?.value || 'sofa_cama',
    custom_name: row.querySelector('[data-field="custom_name"]')?.value.trim() || '',
    capacity: parseInt(row.querySelector('[data-field="capacity"]')?.value) || 0,
    price: parseFloat(row.querySelector('[data-field="price"]')?.value) || 0,
    charge_type: row.querySelector('[data-field="charge_type"]')?.value || 'per_guest_night',
    notes: row.querySelector('[data-field="notes"]')?.value.trim() || ''
  }));
}

function addExtraOccupancyOption(option = {}) {
  const options = collectExtraOccupancyOptions();
  options.push({
    type: option.type || 'cama_extra',
    custom_name: option.custom_name || '',
    capacity: option.capacity ?? 1,
    price: option.price ?? 0,
    charge_type: option.charge_type || 'per_guest_night',
    notes: option.notes || ''
  });
  renderExtraOccupancyOptions(options);
}

function removeExtraOccupancyOption(index) {
  const options = collectExtraOccupancyOptions();
  options.splice(index, 1);
  renderExtraOccupancyOptions(options);
}

function onExtraOccupancyTypeChange(select) {
  const row = select.closest('.extra-occupancy-row');
  const customWrap = row?.querySelector('[data-custom-extra-wrap]');
  if (customWrap) customWrap.style.display = select.value === 'outro' ? '' : 'none';
  const notes = row?.querySelector('[data-field="notes"]');
  if (select.value === 'berco' && notes && !notes.value.trim()) {
    notes.value = 'Mediante verificação de disponibilidade prévia.';
  }
}

function getOptionalIcalUrl(inputId, label) {
  const value = document.getElementById(inputId)?.value.trim() || '';
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
  } catch (_) {}
  toast(`${label}: insere um URL http/https válido.`, 'error');
  throw new Error('invalid_ical_url');
}

// ── GUARDAR ALOJAMENTO ──
async function saveAlojamento() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;

  const checkedAmenities = getSelectedAmenitiesFromUi();

  const parentId = document.getElementById('aloj-parent-id')?.value || null;
  const hasParent = !!parentId;
  const maxGuests = parseInt(document.getElementById('aloj-capacidade').value) || 2;
  const baseGuestsIncluded = Math.min(
    parseInt(document.getElementById('aloj-hospedes-incluidos')?.value) || Math.min(maxGuests, 2),
    maxGuests
  );
  const extraOccupancyOptions = collectExtraOccupancyOptions();
  const firstExtra = extraOccupancyOptions[0] || null;
  let airbnbIcalUrl = null;
  let bookingIcalUrl = null;
  try {
    airbnbIcalUrl = getOptionalIcalUrl('aloj-airbnb-ical-url', 'Airbnb iCal');
    bookingIcalUrl = getOptionalIcalUrl('aloj-booking-ical-url', 'Booking.com iCal');
  } catch (_) {
    return;
  }

  const body = {
    name: document.getElementById('aloj-nome').value,
    license_number: document.getElementById('aloj-licenca').value + '/AL',
    type: document.getElementById('aloj-tipo').value,
    parent_id: parentId,
    area: parseInt(document.getElementById('aloj-area').value) || null,
    max_guests: maxGuests,
    num_rooms: parseInt(document.getElementById('aloj-quartos').value) || 1,
    num_bathrooms: parseInt(document.getElementById('aloj-casasbanho').value) || 1,
    price_per_night: parseFloat(document.getElementById('aloj-preco').value) || 0,
    min_nights: parseInt(document.getElementById('aloj-min-nights')?.value) || 1,
    rgpd_text: document.getElementById('aloj-rgpd-text')?.value?.trim() || null,
    base_guests_included: baseGuestsIncluded,
    baby_age_limit: parseInt(document.getElementById('aloj-baby-age-limit')?.value) || 0,
    baby_price: parseFloat(document.getElementById('aloj-baby-price')?.value) || 0,
    child_age_limit: parseInt(document.getElementById('aloj-child-age-limit')?.value) || 0,
    child_price: parseFloat(document.getElementById('aloj-child-price')?.value) || 0,
    extra_occupancy_options: extraOccupancyOptions,
    extra_bed_enabled: extraOccupancyOptions.length > 0,
    extra_bed_type: firstExtra?.type || 'sofa_cama',
    extra_bed_capacity: firstExtra?.capacity || 0,
    extra_bed_price: firstExtra?.price || 0,
    extra_bed_charge_type: firstExtra?.charge_type || 'per_guest_night',
    description: document.getElementById('desc-pt').value,
    description_en: document.getElementById('desc-en').value,
    description_fr: document.getElementById('desc-fr').value,
    description_es: document.getElementById('desc-es').value,
    description_de: document.getElementById('desc-de').value,
    description_it: document.getElementById('desc-it').value,
    description_nl: document.getElementById('desc-nl').value,
    google_calendar_id: document.getElementById('aloj-gcal-id').value || null,
    airbnb_ical_url: airbnbIcalUrl,
    booking_ical_url: bookingIcalUrl,
    color:         document.getElementById('aloj-color')?.value || null,
    own_amenities: checkedAmenities,
  };

  // Only include inherited fields if this accommodation owns them (no parent)
  if (!hasParent) {
    Object.assign(body, {
      address:    document.getElementById('aloj-morada').value,
      postal_code: document.getElementById('aloj-cp').value,
      city:       document.getElementById('aloj-cidade').value,
      region:     document.getElementById('aloj-regiao').value,
      country:    document.getElementById('aloj-pais').value,
      wifi_name:     document.getElementById('aloj-wifi-nome').value.trim()     || null,
      wifi_password: document.getElementById('aloj-wifi-password').value.trim() || null,
      checkin_time:  document.getElementById('aloj-checkin-time').value  || null,
      checkout_time: document.getElementById('aloj-checkout-time').value || null,
      social_facebook:  document.getElementById('aloj-social-fb')?.value.trim()  || null,
      social_instagram: document.getElementById('aloj-social-ig')?.value.trim()  || null,
      social_website:   document.getElementById('aloj-social-web')?.value.trim() || null,
    });
  }

  try {
    const res = await apiPut('/api/accommodations/' + id, body);
    if (res.success) {
      const activeTab = getActiveAlojTab();
      toast('✅ Alojamento guardado!', 'success');
      document.getElementById('aloj-detalhe-nome').textContent = body.name;
      await loadAccommodations();
      await openAlojamento(id, activeTab);
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

// ── MAPA DE LOCALIZAÇÃO ──
let _alojMap    = null;
let _alojMarker = null;

function resetAlojMap() {
  if (_alojMap) { _alojMap.remove(); _alojMap = null; _alojMarker = null; }
  const ph  = document.getElementById('aloj-map-placeholder');
  const map = document.getElementById('aloj-map');
  if (ph)  ph.style.display  = '';
  if (map) map.style.display = 'none';
  const btn = document.getElementById('aloj-map-btn');
  if (btn) { btn.disabled = false; btn.innerHTML = `${lcIcon('search',13)} Verificar endereço`; }
}

async function geocodeAndShowMap() {
  const morada  = (document.getElementById('aloj-morada')?.value  || '').trim();
  const cp      = (document.getElementById('aloj-cp')?.value      || '').trim();
  const cidade  = (document.getElementById('aloj-cidade')?.value  || '').trim();
  const pais    = (document.getElementById('aloj-pais')?.value    || 'Portugal').trim();
  const q = [morada, cp, cidade, pais].filter(Boolean).join(', ');
  if (!morada && !cidade) { toast('Preencha a morada antes de pesquisar.', 'error'); return; }

  const ph  = document.getElementById('aloj-map-placeholder');
  const mapEl = document.getElementById('aloj-map');
  const btn = document.getElementById('aloj-map-btn');

  if (ph)  ph.style.display  = 'none';
  if (mapEl) mapEl.style.display = 'block';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A pesquisar...'; }

  if (!_alojMap) {
    _alojMap = L.map('aloj-map').setView([39.55, -8.0], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(_alojMap);
  } else {
    _alojMap.invalidateSize();
  }

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'Accept-Language': 'pt' } }
    );
    const results = await resp.json();
    if (!results.length) { toast('Morada não encontrada. Verifique os dados.', 'error'); return; }
    const latlng = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    _alojMap.setView(latlng, 16);
    if (_alojMarker) _alojMarker.remove();
    _alojMarker = L.marker(latlng).addTo(_alojMap);
    _alojMarker.bindPopup(`<b>${results[0].display_name}</b>`).openPopup();
    toast('✅ Localização encontrada!', 'success');
  } catch (e) {
    toast('❌ Erro ao pesquisar morada.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${lcIcon('search',13)} Verificar endereço`; if (window.lucide) lucide.createIcons(); }
  }
}

// ── DESCRIÇÃO MULTILINGUE ──
function switchDescLang(lang) {
  document.querySelectorAll('.desc-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
  document.querySelectorAll('.desc-lang-area').forEach(a => a.style.display = a.id === 'desc-' + lang ? 'block' : 'none');
}
