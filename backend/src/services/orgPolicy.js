// Regras por organização que vários sítios têm de aplicar da mesma maneira:
// demonstrações, testes terminados e o ambiente de testes (staging). Um só
// ponto para que uma integração nova não as esqueça.
//
//  - blocked: teste expirado ou encerrado. A conta não entra e as páginas
//    públicas (reserva, pré-check-in) respondem 404.
//  - demo: demonstração com dados fictícios. Explora a aplicação, mas não
//    liga serviços externos nem tem páginas públicas.
//  - externalAllowed: pode enviar emails, notificações, usar Google/Stripe.
const { isStaging } = require('./stagingPolicy');

// `access` é o resultado de platformTrials.access(orgId) (ou null). Quem já o
// tem (o pedido autenticado, em req.user.trial_access) evita outra consulta.
function fromAccess(access) {
  const blocked = !!access && ['expired', 'closed'].includes(access.status);
  const demo = !!access && access.mode === 'demo' && !access.converted_at;
  return { blocked, demo, externalAllowed: !isStaging() && !blocked && !demo };
}

function forOrganization(organizationId) {
  if (!organizationId) return fromAccess(null);
  return fromAccess(require('./platformTrials').access(organizationId));
}

const isBlocked = organizationId => forOrganization(organizationId).blocked;
const isDemo = organizationId => forOrganization(organizationId).demo;
const externalAllowed = organizationId => forOrganization(organizationId).externalAllowed;
// Página pública desta organização (reserva, pré-check-in, pagamento).
const publicPagesAllowed = organizationId => {
  const { blocked, demo } = forOrganization(organizationId);
  return !blocked && !demo;
};

// Pedidos autenticados que ligam serviços externos ou importam dados reais:
// recusados no ambiente de testes e nas demonstrações.
function isExternalOperation(method, path) {
  const writing = !['GET', 'HEAD'].includes(method);
  // /auth/google, /auth/google-email, /auth/google-tasks, /auth/email…
  return /^\/auth\/(?:google|email)/.test(path)
    || path === '/api/expenses/scan-receipt'
    || /^\/api\/backup\/import(?:\/|$)/.test(path)
    || (writing && /^\/api\/(?:push|tasks)(?:\/|$)/.test(path));
}

module.exports = { fromAccess, forOrganization, isBlocked, isDemo, externalAllowed, publicPagesAllowed, isExternalOperation };
