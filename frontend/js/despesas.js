let despesasData = [];
let despesaEditId = null;
let despesaFilterMonth = SS.get('desp:month', new Date().toISOString().slice(0, 7));

const EXPENSE_CATS = {
  limpeza:          { label: 'Limpeza',             color: '#4a90d9', icon: 'brush-cleaning' },
  produtos_limpeza: { label: 'Produtos de limpeza', color: '#3498db', icon: 'spray-can'      },
  pequenos_almocos: { label: 'Pequenos-almoços',    color: '#e8a33d', icon: 'croissant'      },
  roupas:           { label: 'Roupas',              color: '#8e6bb0', icon: 'shirt'          },
  manutencao:       { label: 'Manutenção',          color: '#e67e22', icon: 'wrench'         },
  marketing:        { label: 'Marketing',           color: '#9b59b6', icon: 'megaphone'      },
  impostos:         { label: 'Impostos',            color: '#e74c3c', icon: 'landmark'       },
  servicos:         { label: 'Serviços',            color: '#2ecc71', icon: 'briefcase'      },
  consumiveis:      { label: 'Consumíveis',         color: '#f39c12', icon: 'package'        },
  // Legado (removido do seletor, mantido para render de despesas antigas):
  supermercado:     { label: 'Supermercado',        color: '#27ae60', icon: 'shopping-cart' },
  outro:            { label: 'Outro',               color: '#95a5a6', icon: 'circle-dot'     },
};

let suppliersData = [];

// ── LOAD ──
async function loadDespesas() {
  document.getElementById('despesas-loading').style.display = 'flex';
  document.getElementById('despesas-body').innerHTML = '';
  document.getElementById('despesas-empty').style.display = 'none';

  const monthInput = document.getElementById('despesa-filter-month');
  if (monthInput) {
    if (!monthInput.value) monthInput.value = despesaFilterMonth;
    despesaFilterMonth = monthInput.value;
    SS.set('desp:month', despesaFilterMonth);
  }

  const period = document.getElementById('despesa-filter-period')?.value || 'ano';
  let listUrl = '/api/expenses';
  if (period === 'mes')      listUrl += `?month=${despesaFilterMonth}`;
  else if (period === 'ano') listUrl += `?year=${new Date().getFullYear()}`;
  // 'tudo' => sem filtro

  try {
    const [data, summary, suppliers] = await Promise.all([
      apiGet(listUrl),
      apiGet('/api/expenses/summary'),
      apiGet('/api/suppliers').catch(() => ({ data: [] }))
    ]);
    despesasData = data.data || [];
    suppliersData = suppliers.data || [];
    renderDespesasKpi(summary.data || {});
    renderDespesas();
  } catch (e) {
    toast('❌ Erro ao carregar despesas.', 'error');
    document.getElementById('despesas-loading').style.display = 'none';
  }
}

function renderDespesasKpi(s) {
  const grid = document.getElementById('despesas-kpi-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="kpi-card" style="border-color:var(--vermelho);">
      <div class="kpi-label">Este mês</div>
      <div class="kpi-value" style="color:var(--vermelho);">€${Number(s.monthTotal||0).toFixed(2)}</div>
      <div class="kpi-sub">${despesaFilterMonth}</div>
    </div>
    <div class="kpi-card" style="border-color:var(--laranja);">
      <div class="kpi-label">Este ano</div>
      <div class="kpi-value" style="color:var(--laranja);">€${Number(s.yearTotal||0).toFixed(2)}</div>
      <div class="kpi-sub">${new Date().getFullYear()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total acumulado</div>
      <div class="kpi-value">€${Number(s.allTotal||0).toFixed(2)}</div>
      <div class="kpi-sub">todas as despesas</div>
    </div>
    <div class="kpi-card" style="border-color:var(--roxo);">
      <div class="kpi-label">Maior categoria (ano)</div>
      <div class="kpi-value" style="font-size:18px;padding-top:4px;">
        ${s.byCategory && s.byCategory[0] ? (EXPENSE_CATS[s.byCategory[0].category]?.label || s.byCategory[0].category) : '—'}
      </div>
      <div class="kpi-sub">${s.byCategory && s.byCategory[0] ? '€' + Number(s.byCategory[0].total).toFixed(2) : ''}</div>
    </div>`;
}

function renderDespesas() {
  const loading = document.getElementById('despesas-loading');
  const tbody   = document.getElementById('despesas-body');
  const empty   = document.getElementById('despesas-empty');
  loading.style.display = 'none';

  if (despesasData.length === 0) {
    tbody.innerHTML = '';
    const period = document.getElementById('despesa-filter-period')?.value || 'ano';
    const scope = period === 'mes' ? `em ${despesaFilterMonth}` : period === 'ano' ? `em ${new Date().getFullYear()}` : 'registadas';
    empty.innerHTML = `
      <div class="es-icon">💸</div>
      <h3>Sem despesas ${scope}</h3>
      <p>${period === 'tudo' ? 'Ainda não registaste nenhuma despesa.' : 'Experimenta mudar o período (ex.: <b>Tudo</b>) — as tuas despesas podem estar noutro mês/ano.'}</p>`;
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const total = despesasData.reduce((s, d) => s + Number(d.amount), 0);

  tbody.innerHTML = despesasData.map(d => {
    const cat = EXPENSE_CATS[d.category] || EXPENSE_CATS.outro;
    return `<tr>
      <td style="font-size:13px;">${formatDate(d.date)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:600;background:${cat.color}22;color:${cat.color};">${cat.icon ? `<i data-lucide="${cat.icon}" style="width:11px;height:11px;"></i>` : ''}${cat.label}</span></td>
      <td>${escapeHtml(d.description)}${d.notes ? `<br><span style="font-size:11px;color:var(--cinza);">${escapeHtml(d.notes)}</span>` : ''}</td>
      <td style="font-size:12.5px;">${escapeHtml(d.supplier || '—')}</td>
      <td style="font-size:12px;color:var(--cinza);">${escapeHtml(d.invoice_ref || '—')}</td>
      <td style="font-weight:600;color:var(--vermelho);">€${Number(d.amount).toFixed(2)}</td>
      <td style="font-size:12.5px;color:var(--cinza);">${escapeHtml(d.payment_method || '—')}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="openDespesaModal('${escapeHtml(d.id)}')" title="Editar">${lcIcon('pencil',13)}</button>
        <button class="btn btn-sm" style="background:rgba(176,48,48,.1);color:var(--vermelho);" onclick="deleteDespesa('${escapeHtml(d.id)}')" title="Remover">${lcIcon('trash-2',13)}</button>
      </td>
    </tr>`;
  }).join('') + `
    <tr style="border-top:2px solid var(--cinza-claro);">
      <td colspan="5" style="text-align:right;font-weight:600;color:var(--cinza);font-size:13px;">Total do período</td>
      <td style="font-weight:700;font-size:15px;color:var(--vermelho);">€${total.toFixed(2)}</td>
      <td colspan="2"></td>
    </tr>`;
  if (window.lucide) lucide.createIcons();
}

// Popula o dropdown de fornecedores no modal, garantindo que o valor atual
// (mesmo que já não exista na lista) fica disponível.
function populateSupplierDropdown(selected) {
  const sel = document.getElementById('despesa-supplier');
  if (!sel) return;
  const names = suppliersData.map(s => s.name);
  if (selected && !names.includes(selected)) names.unshift(selected);
  sel.innerHTML = '<option value="">— Nenhum —</option>' +
    names.map(n => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
  sel.value = selected || '';
}

// ── MODAL ──
function openDespesaModal(id) {
  despesaEditId = id || null;
  const d = id ? despesasData.find(x => x.id === id) : null;
  document.getElementById('despesa-modal-title').textContent = d ? 'Editar Despesa' : 'Nova Despesa';
  document.getElementById('despesa-date').value        = formatDateForStandardInput(d ? d.date : new Date().toISOString().slice(0, 10));
  document.getElementById('despesa-category').value    = d ? d.category    : 'limpeza';
  document.getElementById('despesa-description').value = d ? d.description : '';
  document.getElementById('despesa-amount').value      = d ? d.amount      : '';
  document.getElementById('despesa-payment').value     = d ? (d.payment_method || 'numerário') : 'numerário';
  document.getElementById('despesa-invoice-ref').value = d ? (d.invoice_ref || '') : '';
  document.getElementById('despesa-notes').value       = d ? (d.notes || '') : '';
  populateSupplierDropdown(d ? (d.supplier || '') : '');
  AppUI.enhanceSelects(document.getElementById('despesa-modal-bg'));
  AppUI.refreshDropdowns(document.getElementById('despesa-modal-bg'));
  AppUI.openModal('despesa-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function closeDespesaModal() {
  const bg = document.getElementById('despesa-modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); despesaEditId = null; }, 320);
}

async function saveDespesa() {
  const date        = normalizeIsoDateValue(document.getElementById('despesa-date').value);
  const category    = document.getElementById('despesa-category').value;
  const description = document.getElementById('despesa-description').value.trim();
  const amount      = parseFloat(document.getElementById('despesa-amount').value);
  const payment_method = document.getElementById('despesa-payment').value;
  const invoice_ref = document.getElementById('despesa-invoice-ref').value.trim() || null;
  const notes       = document.getElementById('despesa-notes').value.trim() || null;
  const supplier    = document.getElementById('despesa-supplier')?.value.trim() || null;

  if (!date || !description || isNaN(amount)) {
    toast('Preencha data, descrição e valor.', 'error'); return;
  }

  const body = { date, category, description, amount, payment_method, invoice_ref, notes, supplier };
  try {
    const res = despesaEditId
      ? await apiPut(`/api/expenses/${despesaEditId}`, body)
      : await apiPost('/api/expenses', body);
    if (res.success) {
      toast(despesaEditId ? '✅ Despesa atualizada!' : '✅ Despesa adicionada!', 'success');
      closeDespesaModal();
      await loadDespesas();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}

function exportDespesasXLSX() {
  if (!despesasData.length) { toast('Sem despesas para exportar.', 'error'); return; }
  if (typeof XLSX === 'undefined') { toast('Biblioteca XLSX não carregada.', 'error'); return; }
  const rows = despesasData.map(d => ({
    'Data':           formatDate(d.date),
    'Categoria':      EXPENSE_CATS[d.category]?.label || d.category,
    'Descrição':      d.description,
    'Fornecedor':     d.supplier || '',
    'Nº Fatura':      d.invoice_ref || '',
    'Valor (€)':      Number(d.amount).toFixed(2),
    'Método':         d.payment_method || '',
    'Notas':          d.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');
  XLSX.writeFile(wb, `despesas_${despesaFilterMonth || 'todas'}.xlsx`);
}

async function deleteDespesa(id) {
  const d = despesasData.find(x => x.id === id);
  if (!confirm(`Remover despesa "${d?.description || id}"?`)) return;
  try {
    const res = await apiDelete(`/api/expenses/${id}`);
    if (res.success) { toast('🗑 Despesa removida.', 'info'); await loadDespesas(); }
    else toast('❌ ' + (res.error || 'Erro ao remover.'), 'error');
  } catch (e) {
    toast('❌ Erro de ligação ao servidor.', 'error');
  }
}
