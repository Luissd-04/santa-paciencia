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
    preview.src = (logoUrl.startsWith('http') ? logoUrl : API_BASE + logoUrl) + '?t=' + Date.now();
    preview.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
  }
  // Só o alojamento principal pode carregar/remover — as suites só mostram (herdado).
  if (removeBtn) removeBtn.style.display = (!hasParent && logoUrl) ? '' : 'none';
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
  if (file.size > 5 * 1024 * 1024) { toast('Imagem demasiado grande (máx. 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const res = await apiPost(`/api/accommodations/${id}/logo`, { image: e.target.result });
      const acc = accommodations.find(a => a.id === id);
      if (acc) acc.logo_url = res.url;
      if (currentAlojDetail) currentAlojDetail.logo_url = res.url;
      renderAlojLogoPreview({ ...(acc || {}), logo_url: res.url });
      toast('✅ Logótipo guardado!', 'success');
    } catch (err) {
      toast('❌ ' + (err?.payload?.error || 'Erro ao guardar logótipo.'), 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function removeAlojLogo() {
  const id = document.getElementById('aloj-editing-id').value;
  if (!id) return;
  try {
    await apiDelete(`/api/accommodations/${id}/logo`);
    const acc = accommodations.find(a => a.id === id);
    if (acc) acc.logo_url = null;
    if (currentAlojDetail) currentAlojDetail.logo_url = null;
    renderAlojLogoPreview({ ...(acc || {}), logo_url: null });
    toast('🗑 Logótipo removido.', 'info');
  } catch (err) {
    toast('❌ ' + (err?.payload?.error || 'Erro ao remover logótipo.'), 'error');
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
