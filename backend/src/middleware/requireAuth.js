const { SESSION_COOKIE, SUSPENDED_MESSAGE, PLATFORM_ONLY_MESSAGE, getSessionUser } = require('../services/authService');

function parseCookies(header = '') {
  return header.split(';').reduce((acc, entry) => {
    const idx = entry.indexOf('=');
    if (idx === -1) return acc;
    const key = entry.slice(0, idx).trim();
    let value;
    try { value = decodeURIComponent(entry.slice(idx + 1).trim()); } catch { return acc; }
    if (key) acc[key] = value;
    return acc;
  }, {});
}

// Sessões sem organização aberta: uma lista do que é permitido, e tudo o
// resto (dados de organização) responde 403. Fica aqui, num só sítio, e não
// rota a rota: nenhuma consulta de dados de organização corre com
// organization_id NULL. Os caminhos comparam-se em minúsculas, como o Express
// os encaminha.
//
// Sessão só da consola da plataforma: a consola, a telemetria (204 sem gravar)
// e o essencial da conta.
const PLATFORM_ONLY_ALLOWED = [
  /^\/api\/platform(?:\/|$)/,
  /^\/api\/telemetry\/?$/,
  /^\/auth\/(?:me|logout|switch-org|platform-session|memberships|appearance|change-password)\/?$/,
  /^\/auth\/sessions(?:\/revoke-others|\/[^/]+)?\/?$/,
];
// Sessão numa organização suspensa: só sair dela (terminar sessão ou mudar
// para outra organização ou para a consola).
const SUSPENDED_ALLOWED = [
  /^\/auth\/(?:logout|switch-org|platform-session|memberships)\/?$/,
];

function requestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0].toLowerCase();
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  const user = getSessionUser(sessionId);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
  }

  const path = requestPath(req);
  if (!user.organization_id) {
    if (!PLATFORM_ONLY_ALLOWED.some(rule => rule.test(path))) {
      return res.status(403).json({ success: false, error: PLATFORM_ONLY_MESSAGE, platform_only: true });
    }
  } else if (user.organization_status === 'suspended') {
    if (!SUSPENDED_ALLOWED.some(rule => rule.test(path))) {
      return res.status(403).json({ success: false, error: SUSPENDED_MESSAGE, suspended: true });
    }
  }

  req.user = user;
  req.sessionId = sessionId;
  next();
}

module.exports = requireAuth;
