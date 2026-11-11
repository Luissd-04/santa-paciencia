// Pedidos e mensagens de suporte («Ajuda e feedback» e Suporte da consola).
// O acesso passa sempre por services/supportAccess.js e os anexos por
// services/supportAttachments.js. Os avisos (push e email) são assíncronos e
// nunca falham o pedido.
const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { findVisibleTicket, listVisibilityWhere } = require('./supportAccess');
const attachments = require('./supportAttachments');

const TYPES = ['problem', 'improvement', 'question'];
const STATUSES = ['open', 'in_review', 'needs_customer', 'resolved'];
const SUBJECT_MIN = 3;
const SUBJECT_MAX = 120;
const BODY_MAX = 5000;
const CONTEXT_MAX = 100;
const TEAM = 'Equipa Santa Paciência';
const CONTEXT_KEYS = ['page', 'app_build', 'browser', 'os', 'device', 'display_mode', 'viewport'];

// ISO estritamente crescente: duas gravações no mesmo milissegundo não empatam
// (a comparação entre mensagens e leituras depende disso).
let lastStamp = 0;
function now() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

const numberLabel = n => 'SP-' + String(n).padStart(4, '0');

// ---------- validação ----------
function cleanBody(value) {
  const body = typeof value === 'string' ? value.trim() : '';
  if (!body) throw httpError('Escreva a mensagem.', 400);
  if (body.length > BODY_MAX) throw httpError(`A mensagem pode ter no máximo ${BODY_MAX} caracteres.`, 400);
  return body;
}
function cleanSubject(value) {
  const subject = typeof value === 'string' ? value.trim() : '';
  if (subject.length < SUBJECT_MIN) throw httpError(`O assunto precisa de pelo menos ${SUBJECT_MIN} caracteres.`, 400);
  if (subject.length > SUBJECT_MAX) throw httpError(`O assunto pode ter no máximo ${SUBJECT_MAX} caracteres.`, 400);
  return subject;
}
function cleanStatus(value) {
  if (!STATUSES.includes(value)) throw httpError('Estado inválido.', 400);
  return value;
}
const text = value => (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
  ? String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CONTEXT_MAX) || null : null;

// A página manda { width, height }; guarda-se como «1440×900».
const viewportText = value => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const w = Math.round(Number(value.width)), h = Math.round(Number(value.height));
    return w > 0 && w < 100000 ? (h > 0 && h < 100000 ? `${w}×${h}` : String(w)) : null;
  }
  return text(value);
};

// Só as chaves conhecidas; o IP nunca entra. Sem contexto do cliente: null
// (o utilizador desligou a opção) e o user agent também não é guardado.
function buildContext(context, userAgent) {
  if (context === undefined || context === null) return null;
  if (typeof context !== 'object' || Array.isArray(context)) throw httpError('Contexto inválido.', 400);
  const ua = require('./userAgent').parseUserAgent(userAgent || '');
  const merged = {
    page: text(context.page), app_build: text(context.app_build),
    browser: text(ua.browser), os: text(ua.os), device: text(ua.device),
    display_mode: text(context.display_mode), viewport: viewportText(context.viewport),
  };
  return Object.fromEntries(CONTEXT_KEYS.map(k => [k, merged[k]]));
}

// ---------- apresentação ----------
function unreadCustomerSql(alias = 't') {
  return `EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = ${alias}.id AND m.side = 'platform'
    AND m.created_at > COALESCE((SELECT r.read_at FROM support_reads r WHERE r.ticket_id = ${alias}.id AND r.user_id = ?), ''))`;
}
const unreadPlatformSql = (alias = 't') => `EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = ${alias}.id AND m.side = 'customer'
    AND m.created_at > COALESCE(${alias}.platform_read_at, ''))`;

function shape(row) {
  return {
    id: row.id, number: numberLabel(row.number), type: row.type, subject: row.subject, status: row.status,
    created_at: row.created_at, updated_at: row.updated_at, last_message_at: row.last_message_at,
    unread: !!row.unread,
    author: row.author_user_id && row.author_name != null ? { name: row.author_name } : null,
    customer_confirmed_at: row.customer_confirmed_at || null,
  };
}
const withOrganization = row => ({ ...shape(row), organization: { id: row.organization_id, name: row.organization_name } });

const SELECT_BASE = `SELECT t.*, u.name AS author_name, o.name AS organization_name`;
const JOINS = `FROM support_tickets t LEFT JOIN users u ON u.id = t.author_user_id JOIN organizations o ON o.id = t.organization_id`;

function ticketForUser(user, id) {
  return shape(db.prepare(`${SELECT_BASE}, ${unreadCustomerSql()} AS unread ${JOINS} WHERE t.id = ?`).get(user.id, id));
}
function ticketForPlatform(id) {
  return withOrganization(db.prepare(`${SELECT_BASE}, ${unreadPlatformSql()} AS unread ${JOINS} WHERE t.id = ?`).get(id));
}

function parseContext(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function messagesOf(ticketId, urlBase) {
  const files = new Map();
  for (const a of db.prepare('SELECT * FROM support_attachments WHERE ticket_id = ? ORDER BY created_at, rowid').all(ticketId)) {
    if (!files.has(a.message_id)) files.set(a.message_id, []);
    files.get(a.message_id).push({ id: a.id, name: a.original_name, size: a.size, mime: a.mime, url: `${urlBase}/${a.id}` });
  }
  return db.prepare(`SELECT m.*, u.name AS author_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_user_id
    WHERE m.ticket_id = ? ORDER BY m.created_at, m.rowid`).all(ticketId).map(m => shapeMessage(m, files.get(m.id) || []));
}
const shapeMessage = (m, files) => ({
  id: m.id, side: m.side, author_name: m.side === 'platform' ? TEAM : (m.author_name ?? null),
  body: m.body, created_at: m.created_at, attachments: files,
});
const CUSTOMER_FILES = '/api/support/attachments';
const PLATFORM_FILES = '/api/platform/support/attachments';

function messageById(id, urlBase) {
  const m = db.prepare('SELECT m.*, u.name AS author_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_user_id WHERE m.id = ?').get(id);
  const files = db.prepare('SELECT * FROM support_attachments WHERE message_id = ? ORDER BY rowid').all(id)
    .map(a => ({ id: a.id, name: a.original_name, size: a.size, mime: a.mime, url: `${urlBase}/${a.id}` }));
  return shapeMessage(m, files);
}

// ---------- escrita ----------
// Insere a mensagem (e anexos) e atualiza o pedido; tudo numa transação.
// Se falhar, apaga os ficheiros já gravados.
function insertMessage({ ticket, side, userId, body, stored, status = null, extra = {} }) {
  const messageId = crypto.randomUUID();
  const at = now();
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO support_messages (id, ticket_id, side, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(messageId, ticket.id, side, userId, body, at);
      for (const f of stored) {
        db.prepare('INSERT INTO support_attachments (id, message_id, ticket_id, original_name, mime, size, stored_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(crypto.randomUUID(), messageId, ticket.id, f.original_name, f.mime, f.size, f.stored_name, at);
      }
      const sets = ['updated_at = ?', 'last_message_at = ?'];
      const params = [at, at];
      if (status) { sets.push('status = ?'); params.push(status); }
      for (const [col, value] of Object.entries(extra)) { sets.push(`${col} = ?`); params.push(value); }
      db.prepare(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`).run(...params, ticket.id);
    })();
  } catch (err) {
    attachments.removeStored(stored);
    throw err;
  }
  return { messageId, at };
}

function create(user, input, meta = {}) {
  const data = input || {};
  if (!TYPES.includes(data.type)) throw httpError('Tipo de pedido inválido.', 400);
  const subject = cleanSubject(data.subject);
  const body = cleanBody(data.body);
  const context = buildContext(data.context, meta.userAgent);
  if (!user?.id || !user.organization_id) throw httpError('Sessão inválida.', 401);
  const stored = attachments.validateAndStore(data.attachments);
  const id = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const at = now();
  try {
    db.transaction(() => {
      const number = (db.prepare('SELECT COALESCE(MAX(number), 0) AS n FROM support_tickets').get().n || 0) + 1;
      db.prepare(`INSERT INTO support_tickets (id, number, organization_id, author_user_id, type, subject, status, context_json, created_at, updated_at, last_message_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`)
        .run(id, number, user.organization_id, user.id, data.type, subject, context ? JSON.stringify(context) : null, at, at, at);
      db.prepare("INSERT INTO support_messages (id, ticket_id, side, author_user_id, body, created_at) VALUES (?, ?, 'customer', ?, ?, ?)")
        .run(messageId, id, user.id, body, at);
      for (const f of stored) {
        db.prepare('INSERT INTO support_attachments (id, message_id, ticket_id, original_name, mime, size, stored_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(crypto.randomUUID(), messageId, id, f.original_name, f.mime, f.size, f.stored_name, at);
      }
    }).immediate();
  } catch (err) {
    attachments.removeStored(stored);
    throw err;
  }
  const ticket = ticketForUser(user, id);
  notifyPlatform(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id), 'new');
  return ticket;
}

function addCustomerMessage(user, id, input) {
  const ticket = findVisibleTicket(user, id);
  const body = cleanBody((input || {}).body);
  const stored = attachments.validateAndStore((input || {}).attachments);
  const reopen = ticket.status === 'needs_customer' || ticket.status === 'resolved';
  const { messageId } = insertMessage({ ticket, side: 'customer', userId: user.id, body, stored,
    status: reopen ? 'open' : null, extra: reopen ? { customer_confirmed_at: null } : {} });
  notifyPlatform(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id), 'message');
  return messageById(messageId, CUSTOMER_FILES);
}

function feedback(user, id, resolved) {
  const ticket = findVisibleTicket(user, id);
  if (typeof resolved !== 'boolean') throw httpError('Indique se o problema ficou resolvido.', 400);
  if (resolved) {
    if (ticket.status !== 'resolved') throw httpError('Só pode confirmar um pedido já resolvido.', 409);
    const at = now();
    db.prepare('UPDATE support_tickets SET customer_confirmed_at = ?, updated_at = ?, last_message_at = ? WHERE id = ?').run(at, at, at, ticket.id);
  } else {
    insertMessage({ ticket, side: 'customer', userId: user.id, body: 'O problema continua.', stored: [], status: 'open',
      extra: { customer_confirmed_at: null } });
    notifyPlatform(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id), 'message');
  }
  return ticketForUser(user, ticket.id);
}

function addPlatformMessage(admin, id, input) {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(typeof id === 'string' ? id : '');
  if (!ticket) throw httpError('Pedido não encontrado.', 404);
  const data = input || {};
  const body = cleanBody(data.body);
  const status = data.status === undefined || data.status === null ? null : cleanStatus(data.status);
  const stored = attachments.validateAndStore(data.attachments);
  const extra = {};
  if (status && status !== 'resolved') extra.customer_confirmed_at = null;
  const { messageId, at } = insertMessage({ ticket, side: 'platform', userId: admin?.id || null, body, stored, status, extra });
  // Quem responde já leu o pedido.
  db.prepare('UPDATE support_tickets SET platform_read_at = ? WHERE id = ?').run(at, ticket.id);
  notifyCustomer(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticket.id));
  return messageById(messageId, PLATFORM_FILES);
}

function setStatus(_admin, id, status) {
  cleanStatus(status);
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(typeof id === 'string' ? id : '');
  if (!ticket) throw httpError('Pedido não encontrado.', 404);
  const at = now();
  db.prepare('UPDATE support_tickets SET status = ?, customer_confirmed_at = CASE WHEN ? = \'resolved\' THEN customer_confirmed_at ELSE NULL END, updated_at = ?, last_message_at = ? WHERE id = ?')
    .run(status, status, at, at, ticket.id);
  return ticketForPlatform(ticket.id);
}

// ---------- leitura ----------
function listForUser(user, { status } = {}) {
  const filter = status === undefined || status === null || status === '' ? 'all' : status;
  if (!['all', 'open', 'in_review', 'needs_customer', 'resolved'].includes(filter)) throw httpError('Filtro de estado inválido.', 400);
  const vis = listVisibilityWhere(user, 't');
  const where = [vis.sql];
  const params = [...vis.params];
  if (filter === 'open') where.push("t.status IN ('open', 'needs_customer')");
  else if (filter !== 'all') { where.push('t.status = ?'); params.push(filter); }
  const rows = db.prepare(`${SELECT_BASE}, ${unreadCustomerSql()} AS unread ${JOINS} WHERE ${where.join(' AND ')} ORDER BY t.last_message_at DESC, t.number DESC`)
    .all(user.id, ...params);
  const c = db.prepare(`SELECT t.status AS s, COUNT(*) AS n FROM support_tickets t WHERE ${vis.sql} GROUP BY t.status`).all(...vis.params);
  const n = s => c.find(r => r.s === s)?.n || 0;
  return {
    tickets: rows.map(shape),
    counts: { all: c.reduce((a, r) => a + r.n, 0), open: n('open') + n('needs_customer'), in_review: n('in_review'), resolved: n('resolved') },
  };
}

function getForUser(user, id) {
  const ticket = findVisibleTicket(user, id);
  const result = {
    ticket: ticketForUser(user, ticket.id),
    messages: messagesOf(ticket.id, CUSTOMER_FILES),
    context: parseContext(ticket.context_json),
  };
  db.prepare(`INSERT INTO support_reads (ticket_id, user_id, read_at) VALUES (?, ?, ?)
    ON CONFLICT(ticket_id, user_id) DO UPDATE SET read_at = excluded.read_at`).run(ticket.id, user.id, now());
  return { ...result, ticket: { ...result.ticket, unread: false } };
}

function listForPlatform({ status, type, q, organization_id } = {}) {
  const filter = status === undefined || status === null || status === '' ? 'all' : status;
  if (filter !== 'all') cleanStatus(filter);
  if (type !== undefined && type !== null && type !== '' && !TYPES.includes(type)) throw httpError('Tipo de pedido inválido.', 400);
  const where = [];
  const params = [];
  if (type) { where.push('t.type = ?'); params.push(type); }
  if (organization_id) { where.push('t.organization_id = ?'); params.push(String(organization_id)); }
  const term = typeof q === 'string' ? q.trim().slice(0, 120) : '';
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(`(t.subject LIKE ? ESCAPE '\\' OR ('SP-' || printf('%04d', t.number)) LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`${SELECT_BASE}, ${unreadPlatformSql()} AS unread ${JOINS} ${base}${filter !== 'all' ? `${base ? ' AND' : 'WHERE'} t.status = ?` : ''}
    ORDER BY t.last_message_at DESC, t.number DESC`).all(...params, ...(filter !== 'all' ? [filter] : []));
  const c = db.prepare(`SELECT t.status AS s, COUNT(*) AS n FROM support_tickets t ${base} GROUP BY t.status`).all(...params);
  const counts = { all: 0, open: 0, in_review: 0, needs_customer: 0, resolved: 0 };
  for (const r of c) { counts[r.s] = r.n; counts.all += r.n; }
  return { tickets: rows.map(withOrganization), counts };
}

function getForPlatform(id) {
  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(typeof id === 'string' ? id : '');
  if (!ticket) throw httpError('Pedido não encontrado.', 404);
  const result = {
    ticket: ticketForPlatform(ticket.id),
    messages: messagesOf(ticket.id, PLATFORM_FILES),
    context: parseContext(ticket.context_json),
    organization: { id: ticket.organization_id, name: db.prepare('SELECT name FROM organizations WHERE id = ?').get(ticket.organization_id)?.name ?? null },
  };
  db.prepare('UPDATE support_tickets SET platform_read_at = ? WHERE id = ?').run(now(), ticket.id);
  return { ...result, ticket: { ...result.ticket, unread: false } };
}

// ---------- resumo e incidentes ----------
const INCIDENT_TEXT = {
  Gmail: ['Envio de emails', 'O envio de emails pelo Gmail está com problemas. Já estamos a tratar.'],
  'Google Calendar': ['Google Calendar', 'A sincronização com o Google Calendar está atrasada. Já estamos a tratar.'],
  'Google Tasks': ['Google Tasks', 'A limpeza das tarefas no Google Tasks está atrasada. Já estamos a tratar.'],
  Stripe: ['Pagamentos online', 'Alguns pagamentos online estão demorados a processar. Já estamos a tratar.'],
  Pagamentos: ['Pagamentos', 'Há cancelamentos que precisam de revisão. Já estamos a tratar.'],
};
const toIso = value => {
  if (!value) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function incidentsFor(orgId) {
  try {
    const platform = require('./platformService');
    const found = require('./opsAlerts').problems(require('./opsStatus').opsStatus(orgId)).filter(p => !platform.isInstanceKey(p.key));
    const since = new Map(db.prepare('SELECT key, notified_at FROM ops_alerts WHERE organization_id = ? AND resolved_at IS NULL').all(orgId)
      .map(r => [r.key, toIso(r.notified_at)]));
    return found.map(p => {
      const provider = platform.providerOf(p.key);
      const [title, detail] = INCIDENT_TEXT[provider] || ['Serviço', 'Há um problema técnico em curso. Já estamos a tratar.'];
      return { provider, title, detail, since: since.get(p.key) || null };
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', event: 'support_summary_incidents_failed', error: err.message }));
    return [];
  }
}

function summary(user) {
  const vis = listVisibilityWhere(user, 't');
  const row = db.prepare(`SELECT COALESCE(SUM(${unreadCustomerSql()}), 0) AS unread, COALESCE(SUM(t.status = 'needs_customer'), 0) AS needs
    FROM support_tickets t WHERE ${vis.sql}`).get(user?.id ?? '', ...vis.params);
  return { unread: row.unread, needs_customer: row.needs, incidents: user?.organization_id ? incidentsFor(user.organization_id) : [] };
}

// ---------- avisos ----------
const pending = new Set();
function track(promise) {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
}
/** Espera pelos avisos em curso (para os testes). */
const flushNotifications = async () => { while (pending.size) await Promise.allSettled([...pending]); };

const warn = (step, err, ticket) => console.error(JSON.stringify({ level: 'warn', event: 'support_notify_failed', step, ticket: ticket?.id, error: err?.message || String(err) }));
const origin = () => { try { return require('./publicOrigin').configuredOrigin(); } catch { return ''; } };
const attempt = async (step, ticket, fn) => { try { return await fn(); } catch (err) { warn(step, err, ticket); return undefined; } };

function pushBody(ticket, title, url) {
  const payload = require('./staffNotifier').pushPayload({ title, body: ticket.subject, url, tag: `sp-support-${ticket.id}` });
  return { ...payload, actions: [{ action: 'open', title: 'Abrir pedido' }] };
}
function mailBody(orgId, ticket, headline, path) {
  return require('./accountEmails').compose(orgId, {
    subject: `${numberLabel(ticket.number)}: ${headline}`, title: headline, eyebrow: 'Suporte',
    paragraphs: [`${numberLabel(ticket.number)} · ${require('./emailComposer').escapeHtml(ticket.subject)}`],
    cta: { url: `${origin()}${path}`, label: 'Abrir pedido' },
  });
}

function platformAdmins() {
  const access = require('./platformAccess');
  return db.prepare('SELECT id FROM users WHERE platform_admin = 1 AND active = 1').all().filter(u => access.isPlatformAdmin(u));
}

function notifyPlatform(ticket, kind) {
  track((async () => {
    const headline = kind === 'new' ? 'Novo pedido de suporte' : 'Nova mensagem num pedido';
    const path = `/plataforma/suporte/${ticket.id}`;
    for (const admin of await attempt('admins', ticket, platformAdmins) || []) {
      const adminOrgs = db.prepare('SELECT organization_id FROM memberships WHERE user_id = ? AND active = 1 ORDER BY rowid').all(admin.id).map(r => r.organization_id);
      for (const orgId of adminOrgs) {
        await attempt('push_platform', ticket, () => require('./pushService')
          .sendToOrganization(orgId, pushBody(ticket, `${numberLabel(ticket.number)}: ${headline.toLowerCase()}`, path), { userIds: [admin.id] }));
      }
      const email = db.prepare('SELECT email FROM users WHERE id = ?').get(admin.id)?.email;
      for (const orgId of email ? adminOrgs : []) {
        const sent = await attempt('email_platform', ticket, () => require('./emailService').sendMail(orgId, { to: email, ...mailBody(orgId, ticket, headline, path) }));
        if (sent) break;
      }
    }
  })());
}

function notifyCustomer(ticket) {
  track((async () => {
    const path = `/ajuda?pedido=${ticket.id}`;
    const headline = 'Tem uma resposta ao seu pedido';
    const userIds = await attempt('recipients', ticket, () => {
      const ids = new Set(db.prepare("SELECT user_id FROM memberships WHERE organization_id = ? AND role IN ('owner', 'manager') AND active = 1").all(ticket.organization_id).map(r => r.user_id));
      if (ticket.author_user_id) ids.add(ticket.author_user_id);
      return [...ids];
    }) || [];
    await attempt('push_customer', ticket, () => require('./pushService')
      .sendToOrganization(ticket.organization_id, pushBody(ticket, `${numberLabel(ticket.number)}: resposta da equipa`, path), { userIds }));
    const email = ticket.author_user_id && db.prepare('SELECT email FROM users WHERE id = ? AND active = 1').get(ticket.author_user_id)?.email;
    if (email) {
      await attempt('email_customer', ticket, () => require('./emailService').sendMail(ticket.organization_id, { to: email, ...mailBody(ticket.organization_id, ticket, headline, path) }));
    }
  })());
}

module.exports = {
  listForUser, getForUser, create, addCustomerMessage, feedback, summary,
  listForPlatform, getForPlatform, addPlatformMessage, setStatus, flushNotifications,
};
