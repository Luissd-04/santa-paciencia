const { isPlatformAdmin, isUnlocked, platformRole } = require('../services/platformAccess');

// 404 e não 403: quem não é dono da instância não fica a saber que a área existe.
// Depois, tudo exceto POST /unlock exige a consola desbloqueada nesta sessão.
module.exports = function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user)) return res.status(404).json({ success: false, error: 'Endpoint não encontrado.' });
  if (req.method === 'POST' && req.path === '/unlock') return next();
  if (!isUnlocked(req.sessionId)) {
    return res.status(423).json({ success: false, error: 'Consola bloqueada. Confirme a palavra-passe.', locked: true });
  }
  req.platformRole = platformRole(req.user);
  // Marketing gere tarefas e comunicados. Clientes, pacotes e suporte são da administração.
  if (req.platformRole === 'marketing' && req.path.toLowerCase().startsWith('/workspace/')) return next();
  if (req.platformRole === 'marketing' && !['GET', 'HEAD'].includes(req.method)
      && !/^\/(?:tasks|announcements)(?:\/|$)/.test(req.path)) {
    return res.status(403).json({ success: false, error: 'Esta ação requer o papel Administração.' });
  }
  next();
};
