// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  apiGetAllPages: { get: () => apiGetAllPages },
  createPagedCollection: { get: () => createPagedCollection },
  createRangeCollection: { get: () => createRangeCollection },
  renderPagination: { get: () => renderPagination },
  resetPrivateLists: { get: () => resetPrivateLists },
  serverUpdateRequiredError: { get: () => serverUpdateRequiredError },
});

function serverUpdateRequiredError() {
  return Object.assign(new Error('A aplicação e o servidor estão em versões diferentes. Reinicia o servidor e recarrega a página.'), { code: 'API_UPDATE_REQUIRED' });
}

function validateListPage(result) {
  if (result?.success === true && Array.isArray(result.data) && !Object.hasOwn(result, 'pagination')) {
    throw serverUpdateRequiredError();
  }
  if (!Array.isArray(result?.data) || !result.pagination) throw new Error('Resposta de paginação inválida.');
  return result;
}

// Cada vista tem a sua coleção. As respostas antigas nunca substituem uma
// pesquisa nova; a mesma consulta em curso é partilhada pelos seus consumidores.
function createPagedCollection(url, onChange, pageSize = 50) {
  const state = { rows: [], total: 0, page: 1, limit: pageSize, pages: 0, summary: {}, loading: false, error: null };
  let generation = 0, controller = null, pending = null, pendingKey = '', loadedKey = '', queryKey = '', timer = null;
  function cancel() { generation++; controller?.abort(); controller = null; pending = null; pendingKey = ''; clearTimeout(timer); }
  function requestKey(query, page) { return new URLSearchParams({ ...query, page: String(page), limit: String(pageSize) }).toString(); }
  function load(query = {}, options = {}) {
    clearTimeout(timer);
    const nextQueryKey = new URLSearchParams(query).toString();
    const page = options.page || (queryKey === nextQueryKey ? state.page : 1);
    const key = requestKey(query, page);
    if (!options.force && key === pendingKey && pending) return pending;
    if (!options.force && key === loadedKey) { cancel(); queryKey = nextQueryKey; state.page = page; state.loading = false; state.error = null; onChange(state); return Promise.resolve(true); }
    cancel();
    queryKey = nextQueryKey;
    controller = new AbortController();
    const version = generation;
    state.page = page; state.loading = true; state.error = null;
    onChange(state);
    pendingKey = key;
    pending = (async () => {
      try {
        const result = await AppModules.core.apiRequest(url + '?' + key, { signal: controller.signal });
        if (version !== generation) return false;
        validateListPage(result);
        if (page > Math.max(1, result.pagination.pages)) {
          return load(query, { page: Math.max(1, result.pagination.pages), force: true });
        }
        state.rows = result.data;
        Object.assign(state, result.pagination);
        state.summary = result.summary || {};
        loadedKey = key;
        return true;
      } catch (error) {
        if (version === generation && !controller.signal.aborted) {
          state.error = error.name === 'AbortError' ? 'O servidor demorou demasiado a responder. Tenta novamente.' : error.message;
          state.rows = []; loadedKey = '';
        }
        return false;
      } finally {
        if (version === generation) { state.loading = false; pending = null; pendingKey = ''; onChange(state); }
      }
    })();
    return pending;
  }
  function schedule(query) {
    const nextQueryKey = new URLSearchParams(query).toString();
    if (nextQueryKey === queryKey) return load(query);
    cancel(); state.loading = true; state.error = null; onChange(state);
    timer = setTimeout(() => load(query), 180);
  }
  function reset() {
    cancel(); loadedKey = ''; queryKey = '';
    Object.assign(state, { rows: [], total: 0, page: 1, pages: 0, summary: {}, loading: false, error: null });
    onChange(state);
  }
  return { state, load, schedule, reset };
}

// Estilo único da barra de paginação, partilhado por todas as vistas
// (Reservas, Hóspedes, Eventos, Despesas, Mensagens): a classe é imposta
// aqui, não em cada fragmento HTML, para não haver duas versões a divergir.
function renderPagination(id, state, onPage) {
  const container = document.getElementById(id);
  if (!container) return;
  container.classList.add('list-pagination');
  const label = document.createElement('span');
  label.className = 'list-pagination-label';
  label.setAttribute('aria-live', 'polite');
  label.textContent = state.error || (state.loading ? 'A carregar…'
    : state.total ? `${(state.page - 1) * state.limit + 1}–${Math.min(state.page * state.limit, state.total)} de ${state.total} · Página ${state.page} de ${state.pages}` : '0 resultados');
  const button = (html, text, page, disabled) => {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'btn btn-ghost btn-sm'; element.innerHTML = html;
    element.disabled = disabled || state.loading || !!state.error;
    element.addEventListener('click', async () => {
      await onPage(page);
      if (window.matchMedia?.('(max-width: 600px)').matches && container.isConnected) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return element;
  };
  container.replaceChildren(
    button(`${AppModules.core.lcIcon('chevron-left', 13)} Anterior`, 'Anterior', state.page - 1, state.page <= 1),
    label,
    button(`Seguinte ${AppModules.core.lcIcon('chevron-right', 13)}`, 'Seguinte', state.page + 1, state.page >= state.pages),
  );
  if (state.error) {
    const retry = button(`${AppModules.core.lcIcon('refresh-cw', 13)} Tentar novamente`, 'Tentar novamente', state.page, false);
    retry.disabled = false;
    container.appendChild(retry);
  }
  if (window.lucide) lucide.createIcons();
}

// Exportações e intervalos completos percorrem as páginas sem truncar os dados.
async function apiGetAllPages(path, query = {}, options = {}) {
  const rows = [], seen = new Set();
  let expectedTotal;
  for (let page = 1; page <= 10000; page++) {
    const params = new URLSearchParams({ ...query, page: String(page), limit: '500' });
    const result = await AppModules.core.apiRequest(path + '?' + params, { signal: options.signal });
    options.signal?.throwIfAborted();
    validateListPage(result);
    if (!Array.isArray(result.data) || !result.pagination || result.pagination.page !== page
        || !Number.isInteger(result.pagination.total) || result.pagination.total < 0) throw new Error('Resposta de paginação inválida.');
    expectedTotal ??= result.pagination.total;
    if (result.pagination.total !== expectedTotal) throw new Error('Os dados mudaram durante o carregamento. Tenta novamente.');
    for (const row of result.data) {
      if (seen.has(row.id)) throw new Error('Os dados mudaram durante o carregamento. Tenta novamente.');
      seen.add(row.id); rows.push(row);
    }
    if (!result.pagination.has_more) {
      if (rows.length !== expectedTotal) throw new Error('O carregamento não recebeu todos os resultados. Tenta novamente.');
      return { ...result, data: rows };
    }
    if (!result.data.length) throw new Error('A exportação não recebeu todos os resultados. Tenta novamente.');
  }
  throw new Error('Demasiados resultados. Reduz o intervalo da pesquisa.');
}

// Calendários e agendas precisam do intervalo completo, com cancelamento
// independente e sem que uma resposta antiga substitua a seleção atual.
function createRangeCollection(path) {
  let generation = 0, controller = null, pending = null, pendingKey = '';
  const state = { rows: [], key: '', error: '', loading: false };
  function reset() {
    generation++;
    controller?.abort(); controller = null; pending = null; pendingKey = '';
    Object.assign(state, { rows: [], key: '', error: '', loading: false });
  }
  function load(query) {
    const key = JSON.stringify(query);
    if (key === pendingKey && pending) return pending;
    if (key === state.key) return Promise.resolve(true);
    reset();
    const version = generation;
    const requestController = controller = new AbortController();
    pendingKey = key; state.loading = true;
    pending = (async () => {
      try {
        const result = await apiGetAllPages(path, query, { signal: requestController.signal });
        if (version !== generation) return false;
        state.rows = result.data; state.key = key;
        return true;
      } catch (error) {
        if (version === generation && !requestController.signal.aborted) {
          state.error = error.code === 'API_UPDATE_REQUIRED' ? error.message
            : error.name === 'AbortError' ? 'O servidor demorou demasiado a responder.'
            : 'Não foi possível carregar os eventos.';
        }
        return false;
      } finally {
        if (version === generation) { state.loading = false; pending = null; pendingKey = ''; }
      }
    })();
    return pending;
  }
  return { state, load, reset };
}

function resetPrivateLists() {
  AppModules.core.cancelApiRequests?.();
  AppModules.reservas.clearReservaDraft?.();
  AppModules.resetPrivateState();
  document.querySelectorAll?.('.modal-bg input, .modal-bg textarea, .modal-bg [contenteditable="true"]').forEach(el => {
    if (el.matches('[contenteditable]')) el.textContent = '';
    else if (!['button', 'submit', 'checkbox', 'radio'].includes(el.type)) el.value = '';
  });
  document.querySelectorAll?.('iframe[srcdoc]').forEach(frame => { frame.srcdoc = ''; });
  for (const id of ['email-editor-panel', 'reserva-detail-content', 'invoice-thread-detail', 'invoice-archive-detail']) {
    document.getElementById(id)?.replaceChildren();
  }
  document.querySelectorAll?.('.modal-bg.open, .modal-bg.active').forEach(el => AppUI.closeModal(el));
}

})();
