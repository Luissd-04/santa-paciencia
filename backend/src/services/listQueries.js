const { db } = require('../config/database');
const { normalizeDateValue } = require('./reservationRules');
const { snippet } = require('./emailComposer');
db.function('app_lower', { deterministic: true }, value => String(value ?? '').toLowerCase());

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function textParam(query, name, max = 200) {
  const value = query[name];
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw invalid(`Parâmetro inválido: ${name}.`);
  return value.trim();
}
function pageOptions(query, sorts, defaultSort, defaultLimit = 50, defaultDirection = 'asc') {
  const integer = (name, fallback, max) => {
    const value = query[name];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw invalid(`Parâmetro inválido: ${name}.`);
    return Number(value);
  };
  const page = integer('page', 1, 1000000);
  const limit = integer('limit', defaultLimit, 500);
  const sort = textParam(query, 'sort') || defaultSort;
  const direction = textParam(query, 'direction') || defaultDirection;
  if (!Object.hasOwn(sorts, sort) || !['asc', 'desc'].includes(direction)) throw invalid('Ordenação inválida.');
  return { page, limit, offset: (page - 1) * limit, order: `${sorts[sort]} ${direction.toUpperCase()}` };
}
function metadata(options, total) {
  return { page: options.page, limit: options.limit, total, pages: Math.ceil(total / options.limit), has_more: options.offset + options.limit < total };
}
function searchPattern(value) {
  return '%' + value.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';
}
// Vários valores no mesmo parâmetro (ex.: chips de categoria: types=limpeza,reuniao).
function listParam(query, name, max = 50) {
  const value = textParam(query, name, 400);
  if (!value) return [];
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  if (!items.length || items.length > max) throw invalid(`Parâmetro inválido: ${name}.`);
  return items;
}

function booleanParam(query, name) {
  const value = textParam(query, name, 1);
  if (!value) return null;
  if (!['0', '1'].includes(value)) throw invalid(`Parâmetro inválido: ${name}.`);
  return Number(value);
}

// Intervalo from/to coerente, na forma usada por todas as listas.
function rangeFilter(query, column) {
  const from = dateParam(query, 'from');
  const to = dateParam(query, 'to');
  if (from && to && from > to) throw invalid('Intervalo de datas inválido.');
  const clauses = [], params = [];
  if (from) { clauses.push(` AND ${column} >= ?`); params.push(from); }
  if (to) { clauses.push(` AND ${column} <= ?`); params.push(to); }
  return { where: clauses.join(''), params };
}

function dateParam(query, name) {
  const value = textParam(query, name, 10);
  if (value && normalizeDateValue(value) !== value) throw invalid(`Data inválida: ${name}.`);
  return value;
}

const RESERVATION_SORTS = Object.fromEntries([
  'id', 'check_in', 'check_out', 'created_at', 'nights', 'num_guests', 'total_amount', 'amount_paid', 'status', 'payment_status', 'channel',
].map(key => [key, `r.${key}`]));
Object.assign(RESERVATION_SORTS, { guest_name: 'g.name COLLATE NOCASE', guest_email: 'g.email COLLATE NOCASE', accommodation_name: 'a.name COLLATE NOCASE' });

function listReservations(organizationId, query = {}) {
  const options = pageOptions(query, RESERVATION_SORTS, 'check_in');
  const scope = textParam(query, 'scope', 20) || 'all';
  if (!['operational', 'past', 'all'].includes(scope)) throw invalid('Período de reservas inválido.');
  const today = dateParam(query, 'today');
  if (scope !== 'all' && !today) throw invalid('Data de referência em falta.');
  const params = [organizationId];
  let where = ' WHERE r.organization_id = ?';
  for (const key of ['status', 'channel', 'payment_status']) {
    const value = textParam(query, key);
    if (value) { where += ` AND r.${key} = ?`; params.push(value); }
  }
  const search = textParam(query, 'search');
  if (search) {
    where += " AND app_lower(g.name || ' ' || r.id || ' ' || COALESCE(g.email,'') || ' ' || a.name) LIKE ? ESCAPE '\\'";
    params.push(searchPattern(search));
  }
  const accommodation = textParam(query, 'accommodation_id');
  if (accommodation) {
    where += ' AND EXISTS (SELECT 1 FROM reservation_units ru WHERE ru.reservation_id=r.id AND ru.organization_id=r.organization_id AND ru.accommodation_id=?)';
    params.push(accommodation);
  }
  for (const [key, expression] of Object.entries({ from: 'r.check_in >=', to: 'r.check_out <=', check_in: 'r.check_in =', check_out: 'r.check_out =', overlap_from: 'r.check_out >=', overlap_to: 'r.check_in <=' })) {
    const value = dateParam(query, key);
    if (value) { where += ` AND ${expression} ?`; params.push(value); }
  }
  for (const [start, end] of [['from', 'to'], ['overlap_from', 'overlap_to']]) {
    if (query[start] && query[end] && query[start] > query[end]) throw invalid('Intervalo de datas inválido.');
  }
  const joined = ` FROM reservations r
    JOIN guests g ON g.id=r.guest_id AND g.organization_id=r.organization_id
    JOIN accommodations a ON a.id=r.accommodation_id AND a.organization_id=r.organization_id`;
  const summaryWhere = where;
  const summaryParams = [...params];
  if (scope === 'operational') {
    where += " AND r.status != 'cancelada' AND r.check_out >= ?";
    params.push(today);
  } else if (scope === 'past') {
    where += " AND r.status != 'cancelada' AND r.check_out < ?";
    params.push(today);
  }
  return db.transaction(() => {
    const summaryRow = today
      ? db.prepare(`SELECT COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN r.status!='cancelada' AND r.check_out>=? THEN 1 ELSE 0 END),0) AS operational,
          COALESCE(SUM(CASE WHEN r.status!='cancelada' AND r.check_out<? THEN 1 ELSE 0 END),0) AS past`
          + joined + summaryWhere).get(today, today, ...summaryParams)
      : db.prepare('SELECT COUNT(*) AS total' + joined + summaryWhere).get(...summaryParams);
    const total = db.prepare('SELECT COUNT(*) AS total' + joined + where).get(...params).total;
    const data = db.prepare(`SELECT r.*, g.name AS guest_name, g.email AS guest_email, g.phone AS guest_phone, a.name AS accommodation_name,
      (SELECT oe.status FROM operational_events oe JOIN reservations current ON current.id=oe.reservation_id AND current.organization_id=oe.organization_id
        WHERE oe.organization_id=r.organization_id AND oe.reservation_id=r.id AND oe.auto_kind='checkin'
        ORDER BY (oe.date=current.check_in) DESC, oe.created_at DESC LIMIT 1) AS checkin_task_status,
      (SELECT oe.status FROM operational_events oe JOIN reservations current ON current.id=oe.reservation_id AND current.organization_id=oe.organization_id
        WHERE oe.organization_id=r.organization_id AND oe.reservation_id=r.id AND oe.auto_kind='checkout'
        ORDER BY (oe.date=current.check_out) DESC, oe.created_at DESC LIMIT 1) AS checkout_task_status`
      + joined + where + ` ORDER BY ${options.order}, r.id ASC LIMIT ? OFFSET ?`)
      .all(...params, options.limit, options.offset);
    for (const row of data) {
      row.task_status = { checkin_done: row.checkin_task_status === 'concluido', checkout_done: row.checkout_task_status === 'concluido' };
      delete row.checkin_task_status;
      delete row.checkout_task_status;
    }
    const summary = { all: summaryRow.total };
    if (today) Object.assign(summary, { operational: summaryRow.operational, past: summaryRow.past });
    return { data, pagination: metadata(options, total), summary };
  })();
}

const GUEST_SORTS = Object.fromEntries(['name', 'email', 'phone', 'nationality', 'country', 'last_check_in', 'reservation_count'].map(key => [key, key + (['last_check_in', 'reservation_count'].includes(key) ? '' : ' COLLATE NOCASE')]));
function listGuests(organizationId, query = {}) {
  const options = pageOptions(query, GUEST_SORTS, 'name', query.search && !query.page ? 20 : 50);
  const search = textParam(query, 'search');
  const params = [organizationId, organizationId];
  let where = ' WHERE g.organization_id=?';
  if (search) {
    where += " AND app_lower(g.name || ' ' || COALESCE(g.email,'') || ' ' || COALESCE(g.email_personal,'') || ' ' || COALESCE(g.nationality,'') || ' ' || COALESCE(g.phone,'') || ' ' || COALESCE(g.country,'') || ' ' || COALESCE(g.company,'')) LIKE ? ESCAPE '\\'";
    params.push(searchPattern(search));
  }
  const source = `WITH counts AS (
      SELECT guest_id, COUNT(*) AS reservation_count, MAX(check_in) AS last_check_in
      FROM reservations WHERE organization_id=? AND status!='cancelada' GROUP BY guest_id
    ), matches AS (
      SELECT g.*, COALESCE(c.reservation_count,0) AS reservation_count, c.last_check_in
      FROM guests g LEFT JOIN counts c ON c.guest_id=g.id ${where}
    ) `;
  return db.transaction(() => {
    const summary = db.prepare(source + `SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN is_vip=1 OR is_favorite=1 THEN 1 ELSE 0 END),0) AS vip,
      COALESCE(SUM(CASE WHEN reservation_count>1 THEN 1 ELSE 0 END),0) AS repeat FROM matches`).get(...params);
    const data = db.prepare(source + `SELECT * FROM matches ORDER BY ${options.order}, id ASC LIMIT ? OFFSET ?`).all(...params, options.limit, options.offset);
    return { data, pagination: metadata(options, summary.total), summary };
  })();
}

// ── Eventos operacionais ───────────────────────────────────────────────────
// A vista tem dois consumos distintos, como o calendário de reservas: os modos
// calendário/timeline/agenda pedem um intervalo de datas, a lista pede páginas.
// Ambos passam por aqui.
const EVENT_SORTS = {
  date: 'e.date',
  title: 'e.title COLLATE NOCASE',
  type: 'e.type',
  status: 'e.status',
  responsible: 'e.responsible COLLATE NOCASE',
  important: 'e.important',
  created_at: 'e.created_at',
  accommodation_name: 'a.name COLLATE NOCASE',
};

function listEvents(organizationId, query = {}) {
  const options = pageOptions(query, EVENT_SORTS, 'date');
  const params = [organizationId];
  let where = ' WHERE e.organization_id = ?';

  for (const key of ['type', 'status', 'accommodation_id', 'reservation_id']) {
    const value = textParam(query, key);
    if (value) { where += ` AND e.${key} = ?`; params.push(value); }
  }

  // Chips de categoria: vários tipos ativos ao mesmo tempo.
  const types = listParam(query, 'types');
  if (types.length) {
    where += ` AND e.type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }

  const important = booleanParam(query, 'important');
  if (important !== null) { where += ' AND COALESCE(e.important,0) = ?'; params.push(important); }

  const range = rangeFilter(query, 'e.date');
  where += range.where;
  params.push(...range.params);

  const search = textParam(query, 'search');
  if (search) {
    where += " AND app_lower(e.title || ' ' || COALESCE(e.responsible,'') || ' ' || COALESCE(e.notes,'') || ' ' || COALESCE(a.name,'')) LIKE ? ESCAPE '\\'";
    params.push(searchPattern(search));
  }

  const joined = ` FROM operational_events e
    LEFT JOIN accommodations a ON a.id = e.accommodation_id AND a.organization_id = e.organization_id
    LEFT JOIN users u ON u.id = e.created_by_user_id`;

  return db.transaction(() => {
    const summary = db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN e.status='concluido' THEN 1 ELSE 0 END),0) AS concluidos,
      COALESCE(SUM(CASE WHEN COALESCE(e.important,0)=1 THEN 1 ELSE 0 END),0) AS importantes`
      + joined + where).get(...params);
    // Ordem estável: sem os critérios de desempate, duas páginas seguidas
    // podiam repetir ou saltar eventos com a mesma data.
    const data = db.prepare('SELECT e.*, a.name AS accommodation_name, u.name AS created_by_name'
      + joined + where
      + ` ORDER BY ${options.order}, COALESCE(e.start_time,'99:99') ASC, e.created_at ASC, e.id ASC LIMIT ? OFFSET ?`)
      .all(...params, options.limit, options.offset);
    return { data, pagination: metadata(options, summary.total), summary };
  })();
}

// ── Despesas ───────────────────────────────────────────────────────────────
// O total do filtro ativo vem com a página: sem ele, a soma mostrada seria
// apenas a dos 50 registos visíveis.
const EXPENSE_SORTS = {
  date: 'date',
  amount: 'amount',
  description: 'description COLLATE NOCASE',
  category: 'category',
  supplier: 'supplier COLLATE NOCASE',
  payment_method: 'payment_method',
  invoice_ref: 'invoice_ref COLLATE NOCASE',
  created_at: 'created_at',
};

function listExpenses(organizationId, query = {}) {
  // Por omissão a mais recente primeiro, como a vista sempre mostrou.
  const options = pageOptions(query, EXPENSE_SORTS, 'date', 50, 'desc');
  const params = [organizationId];
  let where = ' WHERE organization_id = ?';

  for (const key of ['category', 'payment_method']) {
    const value = textParam(query, key);
    if (value) { where += ` AND ${key} = ?`; params.push(value); }
  }

  const supplier = textParam(query, 'supplier');
  if (supplier) { where += " AND IFNULL(supplier,'') = ?"; params.push(supplier); }

  const invoiceRef = textParam(query, 'invoice_ref');
  if (invoiceRef) { where += " AND IFNULL(invoice_ref,'') = ?"; params.push(invoiceRef); }

  const hasNif = booleanParam(query, 'has_nif');
  if (hasNif !== null) { where += ' AND COALESCE(has_nif,0) = ?'; params.push(hasNif); }

  // month (AAAA-MM) e year (AAAA) mantêm-se: é como a vista escolhe o período.
  const month = textParam(query, 'month', 7);
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw invalid('Parâmetro inválido: month.');
    where += ' AND substr(date,1,7) = ?'; params.push(month);
  }
  const year = textParam(query, 'year', 4);
  if (year) {
    if (!/^\d{4}$/.test(year)) throw invalid('Parâmetro inválido: year.');
    where += ' AND substr(date,1,4) = ?'; params.push(year);
  }

  const range = rangeFilter(query, 'date');
  where += range.where;
  params.push(...range.params);

  const search = textParam(query, 'search');
  if (search) {
    where += " AND app_lower(description || ' ' || COALESCE(supplier,'') || ' ' || COALESCE(invoice_ref,'') || ' ' || COALESCE(notes,'') || ' ' || COALESCE(category,'')) LIKE ? ESCAPE '\\'";
    params.push(searchPattern(search));
  }

  return db.transaction(() => {
    const summary = db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(amount),0) AS total_amount,
      COALESCE(SUM(CASE WHEN COALESCE(has_nif,0)=1 THEN amount ELSE 0 END),0) AS total_com_nif
      FROM expenses` + where).get(...params);
    const data = db.prepare('SELECT * FROM expenses' + where
      + ` ORDER BY ${options.order}, created_at DESC, id ASC LIMIT ? OFFSET ?`)
      .all(...params, options.limit, options.offset);
    return { data, pagination: metadata(options, summary.total), summary };
  })();
}

// ── Conversas (vista Mensagens) ────────────────────────────────────────────
// A vista mostra uma conversa por reserva com email real, mais as conversas
// avulsas (emails enviados sem reserva associada). Antes, o cliente carregava
// TODAS as reservas e TODOS os hóspedes por páginas e cruzava-os em memória;
// agora o cruzamento é feito aqui e só volta a página pedida.
//
// `@reserva.local` é o email de marcador usado quando não há email real do
// hóspede (ver realEmail() no frontend) — essas reservas não dão conversa.
const THREAD_SORTS = {
  last_sent_at: 'last_sent_at',
  guest_name: 'guest_name COLLATE NOCASE',
  check_in: 'check_in',
};

function listMessageThreads(organizationId, query = {}) {
  const options = pageOptions(query, THREAD_SORTS, 'last_sent_at', 50, 'desc');
  const archived = booleanParam(query, 'archived') === 1;
  const search = textParam(query, 'search');

  const source = `
    WITH ultima AS (
      SELECT app_lower(to_email) AS email, MAX(sent_at) AS last_sent_at
      FROM invoice_messages WHERE organization_id = :org
      GROUP BY app_lower(to_email)
    ),
    emails_com_reserva AS (
      SELECT DISTINCT app_lower(g.email) AS email
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
      WHERE r.organization_id = :org
        AND COALESCE(g.email,'') != '' AND g.email NOT LIKE '%@reserva.local'
    ),
    conversas AS (
      SELECT
        r.id                AS id,
        0                   AS standalone,
        g.name              AS guest_name,
        g.email             AS guest_email,
        r.check_in          AS check_in,
        r.check_out         AS check_out,
        r.status            AS status,
        r.total_amount      AS total_amount,
        a.name              AS alojamento,
        u.last_sent_at      AS last_sent_at
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id AND g.organization_id = r.organization_id
      JOIN accommodations a ON a.id = r.accommodation_id AND a.organization_id = r.organization_id
      LEFT JOIN ultima u ON u.email = app_lower(g.email)
      WHERE r.organization_id = :org
        AND COALESCE(g.email,'') != '' AND g.email NOT LIKE '%@reserva.local'

      UNION ALL

      -- Conversas avulsas: emails sem reserva, agrupados por destinatário, e
      -- só quando esse email não tem já uma conversa de reserva.
      SELECT
        'standalone-' || app_lower(m.to_email) AS id,
        1 AS standalone,
        COALESCE(
          (SELECT g2.name FROM guests g2
            WHERE g2.organization_id = m.organization_id
              AND (app_lower(g2.email) = app_lower(m.to_email)
                OR app_lower(COALESCE(g2.email_personal,'')) = app_lower(m.to_email))
            LIMIT 1),
          MAX(m.to_name), MAX(m.to_email)
        ) AS guest_name,
        MAX(m.to_email) AS guest_email,
        NULL AS check_in, NULL AS check_out, NULL AS status, NULL AS total_amount,
        '' AS alojamento,
        MAX(m.sent_at) AS last_sent_at
      FROM invoice_messages m
      WHERE m.organization_id = :org
        AND m.reservation_id IS NULL
        AND app_lower(m.to_email) NOT IN (SELECT email FROM emails_com_reserva)
      GROUP BY app_lower(m.to_email)
    ),
    filtradas AS (
      SELECT * FROM conversas
      WHERE (id IN (SELECT thread_key FROM conversation_archives WHERE organization_id = :org)) = :arquivadas
  `;

  const params = { org: organizationId, arquivadas: archived ? 1 : 0 };
  let where = '';
  if (search) {
    where = ` AND app_lower(COALESCE(guest_name,'') || ' ' || COALESCE(guest_email,'') || ' ' || COALESCE(alojamento,'')) LIKE :procura ESCAPE '\\'`;
    params.procura = searchPattern(search);
  }
  const closing = ' ) ';

  return db.transaction(() => {
    const total = db.prepare(source + where + closing + 'SELECT COUNT(*) AS total FROM filtradas').get(params).total;
    // Sem mensagens, a conversa vai para o fim — como na ordenação que a vista
    // já fazia (as reservas por contactar ficam depois das conversas ativas).
    const data = db.prepare(source + where + closing +
      `SELECT * FROM filtradas
       ORDER BY last_sent_at IS NULL, ${options.order}, check_in DESC, id ASC
       LIMIT :limite OFFSET :salto`)
      .all({ ...params, limite: options.limit, salto: options.offset });

    // Resumo da última mensagem, só para as conversas desta página. O corpo
    // completo nunca sai daqui: a lista precisa de 80 caracteres, não de
    // dezenas de KB de HTML por conversa.
    const comMensagens = data.filter(t => t.last_sent_at);
    if (comMensagens.length) {
      const marcadores = comMensagens.map(() => '?').join(',');
      const ultimas = db.prepare(`
        SELECT app_lower(to_email) AS email, subject, body_html, sent_at
        FROM invoice_messages
        WHERE organization_id = ? AND app_lower(to_email) IN (${marcadores})
        ORDER BY sent_at ASC
      `).all(organizationId, ...comMensagens.map(t => String(t.guest_email || '').toLowerCase()));

      // ORDER BY ascendente + sobrescrita: fica a mais recente de cada email.
      const porEmail = new Map();
      for (const linha of ultimas) porEmail.set(linha.email, linha);
      for (const conversa of data) {
        const ultima = porEmail.get(String(conversa.guest_email || '').toLowerCase());
        if (!ultima) continue;
        conversa.last_subject = ultima.subject || '';
        conversa.last_snippet = snippet(ultima.subject, ultima.body_html);
      }
    }

    return { data, pagination: metadata(options, total) };
  })();
}

module.exports = { listReservations, listGuests, listEvents, listExpenses, listMessageThreads };
