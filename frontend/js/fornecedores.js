// Gestão de fornecedores (separador Definições > Fornecedores).
let fornecedoresData = [];

const FORNECEDORES_SUGERIDOS = [
  'Continente', 'Intermarché', 'Lidl', 'Pingo Doce', 'Padeiro Baldio',
  'Padaria Ideal', 'Mó de Cima', 'Máxima-Amenities', 'Pato Rico',
  'Zara Home', 'Leroy Merlin', 'Action', 'Espaço Casa',
];

async function loadFornecedores() {
  try {
    const data = await apiGet('/api/suppliers');
    fornecedoresData = data.data || [];
    renderFornecedores();
  } catch (e) {
    toast('❌ Erro ao carregar fornecedores.', 'error');
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
        <span style="font-size:13.5px;">${escapeHtml(f.name)}</span>
        <span style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" onclick="editFornecedor('${f.id}')" title="Editar">${lcIcon('pencil', 13)}</button>
          <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho);" onclick="deleteFornecedor('${f.id}')" title="Remover">${lcIcon('trash-2', 13)}</button>
        </span>
      </div>`).join('')
  }</div>`;
  if (window.lucide) lucide.createIcons();
}

async function addFornecedor() {
  const input = document.getElementById('fornecedor-novo-nome');
  const name = (input?.value || '').trim();
  if (!name) { toast('Escreve o nome do fornecedor.', 'error'); return; }
  try {
    const res = await apiPost('/api/suppliers', { name });
    if (res.success) {
      if (input) input.value = '';
      toast('✅ Fornecedor adicionado.', 'success');
      await loadFornecedores();
    } else {
      toast('❌ ' + (res.error || 'Erro ao adicionar.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || 'Erro de ligação ao servidor.'), 'error');
  }
}

function editFornecedor(id) {
  const f = fornecedoresData.find(x => x.id === id);
  if (!f) return;
  const html = `
    <div id="fornecedor-edit-form" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
      <div style="background:var(--surface-card);border-radius:16px;padding:24px;width:min(360px,92vw);box-shadow:0 8px 40px rgba(0,0,0,.22);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <span style="font-size:15px;font-weight:700;color:var(--text-main);">Editar Fornecedor</span>
          <button onclick="document.getElementById('fornecedor-edit-form').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">×</button>
        </div>
        <label style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px;">Nome</label>
        <input id="fed-name" type="text" value="${escapeHtml(f.name)}" style="width:100%;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:14px;background:var(--surface-muted);color:var(--text-main);" autocomplete="off">
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end;">
          <button onclick="document.getElementById('fornecedor-edit-form').remove()" style="padding:8px 16px;border:1px solid var(--border-soft);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="fed-save-btn" onclick="saveFornecedorEdit('${id}')" style="padding:8px 18px;border:none;border-radius:8px;background:var(--brand-shell);color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('fed-name')?.focus();
}

async function saveFornecedorEdit(id) {
  const f = fornecedoresData.find(x => x.id === id);
  const trimmed = (document.getElementById('fed-name')?.value || '').trim();
  if (!trimmed || trimmed === f?.name) { document.getElementById('fornecedor-edit-form')?.remove(); return; }
  const btn = document.getElementById('fed-save-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await apiPut(`/api/suppliers/${id}`, { name: trimmed });
    if (res.success) {
      document.getElementById('fornecedor-edit-form')?.remove();
      toast('✅ Fornecedor atualizado.', 'success');
      await loadFornecedores();
    } else {
      toast('❌ ' + (res.error || 'Erro ao atualizar.'), 'error');
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || 'Erro de ligação ao servidor.'), 'error');
    if (btn) btn.disabled = false;
  }
}

async function deleteFornecedor(id) {
  const f = fornecedoresData.find(x => x.id === id);
  if (!confirm(`Remover o fornecedor "${f?.name || id}"?\n\nAs despesas já registadas com este fornecedor mantêm o nome.`)) return;
  try {
    const res = await apiDelete(`/api/suppliers/${id}`);
    if (res.success) {
      toast('🗑 Fornecedor removido.', 'info');
      await loadFornecedores();
    } else {
      toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

async function seedFornecedores() {
  try {
    const res = await apiPost('/api/suppliers/seed', { names: FORNECEDORES_SUGERIDOS });
    if (res.success) {
      fornecedoresData = res.data || [];
      renderFornecedores();
      toast(res.added > 0 ? `✅ ${res.added} fornecedor(es) adicionado(s).` : 'Já tinhas todas as sugestões.', res.added > 0 ? 'success' : 'info');
    } else {
      toast('❌ ' + (res.error || 'Erro ao adicionar sugestões.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}
