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

let dragSrcIdx = null;
let dragImgSrc = null; // { section, url } for image drag between sections
let alojImagens = {};
// servicosData is declared globally in state.js; keep a local alias reference
let _servicosTimer = null;

// ── LISTA DE ALOJAMENTOS ──
function renderAlojamentos() {
  const loading = document.getElementById('aloj-loading');
  const tbody = document.getElementById('aloj-body');
  if (!tbody) return;
  loading.style.display = 'none';

  if (accommodations.length === 0) {
    loading.style.display = 'flex';
    return;
  }

  tbody.innerHTML = accommodations.map((a, idx) => `
    <tr draggable="true" data-id="${a.id}" data-idx="${idx}" onclick="openAlojamento('${a.id}')">
      <td><span class="drag-handle" onclick="event.stopPropagation()" title="Arrastar para reordenar">${lcIcon('grip-vertical', 16)}</span></td>
      <td>
        ${a.cover_image
          ? `<img src="${a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--cinza-claro);">`
          : `<div style="width:40px;height:40px;border-radius:8px;background:var(--cinza-claro);display:flex;align-items:center;justify-content:center;color:var(--cinza);">${lcIcon('home', 18)}</div>`}
      </td>
      <td><b>${a.name}</b>${a.city ? `<br><span style="font-size:11px;color:var(--cinza)">${a.city}</span>` : ''}</td>
      <td style="font-size:12px;color:var(--cinza)">${a.type || '—'}</td>
      <td style="font-size:12px">${a.max_guests} hósp.</td>
      <td style="font-size:12px">${a.num_rooms || 1}</td>
      <td style="font-size:12px">${a.area ? a.area + ' m²' : '—'}</td>
      <td><b style="color:var(--azul)">€${a.price_per_night}</b></td>
      <td style="font-size:11.5px;color:var(--cinza)">${a.license_number || '—'}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" style="font-size:11px;gap:4px;" onclick="openAlojCalendarDirect('${a.id}','${a.google_calendar_id || ''}','${a.name}')">
          ${lcIcon('calendar', 13)} Calendário${a.google_calendar_id ? ' ✓' : ''}
        </button>
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

function initAlojDrag() {
  const tbody = document.getElementById('aloj-body');
  if (!tbody) return;

  tbody.querySelectorAll('tr[draggable]').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcIdx = parseInt(row.dataset.idx);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
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
      const destIdx = parseInt(row.dataset.idx);
      if (dragSrcIdx === null || dragSrcIdx === destIdx) return;
      const moved = accommodations.splice(dragSrcIdx, 1)[0];
      accommodations.splice(destIdx, 0, moved);
      dragSrcIdx = null;
      renderAlojamentos();
      initAlojDrag();
    });
  });
}

// ── DETALHE / EDIÇÃO ──
async function openAlojamento(id) {
  try {
    const data = await apiGet('/api/accommodations/' + id);
    const a = data.data;

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
    document.getElementById('aloj-area').value = a.area || '';
    document.getElementById('aloj-capacidade').value = a.max_guests || 2;
    document.getElementById('aloj-quartos').value = a.num_rooms || 1;
    document.getElementById('aloj-casasbanho').value = a.num_bathrooms || 1;
    document.getElementById('aloj-preco').value = a.price_per_night || '';
    document.getElementById('aloj-gcal-id').value = a.google_calendar_id || '';
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
    if (coverPreview) {
      if (a.cover_image) {
        const url = a.cover_image.startsWith('http') ? a.cover_image : API_BASE + a.cover_image;
        coverPreview.src = url + '?t=' + Date.now();
        coverPreview.style.display = 'block';
        if (coverPlaceholder) coverPlaceholder.style.display = 'none';
      } else {
        coverPreview.style.display = 'none';
        if (coverPlaceholder) coverPlaceholder.style.display = 'flex';
      }
    }

    alojImagens[a.id] = a.images || {};
    renderAmenities(a.amenities || []);
    showAlojTab('info');
    resetAlojMap();

    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.getElementById('view-alojamento-detalhe').classList.add('active');
    document.getElementById('topbar-title').textContent = a.name;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    toast('❌ Erro ao carregar alojamento.', 'error');
  }
}

function renderAmenities(selected) {
  const container = document.getElementById('amenities-grid');
  container.innerHTML = Object.entries(AMENITIES_CATALOG).map(([section, items]) => `
    <div class="amenity-section">
      <div class="amenity-section-title">${section}</div>
      <div class="amenity-grid">
        ${items.map(item => {
          const checked = selected.includes(item);
          return `<label class="amenity-item${checked ? ' checked' : ''}">
            <input type="checkbox" value="${item}" ${checked ? 'checked' : ''} onchange="toggleAmenity(this)">
            ${item}
          </label>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function toggleAmenity(el) {
  el.closest('.amenity-item').classList.toggle('checked', el.checked);
}

function showAlojTab(tab) {
  ['info','comodidades','imagens'].forEach(t => {
    const el = document.getElementById('aloj-tab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'imagens') renderImagens();
}

// ── IMAGENS ──
function getImgSections(id) {
  const imgs = alojImagens[id] || {};
  if (imgs._sections && Array.isArray(imgs._sections) && imgs._sections.length > 0) {
    return imgs._sections;
  }
  return DEFAULT_SECTIONS;
}

function renderImagens() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = alojImagens[id] || {};
  const sections = getImgSections(id);
  const container = document.getElementById('img-sections');

  container.innerHTML = sections.map((sec, idx) => {
    const key = sec.key;
    const label = sec.label;
    const urls = imgs[key] || [];

    const thumbs = urls.map(url => `
      <div class="img-thumb-wrap" draggable="true"
           data-section="${key}" data-url="${url}"
           ondragstart="imgDragStart(event,'${key}','${url}')"
           ondragend="imgDragEnd(event)">
        <img class="img-thumb" src="${API_BASE}${url}" alt="">
        <button class="img-remove" onclick="removeImg('${key}','${url}')">✕</button>
      </div>`).join('');

    return `
      <div class="img-section" data-section-idx="${idx}">
        <div class="img-section-header">
          <input class="img-section-label-input" value="${label}"
                 onchange="renameImgSection(${idx}, this.value)"
                 title="Clique para renomear">
          <div class="img-section-actions">
            <button class="img-section-btn add" onclick="triggerImgUpload('${key}')" title="Adicionar fotos">
              ${lcIcon('image-plus', 14)}
            </button>
            <button class="img-section-btn" onclick="removeImgSection(${idx})" title="Remover divisão">
              ${lcIcon('trash-2', 13)}
            </button>
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
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({ section, url }));
  e.currentTarget.style.opacity = '0.5';
}

function imgDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('.img-row').forEach(r => r.classList.remove('drag-over'));
}

async function imgDropInSection(e, targetSection) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!dragImgSrc || dragImgSrc.section === targetSection) {
    dragImgSrc = null;
    return;
  }

  const id = document.getElementById('aloj-editing-id').value;
  const imgs = alojImagens[id] || {};
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
  const sections = getImgSections(id).map((s, i) =>
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

  const imgCount = (imgs[sec.key] || []).length;
  if (imgCount > 0 && !confirm(`A divisão "${sec.label}" tem ${imgCount} foto(s). Remover mesmo assim? As fotos serão eliminadas.`)) return;

  const newSections = sections.filter((_, i) => i !== idx);
  if (imgs[sec.key]) delete imgs[sec.key];
  imgs._sections = newSections;
  alojImagens[id] = imgs;
  renderImagens();
  await saveImgSections(id, imgs);
}

async function addImgSection() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const nameEl = document.getElementById('new-section-name');
  const name = (nameEl.value || '').trim();
  if (!name) { toast('Escreva o nome da divisão.', 'error'); return; }

  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now().toString().slice(-4);

  const imgs = alojImagens[id] || {};
  const sections = getImgSections(id);
  sections.push({ key, label: name });
  imgs._sections = sections;
  imgs[key] = [];
  alojImagens[id] = imgs;
  nameEl.value = '';
  renderImagens();
  await saveImgSections(id, imgs);
}

async function saveImgSections(id, imgs) {
  try {
    await fetch(`${API_BASE}/api/accommodations/${id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imgs })
    });
  } catch (err) {
    toast('❌ Erro ao guardar secções.', 'error');
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
        // Preserve _sections when merging
        const prevSections = alojImagens[id]._sections;
        alojImagens[id] = res.images;
        if (prevSections) alojImagens[id]._sections = prevSections;
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: sec, url })
    });
    const data = await res.json();
    if (data.success) {
      const prevSections = alojImagens[id]?._sections;
      alojImagens[id] = data.images;
      if (prevSections) alojImagens[id]._sections = prevSections;
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
        preview.src = url + '?t=' + Date.now();
        preview.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
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
          : `<input class="form-control" style="font-size:13px;padding:6px 10px;" value="${s.name}" onchange="servicosData[${i}].name=this.value;autoSaveServicos()">`}
      </td>
      <td><input class="form-control" type="number" step="0.01" style="font-size:13px;padding:6px 10px;-moz-appearance:textfield;width:90px;" value="${s.value}" onchange="servicosData[${i}].value=parseFloat(this.value)||0;autoSaveServicos()"></td>
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

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { toast('⚠️ Ficheiro vazio.', 'error'); return; }

      const pick = (row, ...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]); return ''; };

      let created = 0, skipped = 0;
      for (const row of rows) {
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
      }
      toast(`✅ ${created} alojamentos importados${skipped ? `, ${skipped} ignorados` : ''}.`, 'success');
      await loadAccommodations();
    } catch (err) {
      toast('❌ Erro ao ler ficheiro: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportAlojamentosXLS() {
  if (typeof XLSX === 'undefined') { toast('❌ Biblioteca XLSX não carregada.', 'error'); return; }
  const rows = accommodations.map(a => ({
    'Nome':           a.name,
    'Tipo':           a.type || '',
    'Preço/noite':    a.price_per_night || 0,
    'Capacidade':     a.max_guests || '',
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
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alojamentos');
  XLSX.writeFile(wb, `alojamentos_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('📊 Excel exportado!', 'success');
}

function exportAlojamentosPDF() {
  if (typeof window.jspdf === 'undefined') { toast('❌ Biblioteca jsPDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Alojamentos — Santa Paciência', 14, 18);
  doc.setFontSize(10);
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-PT')}`, 14, 26);

  const head = [['Nome', 'Tipo', '€/noite', 'Capac.', 'Licença', 'Cidade', 'Check-in', 'Check-out']];
  const body = accommodations.map(a => [
    a.name,
    a.type || '—',
    `€${a.price_per_night || 0}`,
    String(a.max_guests || '—'),
    a.license_number || '—',
    a.city || '—',
    a.checkin_time || '—',
    a.checkout_time || '—',
  ]);

  doc.autoTable({ head, body, startY: 32, styles: { fontSize: 9 }, headStyles: { fillColor: [132, 52, 36] } });
  doc.save(`alojamentos_${new Date().toISOString().slice(0,10)}.pdf`);
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

// ── GUARDAR ALOJAMENTO ──
async function saveAlojamento() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;

  const checkedAmenities = Array.from(
    document.querySelectorAll('#amenities-grid input[type=checkbox]:checked')
  ).map(el => el.value);

  const body = {
    name: document.getElementById('aloj-nome').value,
    license_number: document.getElementById('aloj-licenca').value + '/AL',
    address: document.getElementById('aloj-morada').value,
    postal_code: document.getElementById('aloj-cp').value,
    city: document.getElementById('aloj-cidade').value,
    region: document.getElementById('aloj-regiao').value,
    country: document.getElementById('aloj-pais').value,
    type: document.getElementById('aloj-tipo').value,
    area: parseInt(document.getElementById('aloj-area').value) || null,
    max_guests: parseInt(document.getElementById('aloj-capacidade').value) || 2,
    num_rooms: parseInt(document.getElementById('aloj-quartos').value) || 1,
    num_bathrooms: parseInt(document.getElementById('aloj-casasbanho').value) || 1,
    price_per_night: parseFloat(document.getElementById('aloj-preco').value) || 0,
    description: document.getElementById('desc-pt').value,
    description_en: document.getElementById('desc-en').value,
    description_fr: document.getElementById('desc-fr').value,
    description_es: document.getElementById('desc-es').value,
    description_de: document.getElementById('desc-de').value,
    description_it: document.getElementById('desc-it').value,
    description_nl: document.getElementById('desc-nl').value,
    google_calendar_id: document.getElementById('aloj-gcal-id').value || null,
    wifi_name:     document.getElementById('aloj-wifi-nome').value.trim()     || null,
    wifi_password: document.getElementById('aloj-wifi-password').value.trim() || null,
    checkin_time:  document.getElementById('aloj-checkin-time').value  || null,
    checkout_time: document.getElementById('aloj-checkout-time').value || null,
    color:         document.getElementById('aloj-color')?.value        || null,
    social_facebook:  document.getElementById('aloj-social-fb')?.value.trim()  || null,
    social_instagram: document.getElementById('aloj-social-ig')?.value.trim()  || null,
    social_website:   document.getElementById('aloj-social-web')?.value.trim() || null,
    amenities: checkedAmenities,
  };

  try {
    const res = await apiPut('/api/accommodations/' + id, body);
    if (res.success) {
      toast('✅ Alojamento guardado!', 'success');
      document.getElementById('aloj-detalhe-nome').textContent = body.name;
      await loadAccommodations();
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
