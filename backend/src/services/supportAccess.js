// Quem vê um pedido de suporte: só a organização da sessão e, dentro dela,
// o autor ou quem é pelo menos manager (owner e manager veem todos). Quem não
// o pode ver recebe 404, nunca 403: não fica a saber que o pedido existe.
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { atLeast } = require('../middleware/requireRole');

function canSeeTicket(user, ticket) {
  if (!user?.id || !user.organization_id || !ticket) return false;
  if (ticket.organization_id !== user.organization_id) return false;
  return ticket.author_user_id === user.id || atLeast(user, 'manager');
}

function findVisibleTicket(user, id) {
  const ticket = typeof id === 'string' ? db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) : null;
  if (!canSeeTicket(user, ticket)) throw httpError('Pedido não encontrado.', 404);
  return ticket;
}

// Fragmento para as listas: `WHERE ${sql}` com `params` pela mesma ordem.
function listVisibilityWhere(user, alias = 't') {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Alias inválido.');
  if (!user?.id || !user.organization_id) return { sql: '0 = 1', params: [] };
  if (atLeast(user, 'manager')) return { sql: `${alias}.organization_id = ?`, params: [user.organization_id] };
  return { sql: `${alias}.organization_id = ? AND ${alias}.author_user_id = ?`, params: [user.organization_id, user.id] };
}

module.exports = { canSeeTicket, findVisibleTicket, listVisibilityWhere };
