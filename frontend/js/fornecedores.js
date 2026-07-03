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

async function editFornecedor(id) {
  const f = fornecedoresData.find(x => x.id === id);
  if (!f) return;
  const name = prompt('Novo nome do fornecedor:', f.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === f.name) return;
  try {
    const res = await apiPut(`/api/suppliers/${id}`, { name: trimmed });
    if (res.success) {
      toast('✅ Fornecedor atualizado.', 'success');
      await loadFornecedores();
    } else {
      toast('❌ ' + (res.error || 'Erro ao atualizar.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || 'Erro de ligação ao servidor.'), 'error');
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
