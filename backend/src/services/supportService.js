// Pedidos e mensagens de suporte. Esqueleto: as rotas já chamam estas funções
// com as assinaturas do contrato; a lógica chega no passo seguinte (3B).
// O acesso passa sempre por services/supportAccess.js e os anexos por
// services/supportAttachments.js.
const { httpError } = require('./httpError');

const todo = name => () => { throw httpError(`Suporte: ${name} ainda não está disponível.`, 501); };

module.exports = {
  // Lado do proprietário (sessão normal).
  /** (user, {status}) → {tickets, counts} */ listForUser: todo('listForUser'),
  /** (user, id) → {ticket, messages, context}; marca como lido */ getForUser: todo('getForUser'),
  /** (user, body, meta:{userAgent, ip}) → ticket */ create: todo('create'),
  /** (user, id, body) → message */ addCustomerMessage: todo('addCustomerMessage'),
  /** (user, id, resolved:boolean) → ticket */ feedback: todo('feedback'),
  /** (user) → {unread, needs_customer, incidents} */ summary: todo('summary'),
  // Lado da plataforma (requirePlatformAdmin, consola desbloqueada).
  /** ({status, type, q, organization_id}) → {tickets, counts} */ listForPlatform: todo('listForPlatform'),
  /** (id) → {ticket, messages, context, organization} */ getForPlatform: todo('getForPlatform'),
  /** (adminUser, id, body:{body, attachments?, status?}) → message */ addPlatformMessage: todo('addPlatformMessage'),
  /** (adminUser, id, status) → ticket */ setStatus: todo('setStatus'),
};
