const { runFrontend } = require('../test-support/frontend.cjs');
// Regressões da paginação de eventos, despesas e conversas (vista Mensagens).
//
// Cobre o que a etapa pedia: resultados fora da primeira página, cancelamento
// de pesquisas antigas e isolamento entre organizações. Dados sintéticos; não
// há rede nem envio de email.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const previous = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-listas-'));
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.EMAIL_ENABLED = 'false';

const { db, initDatabase } = require('../config/database');
initDatabase();
const { listEvents, listExpenses, listMessageThreads } = require('../services/listQueries');
after(() => { db.close(); process.chdir(previous); fs.rmSync(temp, { recursive: true, force: true }); });

db.exec(`
  INSERT INTO organizations(id,name,slug) VALUES('a','A','a'),('b','B','b');
  INSERT INTO accommodations(id,organization_id,name,type,price_per_night,max_guests)
    VALUES('a1','a','Suite Alfa','alojamento',10,2),('b1','b','Suite da Org B','alojamento',10,2);
`);

const guest = db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)');
const reservation = db.prepare(`INSERT INTO reservations(id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,total_amount,status)
  VALUES(?,?,?,?,'2030-06-01','2030-06-03',2,1,100,'confirmada')`);
const event = db.prepare(`INSERT INTO operational_events(id,organization_id,title,type,date,start_time,status,accommodation_id,responsible,important)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);
const expense = db.prepare(`INSERT INTO expenses(id,organization_id,date,description,category,amount,payment_method,supplier,invoice_ref,has_nif)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);
const message = db.prepare(`INSERT INTO invoice_messages(id,organization_id,to_email,to_name,subject,body_html,reservation_id,sent_at)
  VALUES(?,?,?,?,?,?,?,?)`);

const TIPOS = ['limpeza', 'reuniao', 'manutencao', 'checkin'];
let somaDespesas = 0;

db.transaction(() => {
  for (let n = 0; n < 137; n++) {
    const id = String(n).padStart(3, '0');
    event.run(`e${id}`, 'a', n === 130 ? 'Érica 100%_real' : `Evento ${id}`, TIPOS[n % 4],
      `2030-06-${String((n % 28) + 1).padStart(2, '0')}`, n % 3 ? '09:30' : null,
      n % 5 ? 'planeado' : 'concluido', 'a1', `Resp ${n % 3}`, n % 7 ? 0 : 1);

    const valor = 10 + n;
    somaDespesas += valor;
    expense.run(`d${id}`, 'a', `2030-0${(n % 9) + 1}-15`, `Despesa ${id}`, TIPOS[n % 4],
      valor, 'numerário', `Fornecedor ${n % 3}`, `FT-${id}`, n % 2);

    guest.run(`g${id}`, 'a', `Hóspede ${id}`, `h${id}@exemplo.invalid`);
    reservation.run(`r${id}`, 'a', `g${id}`, 'a1');
  }

  // Reservas sem email real: o marcador @reserva.local não dá conversa.
  for (let n = 0; n < 5; n++) {
    guest.run(`gx${n}`, 'a', `Sem Email ${n}`, `x${n}@reserva.local`);
    reservation.run(`rx${n}`, 'a', `gx${n}`, 'a1');
  }

  // Histórico em algumas conversas de reserva, e conversas avulsas.
  for (let n = 0; n < 10; n++) {
    const id = String(n).padStart(3, '0');
    message.run(`m${id}`, 'a', `h${id}@exemplo.invalid`, `Hóspede ${id}`, `Assunto ${id}`,
      `<html><body><td class="email-body-bg"><!--sp:body--><p>Corpo da mensagem ${id}</p><!--/sp:body--></td></body></html>`,
      `r${id}`, `2030-05-${String(10 + n).padStart(2, '0')}T10:00:00Z`);
  }
  for (let n = 0; n < 7; n++) {
    message.run(`ms${n}`, 'a', `avulso${n}@exemplo.invalid`, `Avulso ${n}`, 'Sem reserva',
      '<p>mensagem avulsa</p>', null, `2030-05-2${n}T10:00:00Z`);
  }
  // Avulsa cujo email já tem reserva: não pode gerar uma conversa duplicada.
  message.run('mdup', 'a', 'h000@exemplo.invalid', 'Hóspede 000', 'Outra', '<p>x</p>', null, '2030-05-30T10:00:00Z');

  // Organização B: tudo o que se segue tem de ficar invisível para a A.
  event.run('eb', 'b', 'Evento da Org B', 'limpeza', '2030-06-01', null, 'planeado', 'b1', null, 0);
  expense.run('db', 'b', '2030-06-01', 'Despesa da Org B', 'limpeza', 999, 'numerário', 'Fornecedor B', 'FT-B', 1);
  guest.run('gb', 'b', 'Hóspede da Org B', 'hb@exemplo.invalid');
  reservation.run('rb', 'b', 'gb', 'b1');
  message.run('mb', 'b', 'hb@exemplo.invalid', 'Hóspede da Org B', 'Privado', '<p>segredo</p>', 'rb', '2030-05-31T10:00:00Z');
})();

// ── Eventos ────────────────────────────────────────────────────────────────

test('eventos: páginas cobrem a coleção sem repetir nem saltar registos', () => {
  const primeira = listEvents('a');
  assert.equal(primeira.data.length, 50);
  assert.equal(primeira.pagination.total, 137);
  assert.equal(primeira.pagination.pages, 3);
  assert.equal(primeira.pagination.has_more, true);

  const todos = [1, 2, 3].flatMap(page => listEvents('a', { page: String(page) }).data);
  assert.equal(todos.length, 137);
  assert.equal(new Set(todos.map(e => e.id)).size, 137, 'houve eventos repetidos entre páginas');
  assert.equal(listEvents('a', { page: '3' }).pagination.has_more, false);
});

test('eventos: pesquisa abrange todas as páginas e trata %/_ como texto', () => {
  // O evento 130 está na terceira página por data; a pesquisa tem de o achar.
  assert.equal(listEvents('a', { search: 'ÉRICA' }).pagination.total, 1);
  assert.equal(listEvents('a', { search: '100%_real' }).pagination.total, 1);
  assert.equal(listEvents('a', { search: '%' }).pagination.total, 1);
  assert.equal(listEvents('a', { search: 'Suite Alfa' }).pagination.total, 137, 'pesquisa pelo alojamento');
});

test('eventos: filtros, chips de categoria e intervalo de datas', () => {
  assert.equal(listEvents('a', { status: 'concluido' }).pagination.total, 28);
  assert.equal(listEvents('a', { important: '1' }).pagination.total, 20);
  assert.equal(listEvents('a', { types: 'limpeza,reuniao' }).pagination.total, 69);
  assert.equal(listEvents('a', { accommodation_id: 'a1' }).pagination.total, 137);
  assert.equal(listEvents('a', { from: '2030-06-01', to: '2030-06-07' }).pagination.total, 35);
  assert.equal(listEvents('a', {}).summary.concluidos, 28);
});

test('eventos: isolamento entre organizações', () => {
  const todos = [1, 2, 3].flatMap(page => listEvents('a', { page: String(page) }).data);
  assert(todos.every(e => e.organization_id === 'a'));
  assert(!todos.some(e => e.id === 'eb'), 'evento de outra organização na lista');
  assert.equal(listEvents('b').pagination.total, 1);
  assert.equal(listEvents('b', { search: 'Érica' }).pagination.total, 0);
});

test('eventos: parâmetros inválidos são recusados com 400', () => {
  for (const query of [{ page: '0' }, { page: '-1' }, { limit: '9999' }, { sort: 'x; DROP TABLE' },
    { direction: 'sideways' }, { from: '2030-13-01' }, { from: '2030-06-10', to: '2030-06-01' },
    { important: '2' }]) {
    assert.throws(() => listEvents('a', query), err => err.status === 400, JSON.stringify(query));
  }
});

// ── Despesas ───────────────────────────────────────────────────────────────

test('despesas: páginas cobrem a coleção e o total é o do filtro completo', () => {
  const primeira = listExpenses('a');
  assert.equal(primeira.data.length, 50);
  assert.equal(primeira.pagination.total, 137);
  // O total tem de somar TODAS as páginas, não só as 50 devolvidas.
  assert.equal(Math.round(primeira.summary.total_amount), Math.round(somaDespesas));

  const todas = [1, 2, 3].flatMap(page => listExpenses('a', { page: String(page) }).data);
  assert.equal(new Set(todas.map(d => d.id)).size, 137);
});

test('despesas: ordenação abrange a coleção, não apenas a página aberta', () => {
  // A despesa mais cara é a 136, que por data fica na última página.
  const maisCara = listExpenses('a', { sort: 'amount', direction: 'desc' }).data[0];
  assert.equal(maisCara.description, 'Despesa 136');
  const maisBarata = listExpenses('a', { sort: 'amount', direction: 'asc' }).data[0];
  assert.equal(maisBarata.description, 'Despesa 000');
});

test('despesas: pesquisa e filtros no servidor', () => {
  assert.equal(listExpenses('a', { search: 'Despesa 131' }).pagination.total, 1);
  assert.equal(listExpenses('a', { search: 'FT-131' }).pagination.total, 1, 'pesquisa pelo nº de fatura');
  assert.equal(listExpenses('a', { search: 'Fornecedor 1' }).pagination.total, 46);
  assert.equal(listExpenses('a', { category: 'limpeza' }).pagination.total, 35);
  assert.equal(listExpenses('a', { supplier: 'Fornecedor 2' }).pagination.total, 45);
  assert.equal(listExpenses('a', { has_nif: '1' }).pagination.total, 68);
  assert.equal(listExpenses('a', { year: '2030' }).pagination.total, 137);
  assert.equal(listExpenses('a', { month: '2030-01' }).pagination.total, 16);

  // O total acompanha o filtro.
  const limpeza = listExpenses('a', { category: 'limpeza' });
  const somaLimpeza = limpeza.data.reduce((s, d) => s + d.amount, 0);
  assert.equal(limpeza.pagination.total, limpeza.data.length, 'coube numa página');
  assert.equal(Math.round(limpeza.summary.total_amount), Math.round(somaLimpeza));
});

test('despesas: isolamento entre organizações', () => {
  const todas = [1, 2, 3].flatMap(page => listExpenses('a', { page: String(page) }).data);
  assert(todas.every(d => d.organization_id === 'a'));
  assert(!todas.some(d => d.id === 'db'));
  assert.equal(listExpenses('b').pagination.total, 1);
  assert.equal(listExpenses('b').summary.total_amount, 999);
  assert.equal(listExpenses('a', { search: 'Org B' }).pagination.total, 0);
});

test('despesas: parâmetros inválidos são recusados com 400', () => {
  for (const query of [{ page: '0' }, { limit: '9999' }, { sort: 'receipt_image' },
    { direction: 'up' }, { month: 'junho' }, { year: '30' }, { has_nif: '2' },
    { from: '2030-06-10', to: '2030-06-01' }]) {
    assert.throws(() => listExpenses('a', query), err => err.status === 400, JSON.stringify(query));
  }
});

// ── Conversas (Mensagens) ──────────────────────────────────────────────────

test('conversas: uma por reserva com email real, mais as avulsas, sem duplicar', () => {
  const primeira = listMessageThreads('a');
  // 137 reservas com email real + 7 avulsas. As 5 @reserva.local não contam,
  // e o email avulso que já tem reserva não gera uma segunda conversa.
  assert.equal(primeira.pagination.total, 144);

  const ids = [];
  for (let page = 1; page <= primeira.pagination.pages; page++) {
    ids.push(...listMessageThreads('a', { page: String(page) }).data.map(t => t.id));
  }
  assert.equal(new Set(ids).size, ids.length, 'conversas repetidas entre páginas');
  assert(!ids.some(id => id.startsWith('rx')), 'reserva sem email real gerou conversa');
  assert(!ids.includes('standalone-h000@exemplo.invalid'), 'conversa avulsa duplicou uma de reserva');
  assert.equal(ids.filter(id => id.startsWith('standalone-')).length, 7);
});

test('conversas: as que têm mensagens vêm primeiro; as restantes não desaparecem', () => {
  const primeira = listMessageThreads('a');
  assert(primeira.data[0].last_sent_at, 'a primeira conversa devia ter mensagens');
  const comMensagens = primeira.data.filter(t => t.last_sent_at).length;
  assert.equal(comMensagens, 17, '10 de reserva + 7 avulsas');
  // As conversas sem mensagens continuam listadas, no fim.
  const ultima = listMessageThreads('a', { page: '3' }).data.slice(-1)[0];
  assert.equal(ultima.last_sent_at, null);
});

test('conversas: o resumo vem do corpo da mensagem, sem a moldura da marca', () => {
  const comResumo = listMessageThreads('a').data.find(t => t.id === 'r009');
  assert.equal(comResumo.last_subject, 'Assunto 009');
  assert.equal(comResumo.last_snippet, 'Corpo da mensagem 009');
  assert(!/ALOJAMENTO LOCAL|Licença/.test(comResumo.last_snippet || ''));
  // Uma conversa sem mensagens não traz resumo nenhum.
  const semResumo = listMessageThreads('a', { page: '3' }).data.slice(-1)[0];
  assert.equal(semResumo.last_snippet, undefined);
});

test('conversas: pesquisa abrange todas as páginas', () => {
  // O hóspede 121 está fora da primeira página.
  const encontrado = listMessageThreads('a', { search: 'Hóspede 121' });
  assert.equal(encontrado.pagination.total, 1);
  assert.equal(encontrado.data[0].id, 'r121');
  assert.equal(listMessageThreads('a', { search: 'Suite Alfa' }).pagination.total, 137);
  assert.equal(listMessageThreads('a', { search: 'avulso3@' }).pagination.total, 1);
});

test('conversas: o arquivo é filtrado pelo servidor', () => {
  db.prepare(`INSERT INTO conversation_archives(id,organization_id,thread_key,key_type)
    VALUES('arc','a','r005','reservation')`).run();
  try {
    assert.equal(listMessageThreads('a').pagination.total, 143, 'a arquivada saiu das ativas');
    const arquivadas = listMessageThreads('a', { archived: '1' });
    assert.equal(arquivadas.pagination.total, 1);
    assert.equal(arquivadas.data[0].id, 'r005');
  } finally {
    db.prepare("DELETE FROM conversation_archives WHERE id='arc'").run();
  }
});

test('conversas: isolamento entre organizações', () => {
  const ids = [];
  for (let page = 1; page <= 3; page++) ids.push(...listMessageThreads('a', { page: String(page) }).data.map(t => t.id));
  assert(!ids.includes('rb'), 'conversa de outra organização na lista');
  assert.equal(listMessageThreads('a', { search: 'Org B' }).pagination.total, 0);

  const outra = listMessageThreads('b');
  assert.equal(outra.pagination.total, 1);
  assert.equal(outra.data[0].id, 'rb');
  // O resumo da outra organização também não atravessa.
  assert(!outra.data[0].last_snippet || outra.data[0].last_snippet === 'segredo');
  assert.equal(listMessageThreads('b', { search: 'Hóspede 121' }).pagination.total, 0);
});

test('conversas: parâmetros inválidos são recusados com 400', () => {
  for (const query of [{ page: '0' }, { limit: '9999' }, { sort: 'body_html' },
    { direction: 'up' }, { archived: '2' }]) {
    assert.throws(() => listMessageThreads('a', query), err => err.status === 400, JSON.stringify(query));
  }
});

// ── Coleção do cliente: pesquisas antigas nunca se sobrepõem ───────────────
// Mesma bancada usada em pagination.test.cjs: a coleção é carregada num
// contexto isolado com um apiRequest controlado.

function browser(apiRequest) {
  const context = vm.createContext({ apiRequest, AbortController, URLSearchParams, setTimeout, clearTimeout });
  runFrontend(fs.readFileSync(path.resolve(__dirname, '../../../frontend/js/domain/pagination.js'), 'utf8'), context);
  return context;
}

test('coleção: uma resposta atrasada não substitui uma pesquisa mais recente', async () => {
  const pendentes = [];
  const context = browser((url) => new Promise((resolve, reject) => pendentes.push({ url, resolve, reject })));
  vm.runInContext('const lista = createPagedCollection("/auth/email/threads", () => {});', context);

  const antiga = vm.runInContext('lista.load({ search: "antiga" })', context);
  const recente = vm.runInContext('lista.load({ search: "recente" })', context);

  // A resposta da pesquisa antiga chega DEPOIS de a nova ter começado.
  const pedidoAntigo = pendentes.find(p => p.url.includes('antiga'));
  const pedidoRecente = pendentes.find(p => p.url.includes('recente'));
  pedidoRecente.resolve({ success: true, data: [{ id: 'novo' }], pagination: { page: 1, limit: 50, total: 1, pages: 1, has_more: false } });
  await recente;
  pedidoAntigo.resolve({ success: true, data: [{ id: 'velho' }], pagination: { page: 1, limit: 50, total: 99, pages: 2, has_more: true } });
  await antiga.catch(() => {});

  assert.deepEqual(Array.from(vm.runInContext('lista.state.rows.map(r => r.id)', context)), ['novo']);
  assert.equal(vm.runInContext('lista.state.total', context), 1);
});

test('coleção: um servidor antigo sem paginação é assinalado, não tratado como lista vazia', async () => {
  const context = browser(async () => ({ success: true, data: [{ id: 'x' }] }));
  vm.runInContext('const lista = createPagedCollection("/api/events", () => {});', context);
  await vm.runInContext('lista.load({})', context);
  assert.match(vm.runInContext('lista.state.error', context), /versões diferentes/);
  assert.equal(vm.runInContext('lista.state.rows.length', context), 0);
});

test('coleção: um erro do servidor fica registado como erro, não como lista vazia', async () => {
  const context = browser(async () => { throw new Error('Serviço indisponível'); });
  vm.runInContext('const lista = createPagedCollection("/api/expenses", () => {});', context);
  await vm.runInContext('lista.load({})', context);
  assert.equal(vm.runInContext('lista.state.error', context), 'Serviço indisponível');
  assert.equal(vm.runInContext('lista.state.total', context), 0);
  assert.equal(vm.runInContext('lista.state.rows.length', context), 0);
});
