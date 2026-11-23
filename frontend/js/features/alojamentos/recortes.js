// «Ajustar recortes» da fotografia de capa e do logótipo (PENDENTES, ponto 15).
// O original nunca é alterado: guarda-se o ponto principal e, para os formatos
// afinados à mão, o retângulo de cada um (normalizado 0..1); o servidor recorta
// com sharp em cada pedido (`/uploads/<f>?crop=<formato>`). Recortador próprio,
// sem bibliotecas (CSP): arrastar o retângulo, cantos para redimensionar,
// toque para o ponto principal, setas do teclado para afinar.
(() => {
AppModules.define('alojamentos', {
  openCoverCrops: { get: () => openCoverCrops },
  openLogoCrops: { get: () => openLogoCrops },
  refreshCoverPreview: { get: () => refreshCoverPreview },
  rotateGalleryImage: { get: () => rotateGalleryImage },
});

const core = () => AppModules.core;
const C = () => window.ImageCrops;
const esc = value => core().escapeHtml(value);
const MIN_PX = 24;
let session = null;

function currentAccommodation() {
  const id = document.getElementById('aloj-editing-id')?.value;
  if (!id) return null;
  return core().accommodations.find(a => a.id === id) || (AppModules.alojamentos.currentAlojDetail?.id === id ? AppModules.alojamentos.currentAlojDetail : null);
}

function applyFields(id, fields) {
  for (const target of [core().accommodations.find(a => a.id === id), AppModules.alojamentos.currentAlojDetail?.id === id ? AppModules.alojamentos.currentAlojDetail : null]) {
    if (target) Object.assign(target, fields);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

// Rodar no browser só para pré-visualizar; quem roda o ficheiro é o servidor ao guardar.
async function rotatedSource(img, degrees) {
  if (!degrees) return { src: img.src, width: img.naturalWidth, height: img.naturalHeight };
  const swap = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return { src: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, blob: true };
}

// ── Recortador ────────────────────────────────────────────────────────────
// `ratio` (largura/altura em píxeis) ou null (livre); `onChange(rect)` ao
// mexer; `onFocal(point)` ao tocar fora do retângulo (só na capa).
function createStage(root, { onChange, onFocal, label }) {
  const state = { width: 1, height: 1, ratio: null, rect: { x: 0, y: 0, w: 1, h: 1 }, focal: null, outlines: [] };
  root.innerHTML = `<div class="rc-frame">
      <img class="rc-img" alt="" draggable="false">
      <div class="rc-outlines" aria-hidden="true"></div>
      <div class="rc-rect" tabindex="0" role="group">
        <span class="rc-tag" aria-hidden="true"></span>
        ${['nw', 'ne', 'sw', 'se'].map(c => `<span class="rc-handle rc-${c}" data-corner="${c}" aria-hidden="true"></span>`).join('')}
      </div>
      ${onFocal ? '<button type="button" class="rc-focal" aria-label="Ponto principal: use as setas para o mover"></button>' : ''}
    </div>`;
  const frame = root.querySelector('.rc-frame');
  const img = root.querySelector('.rc-img');
  const rectEl = root.querySelector('.rc-rect');
  const focalEl = root.querySelector('.rc-focal');
  const outlinesEl = root.querySelector('.rc-outlines');
  const pct = n => `${(n * 100).toFixed(3)}%`;

  function fitRect(r) {
    const { clamp } = C();
    let pw = Math.max(MIN_PX, r.w * state.width), ph = Math.max(MIN_PX, r.h * state.height);
    if (state.ratio) {
      // Mantém a proporção e cabe na imagem.
      ph = pw / state.ratio;
      if (pw > state.width) { pw = state.width; ph = pw / state.ratio; }
      if (ph > state.height) { ph = state.height; pw = ph * state.ratio; }
    } else {
      pw = Math.min(pw, state.width); ph = Math.min(ph, state.height);
    }
    const w = pw / state.width, h = ph / state.height;
    return { x: C().round(clamp(r.x, 0, 1 - w)), y: C().round(clamp(r.y, 0, 1 - h)), w: C().round(w), h: C().round(h) };
  }

  function draw() {
    const r = state.rect;
    Object.assign(rectEl.style, { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) });
    if (focalEl) {
      focalEl.hidden = !state.focal;
      if (state.focal) Object.assign(focalEl.style, { left: pct(state.focal.x), top: pct(state.focal.y) });
    }
    outlinesEl.innerHTML = state.outlines.map(o => `<span class="rc-outline" style="left:${pct(o.rect.x)};top:${pct(o.rect.y)};width:${pct(o.rect.w)};height:${pct(o.rect.h)}"><em>${esc(o.label)}</em></span>`).join('');
  }

  function point(event) {
    const box = img.getBoundingClientRect();
    return { x: C().clamp((event.clientX - box.left) / box.width, 0, 1), y: C().clamp((event.clientY - box.top) / box.height, 0, 1), box };
  }

  let drag = null;
  frame.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const p = point(event);
    const corner = event.target.closest('.rc-handle')?.dataset.corner;
    const onRect = event.target.closest('.rc-rect');
    const onFocalEl = event.target.closest('.rc-focal');
    drag = { mode: corner ? 'resize' : onFocalEl ? 'focal' : onRect ? 'move' : 'tap', corner, start: p, rect: { ...state.rect }, moved: false, id: event.pointerId };
    frame.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  frame.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const p = point(event);
    const dxPx = (p.x - drag.start.x) * p.box.width, dyPx = (p.y - drag.start.y) * p.box.height;
    if (!drag.moved && Math.hypot(dxPx, dyPx) < 4) return;
    drag.moved = true;
    if (drag.mode === 'focal' || (drag.mode === 'tap' && onFocal)) {
      state.focal = { x: C().round(p.x), y: C().round(p.y) };
      onFocal?.(state.focal);
      draw();
      return;
    }
    if (drag.mode === 'move') {
      state.rect = fitRect({ ...drag.rect, x: drag.rect.x + (p.x - drag.start.x), y: drag.rect.y + (p.y - drag.start.y) });
    } else if (drag.mode === 'resize') {
      const r = drag.rect;
      // Canto oposto fixo.
      const ax = drag.corner.includes('w') ? r.x + r.w : r.x;
      const ay = drag.corner.includes('n') ? r.y + r.h : r.y;
      let pw = Math.abs(p.x - ax) * state.width, ph = Math.abs(p.y - ay) * state.height;
      const maxW = (drag.corner.includes('w') ? ax : 1 - ax) * state.width;
      const maxH = (drag.corner.includes('n') ? ay : 1 - ay) * state.height;
      if (state.ratio) {
        pw = Math.max(pw, ph * state.ratio);
        pw = Math.min(pw, maxW, maxH * state.ratio);
        ph = pw / state.ratio;
      } else {
        pw = Math.min(pw, maxW); ph = Math.min(ph, maxH);
      }
      pw = Math.max(pw, MIN_PX); ph = Math.max(ph, state.ratio ? MIN_PX / state.ratio : MIN_PX);
      const w = pw / state.width, h = ph / state.height;
      state.rect = fitRect({ x: drag.corner.includes('w') ? ax - w : ax, y: drag.corner.includes('n') ? ay - h : ay, w, h });
    } else return;
    draw();
    onChange?.(state.rect);
  });
  const end = event => {
    if (!drag || event.pointerId !== drag.id) return;
    // Toque sem arrastar (dentro ou fora do retângulo): ponto principal.
    if (!drag.moved && onFocal && drag.mode !== 'resize') {
      state.focal = { x: C().round(drag.start.x), y: C().round(drag.start.y) };
      onFocal(state.focal);
      draw();
    }
    drag = null;
  };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);

  // Teclado: setas movem (1 %), Shift+setas redimensionam; no ponto principal, setas movem-no.
  rectEl.addEventListener('keydown', event => {
    const step = 0.01;
    const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const k = keys[event.key];
    if (!k) return;
    event.preventDefault();
    const r = state.rect;
    if (event.shiftKey) {
      // → e ↑ aumentam, ← e ↓ diminuem; sem proporção fixa, ←/→ mexem na
      // largura e ↑/↓ na altura.
      const d = step * 2;
      let w = r.w, h = r.h;
      if (state.ratio) w = Math.max(0.02, r.w + (k[0] || -k[1]) * d);
      else if (k[0]) w = Math.max(0.02, r.w + k[0] * d);
      else h = Math.max(0.02, r.h - k[1] * d);
      state.rect = fitRect({ x: r.x, y: r.y, w, h });
    } else {
      state.rect = fitRect({ ...r, x: r.x + k[0] * step, y: r.y + k[1] * step });
    }
    draw();
    onChange?.(state.rect);
  });
  focalEl?.addEventListener('keydown', event => {
    const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const k = keys[event.key];
    if (!k || !state.focal) return;
    event.preventDefault();
    state.focal = { x: C().round(C().clamp(state.focal.x + k[0] * 0.01, 0, 1)), y: C().round(C().clamp(state.focal.y + k[1] * 0.01, 0, 1)) };
    onFocal(state.focal);
    draw();
  });

  return {
    setImage(src, width, height) {
      state.width = width; state.height = height;
      img.src = src;
      frame.style.aspectRatio = `${width} / ${height}`;
      frame.style.setProperty('--rc-ratio', String(width / height));
    },
    setRect(rect, ratio, tag) {
      state.ratio = ratio || null;
      state.rect = fitRect(rect);
      rectEl.querySelector('.rc-tag').textContent = tag || '';
      rectEl.setAttribute('aria-label', `${tag || label}: setas para mover, Shift e setas para redimensionar`);
      draw();
    },
    setFocal(focal) { state.focal = focal; draw(); },
    setOutlines(list) { state.outlines = list; draw(); },
    get rect() { return { ...state.rect }; },
    focusRect() { rectEl.focus({ preventScroll: true }); },
  };
}

// Pré-visualização de um retângulo numa caixa com a proporção do recorte.
function previewImg(src, rect) {
  const pct = n => `${(n * 100).toFixed(3)}%`;
  return `<img src="${esc(src)}" alt="" draggable="false" style="width:${pct(1 / rect.w)};height:${pct(1 / rect.h)};left:${pct(-rect.x / rect.w)};top:${pct(-rect.y / rect.h)}">`;
}

function openWindow({ id, title, icon, body, footer, className }) {
  const dialog = AppUI.openDialog({ id, title, body, footer, className: `rc-dialog ${className}`, onClose: () => {
    if (session?.source?.blob) URL.revokeObjectURL(session.source.src);
    session = null;
  } });
  if (document.documentElement.dataset.look) {
    dialog.classList.add('v2-janela');
    dialog.querySelector('.modal-header')?.insertAdjacentHTML('afterbegin', `<span class="v2-bigic is-info" aria-hidden="true">${core().lcIcon(icon, 22)}</span>`);
    if (window.lucide) lucide.createIcons();
  }
  return dialog;
}

// ── Capa ──────────────────────────────────────────────────────────────────
async function openCoverCrops() {
  const a = currentAccommodation();
  if (!a?.cover_image || !/^\/uploads\/[A-Za-z0-9_.-]+$/.test(a.cover_image)) {
    core().toast('Só as fotografias carregadas na aplicação podem ser recortadas.', 'info');
    return;
  }
  let original;
  try { original = await loadImage((core().API_BASE || '') + a.cover_image); } catch (e) { core().toast(`❌ ${e.message}`, 'error'); return; }
  const formats = C().COVER_FORMATS;
  const saved = C().parse(a.cover_crops) || {};
  session = {
    kind: 'cover', id: a.id, original, rotate: 0,
    focal: C().parse(a.cover_focal),
    crops: Object.fromEntries(Object.entries(saved).filter(([f, r]) => formats[f] && C().validRect(r))),
    selected: 'square',
  };
  session.source = await rotatedSource(original, 0);

  const cards = Object.entries(formats).map(([key, f]) => `
    <button type="button" class="rc-card" data-format="${key}" aria-pressed="false">
      <span class="rc-prev" style="aspect-ratio:${f.ratio}"></span>
      <span class="rc-card-copy"><b>${esc(f.label)}</b><small>${esc(f.usage)}</small><em class="rc-state"></em></span>
    </button>`).join('');
  const dialog = openWindow({
    id: 'rc-capa',
    title: 'Ajustar recortes',
    icon: 'crop',
    className: 'rc-cover',
    body: `<div class="rc-layout">
        <section class="rc-left" aria-label="Fotografia original">
          <div class="rc-head"><h4>Fotografia de capa</h4><span>1 · Toque no ponto principal</span></div>
          <div class="rc-stage"></div>
          <div class="rc-tools">
            <button type="button" class="btn btn-ghost btn-sm" data-rc="rodar">${core().lcIcon('rotate-cw', 14)} Rodar 90°</button>
            <button type="button" class="btn btn-ghost btn-sm" data-rc="repor">Repor automático</button>
            <span class="rc-hint">Arraste o retângulo para mover; cantos para redimensionar. No teclado: setas e Shift+setas.</span>
          </div>
        </section>
        <section class="rc-right" aria-label="Formatos">
          <span class="rc-step">2 · Veja como fica em cada sítio (toque para afinar)</span>
          <div class="rc-cards">${cards}</div>
        </section>
      </div>
      <p class="rc-error" role="alert" hidden></p>`,
    footer: `<button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-rc="guardar">Guardar recortes</button>`,
  });

  const stage = createStage(dialog.querySelector('.rc-stage'), {
    label: 'Recorte',
    onChange: rect => { session.crops[session.selected] = rect; renderCover(dialog, stage, false); },
    onFocal: focal => { session.focal = focal; renderCover(dialog, stage, true); },
  });
  stage.setImage(session.source.src, session.source.width, session.source.height);
  dialog.querySelector('.rc-cards').addEventListener('click', event => {
    const card = event.target.closest('[data-format]');
    if (!card) return;
    session.selected = card.dataset.format;
    renderCover(dialog, stage, true);
    stage.focusRect();
  });
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-rc]')?.dataset.rc;
    if (action === 'rodar') rotateCover(dialog, stage);
    else if (action === 'repor') { delete session.crops[session.selected]; renderCover(dialog, stage, true); }
    else if (action === 'guardar') saveCover(dialog);
  });
  renderCover(dialog, stage, true);
}

function coverRect(format) {
  const s = session;
  return s.crops[format] || C().autoCrop(C().COVER_FORMATS[format].ratio, s.source.width, s.source.height, s.focal);
}

function renderCover(dialog, stage, resetStage) {
  const formats = C().COVER_FORMATS;
  const selected = session.selected;
  if (resetStage) stage.setRect(coverRect(selected), formats[selected].ratio, `${formats[selected].label} (a editar)`);
  stage.setFocal(session.focal || { x: 0.5, y: 0.5 });
  // A faixa aparece tracejada por baixo do formato a editar, como na maqueta.
  stage.setOutlines(Object.keys(formats).filter(f => f !== selected && (f === 'banner' || session.crops[f])).map(f => ({ rect: coverRect(f), label: formats[f].label.split(' ')[0] })));
  dialog.querySelectorAll('.rc-card').forEach(card => {
    const f = card.dataset.format;
    const manual = Boolean(session.crops[f]);
    card.setAttribute('aria-pressed', String(f === selected));
    card.classList.toggle('is-active', f === selected);
    card.querySelector('.rc-prev').innerHTML = previewImg(session.source.src, coverRect(f));
    card.querySelector('.rc-state').textContent = `${f === selected ? 'A editar · ' : ''}${manual ? 'ajustado à mão' : 'automático'}`;
  });
}

async function rotateCover(dialog, stage) {
  session.rotate = (session.rotate + 90) % 360;
  if (session.source.blob) URL.revokeObjectURL(session.source.src);
  session.source = await rotatedSource(session.original, session.rotate);
  session.focal = C().rotateFocal(session.focal);
  // As proporções mudam com a imagem rodada: os formatos voltam ao automático.
  session.crops = {};
  stage.setImage(session.source.src, session.source.width, session.source.height);
  renderCover(dialog, stage, true);
}

async function saveCover(dialog) {
  const button = dialog.querySelector('[data-rc="guardar"]');
  const error = dialog.querySelector('.rc-error');
  error.hidden = true;
  button.disabled = true;
  try {
    const res = await core().apiPut(`/api/accommodations/${encodeURIComponent(session.id)}/cover/crops`, {
      focal: session.focal, crops: session.crops, rotate: session.rotate,
    });
    if (!res?.success) throw Object.assign(new Error(res?.error || 'Não foi possível guardar.'), { payload: res });
    const id = session.id;
    applyFields(id, { cover_image: res.cover_image, cover_focal: res.cover_focal, cover_crops: res.cover_crops, cover_size: res.cover_size });
    AppUI.closeDialog(dialog);
    refreshCoverPreview();
    refreshViews();
    core().toast('✅ Recortes guardados.', 'success');
  } catch (e) {
    error.textContent = e?.payload?.error || e.message || 'Não foi possível guardar os recortes.';
    error.hidden = false;
    button.disabled = false;
  }
}

// Miniatura da capa na ficha (quadrado 1:1) e o botão «Ajustar recortes».
function refreshCoverPreview() {
  const a = currentAccommodation();
  const preview = document.getElementById('aloj-cover-preview');
  const button = document.getElementById('aloj-cover-crops-btn');
  if (preview && a?.cover_image) {
    preview.src = core().coverSrc(a, 'square', 160);
    preview.style.display = 'block';
  }
  if (button) button.hidden = !(a?.cover_image && /^\/uploads\/[A-Za-z0-9_.-]+$/.test(a.cover_image));
  if (a?.cover_image) AppModules.alojamentos.refreshConfigV2Cover?.(a);
}

function refreshViews() {
  if (typeof AppModules.alojamentos.renderAlojamentos === 'function') AppModules.alojamentos.renderAlojamentos();
  AppModules.alojamentos.refreshConfigV2Cover?.(currentAccommodation());
  AppModules.core.renderSidebarBrand?.();
}

// ── Logótipo ──────────────────────────────────────────────────────────────
// Sem argumento: o logótipo do alojamento aberto. Com `target`, outro dono do
// logótipo com os mesmos recortes (a organização, na Área do proprietário):
// { id, endpoint (…/logo, com /trim e /crops), fields (logo_*), name, onSaved(dados) }.
async function openLogoCrops(target = null) {
  const owner = target && typeof target === 'object' && target.endpoint ? target : null;
  const a = owner ? owner.fields || {} : currentAccommodation();
  if (!a || (!owner && a.parent_id)) return;
  const originalUrl = a.logo_original_url || a.logo_url;
  if (!originalUrl || !/^\/uploads\/[A-Za-z0-9_.-]+$/.test(originalUrl)) {
    core().toast('Carregue primeiro um logótipo.', 'info');
    return;
  }
  let original;
  try { original = await loadImage((core().API_BASE || '') + originalUrl); } catch (e) { core().toast(`❌ ${e.message}`, 'error'); return; }
  const width = original.naturalWidth, height = original.naturalHeight;
  const crop = C().parse(a.logo_crop);
  const square = C().parse(a.logo_square_crop);
  session = {
    kind: 'logo', id: owner ? owner.id : a.id, source: { src: original.src, width, height },
    endpoint: owner ? owner.endpoint : `/api/accommodations/${encodeURIComponent(a.id)}/logo`,
    onSaved: owner?.onSaved || null,
    crop: C().validRect(crop) ? crop : { x: 0, y: 0, w: 1, h: 1 },
    square: C().validRect(square) ? square : null,
    useSquare: C().validRect(square),
    selected: 'logo',
  };
  const name = (owner?.name || core().currentUser?.organization_name || a.name || '').trim();
  const dialog = openWindow({
    id: 'rc-logo',
    title: 'Ajustar logótipo',
    icon: 'crop',
    className: 'rc-logo',
    body: `<div class="rc-layout">
        <section class="rc-left" aria-label="Logótipo original">
          <div class="rc-seg" role="radiogroup" aria-label="Recorte a editar">
            <button type="button" role="radio" data-sel="logo" aria-checked="true">Logótipo</button>
            <button type="button" role="radio" data-sel="mark" aria-checked="false">Quadrado (barra recolhida)</button>
          </div>
          <div class="rc-stage rc-stage-logo"></div>
          <div class="rc-tools">
            <button type="button" class="btn btn-ghost btn-sm" data-rc="trim">${core().lcIcon('scissors', 14)} Cortar margens automaticamente</button>
            <button type="button" class="btn btn-ghost btn-sm" data-rc="repor">Repor</button>
          </div>
          <label class="rc-check"><input type="checkbox" data-rc-square ${session.useSquare ? 'checked' : ''}> Usar um recorte quadrado na barra recolhida <small>(sem ele, aparecem as iniciais)</small></label>
        </section>
        <section class="rc-right" aria-label="Pré-visualização">
          <span class="rc-step">Como fica</span>
          <div class="rc-ctx">
            <figure class="rc-ctx-email"><div class="rc-mail"><span class="rc-logo-box"></span><i></i><i></i><i class="short"></i></div><figcaption>Email ao hóspede</figcaption></figure>
            <figure class="rc-ctx-pdf"><div class="rc-paper"><span class="rc-logo-box"></span><span class="rc-paper-lines"><i></i><i class="short"></i></span></div><figcaption>PDF (cabeçalho)</figcaption></figure>
            <figure class="rc-ctx-side"><div class="rc-side"><span class="rc-logo-box"></span><span class="rc-mini"></span></div><figcaption>Barra lateral · aberta e recolhida</figcaption></figure>
          </div>
        </section>
      </div>
      <p class="rc-error" role="alert" hidden></p>`,
    footer: `<button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-rc="guardar">Guardar recortes</button>`,
  });
  dialog.dataset.initials = name.split(/\s+/).filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const stage = createStage(dialog.querySelector('.rc-stage'), {
    label: 'Recorte do logótipo',
    onChange: rect => {
      if (session.selected === 'mark') { session.square = rect; session.useSquare = true; dialog.querySelector('[data-rc-square]').checked = true; }
      else session.crop = rect;
      renderLogo(dialog, stage, false);
    },
  });
  stage.setImage(session.source.src, width, height);
  dialog.addEventListener('click', event => {
    const sel = event.target.closest('[data-sel]')?.dataset.sel;
    if (sel) { session.selected = sel; renderLogo(dialog, stage, true); stage.focusRect(); return; }
    const action = event.target.closest('[data-rc]')?.dataset.rc;
    if (action === 'trim') trimLogo(dialog, stage);
    else if (action === 'repor') {
      if (session.selected === 'mark') { session.square = null; session.useSquare = false; dialog.querySelector('[data-rc-square]').checked = false; }
      else session.crop = { x: 0, y: 0, w: 1, h: 1 };
      renderLogo(dialog, stage, true);
    } else if (action === 'guardar') saveLogo(dialog);
  });
  dialog.querySelector('[data-rc-square]').addEventListener('change', event => {
    session.useSquare = event.target.checked;
    if (session.useSquare) session.selected = 'mark';
    renderLogo(dialog, stage, true);
  });
  renderLogo(dialog, stage, true);
}

function squareRect() {
  const s = session;
  if (s.square) return s.square;
  // Por omissão, um quadrado com o lado menor do logótipo já sem margens,
  // ao centro (num logótipo largo, a parte do meio); afina-se arrastando.
  const c = s.crop;
  const side = Math.min(c.w * s.source.width, c.h * s.source.height);
  const w = side / s.source.width, h = side / s.source.height;
  return { x: C().clamp(c.x + c.w / 2 - w / 2, 0, 1 - w), y: C().clamp(c.y + c.h / 2 - h / 2, 0, 1 - h), w, h };
}

function renderLogo(dialog, stage, resetStage) {
  const markSelected = session.selected === 'mark';
  dialog.querySelectorAll('[data-sel]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.sel === session.selected)));
  if (resetStage) stage.setRect(markSelected ? squareRect() : session.crop, markSelected ? 1 : null, markSelected ? 'Quadrado' : 'Logótipo');
  stage.setOutlines(markSelected ? [{ rect: session.crop, label: 'Logótipo' }] : (session.useSquare ? [{ rect: squareRect(), label: 'Quadrado' }] : []));
  const c = session.crop;
  const aspect = (c.w * session.source.width) / (c.h * session.source.height);
  dialog.querySelectorAll('.rc-logo-box').forEach(box => {
    box.style.aspectRatio = String(aspect);
    box.innerHTML = previewImg(session.source.src, c);
  });
  const mini = dialog.querySelector('.rc-mini');
  mini.innerHTML = session.useSquare ? previewImg(session.source.src, squareRect()) : `<b>${esc(dialog.dataset.initials)}</b>`;
}

async function trimLogo(dialog, stage) {
  const button = dialog.querySelector('[data-rc="trim"]');
  button.disabled = true;
  try {
    const reply = await core().apiPost(`${session.endpoint}/trim`, {});
    if (!reply?.success) throw new Error(reply?.error || 'Não foi possível detetar as margens.');
    // A rota da organização devolve { data }; a dos alojamentos, os campos soltos.
    const res = reply.data || reply;
    session.crop = res.crop;
    session.selected = 'logo';
    renderLogo(dialog, stage, true);
    const whole = res.crop.w > 0.995 && res.crop.h > 0.995;
    core().toast(whole ? 'Não há margens para cortar.' : '✂️ Margens detetadas. Confira e guarde.', 'info');
  } catch (e) {
    core().toast(`❌ ${e?.payload?.error || e.message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

async function saveLogo(dialog) {
  const button = dialog.querySelector('[data-rc="guardar"]');
  const error = dialog.querySelector('.rc-error');
  error.hidden = true;
  button.disabled = true;
  try {
    const reply = await core().apiPut(`${session.endpoint}/crops`, {
      crop: session.crop, square: session.useSquare ? squareRect() : null,
    });
    if (!reply?.success) throw Object.assign(new Error(reply?.error || 'Não foi possível guardar.'), { payload: reply });
    if (session.onSaved) {
      session.onSaved(reply.data);
      AppUI.closeDialog(dialog);
      core().toast('✅ Logótipo atualizado.', 'success');
      return;
    }
    const res = reply;
    const id = session.id;
    applyFields(id, { logo_url: res.logo_url, logo_original_url: res.logo_original_url, logo_crop: res.logo_crop, logo_square_crop: res.logo_square_crop });
    AppUI.closeDialog(dialog);
    AppModules.alojamentos.renderAlojLogoPreview?.(currentAccommodation());
    AppModules.core.renderSidebarBrand?.();
    core().toast('✅ Logótipo atualizado.', 'success');
  } catch (e) {
    error.textContent = e?.payload?.error || e.message || 'Não foi possível guardar o logótipo.';
    error.hidden = false;
    button.disabled = false;
  }
}

// ── Galeria: «Rodar 90°» ──────────────────────────────────────────────────
async function rotateGalleryImage(url, button) {
  const a = currentAccommodation();
  if (!a || !url) return;
  if (button) button.disabled = true;
  try {
    const res = await core().apiPost(`/api/accommodations/${encodeURIComponent(a.id)}/images/rotate`, { url, degrees: 90 });
    if (!res?.success) throw Object.assign(new Error(res?.error || 'Não foi possível rodar.'), { payload: res });
    const imgs = AppModules.alojamentos.alojImagens;
    const sections = imgs[a.id]?._sections;
    imgs[a.id] = { ...res.images, _sections: sections };
    applyFields(a.id, { images: res.images, cover_image: res.cover_image, cover_focal: res.cover_focal, cover_crops: res.cover_crops, cover_size: res.cover_size });
    AppModules.alojamentos.renderImagens();
    refreshCoverPreview();
    if (res.cover_image === res.url) refreshViews();
  } catch (e) {
    core().toast(`❌ ${e?.payload?.error || e.message}`, 'error');
    if (button) button.disabled = false;
  }
}

AppActions.register({
  'recortes-abrir-capa': (el, event) => { event.stopPropagation(); openCoverCrops(); },
  'recortes-abrir-logo': () => { openLogoCrops(); },
  'recortes-rodar-foto': (el, event, args) => { event.stopPropagation(); rotateGalleryImage(String(args[0]), el); },
}, 'click');
})();
