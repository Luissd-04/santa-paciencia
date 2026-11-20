const { isPlatformAdmin, isUnlocked, can, platformRoles } = require('../services/platformAccess');

const LABELS = { admin: 'Administração', support: 'Suporte', sales: 'Marketing e comercial' };

// Que capacidade (services/platformAccess.js) cada parte da consola exige.
// `path` é relativo a /api/platform, em minúsculas. As áreas internas
// (/workspace/records, equipa, configurações…) verificam ainda o tipo de
// registo e a Administração no serviço (services/platformWorkspace.js).
function needed(method, path) {
  const reading = method === 'GET' || method === 'HEAD';
  const area = prefix => path === prefix || path.startsWith(prefix + '/');

  // Registo de ações (tem IPs) e diagnóstico técnico.
  if (area('/audit') || area('/diagnostics')) return 'admin';
  // Suporte: ver e responder é do Suporte; apagar e mudar a conservação, da Administração.
  if (area('/support') || area('/support-stats')) {
    if (method === 'DELETE' || (!reading && area('/support/retention'))) return 'admin';
    return 'support';
  }
  if (area('/tasks')) return 'read';
  if (area('/announcements')) return reading ? 'read' : 'sales';
  if (area('/workspace/trials')) return 'sales';
  if (area('/workspace')) return 'read';
  // Visão geral, clientes, pacotes, tendências: todos veem; só a Administração altera.
  return reading ? 'read' : 'admin';
}

// 404 e não 403: quem não é da equipa não fica a saber que a área existe.
// Depois, tudo exceto POST /unlock exige a consola desbloqueada nesta sessão.
function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user)) return res.status(404).json({ success: false, error: 'Endpoint não encontrado.' });
  // Também é usado em app.js antes do parser de anexos, fora do router: o
  // caminho conta sempre a partir de /api/platform.
  const path = (req.baseUrl + req.path).toLowerCase().replace(/^\/api\/platform(?=\/|$)/, '') || '/';
  if (req.method === 'POST' && path === '/unlock') return next();
  if (!isUnlocked(req.sessionId)) {
    return res.status(423).json({ success: false, error: 'Consola bloqueada. Confirme a palavra-passe.', locked: true });
  }
  req.platformRoles = platformRoles(req.user);
  const capability = needed(req.method, path);
  if (!can(req.user, capability)) {
    return res.status(403).json({ success: false, error: `Esta ação requer o cargo ${LABELS[capability] || 'Administração'}.` });
  }
  next();
}

module.exports = requirePlatformAdmin;
module.exports.needed = needed;
