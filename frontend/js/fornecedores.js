// Estado privado; interface partilhada em AppModules.definicoes.
(() => {
AppModules.define('definicoes', {
  addFornecedor: { get: () => addFornecedor },
  loadFornecedores: { get: () => loadFornecedores },
  seedFornecedores: { get: () => seedFornecedores },
});

// Gestão de fornecedores (separador Definições > Fornecedores).
let fornecedoresData = [];

const FORNECEDORES_SUGERIDOS = [
  'Continente', 'Intermarché', 'Lidl', 'Pingo Doce', 'Padeiro Baldio',
  'Padaria Ideal', 'Mó de Cima', 'Máxima-Amenities', 'Pato Rico',
  'Zara Home', 'Leroy Merlin', 'Action', 'Espaço Casa',
];

async function loadFornecedores() {
  try {
    const data = await AppModules.core.apiGet('/api/suppliers');
    fornecedoresData = data.data || [];
    renderFornecedores();
  } catch (e) {
    AppModules.core.toast('❌ Erro ao carregar fornecedores.', 'error');
  }
}

function renderFornecedores() {
  const wrap = document.getElementById('fornecedores-list');
  if (!wrap) return;
  if (!fornecedoresData.length) {
    wrap.innerHTML = `<div style="text-align:center;color:var(--cinza);padding:24px 12px;font-size:13.5px;">
      Ainda não tens fornecedores. Adiciona um acima, ou clica em <b>Adicionar sugestões</b>.
    </div>`;
    return;
  }
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">${
    fornecedoresData.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border:1px solid var(--cinza-claro);border-radius:8px;">
        <span style="font-size:13.5px;">${AppModules.core.escapeHtml(f.name)}</span>
        <span style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" ${AppActions.attrs("click", "fornecedores-edit-fornecedor-66880c2", [String((f.id) ?? '')])} title="Editar">${AppModules.core.lcIcon('pencil', 13)}</button>
          <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho);" ${AppActions.attrs("click", "fornecedores-delete-fornecedor-9553e58", [String((f.id) ?? '')])} title="Remover">${AppModules.core.lcIcon('trash-2', 13)}</button>
        </span>
      </div>`).join('')
  }</div>`;
  if (window.lucide) lucide.createIcons();
}

async function addFornecedor() {
  const input = document.getElementById('fornecedor-novo-nome');
  const name = (input?.value || '').trim();
  if (!name) { AppModules.core.toast('Escreve o nome do fornecedor.', 'error'); return; }
  try {
    const res = await AppModules.core.apiPost('/api/suppliers', { name });
    if (res.success) {
      if (input) input.value = '';
      AppModules.core.toast('✅ Fornecedor adicionado.', 'success');
      await loadFornecedores();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao adicionar.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação ao servidor.'), 'error');
  }
}

function editFornecedor(id) {
  const f = fornecedoresData.find(x => x.id === id);
  if (!f) return;
  AppUI.openDialog({
    id: 'fornecedor-edit-form',
    title: 'Editar fornecedor',
    body: `
      <div class="form-group">
        <label class="form-label" for="fed-name">Nome</label>
        <input id="fed-name" class="form-control" type="text" value="${AppModules.core.escapeHtml(f.name)}" autocomplete="off">
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-dialog-close>Cancelar</button>
      <button type="button" class="btn btn-primary" id="fed-save-btn" ${AppActions.attrs("click", "fornecedores-save-fornecedor-edit-e532f73", [String((id) ?? '')])}>Guardar</button>`,
  });
  document.getElementById('fed-name')?.focus();
}

async function saveFornecedorEdit(id) {
  const f = fornecedoresData.find(x => x.id === id);
  const trimmed = (document.getElementById('fed-name')?.value || '').trim();
  if (!trimmed || trimmed === f?.name) { AppUI.closeDialog('fornecedor-edit-form'); return; }
  const btn = document.getElementById('fed-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await AppModules.core.apiPut(`/api/suppliers/${id}`, { name: trimmed });
    if (res.success) {
      AppUI.closeDialog('fornecedor-edit-form');
      AppModules.core.toast('✅ Fornecedor atualizado.', 'success');
      await loadFornecedores();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao atualizar.'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    AppModules.core.toast('❌ ' + (e?.payload?.error || 'Erro de ligação ao servidor.'), 'error');
    if (btn) btn.disabled = false;
  }
}

async function deleteFornecedor(id) {
  const f = fornecedoresData.find(x => x.id === id);
  if (!confirm(`Remover o fornecedor "${f?.name || id}"?\n\nAs despesas já registadas com este fornecedor mantêm o nome.`)) return;
  try {
    const res = await AppModules.core.apiDelete(`/api/suppliers/${id}`);
    if (res.success) {
      AppModules.core.toast('🗑 Fornecedor removido.', 'info');
      await loadFornecedores();
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function seedFornecedores() {
  try {
    const res = await AppModules.core.apiPost('/api/suppliers/seed', { names: FORNECEDORES_SUGERIDOS });
    if (res.success) {
      fornecedoresData = res.data || [];
      renderFornecedores();
      AppModules.core.toast(res.added > 0 ? `✅ ${res.added} fornecedor(es) adicionado(s).` : 'Já tinhas todas as sugestões.', res.added > 0 ? 'success' : 'info');
    } else {
      AppModules.core.toast('❌ ' + (res.error || 'Erro ao adicionar sugestões.'), 'error');
    }
  } catch (e) {
    AppModules.core.toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

AppActions.register({
  "fornecedores-save-fornecedor-edit-e532f73": (el, event, args) => { saveFornecedorEdit(args[0]) },
}, "click");

AppActions.register({
  "fornecedores-edit-fornecedor-66880c2": (el, event, args) => { editFornecedor(args[0]) },
  "fornecedores-delete-fornecedor-9553e58": (el, event, args) => { deleteFornecedor(args[0]) },
}, "click");

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('fornecedores.js', () => {
  fornecedoresData = [];
});

})();
