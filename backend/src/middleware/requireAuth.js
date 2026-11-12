const { SESSION_COOKIE, SUSPENDED_MESSAGE, PLATFORM_ONLY_MESSAGE, getSessionUser } = require('../services/authService');
const orgPolicy = require('../services/orgPolicy');
const { isStaging } = require('../services/stagingPolicy');

const TRIAL_ENDED_MESSAGE = 'O período de teste terminou ou foi encerrado. Contacte a equipa Santa Paciência.';

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

  // Demonstrações, testes terminados e ambiente de testes (services/orgPolicy.js).
  // O estado do teste já veio com a sessão (user.trial_access): sem nova consulta.
  const policy = orgPolicy.fromAccess(user.trial_access);
  const staging = isStaging();
  if (orgPolicy.isExternalOperation(req.method, path) && (staging || policy.demo)) {
    const error = staging
      ? 'Integrações externas e importação de dados reais estão desligadas no ambiente de testes.'
      : 'Esta operação externa está desligada na demonstração.';
    return res.status(403).json({ success: false, error });
  }
  // Teste terminado: só sair da organização; a equipa da plataforma mantém a consola.
  if (user.organization_id && policy.blocked && !SUSPENDED_ALLOWED.some(rule => rule.test(path))
      && !(/^\/api\/platform(?:\/|$)/.test(path) && require('../services/platformAccess').isPlatformAdmin(user))) {
    return res.status(403).json({ success: false, error: TRIAL_ENDED_MESSAGE, trial_expired: true });
  }

  req.user = user;
  req.sessionId = sessionId;
  // Carregado aqui: o módulo prepara consultas e a base pode ainda não existir.
  require('../services/platformDiagnostics').observe(req, res);
  next();
}

module.exports = requireAuth;
