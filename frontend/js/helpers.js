// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  normalizeIsoDateValue: { get: () => normalizeIsoDateValue },
  formatDateForStandardInput: { get: () => formatDateForStandardInput },
  apiDelete: { get: () => apiDelete },
  apiGet: { get: () => apiGet },
  apiPost: { get: () => apiPost },
  apiPut: { get: () => apiPut },
  apiRequest: { get: () => apiRequest },
  appUpdateAvailable: { get: () => appUpdateAvailable },
  badgeEstado: { get: () => badgeEstado },
  badgePagamento: { get: () => badgePagamento },
  badgePrecheckin: { get: () => badgePrecheckin },
  cancelApiRequests: { get: () => cancelApiRequests },
  confirmPriceChange: { get: () => confirmPriceChange },
  escapeHtml: { get: () => escapeHtml },
  flagHtml: { get: () => flagHtml },
  formatDate: { get: () => formatDate },
  formatEUR: { get: () => formatEUR },
  hideOperationProgress: { get: () => hideOperationProgress },
  imageUrlToDataUrl: { get: () => imageUrlToDataUrl },
  lcIcon: { get: () => lcIcon },
  realEmail: { get: () => realEmail },
  mediaThumb: { get: () => mediaThumb },
  putReservationConfirmingTotal: { get: () => putReservationConfirmingTotal },
  safeMediaUrl: { get: () => safeMediaUrl },
  showOperationProgress: { get: () => showOperationProgress },
  toast: { get: () => toast },
  updateOperationProgress: { get: () => updateOperationProgress },
});

const activeApiRequests = new Set();
function cancelApiRequests() {
  activeApiRequests.forEach(controller => controller.abort());
  activeApiRequests.clear();
}
// ── API ──
async function apiRequest(path, options = {}, config = {}) {
  // O separador que faz o pedido (live.js): as suas alterações não lhe recarregam o ecrã.
  const headers = { ...(AppModules.core.liveClientId ? { 'X-Client-Id': AppModules.core.liveClientId } : {}), ...(options.headers || {}) };
  const request = {
    credentials: 'include',
    ...options,
    headers
  };

  const controller = new AbortController();
  activeApiRequests.add(controller);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, config.timeoutMs || 30000);
  try {
    const res = await fetch(AppModules.core.API_BASE + path, { ...request, signal: controller.signal });
    noteAppBuild(res.headers?.get?.('X-App-Build'));
    let payload = null;
    try { payload = await res.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      if (res.ok) throw new Error('O servidor devolveu uma resposta inválida.');
    }
    controller.signal.throwIfAborted();

    if (res.status === 401 && !config.skipAuthRedirect && typeof AppModules.core.handleUnauthorized === 'function') {
      AppModules.core.handleUnauthorized();
    }
    if (!res.ok) {
      const err = new Error(payload?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    activeApiRequests.delete(controller);
    options.signal?.removeEventListener('abort', abort);
  }
}

// ── Nova versão publicada durante a sessão ──
// O servidor envia a impressão digital do frontend em cada resposta. Se mudar,
// esta página tem o núcleo antigo em memória e os módulos que ainda faltam já
// seriam da versão nova: avisa e, ao abrir uma secção ainda não carregada,
// recarrega em vez de misturar versões (ver ensureFeature em features.js).
let appBuild = null;
let appUpdateAvailable = false;
function noteAppBuild(value) {
  if (!value) return;
  if (!appBuild) { appBuild = value; return; }
  if (value === appBuild || appUpdateAvailable) return;
  appUpdateAvailable = true;
  showAppUpdateBanner();
}
function showAppUpdateBanner() {
  if (document.getElementById('app-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'app-update-banner';
  banner.className = 'app-update-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<span>Está disponível uma versão nova da aplicação.</span> <button type="button" class="btn btn-primary btn-sm">Recarregar</button>';
  banner.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(banner);
}

async function apiGet(path, config) {
  return apiRequest(path, {}, config);
}

async function apiPost(path, body, config) {
  return apiRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, config);
}

async function apiPut(path, body, config) {
  return apiRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, config);
}

async function apiDelete(path, config, body) {
  return apiRequest(path, { method: 'DELETE', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }, config);
}

// ── Confirmação de alteração de valores da estadia ──
// Mostra o padrão do calendário dinâmico vs o novo valor, e avisa se a reserva
// já tinha sido editada manualmente. Devolve Promise<boolean>.
function confirmPriceChange({ standardTotal, newTotal, editedAt = null, editedByName = null,
  title = 'Alterar valores da estadia?', intro = 'O novo valor difere do preço padrão do calendário dinâmico.',
  standardLabel = 'Padrão (calendário dinâmico)' }) {
  return new Promise(resolve => {
    const fmt = v => `${ReservationMoney.format(v)}`;
    const diff = Number(newTotal) - Number(standardTotal);
    const esc = escapeHtml;
    const reference = standardLabel === 'Padrão (calendário dinâmico)' ? 'ao padrão' : 'ao total atual';
    const diffLine = Math.abs(diff) > 0.005
      ? (diff < 0
        ? `<span style="color:#0f9d58;font-weight:600;">Desconto de ${fmt(Math.abs(diff))} face ${reference}</span>`
        : `<span style="color:#e8710a;font-weight:600;">Acréscimo de ${fmt(diff)} face ${reference}</span>`)
      : '';
    const editedWarn = editedAt ? `
      <div style="background:#fdf3e2;border:1px solid #f0d9a8;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#8a6d1d;">
        ⚠️ Esta reserva já foi editada manualmente em ${new Date(editedAt).toLocaleDateString('pt-PT')}${editedByName ? ` por ${editedByName}` : ''}.
      </div>` : '';

    let confirmed = false;
    const overlay = AppUI.openDialog({
      title: esc(title),
      body: `
        <p>${esc(intro)}</p>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px;">
          <div style="display:flex;justify-content:space-between;color:var(--cinza);">
            <span>${esc(standardLabel)}</span><span style="font-size:12.5px;">${fmt(standardTotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--azul);">
            <span>Novo total</span><span>${fmt(newTotal)}</span>
          </div>
          ${diffLine ? `<div style="font-size:12.5px;">${diffLine}</div>` : ''}
        </div>
        ${editedWarn}`,
      footer: `
        <button type="button" class="btn btn-ghost" data-pc-cancel data-dialog-close>Cancelar</button>
        <button type="button" class="btn btn-primary" data-pc-confirm>Confirmar alteração</button>`,
      onClose: () => resolve(confirmed),
    });
    overlay.querySelector('[data-pc-confirm]').onclick = () => { confirmed = true; AppUI.closeDialog(overlay); };
  });
}

// Alterações à reserva fora do assistente (arrastar no calendário, adicionar
// hóspede). Numa reserva com o preço editado à mão (ou com voucher que deixa
// de valer) o servidor não recalcula o total sem confirmação: mostra o total
// atual e o novo e grava com o total confirmado. Devolve null se cancelar.
const TOTAL_CONFIRMATION_CODES = new Set(['total_confirmation', 'voucher_min_nights', 'voucher_accommodation']);
async function putReservationConfirmingTotal(id, body, currentTotal) {
  try {
    return await apiPut(`/api/reservations/${id}`, body);
  } catch (error) {
    const payload = error?.payload;
    if (error?.status !== 409 || !TOTAL_CONFIRMATION_CODES.has(payload?.code) || payload?.details?.total_amount == null) throw error;
    const ok = await confirmPriceChange({
      title: 'Confirmar o novo total?', intro: payload.error,
      standardLabel: 'Total atual', standardTotal: Number(currentTotal) || 0, newTotal: payload.details.total_amount,
    });
    if (!ok) return null;
    return apiPut(`/api/reservations/${id}`, { ...body, total_amount: payload.details.total_amount });
  }
}

// Returns the email only if it's a real one (not an internal placeholder)
function realEmail(e) {
  if (!e) return null;
  return /@(reserva|sem-email)\.local$/i.test(e) ? null : e;
}

// Descarrega uma imagem (mesma origem, com cookies) e devolve como data URL —
// usado para embutir imagens (capas, logótipo) em PDFs gerados no cliente.
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

// ── FORMAT ──
function formatDate(s) {
  return window.ReservationDates?.formatShortPtDate(s) || '—';
}

// Rótulos e classes em js/domain/reservation-status.js (iguais em todos os ecrãs).
function badgeEstado(e) {
  const S = window.ReservationStatus;
  return `<span class="badge ${S.badge(e)}">${escapeHtml(S.label(e))}</span>`;
}

function badgePagamento(p) {
  const S = window.ReservationStatus;
  return `<span class="badge ${S.paymentBadge(p)}">${escapeHtml(S.paymentLabel(p))}</span>`;
}

function badgePrecheckin(p) {
  const S = window.ReservationStatus;
  return `<span class="badge ${S.precheckinBadge(p)}">${escapeHtml(S.precheckinLabel(p))}</span>`;
}

function toast(msg, type = 'info', dur = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(60px)';
    t.style.transition = 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, dur);
}

function lcIcon(name, size = 14) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
}

function showOperationProgress(title = 'A processar...', detail = 'A preparar...', percent = 5) {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  wrap.hidden = false;
  updateOperationProgress(percent, detail, title);
}

function updateOperationProgress(percent = 0, detail = '', title = '') {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const titleEl = document.getElementById('operation-progress-title');
  const percentEl = document.getElementById('operation-progress-percent');
  const detailEl = document.getElementById('operation-progress-detail');
  const bar = document.getElementById('operation-progress-bar');
  if (title && titleEl) titleEl.textContent = title;
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (detailEl) detailEl.textContent = detail || '';
  if (bar) bar.style.width = `${pct}%`;
}

function hideOperationProgress(delay = 450) {
  const wrap = document.getElementById('operation-progress');
  if (!wrap) return;
  setTimeout(() => {
    wrap.hidden = true;
    updateOperationProgress(0, 'A preparar...');
  }, delay);
}

async function runWithOperationProgress(title, steps, work) {
  showOperationProgress(title, steps?.[0]?.detail || 'A preparar...', steps?.[0]?.percent || 5);
  try {
    const setProgress = (percent, detail) => updateOperationProgress(percent, detail, title);
    const result = await work(setProgress);
    updateOperationProgress(100, 'Concluído.', title);
    return result;
  } finally {
    hideOperationProgress();
  }
}


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

// URLs colocados em atributos ou estilos têm um contexto diferente de texto
// HTML. Aceitamos apenas recursos HTTP(S) e caminhos da própria aplicação;
// a função de escape continua a ser necessária ao inserir o resultado num
// template literal.
function safeMediaUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const base = globalThis.location?.origin || 'http://localhost';
    const parsed = new URL(raw, base);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.href;
  } catch {
    return '';
  }
}

// Pede ao servidor uma miniatura (`?w=`) em vez da foto original, que pode
// ter vários MB. Só para fotos carregadas na própria aplicação; URLs externos
// e de outras origens ficam como estão.
function mediaThumb(value, width) {
  const safe = safeMediaUrl(value);
  if (!safe) return '';
  try {
    const origin = globalThis.location?.origin || 'http://localhost';
    const parsed = new URL(safe, origin);
    if (parsed.origin !== origin || !/^\/uploads\/[^/]+$/.test(parsed.pathname)) return safe;
    parsed.searchParams.set('w', String(width));
    return safe.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.href;
  } catch {
    return safe;
  }
}

// Um argumento de evento HTML precisa de duas codificações: literal JavaScript
// e atributo HTML. escapeHtml, por si só, não protege as aspas após o parsing.
function inlineArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

// Montante em euros, no formato de js/domain/money.js («1 234,56 €»).
function formatEUR(value) {
  return ReservationMoney.format(value || 0);
}

/* ═══════════════════════════════════════════════════════════════
   Bandeiras de país — SVG via flag-icons (css/vendor/flag-icons.min.css).
   Substitui os emoji de bandeira (regional indicators), que o Windows
   não desenha (mostra "PT", "GB"...). Recebe um código ISO 3166-1
   alpha-2; devolve um <span class="fi fi-xx"> ou um globo de fallback.
   NOTA: não funciona dentro de <option> (elemento nativo, sem HTML) —
   aí mantém-se o emoji.
═══════════════════════════════════════════════════════════════ */
function flagHtml(code, opts = {}) {
  const size = opts.size || 20;
  const extra = opts.className ? ' ' + opts.className : '';
  const cc = String(code || '').trim().toLowerCase();
  const h = Math.round(size * 0.75);
  if (!/^[a-z]{2}$/.test(cc)) {
    return `<span class="flag-fallback${extra}" role="img" aria-label="País desconhecido" title="${opts.title || ''}" style="width:${size}px;height:${h}px;font-size:${Math.round(size * 0.7)}px;">🌐</span>`;
  }
  const label = opts.title || cc.toUpperCase();
  return `<span class="fi fi-${cc}${extra}" role="img" aria-label="${label}" title="${label}" style="width:${size}px;height:${h}px;"></span>`;
}

// type=date exige ISO; as máscaras de texto usam formatPtDate separadamente.
function normalizeIsoDateValue(value) {
  return window.ReservationDates?.normalizeIsoDate(value) || '';
}
function formatDateForStandardInput(value) {
  return normalizeIsoDateValue(value);
}

})();
