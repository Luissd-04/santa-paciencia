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
    populateSupplierFilter();
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

// Popula o filtro de fornecedores a partir da lista carregada, preservando a seleção.
function populateSupplierFilter() {
  const sel = document.getElementById('despesa-filter-supplier');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos os fornecedores</option>' +
    suppliersData.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
  if ([...sel.options].some(o => o.value === current)) sel.value = current;
  AppUI.enhanceSelects(document.getElementById('view-despesas'));
  AppUI.refreshSelect(sel);
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
  // Filtros client-side por categoria e fornecedor
  const fcat = document.getElementById('despesa-filter-category')?.value || '';
  const fsup = document.getElementById('despesa-filter-supplier')?.value || '';
  const filtered = despesasData.filter(d =>
    (!fcat || d.category === fcat) &&
    (!fsup || (d.supplier || '') === fsup)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.innerHTML = `
      <div class="es-icon">🔍</div>
      <h3>Sem despesas para estes filtros</h3>
      <p>Nenhuma despesa corresponde à categoria/fornecedor selecionados neste período.</p>`;
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const total = filtered.reduce((s, d) => s + Number(d.amount), 0);

  tbody.innerHTML = filtered.map(d => {
    const cat = EXPENSE_CATS[d.category] || EXPENSE_CATS.outro;
    return `<tr>
      <td style="font-size:13px;">${formatDate(d.date)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:600;background:${cat.color}22;color:${cat.color};">${cat.icon ? `<i data-lucide="${cat.icon}" style="width:11px;height:11px;"></i>` : ''}${cat.label}</span></td>
      <td>${escapeHtml(d.description)}${d.notes ? `<br><span style="font-size:11px;color:var(--cinza);">${escapeHtml(d.notes)}</span>` : ''}</td>
      <td style="font-size:12.5px;">${escapeHtml(d.supplier || '—')}</td>
      <td style="font-size:12px;color:var(--cinza);">${escapeHtml(d.invoice_ref || '—')}${d.receipt_image ? ` <a href="${escapeHtml(d.receipt_image)}" target="_blank" title="Ver talão" style="color:var(--marca);text-decoration:none;">${lcIcon('paperclip',12)}</a>` : ''}</td>
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

// ══════════════════════════════════════
//  LEITURA DE TALÕES POR IA
// ══════════════════════════════════════
let _receiptImage = null;   // data URI da foto (comprimida)
let _receiptLines = [];      // [{ description, category, amount }]

const RECEIPT_CATS = [
  ['limpeza', 'Limpeza'], ['produtos_limpeza', 'Produtos de limpeza'],
  ['pequenos_almocos', 'Pequenos-almoços'], ['roupas', 'Roupas'],
  ['manutencao', 'Manutenção'], ['marketing', 'Marketing'], ['impostos', 'Impostos'],
  ['servicos', 'Serviços'], ['consumiveis', 'Consumíveis'], ['outro', 'Outro'],
];

// Redimensiona/comprime a foto no browser antes de enviar.
// 2560px + qualidade 0.9 aproveita a visão de alta resolução do modelo (lê melhor
// talões pequenos/amarrotados); continua barato porque comprime para JPEG.
function _compressImage(file, maxDim = 2560, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// As câmaras Apple gravam por defeito em HEIC, que a maioria dos browsers (fora o
// Safari) não decodifica num <img> — e a API de visão também não o aceita. Detetamos
// HEIC e convertemos para JPEG no browser antes de comprimir/enviar.
function _isHeic(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('heic') || t.includes('heif')) return true;
  return /\.(heic|heif)$/i.test(file.name || '');
}

let _heic2anyPromise = null;
function _loadHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (_heic2anyPromise) return _heic2anyPromise;
  _heic2anyPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.integrity = 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL';
    s.crossOrigin = 'anonymous';
    s.onload = () => window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any indisponível'));
    s.onerror = () => reject(new Error('Falha ao carregar o conversor HEIC'));
    document.head.appendChild(s);
  });
  return _heic2anyPromise;
}

// Devolve um ficheiro/blob que o browser consegue decodificar (converte HEIC → JPEG).
async function _ensureSupportedImage(file) {
  if (!_isHeic(file)) return file;
  const heic2any = await _loadHeic2any();
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

async function onReceiptSelected(input) {
  const file = input.files && input.files[0];
  input.value = ''; // permite reescolher a mesma foto
  if (!file) return;
  if (!(file.type || '').startsWith('image/') && !_isHeic(file)) { toast('Escolhe uma imagem.', 'error'); return; }

  _openReceiptModalLoading();
  let dataUri;
  try {
    const usable = await _ensureSupportedImage(file);
    dataUri = await _compressImage(usable);
  } catch (err) {
    console.error('Falha a preparar a imagem do talão:', err);
    _renderReceiptError(_isHeic(file)
      ? 'Não foi possível converter a foto HEIC. Tenta outra vez, ou muda a câmara para JPEG (Definições › Câmara › Formatos › "Mais compatível") e tira nova foto.'
      : 'Não foi possível ler a imagem. Tenta outra foto (JPEG ou PNG).');
    return;
  }
  _receiptImage = dataUri;
  try {
    const res = await apiPost('/api/expenses/scan-receipt', { image: dataUri });
    if (res.success) _renderReceiptReview(res.data);
    else _renderReceiptError(res.error || 'Erro ao ler o talão.');
  } catch (e) {
    _renderReceiptError(e?.payload?.error || 'Erro ao ler o talão. Verifica a ligação e a chave da API no servidor.');
  }
}

function _openReceiptModalLoading() {
  const el = document.getElementById('receipt-review-content');
  if (el) el.innerHTML = `<div style="text-align:center;padding:44px 20px;color:var(--cinza);">
    <i data-lucide="loader" style="width:26px;height:26px;"></i>
    <div style="margin-top:12px;font-size:14px;">A ler o talão com IA…</div>
    <div style="font-size:12px;margin-top:4px;">Pode demorar alguns segundos.</div></div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';
  AppUI.openModal('receipt-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function _renderReceiptError(msg) {
  const el = document.getElementById('receipt-review-content');
  if (el) el.innerHTML = `<div style="text-align:center;padding:32px 20px;">
    <div style="font-size:34px;">📷</div>
    <h3 style="margin:8px 0;">Não deu para ler o talão</h3>
    <p style="color:var(--cinza);font-size:13px;">${escapeHtml(msg)}</p>
    <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="closeReceiptModal();setTimeout(()=>document.getElementById('receipt-file-input').click(),350)">Tentar outra foto</button>
  </div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = 'none';
}

function _renderReceiptReview(data) {
  _receiptLines = (data.items || []).map(i => ({ description: i.description, category: i.category, amount: i.amount }));
  const today = new Date().toISOString().slice(0, 10);
  const dateVal = data.date || today;
  const el = document.getElementById('receipt-review-content');
  el.innerHTML = `
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;">
      <img src="${_receiptImage}" alt="talão" style="width:84px;height:108px;object-fit:cover;border-radius:8px;border:1px solid var(--cinza-claro);cursor:zoom-in;" onclick="window.open('${_receiptImage}','_blank')">
      <div class="form-grid" style="flex:1;min-width:260px;">
        <div class="form-group"><label class="form-label">Data</label><input class="form-control" id="rl-date" type="date" value="${dateVal}"></div>
        <div class="form-group"><label class="form-label">Fornecedor</label><input class="form-control" id="rl-supplier" list="rl-supplier-list" value="${escapeHtml(data.supplier || '')}" placeholder="Fornecedor" autocomplete="off"><datalist id="rl-supplier-list">${(suppliersData || []).map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Nº Fatura</label><input class="form-control" id="rl-invoice" value="${escapeHtml(data.invoice_ref || '')}" placeholder="Nº fatura" autocomplete="off"></div>
        <div class="form-group"><label class="form-label">Pagamento</label><select class="form-control" id="rl-payment">
          <option value="numerário">Numerário</option><option value="transferencia">Transferência</option>
          <option value="mbway">MBWay</option><option value="cartao" selected>Cartão</option></select></div>
      </div>
    </div>
    <div style="font-size:12.5px;color:var(--cinza);margin-bottom:8px;">
      ${lcIcon('info', 13)} A IA lê o talão mas pode enganar-se — <b>confere os valores e categorias</b> antes de guardar.
    </div>
    <div class="table-wrap" style="max-height:320px;overflow:auto;">
      <table class="tabela" style="font-size:13px;">
        <thead><tr><th>Artigo</th><th style="width:160px;">Categoria</th><th style="width:100px;text-align:right;">Valor (€)</th><th style="width:38px;"></th></tr></thead>
        <tbody id="receipt-lines-body"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
      <button class="btn btn-ghost btn-sm" onclick="addReceiptLine()">${lcIcon('plus', 13)} Adicionar linha</button>
      <div style="font-weight:700;">Total: <span id="rl-total">€0.00</span></div>
    </div>`;
  const saveBtn = document.getElementById('receipt-save-btn');
  if (saveBtn) saveBtn.style.display = '';
  _renderReceiptLines();
  AppUI.openModal('receipt-modal-bg');
  if (window.lucide) lucide.createIcons();
}

function _receiptLineRow(line, idx) {
  const opts = RECEIPT_CATS.map(([v, l]) => `<option value="${v}"${v === line.category ? ' selected' : ''}>${l}</option>`).join('');
  return `<tr>
    <td><input class="form-control" data-rl="desc" value="${escapeHtml(line.description || '')}" placeholder="Artigo" autocomplete="off"></td>
    <td><select class="form-control" data-rl="cat">${opts}</select></td>
    <td><input class="form-control no-number-spin" data-rl="amount" type="number" step="0.01" min="0" value="${line.amount}" style="text-align:right;"></td>
    <td><button class="btn btn-sm" onclick="removeReceiptLine(${idx})" title="Remover linha" style="background:rgba(176,48,48,.1);color:var(--vermelho);">${lcIcon('trash-2', 13)}</button></td>
  </tr>`;
}

function _renderReceiptLines() {
  const tbody = document.getElementById('receipt-lines-body');
  if (!tbody) return;
  tbody.innerHTML = _receiptLines.length
    ? _receiptLines.map((l, i) => _receiptLineRow(l, i)).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:16px;">Sem linhas — adiciona uma.</td></tr>`;
  tbody.querySelectorAll('[data-rl="amount"]').forEach(inp => { inp.oninput = _updateReceiptTotal; });
  _updateReceiptTotal();
  if (window.lucide) lucide.createIcons();
}

function _updateReceiptTotal() {
  let total = 0;
  document.querySelectorAll('#receipt-lines-body [data-rl="amount"]').forEach(i => { total += parseFloat(i.value) || 0; });
  const el = document.getElementById('rl-total');
  if (el) el.textContent = '€' + total.toFixed(2);
}

function _syncReceiptLinesFromDom() {
  const rows = document.querySelectorAll('#receipt-lines-body tr');
  const collected = [...rows]
    .filter(tr => tr.querySelector('[data-rl="desc"]'))
    .map(tr => ({
      description: tr.querySelector('[data-rl="desc"]').value.trim(),
      category: tr.querySelector('[data-rl="cat"]').value,
      amount: parseFloat(tr.querySelector('[data-rl="amount"]').value) || 0,
    }));
  if (collected.length || !rows.length) _receiptLines = collected;
}

function addReceiptLine() {
  _syncReceiptLinesFromDom();
  _receiptLines.push({ description: '', category: 'outro', amount: 0 });
  _renderReceiptLines();
}

function removeReceiptLine(idx) {
  _syncReceiptLinesFromDom();
  _receiptLines.splice(idx, 1);
  _renderReceiptLines();
}

function closeReceiptModal() {
  const bg = document.getElementById('receipt-modal-bg');
  const modal = bg.querySelector('.modal');
  modal.classList.add('modal-closing');
  setTimeout(() => { AppUI.closeModal(bg); modal.classList.remove('modal-closing'); }, 320);
  _receiptImage = null;
  _receiptLines = [];
}

async function saveReceiptExpenses() {
  _syncReceiptLinesFromDom();
  const date    = document.getElementById('rl-date')?.value;
  const supplier = (document.getElementById('rl-supplier')?.value || '').trim();
  const invoice  = (document.getElementById('rl-invoice')?.value || '').trim();
  const payment  = document.getElementById('rl-payment')?.value || 'numerário';
  if (!date) { toast('Indica a data do talão.', 'error'); return; }
  const valid = _receiptLines.filter(l => l.description && l.amount > 0);
  if (!valid.length) { toast('Não há linhas válidas para guardar.', 'error'); return; }
  const expenses = valid.map(l => ({
    date, description: l.description, category: l.category, amount: l.amount,
    supplier, invoice_ref: invoice, payment_method: payment,
  }));
  const btn = document.getElementById('receipt-save-btn');
  AppUI.setButtonLoading(btn, true);
  try {
    const res = await apiPost('/api/expenses/bulk', { image: _receiptImage, expenses });
    if (res.success) {
      toast(`✅ ${res.count} despesa${res.count !== 1 ? 's' : ''} guardada${res.count !== 1 ? 's' : ''}.`, 'success');
      closeReceiptModal();
      await loadDespesas();
    } else {
      toast('❌ ' + (res.error || 'Erro ao guardar.'), 'error');
    }
  } catch (e) {
    toast('❌ ' + (e?.payload?.error || 'Erro ao guardar as despesas.'), 'error');
  } finally {
    AppUI.setButtonLoading(btn, false);
  }
}
