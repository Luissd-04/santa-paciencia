// Documentos da reserva (ficha de reserva, conta corrente, ficha de hóspede e
// registo de fatura): os dados de cada um são montados uma só vez, aqui. A
// pré-visualização, o PDF (documentos/pdf.js) e o Excel (documentos/xlsx.js)
// desenham a partir do mesmo modelo, para dizerem sempre o mesmo.
//
// Modelo de um documento:
//   tipo, ficheiro, titulo, codigo, extra (texto ao lado do código),
//   emitidoEm (Date), emitidoPor, estado { texto, tom },
//   cabecalho { nome, marca, logo, linhas[] },
//   resumo [{ rotulo, valor (número em €), tom }]          — caixas no topo
//   blocos [{ titulo, linhas [{ texto, forte, tom }] }]       — Hóspede / Estadia
//   campos [{ rotulo, valor, tipo }]                          — os mesmos dados, em pares, para o Excel
//   tabelas [{ id, titulo, colunas [{ chave, rotulo, tipo, largura, so }],
//              linhas [{ c: { chave: valor }, tom }], vazio,
//              totais [{ id, rotulo, valor, tom, soma, formula }] }]
//   condicoes [{ rotulo, texto }], nota, folhas (Excel)
// Tipos de célula: 'texto', 'eur' (número), 'data' (AAAA-MM-DD), 'int'.
// Uma célula pode ser { v, f(endereco) } quando o Excel deve levar fórmula.
(() => {
AppModules.define('reservas', {
  docDados: { get: () => api },
});

const D = () => window.ReservationDates;
const core = () => AppModules.core;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const METODOS = { transferencia: 'Transferência', mbway: 'MB WAY', numerario: 'Numerário', cartao: 'Cartão', stripe: 'Cartão · Stripe', multibanco: 'Multibanco' };
const ENVIO_FATURA = { whatsapp: 'WhatsApp', email: 'Email', winmax: 'Winmax', outro: 'Outro' };
const PLATAFORMAS = ['airbnb', 'booking', 'expedia', 'vrbo'];

// ── Formatos ──
const isoDia = value => D().normalizeIsoDate(String(value || '').slice(0, 10)) || '';
function partes(value) {
  const iso = isoDia(value);
  return iso ? iso.split('-').map(Number) : null;
}
// «25 nov 2026», «qua 25 nov 2026», «25 nov»
function dataCurta(value, { ano = true, semana = false } = {}) {
  const p = partes(value);
  if (!p) return '—';
  const [y, m, d] = p;
  const dia = semana ? `${SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : '';
  return `${dia}${d} ${MESES[m - 1]}${ano ? ` ${y}` : ''}`;
}
// «qua 25 nov → sáb 28 nov 2026» (o ano só no fim quando é o mesmo).
function intervalo(inicio, fim, { semana = true } = {}) {
  const a = partes(inicio), b = partes(fim);
  if (!a || !b) return '—';
  return `${dataCurta(inicio, { ano: a[0] !== b[0], semana })} → ${dataCurta(fim, { semana })}`;
}
// «25 → 28 nov» (linhas das tabelas)
function intervaloCompacto(inicio, fim) {
  const a = partes(inicio), b = partes(fim);
  if (!a || !b) return '';
  if (a[0] === b[0] && a[1] === b[1]) return `${a[2]} → ${b[2]} ${MESES[b[1] - 1]}`;
  return `${dataCurta(inicio, { ano: a[0] !== b[0] })} → ${dataCurta(fim, { ano: a[0] !== b[0] })}`;
}
// Instantes (prazos, carimbos SQLite) no dia de Lisboa.
function diaDoInstante(value) {
  const date = D().parseInstant(value);
  return date ? date.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }) : isoDia(value);
}
function dataHora(value) {
  const date = D().parseInstant(value);
  if (!date) return '';
  const hora = date.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${dataCurta(diaDoInstante(value), { ano: false })}, ${hora}`;
}
const eur = value => ReservationMoney.format(value);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const noites = n => plural(n, 'noite', 'noites');
const arred = v => Math.round(Number(v || 0) * 100) / 100;
const json = (value, fallback) => {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || 'null') ?? fallback; } catch { return fallback; }
};
const metodo = p => (String(p.id || '').startsWith('stripe-') ? 'Cartão · Stripe' : (METODOS[p.method] || p.method || '—'));
const limpo = value => String(value ?? '').trim();

// Texto vindo de formulários: o Excel e o CSV não o podem ler como fórmula.
// Estrito (CSV): qualquer texto começado por = + - @ ganha um apóstrofo.
// No .xlsx as células de texto nunca são fórmulas, mas o ficheiro pode voltar
// a ser gravado como CSV; aí basta poupar o que é só número (telefones «+351 …»).
function neutralizar(value, { estrito = true } = {}) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) && (estrito || !/^[\s]*[+-]?[\d\s().]+$/.test(text))) text = "'" + text;
  return text;
}

// Documento sensível: só os últimos 3 caracteres do número.
function mascarar(numero) {
  const raw = limpo(numero);
  if (!raw) return '';
  if (raw.length <= 3) return '•'.repeat(raw.length);
  return '•'.repeat(Math.min(6, raw.length - 3)) + raw.slice(-3);
}

function tomDoEstado(status) {
  const badge = window.ReservationStatus.badge(status);
  if (/confirmada/.test(badge)) return 'ok';
  if (/cancelada/.test(badge)) return 'erro';
  return badge ? 'aviso' : 'neutro';
}

// ── Contexto comum ──
function alojamentoDe(r) {
  const list = core().accommodations || [];
  const acc = list.find(a => a.id === r.accommodation_id) || {};
  const parent = acc.parent_id ? list.find(a => a.id === acc.parent_id) || null : null;
  return { acc, parent };
}

// Cabeçalho: logótipo (o da unidade ou, herdado, o do alojamento principal) e
// dados do alojamento principal. Sem logótipo, o da organização; sem nenhum,
// o nome da organização em texto. Sem NIF no alojamento, o NIF e a
// denominação legal da empresa (Área do proprietário → Empresa).
function cabecalho(r) {
  const { acc, parent } = alojamentoDe(r);
  const pick = field => limpo(acc[field]) || limpo(parent?.[field]);
  const user = core().currentUser || {};
  const empresa = user.organization || {};
  const org = limpo(user.organization_name) || limpo(empresa.name);
  const nome = limpo(parent?.name) || limpo(acc._parent_name) || limpo(acc.name) || limpo(r.accommodation_name) || org || 'Alojamento';
  const licenca = limpo(r.license_number) || pick('license_number');
  const nifProprio = pick('nif');
  const nif = nifProprio || limpo(empresa.nif);
  // A denominação legal só aparece com o NIF da empresa (identifica quem emite).
  const legal = !nifProprio && nif ? limpo(empresa.legal_name) : '';
  const morada = [pick('address'), [pick('postal_code'), pick('city')].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  return {
    nome,
    marca: org && org !== nome ? org : '',
    logo: pick('logo_url') || limpo(empresa.logo_url),
    linhas: [
      morada,
      [licenca ? `Licença AL ${licenca.replace(/\s*\/\s*AL$/i, '')}` : '', legal && legal !== nome ? legal : '', nif ? `NIF ${nif}` : ''].filter(Boolean).join(' · '),
      [pick('contact_email'), pick('contact_phone')].filter(Boolean).join(' · '),
    ].filter(Boolean),
    checkin: pick('checkin_time'),
    checkout: pick('checkout_time'),
  };
}

function base(r, tipo, titulo, ficheiro) {
  return {
    tipo, titulo, ficheiro: `${ficheiro}-${r.id}`, codigo: r.id, extra: '',
    emitidoEm: new Date(), emitidoPor: limpo(core().currentUser?.name),
    estado: r.status ? { texto: window.ReservationStatus.label(r.status), tom: tomDoEstado(r.status) } : null,
    cabecalho: cabecalho(r), resumo: [], blocos: [], campos: [], tabelas: [], condicoes: [],
    nota: 'Documento interno, sem valor fiscal',
  };
}

function estadia(r) {
  const nights = Number(r.nights) || D().countNights(r.check_in, r.check_out);
  const guestsData = json(r.guests_data, []);
  const accsData = json(r.accommodations_data, []);
  const children = Number(r.num_children || 0);
  const adults = Number(r.num_adults) || Math.max(1, Number(r.num_guests || 1) - children);
  const { acc } = alojamentoDe(r);
  const quartos = accsData.length ? accsData.map(row => limpo(row.name || row.accommodation_name)).filter(Boolean) : [];
  return {
    nights, adults, children, guestsData, accsData, acc,
    nomes: quartos.length ? quartos.join(', ') : (limpo(r.accommodation_name) || limpo(acc.name) || '—'),
    ocupacao: `${plural(adults, 'adulto', 'adultos')} · ${plural(children, 'criança', 'crianças')}`,
  };
}

// Linhas cobradas: alojamento, serviços, taxas e o acerto até ao total gravado.
function linhasCobradas(r, e) {
  const total = arred(r.total_amount);
  const nightly = json(r.nightly_prices, []);
  const detalhe = intervaloCompacto(r.check_in, r.check_out);
  const servicos = core().servicosData || [];
  const unit = id => Number(servicos.find(s => s.id === id)?.value);
  const linhas = [];
  const extras = [];
  const bkfPrice = Number.isFinite(unit('breakfast')) ? unit('breakfast') : 19;
  if (r.breakfast_included) {
    const qtd = Number(r.num_guests || 1) * e.nights;
    extras.push({ descricao: 'Pequeno-almoço', detalhe: `${eur(bkfPrice)} por pessoa e noite`, qtd, valor: arred(qtd * bkfPrice) });
  }
  const extraOcc = AppModules.reservas.getExtraOccupancyCharge?.(e.acc, r.num_guests || 1, e.nights, e.guestsData.map(g => g.birth_date).filter(Boolean), r.check_in) || 0;
  if (extraOcc > 0) extras.push({ descricao: 'Ocupação extra', detalhe: noites(e.nights), qtd: e.nights, valor: arred(extraOcc) });
  const tax = arred(r.tourist_tax);
  if (tax > 0) {
    const price = unit('tourist_tax');
    const qtd = price > 0 && Math.abs(tax / price - Math.round(tax / price)) < 0.001 ? Math.round(tax / price) : null;
    extras.push({ descricao: 'Taxa turística', detalhe: qtd ? `${eur(price)} por pessoa e noite` : '', qtd, valor: tax });
  }
  const extrasSum = extras.reduce((s, x) => s + x.valor, 0);

  // O valor do alojamento: preços por noite gravados, ou os subtotais dos
  // quartos. Sem nenhum dos dois, é o que sobra do total (sem acerto a mostrar).
  const nightlySum = arred(nightly.reduce((s, n) => s + Number(n.price || 0), 0));
  const roomsSum = arred(e.accsData.reduce((s, row) => s + Number(row.subtotal || 0), 0));
  if (e.accsData.length > 1) {
    for (const row of e.accsData) {
      const n = Number(row.nights || e.nights);
      linhas.push({ descricao: limpo(row.name || row.accommodation_name) || 'Alojamento', detalhe, qtd: n, unidade: 'noites', valor: arred(row.subtotal || Number(row.price_per_night || 0) * n) });
    }
  }
  const baseAmount = nightlySum > 0 ? nightlySum : roomsSum > 0 ? roomsSum : arred(total - extrasSum);
  if (e.accsData.length <= 1) linhas.push({ descricao: 'Alojamento', detalhe, qtd: e.nights, unidade: 'noites', valor: baseAmount });
  linhas.push(...extras);

  let acerto = arred(total - baseAmount - extrasSum);
  // Voucher: só aparece quando explica (parte de) a diferença — os preços por
  // noite podem já trazer o desconto.
  const desconto = arred(r.voucher?.discount_amount);
  if (desconto > 0 && Math.abs(acerto + desconto) < Math.abs(acerto)) {
    linhas.push({ descricao: `Voucher ${limpo(r.voucher.code)}`, detalhe: '', qtd: null, valor: -desconto });
    acerto = arred(acerto + desconto);
  }
  if (Math.abs(acerto) >= 0.005) linhas.push({ descricao: acerto < 0 ? 'Desconto / ajuste manual' : 'Ajuste manual', detalhe: '', qtd: null, valor: acerto, tom: acerto < 0 ? 'ok' : 'aviso' });
  return { linhas, total };
}

function tabelaLinhas(cobradas, { titulo = '' } = {}) {
  return {
    id: 'linhas', titulo,
    colunas: [
      { chave: 'descricaoCompleta', rotulo: 'Descrição', tipo: 'texto', so: 'pdf' },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 28, so: 'xlsx' },
      { chave: 'detalhe', rotulo: 'Detalhe', tipo: 'texto', largura: 30, so: 'xlsx' },
      { chave: 'qtdTexto', rotulo: 'Qtd.', tipo: 'texto', so: 'pdf', alinhar: 'right', largura: 26 },
      { chave: 'qtd', rotulo: 'Quantidade', tipo: 'int', largura: 12, so: 'xlsx' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'eur', largura: 14 },
    ],
    linhas: cobradas.linhas.map(l => ({
      tom: l.tom,
      c: {
        descricaoCompleta: [l.descricao, l.detalhe].filter(Boolean).join(' · '),
        descricao: l.descricao, detalhe: l.detalhe, qtd: l.qtd ?? '',
        qtdTexto: l.qtd == null ? '—' : l.unidade ? plural(l.qtd, l.unidade.replace(/s$/, ''), l.unidade) : String(l.qtd),
        valor: l.valor,
      },
    })),
    totais: [{ id: 'total', rotulo: 'Total', valor: cobradas.total, soma: 'valor', forte: true }],
  };
}

// Pagamentos do ledger; reservas antigas só com amount_paid recebem uma linha
// «sem detalhe», para a soma bater certo com o que está pago.
function pagamentos(r) {
  const paid = arred(r.amount_paid);
  const deposit = arred(r.payment_policy ? (r.payment_policy.depositCents || 0) / 100 : r.deposit_amount);
  const rows = (r.payments || []).map(p => ({ ...p, amount: arred(p.amount) }));
  const sum = arred(rows.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - sum) >= 0.005) rows.unshift({ id: 'saldo', amount: arred(paid - sum), payment_date: r.payment_date || '', method: r.payment_method || '', notes: 'Pagamento registado sem detalhe' });
  let antes = 0;
  return rows.map(p => {
    const tipo = p.amount < 0 ? 'Reembolso' : deposit > 0 && antes < deposit - 0.005 ? 'Sinal' : 'Pagamento';
    antes += p.amount;
    const nota = limpo(p.notes);
    return { ...p, tipo, metodo: metodo(p), nota: nota.toLowerCase() === tipo.toLowerCase() ? '' : nota };
  });
}

function condicoesPagamento(r, e, paid) {
  const out = [];
  const policy = r.payment_policy;
  const deposit = arred(policy ? (policy.depositCents || 0) / 100 : r.deposit_amount);
  if (policy?.cancellation) {
    out.push({ rotulo: 'Cancelamento', texto: `reserva cancelada; reembolso de ${eur(policy.cancellation.amount)}.` });
  } else if (deposit > 0) {
    const sinal = paid + 0.005 >= deposit ? `Sinal ${eur(deposit)} (pago)` : `Sinal ${eur(deposit)}${r.deposit_deadline ? ` até ${dataHora(r.deposit_deadline)}` : ''}`;
    const restante = policy?.balanceCents ? `; restante ${eur(policy.balanceCents / 100)} até ${dataCurta(diaDoInstante(policy.dueAt))}` : '';
    out.push({ rotulo: 'Pagamento', texto: `${sinal}${restante}.` });
  }
  if (!policy?.cancellation) {
    const rules = policy?.policy?.refundRules;
    if (rules?.length) {
      const partes = [...rules].sort((a, b) => b.minDays - a.minDays).map(rule => {
        const quando = rule.maxDays === null ? `${rule.minDays} ou mais dias antes` : rule.minDays === 0 ? `até ${rule.maxDays} dias antes` : `${rule.minDays} a ${rule.maxDays} dias antes`;
        return `${rule.percent} % ${quando}`;
      });
      const baseCalc = policy.policy.refundBasis === 'booking' ? 'contados da data da reserva até à chegada' : 'contados da data do cancelamento até à chegada';
      out.push({ rotulo: 'Cancelamento', texto: `reembolso de ${partes.join('; ')} (${baseCalc}).` });
    } else if (PLATAFORMAS.includes(r.channel)) {
      out.push({ rotulo: 'Cancelamento', texto: `segue as condições de ${core().channelLabel(r.channel)}.` });
    }
  }
  return out;
}

function notas(r) {
  const out = [];
  if (limpo(r.notes)) out.push({ rotulo: 'Observações', texto: limpo(r.notes) });
  out.push({ rotulo: 'Notas do hóspede', texto: limpo(r.guest_notes) || '—' });
  return out;
}

const PRECHECKIN = { preenchido: 'feito', enviado: 'link enviado, por preencher', nao_enviado: 'por fazer' };

function blocosReserva(r, e, cab) {
  const email = core().realEmail(r.guest_email);
  const horas = [cab.checkin ? `Check-in ${cab.checkin}` : '', cab.checkout ? `check-out ${cab.checkout}` : ''].filter(Boolean).join(' · ');
  return [
    { titulo: 'Hóspede', linhas: [
      { texto: limpo(r.guest_name) || '—', forte: true },
      limpo(r.guest_company) ? { texto: limpo(r.guest_company) } : null,
      email ? { texto: email } : null,
      { texto: [limpo(r.guest_phone), `NIF ${limpo(r.guest_nif) || '—'}`].filter(Boolean).join(' · ') },
      r.status !== 'cancelada' ? { texto: `Pré-check-in: ${PRECHECKIN[r.precheckin_state] || 'por fazer'}`, tom: r.precheckin_state === 'preenchido' ? 'ok' : 'suave' } : null,
    ].filter(Boolean) },
    { titulo: 'Estadia', linhas: [
      { texto: e.nomes, forte: true },
      { texto: `${intervalo(r.check_in, r.check_out)} · ${noites(e.nights)}` },
      horas ? { texto: horas + (limpo(r.arrival_time) ? ` · chegada prevista ${limpo(r.arrival_time)}` : '') } : (limpo(r.arrival_time) ? { texto: `Chegada prevista ${limpo(r.arrival_time)}` } : null),
      { texto: `${e.ocupacao} · canal: ${core().channelLabel(r.channel) || '—'}` },
    ].filter(Boolean) },
  ];
}

function camposReserva(r, e) {
  const email = core().realEmail(r.guest_email);
  return [
    { rotulo: 'Hóspede', valor: limpo(r.guest_name) || '—' },
    { rotulo: 'Entrada', valor: isoDia(r.check_in), tipo: 'data' },
    { rotulo: e.accsData.length > 1 ? 'Alojamentos' : 'Alojamento', valor: e.nomes },
    { rotulo: 'Saída', valor: isoDia(r.check_out), tipo: 'data' },
    { rotulo: 'Email', valor: email || '—' },
    { rotulo: 'Noites', valor: e.nights, tipo: 'int' },
    { rotulo: 'Telefone', valor: limpo(r.guest_phone) || '—' },
    { rotulo: 'Ocupação', valor: e.ocupacao },
    { rotulo: 'NIF', valor: limpo(r.guest_nif) || '—' },
    { rotulo: 'Canal', valor: core().channelLabel(r.channel) || '—' },
    { rotulo: 'Estado', valor: window.ReservationStatus.label(r.status) },
    { rotulo: 'Pré-check-in', valor: PRECHECKIN[r.precheckin_state] || 'por fazer' },
  ];
}

function tabelaPagamentos(r, lista, { total, paid }) {
  return {
    id: 'pagamentos', titulo: 'Pagamentos',
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data', largura: 12 },
      { chave: 'descricao', rotulo: 'Pagamento', tipo: 'texto', largura: 34 },
      { chave: 'metodo', rotulo: 'Método', tipo: 'texto', largura: 18 },
      { chave: 'valor', rotulo: 'Valor', tipo: 'eur', largura: 14 },
    ],
    linhas: lista.map(p => ({ tom: p.amount < 0 ? 'erro' : 'ok', c: { data: isoDia(p.payment_date), descricao: [p.tipo, p.nota].filter(Boolean).join(' · '), metodo: p.metodo, valor: p.amount } })),
    vazio: 'Sem pagamentos registados',
    totais: [
      { id: 'pago', rotulo: 'Pago', valor: paid, soma: 'valor', tom: paid > 0.005 ? 'ok' : undefined, forte: true },
      { id: 'falta', rotulo: 'Em falta', valor: Math.max(0, arred(total - paid)), tom: total - paid > 0.005 ? 'erro' : 'ok', forte: true, formula: ref => `MAX(0,${total}-${ref.pago})` },
    ],
  };
}

// ── Ficha de reserva ──
function fichaReserva(r) {
  const doc = base(r, 'ficha', 'Ficha de reserva', 'ficha-reserva');
  const e = estadia(r);
  const total = arred(r.total_amount), paid = arred(r.amount_paid);
  const cobradas = linhasCobradas(r, e);
  doc.blocos = blocosReserva(r, e, doc.cabecalho);
  doc.campos = camposReserva(r, e);
  const lista = pagamentos(r);
  doc.tabelas = [tabelaLinhas(cobradas), tabelaPagamentos(r, lista, { total, paid })];
  doc.condicoes = [...condicoesPagamento(r, e, paid), ...notas(r)];
  const std = Number(r.standard_total);
  if (Number.isFinite(std) && std > 0 && Math.abs(total - std) > 0.005) {
    doc.condicoes.push({ rotulo: 'Preço', texto: `${total < std ? 'desconto' : 'acréscimo'} de ${eur(Math.abs(total - std))} face ao padrão do calendário dinâmico (${eur(std)}).` });
  }
  doc.folhas = [{ nome: 'Ficha', titulo: true, campos: true, tabela: 'linhas' }, { nome: 'Pagamentos', tabela: 'pagamentos' }];
  return doc;
}

// ── Conta corrente ──
function contaCorrente(r) {
  const doc = base(r, 'conta', 'Conta corrente', 'conta-corrente');
  const e = estadia(r);
  const total = arred(r.total_amount), paid = arred(r.amount_paid);
  const remaining = Math.max(0, arred(total - paid));
  doc.extra = limpo(r.guest_name);
  doc.resumo = [
    { rotulo: 'Total da reserva', valor: total },
    { rotulo: 'Pago', valor: paid, tom: paid > 0.005 ? 'ok' : undefined },
    { rotulo: 'Em falta', valor: remaining, tom: remaining > 0.005 ? 'erro' : 'ok' },
  ];
  doc.contexto = `${e.nomes} · ${intervalo(r.check_in, r.check_out)} · ${noites(e.nights)}`;
  const movimentos = [];
  const saldoF = first => a => first ? a('valor') : `${a('saldo', -1)}+${a('valor')}`;
  let saldo = total;
  movimentos.push({ c: { data: diaDoInstante(r.created_at) || isoDia(r.check_in), movimento: 'Reserva (total)', metodo: '—', valor: total, saldo: { v: total, f: saldoF(true) } } });
  for (const p of pagamentos(r)) {
    saldo = arred(saldo - p.amount);
    movimentos.push({ tom: p.amount < 0 ? 'aviso' : 'ok', c: { data: isoDia(p.payment_date), movimento: [p.tipo, p.nota].filter(Boolean).join(' · '), metodo: p.metodo, valor: -p.amount, saldo: { v: saldo, f: saldoF(false) } } });
  }
  // Linhas previstas: só com política de pagamento e enquanto falta pagar.
  const policy = r.payment_policy;
  if (policy && !policy.cancellation && remaining > 0.005 && r.status !== 'cancelada') {
    const deposit = arred((policy.depositCents || 0) / 100);
    const faltaSinal = Math.min(remaining, Math.max(0, arred(deposit - paid)));
    if (faltaSinal > 0.005) movimentos.push({ tom: 'suave', c: { data: diaDoInstante(r.deposit_deadline), movimento: 'Sinal (previsto)', metodo: '—', valor: faltaSinal, saldo: '' } });
    const resto = arred(remaining - faltaSinal);
    if (resto > 0.005) movimentos.push({ tom: 'suave', c: { data: diaDoInstante(policy.dueAt), movimento: 'Restante (previsto)', metodo: '—', valor: resto, saldo: '' } });
  }
  doc.tabelas = [{
    id: 'movimentos',
    colunas: [
      { chave: 'data', rotulo: 'Data', tipo: 'data', largura: 12 },
      { chave: 'movimento', rotulo: 'Movimento', tipo: 'texto', largura: 34 },
      { chave: 'metodo', rotulo: 'Método', tipo: 'texto', largura: 18 },
      { chave: 'valor', rotulo: 'Valor', tipo: 'eur', largura: 14 },
      { chave: 'saldo', rotulo: 'Saldo', tipo: 'eur', largura: 14 },
    ],
    linhas: movimentos,
    totais: [],
  }];
  doc.campos = [
    { rotulo: 'Hóspede', valor: limpo(r.guest_name) || '—' },
    { rotulo: 'Entrada', valor: isoDia(r.check_in), tipo: 'data' },
    { rotulo: e.accsData.length > 1 ? 'Alojamentos' : 'Alojamento', valor: e.nomes },
    { rotulo: 'Saída', valor: isoDia(r.check_out), tipo: 'data' },
    { rotulo: 'Total da reserva', valor: total, tipo: 'eur' },
    { rotulo: 'Pago', valor: paid, tipo: 'eur' },
    { rotulo: 'Em falta', valor: remaining, tipo: 'eur' },
    { rotulo: 'Estado', valor: window.ReservationStatus.label(r.status) },
  ];
  doc.condicoes = [{ rotulo: 'Como ler', texto: 'o saldo começa no total da reserva e desce com cada pagamento; os reembolsos aparecem como movimento positivo. As linhas «previsto» seguem a política de pagamento da reserva.' }];
  doc.folhas = [{ nome: 'Conta corrente', titulo: true, campos: true, tabela: 'movimentos' }];
  return doc;
}

// ── Ficha de hóspede ──
// O número do documento sai parcialmente oculto, a não ser que quem exporta
// peça a versão completa (a ficha no ecrã mostra-o a quem a pode editar, mas o
// PDF/Excel sai do sistema e circula).
function fichaHospede(g, r, { documentoCompleto = false } = {}) {
  const doc = base(r, 'hospede', 'Ficha de hóspede', 'ficha-hospede');
  doc.ficheiro = `ficha-hospede-${String(g.name || g.id || 'hospede').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'hospede'}`;
  doc.codigo = limpo(g.name) || 'Hóspede';
  doc.estado = g.is_vip ? { texto: 'VIP', tom: 'aviso' } : null;
  const ativas = (g.reservations || []).filter(x => !['cancelada', 'rejeitada'].includes(x.status))
    .sort((a, b) => String(b.check_in).localeCompare(String(a.check_in)));
  const totalNoites = ativas.reduce((s, x) => s + (Number(x.nights) || D().countNights(x.check_in, x.check_out)), 0);
  const gasto = arred(ativas.reduce((s, x) => s + Number(x.total_amount || 0), 0));
  const email = core().realEmail(g.email);
  const numero = documentoCompleto ? limpo(g.document_number) : mascarar(g.document_number);
  const documento = [limpo(g.document_type), numero].filter(Boolean).join(' ') || '—';
  const morada = [limpo(g.address), [limpo(g.postal_code), limpo(g.city)].filter(Boolean).join(' '), limpo(g.country)].filter(Boolean).join(', ');
  doc.extra = documentoCompleto ? 'documento completo' : '';
  doc.resumo = [
    { rotulo: 'Estadias', valor: ativas.length, tipo: 'int' },
    { rotulo: 'Noites', valor: totalNoites, tipo: 'int' },
    { rotulo: 'Total gasto', valor: gasto },
  ];
  doc.blocos = [
    { titulo: 'Identificação', linhas: [
      { texto: limpo(g.name) || '—', forte: true },
      { texto: `Documento: ${documento}` },
      { texto: `Nacionalidade: ${limpo(g.nationality) || limpo(g.country) || '—'}` },
      { texto: `Data de nascimento: ${g.birth_date ? D().formatPtDate(g.birth_date).replace(/-/g, '/') : '—'}` },
      { texto: `NIF: ${limpo(g.nif) || '—'}${limpo(g.company) ? ` · ${limpo(g.company)}${limpo(g.company_nif) ? ` (NIF ${limpo(g.company_nif)})` : ''}` : ''}` },
    ] },
    { titulo: 'Contactos', linhas: [
      email ? { texto: email } : { texto: 'Sem email', tom: 'suave' },
      { texto: limpo(g.phone) || 'Sem telefone', tom: limpo(g.phone) ? undefined : 'suave' },
      morada ? { texto: morada } : null,
      { texto: `Reserva atual: ${r.id} · ${intervalo(r.check_in, r.check_out, { semana: false })}` },
    ].filter(Boolean) },
  ];
  doc.campos = [
    { rotulo: 'Nome', valor: limpo(g.name) || '—' },
    { rotulo: 'Documento', valor: documento },
    { rotulo: 'Nacionalidade', valor: limpo(g.nationality) || limpo(g.country) || '—' },
    { rotulo: 'Nascimento', valor: isoDia(g.birth_date), tipo: 'data' },
    { rotulo: 'Email', valor: email || '—' },
    { rotulo: 'Telefone', valor: limpo(g.phone) || '—' },
    { rotulo: 'NIF', valor: limpo(g.nif) || '—' },
    { rotulo: 'Morada', valor: morada || '—' },
    { rotulo: 'Estadias', valor: ativas.length, tipo: 'int' },
    { rotulo: 'Noites', valor: totalNoites, tipo: 'int' },
  ];
  doc.tabelas = [{
    id: 'estadias', titulo: 'Histórico de estadias',
    colunas: [
      { chave: 'reserva', rotulo: 'Reserva', tipo: 'texto', largura: 18 },
      { chave: 'entrada', rotulo: 'Entrada', tipo: 'data', largura: 12 },
      { chave: 'saida', rotulo: 'Saída', tipo: 'data', largura: 12 },
      { chave: 'alojamento', rotulo: 'Alojamento', tipo: 'texto', largura: 26 },
      { chave: 'estado', rotulo: 'Estado', tipo: 'texto', largura: 14 },
      { chave: 'valor', rotulo: 'Valor', tipo: 'eur', largura: 14 },
    ],
    linhas: ativas.map(x => ({ c: { reserva: x.id, entrada: isoDia(x.check_in), saida: isoDia(x.check_out), alojamento: limpo(x.accommodation_name) || '—', estado: window.ReservationStatus.label(x.status), valor: arred(x.total_amount) } })),
    vazio: 'Ainda sem estadias',
    totais: [{ id: 'gasto', rotulo: 'Total gasto', valor: gasto, soma: 'valor', forte: true }],
  }];
  doc.condicoes = [
    { rotulo: 'Notas', texto: limpo(g.notes) || '—' },
    { rotulo: 'RGPD', texto: g.rgpd_consent ? `consentimento dado${g.rgpd_consent_date ? ` a ${dataCurta(diaDoInstante(g.rgpd_consent_date))}` : ''}.` : 'sem consentimento registado.' },
  ];
  if (!documentoCompleto && limpo(g.document_number)) doc.condicoes.push({ rotulo: 'Documento', texto: 'número parcialmente oculto (dados pessoais).' });
  doc.folhas = [{ nome: 'Hóspede', titulo: true, campos: true, tabela: 'estadias' }];
  return doc;
}

// ── Registo de fatura ──
// A fatura certificada é emitida no programa de faturação; aqui fica o
// registo, com o número e a série do documento externo quando existem.
function serieENumero(value) {
  const raw = limpo(value);
  const m = raw.match(/^(.*\S)\s*\/\s*(\d+)$/);
  return m ? { serie: m[1], numero: m[2] } : { serie: '', numero: raw };
}
function registoFatura(r) {
  const doc = base(r, 'fatura', 'Registo de fatura', 'registo-fatura');
  const e = estadia(r);
  const ext = serieENumero(r.invoice_number);
  doc.extra = limpo(r.invoice_number) ? `fatura ${limpo(r.invoice_number)}` : 'fatura por registar';
  doc.estado = r.invoice_number ? { texto: r.invoice_sent_date ? 'Enviada' : 'Registada', tom: 'ok' } : { texto: 'Por registar', tom: 'aviso' };
  const email = core().realEmail(r.guest_email);
  doc.blocos = [
    { titulo: 'Documento externo', linhas: [
      { texto: limpo(r.invoice_number) || 'Sem número registado', forte: true },
      ext.serie ? { texto: `Série ${ext.serie} · n.º ${ext.numero}` } : null,
      { texto: `Data: ${r.invoice_date ? dataCurta(r.invoice_date) : '—'}` },
      { texto: r.invoice_sent_date ? `Enviada a ${dataCurta(r.invoice_sent_date)}${r.invoice_sent_method ? ` por ${ENVIO_FATURA[r.invoice_sent_method] || r.invoice_sent_method}` : ''}` : 'Ainda não enviada', tom: r.invoice_sent_date ? undefined : 'suave' },
    ].filter(Boolean) },
    { titulo: 'Cliente', linhas: [
      { texto: limpo(r.guest_company) || limpo(r.guest_name) || '—', forte: true },
      limpo(r.guest_company) ? { texto: limpo(r.guest_name) } : null,
      { texto: `NIF ${limpo(r.guest_nif) || '—'}` },
      email ? { texto: email } : null,
      { texto: `Estadia: ${e.nomes} · ${intervalo(r.check_in, r.check_out, { semana: false })}` },
    ].filter(Boolean) },
  ];
  const total = arred(r.total_amount), paid = arred(r.amount_paid);
  doc.tabelas = [tabelaLinhas(linhasCobradas(r, e)), tabelaPagamentos(r, pagamentos(r), { total, paid })];
  doc.condicoes = [{ rotulo: 'Nota', texto: 'registo interno da fatura emitida no programa de faturação; não substitui a fatura certificada.' }];
  doc.nota = 'Registo interno, não substitui a fatura certificada';
  doc.folhas = [{ nome: 'Fatura', titulo: true, campos: true, tabela: 'linhas' }];
  doc.campos = [
    { rotulo: 'Fatura', valor: limpo(r.invoice_number) || '—' },
    { rotulo: 'Data', valor: isoDia(r.invoice_date), tipo: 'data' },
    { rotulo: 'Série', valor: ext.serie || '—' },
    { rotulo: 'Número', valor: ext.numero || '—' },
    { rotulo: 'Cliente', valor: limpo(r.guest_company) || limpo(r.guest_name) || '—' },
    { rotulo: 'NIF', valor: limpo(r.guest_nif) || '—' },
  ];
  return doc;
}

// ── Pré-visualização (janela da ficha) ──
function htmlPrevia(doc) {
  const esc = core().escapeHtml;
  const valor = (tipo, v) => {
    const raw = v && typeof v === 'object' ? v.v : v;
    if (raw === '' || raw === null || raw === undefined) return '—';
    if (tipo === 'eur') return eur(raw);
    if (tipo === 'data') return dataCurta(raw);
    return esc(String(raw));
  };
  const tomClass = tom => tom ? ` doc-tom-${tom}` : '';
  const resumo = doc.resumo.length ? `<div class="doc-resumo">${doc.resumo.map(b => `<div class="doc-caixa${tomClass(b.tom)}"><span>${esc(b.rotulo)}</span><b>${b.tipo === 'int' ? esc(String(b.valor)) : eur(b.valor)}</b></div>`).join('')}</div>` : '';
  const blocos = doc.blocos.length ? `<div class="doc-blocos">${doc.blocos.map(b => `<div class="doc-bloco"><h4>${esc(b.titulo)}</h4>${b.linhas.map(l => `<p class="${l.forte ? 'doc-forte' : ''}${tomClass(l.tom)}">${esc(l.texto)}</p>`).join('')}</div>`).join('')}</div>` : '';
  const tabelas = doc.tabelas.map(t => {
    const cols = t.colunas.filter(c => c.so !== 'xlsx');
    const num = c => c.tipo === 'eur' || c.alinhar === 'right';
    const body = t.linhas.length
      ? t.linhas.map(l => `<tr class="${tomClass(l.tom).trim()}">${cols.map(c => `<td${num(c) ? ` class="doc-num${c.chave === 'valor' ? ' doc-valor' : ''}"` : ''}>${valor(c.tipo, l.c[c.chave])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="doc-vazio">${esc(t.vazio || 'Sem linhas')}</td></tr>`;
    const totais = (t.totais || []).map(x => `<div class="stmt-foot-row${tomClass(x.tom)}"><span>${esc(x.rotulo)}</span><b>${eur(x.valor)}</b></div>`).join('');
    return `${t.titulo ? `<h4 class="doc-tabela-titulo">${esc(t.titulo)}</h4>` : ''}<table class="stmt-table"><thead><tr>${cols.map(c => `<th${num(c) ? ' class="doc-num"' : ''}>${esc(c.rotulo)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${totais ? `<div class="stmt-footer">${totais}</div>` : ''}`;
  }).join('');
  const condicoes = doc.condicoes.length ? `<div class="doc-condicoes">${doc.condicoes.map(c => `<p><b>${esc(c.rotulo)}</b> — ${esc(c.texto)}</p>`).join('')}</div>` : '';
  const estado = doc.estado ? `<span class="doc-estado${tomClass(doc.estado.tom)}">${esc(doc.estado.texto)}</span>` : '';
  return `<div class="doc-previa">
      <div class="doc-topo"><span>${esc([doc.codigo, doc.extra, `emitido a ${dataCurta(D().localIso(doc.emitidoEm))}`].filter(Boolean).join(' · '))}</span>${estado}</div>
      ${resumo}${doc.contexto ? `<p class="doc-contexto">${esc(doc.contexto)}</p>` : ''}${blocos}${tabelas}${condicoes}
    </div>`;
}

// Descarga de um ficheiro gerado no browser.
function baixar(blob, nome) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const api = Object.freeze({
  fichaReserva, contaCorrente, fichaHospede, registoFatura, htmlPrevia,
  neutralizar, mascarar, baixar, eur, dataCurta, intervalo, isoDia, diaDoInstante,
});

})();
