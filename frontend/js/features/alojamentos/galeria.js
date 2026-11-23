// Estado privado; interface partilhada em AppModules.alojamentos.
(() => {
AppModules.define('alojamentos', {
  addImgSection: { get: () => addImgSection },
  closeImageLightbox: { get: () => closeImageLightbox },
  coverDragEnd: { get: () => coverDragEnd },
  coverDragStart: { get: () => coverDragStart },
  handleCoverDrop: { get: () => handleCoverDrop },
  handleCoverZoneClick: { get: () => handleCoverZoneClick },
  handleImgDrop: { get: () => handleImgDrop },
  handleImgSelect: { get: () => handleImgSelect },
  removeAlojLogo: { get: () => removeAlojLogo },
  removeCoverImage: { get: () => removeCoverImage },
  renderCoverWarning: { get: () => renderCoverWarning },
  openCoverPicker: { get: () => openCoverPicker },
  renderAlojLogoPreview: { get: () => renderAlojLogoPreview },
  renderImagens: { get: () => renderImagens },
  uploadAlojLogo: { get: () => uploadAlojLogo },
  uploadCoverImage: { get: () => uploadCoverImage },
});

// A ficha do alojamento carrega depois do arranque, por isso os inputs de ficheiro
// são tratados por delegação em vez de ligados a elementos que ainda não existem.
document.addEventListener('change', event => {
  const input = event.target;
  if (input?.id === 'cover-input') {
    const file = input.files[0];
    input.value = '';
    if (file) uploadCoverImage(file);
  } else if (input?.id === 'img-input') handleImgSelect(event);
});

// ── IMAGENS ──
function getImgSections(id) {
  const imgs = AppModules.alojamentos.alojImagens[id] || {};
  const hasParent = !!AppModules.alojamentos.currentAlojDetail?.parent_id;
  return AppModules.alojamentos.buildImageSections(imgs, imgs._sections, hasParent);
}

function renderImagens() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = AppModules.alojamentos.alojImagens[id] || {};
  const sections = getImgSections(id);
  const container = document.getElementById('img-sections');
  const hasParent = !!AppModules.alojamentos.currentAlojDetail?.parent_id;
  const commonAreaImages = AppModules.alojamentos.currentAlojDetail?.common_area_images?.length
    ? AppModules.alojamentos.currentAlojDetail.common_area_images
    : AppModules.alojamentos.currentAlojDetail?._parent?.images?.[AppModules.alojamentos.COMMON_AREAS_SECTION.key] || [];

  const inheritedCommonAreas = hasParent ? `
    <div class="img-section img-section-inherited">
      <div class="img-section-header">
        <div>
          <div class="img-section-title-static">${AppModules.alojamentos.COMMON_AREAS_SECTION.label}</div>
          <div class="img-section-subtitle">Herdado de ${AppModules.alojamentos.currentAlojDetail?._parent_name || 'alojamento principal'} · só leitura</div>
        </div>
      </div>
      <div class="img-row img-row-inherited">
        ${commonAreaImages.length
          ? commonAreaImages.map(url => `
            <div class="img-thumb-wrap">
              <img class="img-thumb" src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(AppModules.core.API_BASE + url, 480))}" alt="" loading="lazy" decoding="async" ${AppActions.attrs("click", "galeria-open-image-lightbox-c42eaa8", [AppModules.core.API_BASE, url])}>
            </div>`).join('')
          : `<div class="img-inherited-empty">Sem fotos de áreas comuns no alojamento principal.</div>`}
      </div>
    </div>
  ` : '';

  container.innerHTML = inheritedCommonAreas + sections.map((sec, idx) => {
    const key = sec.key;
    const label = sec.label;
    const urls = imgs[key] || [];
    const isCommonAreas = key === AppModules.alojamentos.COMMON_AREAS_SECTION.key;

    const thumbs = urls.map(url => `
      <div class="img-thumb-wrap" draggable="true"
           data-section="${key}" data-url="${url}"
           ${AppActions.attrs("dragstart", "galeria-img-drag-start-db472bd", [key, url])}
           data-on-dragend="galeria-img-drag-end-f9de7ac">
        <img class="img-thumb" src="${AppModules.core.escapeHtml(AppModules.core.mediaThumb(AppModules.core.API_BASE + url, 480))}" alt="" loading="lazy" decoding="async" ${AppActions.attrs("click", "galeria-open-image-lightbox-c42eaa8", [AppModules.core.API_BASE, url])}>
        ${smallBadge(id, url)}
        <button type="button" class="img-rotate" title="Rodar 90°" aria-label="Rodar 90°" ${AppActions.attrs("click", "recortes-rodar-foto", [String(url ?? '')])}>${AppModules.core.lcIcon('rotate-cw', 12)}</button>
        <button class="img-remove" ${AppActions.attrs("click", "galeria-remove-img-f163082", [String((key) ?? ''), String((url) ?? '')])}>✕</button>
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
                 ${AppActions.attrs("change", "galeria-rename-img-section-ffac3ed", [idx])}
                 title="Clique para renomear" autocomplete="off">`}
          <div class="img-section-actions">
            <button class="img-section-btn add" ${AppActions.attrs("click", "galeria-trigger-img-upload-dc59c9c", [String((key) ?? '')])} title="Adicionar fotos">
              ${AppModules.core.lcIcon('image-plus', 14)}
            </button>
            ${isCommonAreas ? '' : `<button class="img-section-btn" ${AppActions.attrs("click", "galeria-remove-img-section-f515826", [idx])} title="Remover divisão">
              ${AppModules.core.lcIcon('trash-2', 13)}
            </button>`}
          </div>
        </div>
        <div class="img-row" id="imgs-${key}"
             data-on-dragover="galeria-prevent-default-e179d9b"
             data-on-dragleave="galeria-remove-1227cde"
             ${AppActions.attrs("drop", "galeria-img-drop-in-section-c2bc56f", [key])}>
          ${thumbs}
          <div class="img-empty" style="cursor:pointer;" ${AppActions.attrs("click", "galeria-trigger-img-upload-dc59c9c", [String((key) ?? '')])}>＋</div>
        </div>
      </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
  renderCoverWarning();
  loadGallerySizes(id);
}

// ── FOTOGRAFIA PEQUENA ──
// A capa precisa de pelo menos 1600 px de largura (topo da página de reservas
// e do portal, em ecrãs grandes ou de densidade alta); as fotos da galeria,
// de 1200 px (só levam um selo). Os mesmos limites de services/imageCrops.js.
const SMALL_COVER_WIDTH = 1600;
const SMALL_GALLERY_WIDTH = 1200;
const gallerySizes = {};   // id do alojamento → { url: { w, h } }

function currentCover() {
  const id = document.getElementById('aloj-editing-id')?.value;
  const a = AppModules.core.accommodations.find(x => x.id === id);
  const detail = AppModules.alojamentos.currentAlojDetail;
  return detail?.id === id ? detail : a;
}

function renderCoverWarning() {
  const box = document.getElementById('aloj-cover-warning');
  if (!box) return;
  const a = currentCover();
  const size = globalThis.ImageCrops?.parse(a?.cover_size);
  if (!a?.cover_image || !(size?.w > 0) || size.w >= SMALL_COVER_WIDTH) { box.hidden = true; box.innerHTML = ''; return; }
  const hasGallery = Object.entries(AppModules.alojamentos.alojImagens[a.id] || {}).some(([k, l]) => k !== '_sections' && Array.isArray(l) && l.length);
  box.innerHTML = `<span>${AppModules.core.lcIcon('triangle-alert', 14)} <strong>Fotografia pequena.</strong> A capa tem ${size.w} px de largura (recomendado: pelo menos ${SMALL_COVER_WIDTH} px) e pode aparecer desfocada na página de reservas e no portal do hóspede.</span>
    ${hasGallery ? '<button type="button" class="btn btn-ghost btn-sm" data-on-click="galeria-usar-da-galeria">Usar uma fotografia da galeria</button>' : ''}`;
  box.hidden = false;
  if (window.lucide) lucide.createIcons();
}

function smallBadge(id, url) {
  const size = gallerySizes[id]?.[url];
  return size?.w > 0 && size.w < SMALL_GALLERY_WIDTH
    ? `<span class="img-small-badge" title="${size.w} px de largura">Fotografia pequena</span>` : '';
}

// As larguras vêm do servidor (a galeria só guarda endereços); pedem-se uma
// vez por alojamento e voltam a pintar a grelha só se houver fotos pequenas.
const sizesTried = {};     // id → endereços já pedidos
async function loadGallerySizes(id) {
  if (!id) return;
  const urls = Object.entries(AppModules.alojamentos.alojImagens[id] || {})
    .filter(([k, l]) => k !== '_sections' && Array.isArray(l)).flatMap(([, l]) => l);
  const tried = sizesTried[id] ||= new Set();
  if (!urls.some(u => !tried.has(u))) return;
  urls.forEach(u => tried.add(u));
  try {
    gallerySizes[id] = (await AppModules.core.apiGet(`/api/accommodations/${encodeURIComponent(id)}/images/sizes`)).sizes || {};
  } catch { delete sizesTried[id]; return; }
  if (Object.values(gallerySizes[id]).some(s => s.w < SMALL_GALLERY_WIDTH) && document.getElementById('aloj-editing-id')?.value === id) renderImagens();
}

// «Usar uma fotografia da galeria»: escolher entre as fotos já carregadas.
async function openCoverPicker() {
  const id = document.getElementById('aloj-editing-id')?.value;
  if (!id) return;
  const core = AppModules.core;
  const urls = [...new Set(Object.entries(AppModules.alojamentos.alojImagens[id] || {})
    .filter(([k, l]) => k !== '_sections' && Array.isArray(l)).flatMap(([, l]) => l))];
  try { gallerySizes[id] = (await core.apiGet(`/api/accommodations/${encodeURIComponent(id)}/images/sizes`)).sizes || {}; } catch { gallerySizes[id] ||= {}; }
  const esc = core.escapeHtml;
  const items = urls.map(url => {
    const w = gallerySizes[id]?.[url]?.w;
    const small = w && w < SMALL_COVER_WIDTH;
    return `<button type="button" class="cover-pick-item" data-url="${esc(url)}" aria-label="Usar esta fotografia como capa${w ? ` (${w} px)` : ''}">
      <img src="${esc(core.mediaThumb(core.API_BASE + url, 480))}" alt="" loading="lazy" decoding="async">
      ${w ? `<span class="${small ? 'img-small-badge' : 'cover-pick-w'}">${small ? `${w} px · pequena` : `${w} px`}</span>` : ''}</button>`;
  }).join('');
  const dialog = AppUI.openDialog({
    id: 'cover-picker', title: 'Usar uma fotografia da galeria', className: 'cover-picker',
    body: `<p style="margin:0 0 12px;font-size:13px;color:var(--cinza)">Escolha a fotografia para a capa. As de pelo menos ${SMALL_COVER_WIDTH} px ficam nítidas em qualquer ecrã.</p>
      <div class="cover-pick-grid">${items || '<p>A galeria ainda não tem fotografias.</p>'}</div>`,
  });
  dialog.addEventListener('click', async event => {
    const item = event.target.closest('.cover-pick-item');
    if (!item) return;
    item.disabled = true;
    if (await setCoverFromUrl(id, item.dataset.url)) AppUI.closeDialog(dialog);
    else item.disabled = false;
  });
}

// ── IMAGE DRAG BETWEEN SECTIONS ──
function imgDragStart(e, section, url) {
  AppModules.alojamentos.dragImgSrc = { section, url };
  AppModules.alojamentos.coverDragUrl = null;
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
  const imgs = AppModules.alojamentos.alojImagens[id] || {};

  if (AppModules.alojamentos.coverDragUrl) {
    if (!imgs[targetSection]) imgs[targetSection] = [];
    if (!imgs[targetSection].includes(AppModules.alojamentos.coverDragUrl)) imgs[targetSection].push(AppModules.alojamentos.coverDragUrl);
    AppModules.alojamentos.alojImagens[id] = imgs;
    AppModules.alojamentos.coverDragUrl = null;
    renderImagens();
    await saveImgSections(id, imgs);
    return;
  }

  if (!AppModules.alojamentos.dragImgSrc || AppModules.alojamentos.dragImgSrc.section === targetSection) {
    AppModules.alojamentos.dragImgSrc = null;
    return;
  }

  const { section: srcSection, url } = AppModules.alojamentos.dragImgSrc;
  AppModules.alojamentos.dragImgSrc = null;

  if (!imgs[srcSection]) return;
  imgs[srcSection] = imgs[srcSection].filter(u => u !== url);
  if (!imgs[targetSection]) imgs[targetSection] = [];
  imgs[targetSection].push(url);

  AppModules.alojamentos.alojImagens[id] = imgs;
  renderImagens();

  try {
    await fetch(`${AppModules.core.API_BASE}/api/accommodations/${id}/images`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imgs })
    });
  } catch (err) {
    AppModules.core.toast('❌ Erro ao mover imagem.', 'error');
  }
}

// ── SECTION MANAGEMENT ──
function renameImgSection(idx, newLabel) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = AppModules.alojamentos.alojImagens[id] || {};
  const sectionsBase = getImgSections(id);
  if (sectionsBase[idx]?.key === AppModules.alojamentos.COMMON_AREAS_SECTION.key) return;
  const sections = sectionsBase.map((s, i) =>
    i === idx ? { ...s, label: newLabel } : s
  );
  imgs._sections = sections;
  AppModules.alojamentos.alojImagens[id] = imgs;
  saveImgSections(id, imgs);
}

async function removeImgSection(idx) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const imgs = AppModules.alojamentos.alojImagens[id] || {};
  const sections = getImgSections(id);
  const sec = sections[idx];
  if (!sec) return;
  if (sec.key === AppModules.alojamentos.COMMON_AREAS_SECTION.key) return;

  const imgCount = (imgs[sec.key] || []).length;
  if (imgCount > 0 && !(await AppModules.core.confirmar(`A divisão "${sec.label}" tem ${imgCount} foto(s). Remover mesmo assim? As fotos serão eliminadas.`))) return;

  const prevImgs = JSON.parse(JSON.stringify(imgs));
  const newSections = sections.filter((_, i) => i !== idx);
  if (imgs[sec.key]) delete imgs[sec.key];
  imgs._sections = newSections;
  AppModules.alojamentos.alojImagens[id] = imgs;
  renderImagens();
  try {
    await saveImgSections(id, imgs);
  } catch {
    AppModules.alojamentos.alojImagens[id] = prevImgs;
    renderImagens();
  }
}

async function addImgSection() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const nameEl = document.getElementById('new-section-name');
  const name = (nameEl.value || '').trim();
  if (!name) { AppModules.core.toast('Escreve o nome da divisão.', 'error'); return; }

  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now().toString().slice(-4);

  const imgs = AppModules.alojamentos.alojImagens[id] || {};
  const prevImgs = JSON.parse(JSON.stringify(imgs));
  const sections = getImgSections(id);
  sections.push({ key, label: name });
  imgs._sections = sections;
  imgs[key] = [];
  AppModules.alojamentos.alojImagens[id] = imgs;
  nameEl.value = '';
  renderImagens();
  try {
    await saveImgSections(id, imgs);
  } catch {
    AppModules.alojamentos.alojImagens[id] = prevImgs;
    nameEl.value = name;
    renderImagens();
  }
}

async function saveImgSections(id, imgs) {
  try {
    await fetch(`${AppModules.core.API_BASE}/api/accommodations/${id}/images`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: imgs })
    });
  } catch (err) {
    AppModules.core.toast('❌ Erro ao guardar secções.', 'error');
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
  const files = Array.from(e.target.files);
  e.target.value = '';
  uploadImgFiles(files, section);
}

function handleImgDrop(e) {
  e.preventDefault();
  document.getElementById('img-dropzone').style.background = '';
  uploadImgFiles(Array.from(e.dataTransfer.files), 'outros');
}

// Valida, carrega os ficheiros bons e mostra junto da zona o que não seguiu.
async function uploadImgFiles(files, section) {
  const zone = document.getElementById('img-dropzone');
  const core = AppModules.core;
  const { ok, errors } = core.checkImageFiles(files);
  core.showUploadAlert(zone, errors);
  const results = await Promise.all(ok.map(f => processImgFile(f, section)));
  const all = [...errors, ...results.filter(Boolean)];
  if (all.length !== errors.length) core.showUploadAlert(zone, all);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Devolve uma mensagem de erro (com o nome do ficheiro) ou null se correu bem.
async function processImgFile(file, section) {
  const id = document.getElementById('aloj-editing-id').value;
  const sections = getImgSections(id);

  // If section key doesn't exist in current sections, use first available section key
  section = sections.find(s => s.key === section) ? section : (sections[sections.length - 1]?.key || 'outros');
  if (!id) return null;
  try {
    const res = await AppModules.core.apiPost(`/api/accommodations/${id}/images`, { section, image: await readFileAsDataUrl(file) });
    if (!res.success) return `${file.name} — erro ao guardar a imagem`;
    if (!AppModules.alojamentos.alojImagens[id]) AppModules.alojamentos.alojImagens[id] = {};
    const prevSections = AppModules.alojamentos.alojImagens[id]?._sections;
    AppModules.alojamentos.alojImagens[id] = { ...res.images };
    AppModules.alojamentos.alojImagens[id]._sections = prevSections
      || AppModules.alojamentos.alojImagens[id]._sections
      || AppModules.alojamentos.buildImageSections(AppModules.alojamentos.alojImagens[id], null, !!AppModules.alojamentos.currentAlojDetail?.parent_id);
    renderImagens();
    AppModules.core.toast('✅ Imagem guardada!', 'success');
    return null;
  } catch (err) {
    return `${file.name} — ${err?.payload?.error || 'erro ao guardar a imagem'}`;
  }
}

async function removeImg(sec, url) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  try {
    const res = await fetch(`${AppModules.core.API_BASE}/api/accommodations/${id}/images`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: sec, url })
    });
    const data = await res.json();
    if (data.success) {
      const prevSections = AppModules.alojamentos.alojImagens[id]?._sections;
      AppModules.alojamentos.alojImagens[id] = { ...data.images };
      AppModules.alojamentos.alojImagens[id]._sections = prevSections
        || AppModules.alojamentos.alojImagens[id]._sections
        || AppModules.alojamentos.buildImageSections(AppModules.alojamentos.alojImagens[id], null, !!AppModules.alojamentos.currentAlojDetail?.parent_id);
      renderImagens();
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro ao remover imagem.', 'error');
  }
}

async function uploadCoverImage(file) {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const zone = document.getElementById('aloj-cover-dropzone')?.closest('.aloj-cover-panel');
  const { ok, errors } = AppModules.core.checkImageFiles([file]);
  AppModules.core.showUploadAlert(zone, errors);
  if (!ok.length) return;
  try {
    const res = await AppModules.core.apiPost(`/api/accommodations/${id}/cover`, { image: await readFileAsDataUrl(file) });
    if (res.success) {
      const url = res.url.startsWith('http') ? res.url : AppModules.core.API_BASE + res.url;
      const preview = document.getElementById('aloj-cover-preview');
      const placeholder = document.getElementById('aloj-cover-placeholder');
      const deleteBtn = document.getElementById('aloj-cover-delete-btn');
      preview.src = url + '?t=' + Date.now();
      preview.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (deleteBtn) deleteBtn.style.display = '';
      setCoverFields(id, { cover_image: res.url, cover_focal: null, cover_crops: null, cover_size: res.cover_size || null });
      AppModules.core.toast('✅ Foto de capa guardada!', 'success');
      const w = res.cover_size?.w;
      if (w && w < SMALL_COVER_WIDTH) AppModules.core.toast(`⚠️ Fotografia pequena: a capa tem só ${w} px de largura e pode aparecer desfocada. Recomendamos pelo menos ${SMALL_COVER_WIDTH} px.`, 'info', 9000);
      // Capa nova: abre logo «Ajustar recortes» (tudo automático até mexer).
      AppModules.alojamentos.refreshCoverPreview?.();
      AppModules.alojamentos.openCoverCrops?.();
    }
  } catch (e) {
    AppModules.core.showUploadAlert(zone, [`${file.name} — ${e?.payload?.error || 'erro ao guardar a capa'}`]);
  }
}

// A capa mudou: o ponto principal e os recortes da anterior já não servem.
function setCoverFields(id, fields) {
  const acc = AppModules.core.accommodations.find(a => a.id === id);
  if (acc) Object.assign(acc, fields);
  if (AppModules.alojamentos.currentAlojDetail?.id === id) Object.assign(AppModules.alojamentos.currentAlojDetail, fields);
  renderCoverWarning();
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
    const res = await fetch(`${AppModules.core.API_BASE}/api/accommodations/${id}/cover`, {
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
    setCoverFields(id, { cover_image: null, cover_focal: null, cover_crops: null, cover_size: null });
    const cropsBtn = document.getElementById('aloj-cover-crops-btn');
    if (cropsBtn) cropsBtn.hidden = true;
    AppModules.core.toast('🗑 Foto de capa removida.', 'info');
  } catch (e) {
    AppModules.core.toast('❌ Erro ao remover capa.', 'error');
  }
}

// ── LOGÓTIPO (herdado pelas suites — só editável no alojamento principal) ──
function renderAlojLogoPreview(a) {
  const preview = document.getElementById('aloj-logo-preview');
  const placeholder = document.getElementById('aloj-logo-placeholder');
  const removeBtn = document.getElementById('aloj-logo-remove-btn');
  const uploadLabel = document.getElementById('aloj-logo-upload-label');
  const badge = document.getElementById('aloj-logo-inherited-badge');
  if (!preview) return;

  const hasParent = !!a?.parent_id;
  const logoUrl = a?.logo_url || '';
  if (logoUrl) {
    preview.src = (logoUrl.startsWith('http') ? logoUrl : AppModules.core.API_BASE + logoUrl) + '?t=' + Date.now();
    preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
  }
  // Só o alojamento principal pode carregar/remover — as suites só mostram (herdado).
  if (removeBtn) removeBtn.style.display = (!hasParent && logoUrl) ? '' : 'none';
  const cropBtn = document.getElementById('aloj-logo-crop-btn');
  if (cropBtn) cropBtn.style.display = (!hasParent && /^\/uploads\/[A-Za-z0-9_.-]+$/.test(a?.logo_original_url || logoUrl)) ? '' : 'none';
  if (uploadLabel) {
    uploadLabel.style.opacity = hasParent ? '.55' : '';
    uploadLabel.style.pointerEvents = hasParent ? 'none' : '';
  }
  if (badge) badge.style.display = hasParent ? '' : 'none';
}

async function uploadAlojLogo(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  const anchor = document.getElementById('aloj-logo-row');
  const { ok, errors } = AppModules.core.checkImageFiles([file]);
  AppModules.core.showUploadAlert(anchor, errors);
  if (!ok.length) return;
  try {
    const res = await AppModules.core.apiPost(`/api/accommodations/${id}/logo`, { image: await readFileAsDataUrl(file) });
    const acc = AppModules.core.accommodations.find(a => a.id === id);
    const fresh = { logo_url: res.url, logo_original_url: null, logo_crop: null, logo_square_crop: null };
    if (acc) Object.assign(acc, fresh);
    if (AppModules.alojamentos.currentAlojDetail) Object.assign(AppModules.alojamentos.currentAlojDetail, fresh);
    renderAlojLogoPreview({ ...(acc || {}), ...fresh });
    AppModules.core.renderSidebarBrand?.();
    AppModules.core.toast('✅ Logótipo guardado!', 'success');
  } catch (err) {
    AppModules.core.showUploadAlert(anchor, [`${file.name} — ${err?.payload?.error || 'erro ao guardar o logótipo'}`]);
  }
}

async function removeAlojLogo() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  try {
    await AppModules.core.apiDelete(`/api/accommodations/${id}/logo`);
    const acc = AppModules.core.accommodations.find(a => a.id === id);
    const cleared = { logo_url: null, logo_original_url: null, logo_crop: null, logo_square_crop: null };
    if (acc) Object.assign(acc, cleared);
    if (AppModules.alojamentos.currentAlojDetail) Object.assign(AppModules.alojamentos.currentAlojDetail, cleared);
    renderAlojLogoPreview({ ...(acc || {}), ...cleared });
    AppModules.core.renderSidebarBrand?.();
    AppModules.core.toast('🗑 Logótipo removido.', 'info');
  } catch (err) {
    AppModules.core.toast('❌ ' + (err?.payload?.error || 'Erro ao remover logótipo.'), 'error');
  }
}

function coverDragStart(event) {
  const preview = document.getElementById('aloj-cover-preview');
  const src = preview?.src ? preview.src.split('?')[0] : '';
  if (!src) return;
  AppModules.alojamentos.coverDragUrl = src.replace(AppModules.core.API_BASE, '');
  AppModules.alojamentos.dragImgSrc = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ section: '__cover__', url: AppModules.alojamentos.coverDragUrl }));
  event.currentTarget.style.opacity = '0.55';
}

function coverDragEnd(event) {
  AppModules.alojamentos.coverDragUrl = null;
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
    await uploadCoverImage(event.dataTransfer.files[0]);
    return;
  }

  const url = AppModules.alojamentos.dragImgSrc?.url || AppModules.alojamentos.coverDragUrl;
  if (!url) return;
  if (AppModules.alojamentos.dragImgSrc?.section === '__cover__') return;

  try {
    await setCoverFromUrl(id, url);
  } finally {
    AppModules.alojamentos.dragImgSrc = null;
    AppModules.alojamentos.coverDragUrl = null;
  }
}

// Define como capa uma foto já carregada (arrastada ou escolhida na galeria).
async function setCoverFromUrl(id, url) {
  try {
    const res = await AppModules.core.apiPost(`/api/accommodations/${id}/cover`, { url });
    if (!res.success) throw new Error();
    const preview = document.getElementById('aloj-cover-preview');
    const placeholder = document.getElementById('aloj-cover-placeholder');
    const deleteBtn = document.getElementById('aloj-cover-delete-btn');
    if (preview) {
      preview.src = `${AppModules.core.API_BASE}${url}?t=${Date.now()}`;
      preview.style.display = 'block';
      preview.setAttribute('draggable', 'true');
    }
    if (placeholder) placeholder.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = '';
    setCoverFields(id, { cover_image: url, cover_focal: null, cover_crops: null, cover_size: res.cover_size || null });
    AppModules.alojamentos.refreshCoverPreview?.();
    AppModules.core.toast('✅ Capa atualizada.', 'success');
    return true;
  } catch (e) {
    AppModules.core.toast('❌ Erro ao atualizar capa.', 'error');
    return false;
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

AppActions.register({
  "galeria-trigger-img-upload-dc59c9c": (el, event, args) => { triggerImgUpload(args[0]) },
  "galeria-open-image-lightbox-c42eaa8": (el, event, args) => { openImageLightbox((String(args[0]) + String(args[1]))) },
  "galeria-remove-img-f163082": (el, event, args) => { removeImg(args[0],args[1]) },
  "galeria-usar-da-galeria": () => { openCoverPicker() },
}, "click");

AppActions.register({
  "galeria-prevent-default-e179d9b": (el, event, args) => { event.preventDefault();el.classList.add('drag-over') },
}, "dragover");

AppActions.register({
  "galeria-remove-1227cde": (el, event, args) => { el.classList.remove('drag-over') },
}, "dragleave");

AppActions.register({
  "galeria-img-drop-in-section-c2bc56f": (el, event, args) => { imgDropInSection(event,(String(args[0]))) },
}, "drop");

AppActions.register({
  "galeria-img-drag-start-db472bd": (el, event, args) => { imgDragStart(event,(String(args[0])),(String(args[1]))) },
}, "dragstart");

AppActions.register({
  "galeria-img-drag-end-f9de7ac": (el, event, args) => { imgDragEnd(event) },
}, "dragend");

AppActions.register({
  "galeria-remove-img-section-f515826": (el, event, args) => { removeImgSection(args[0]) },
}, "click");

AppActions.register({
  "galeria-rename-img-section-ffac3ed": (el, event, args) => { renameImgSection(args[0], el.value) },
}, "change");

})();
