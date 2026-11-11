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

  if(require('../services/stagingPolicy').isStaging() && (/^\/auth\/(?:google|email)/.test(path) || path==='/api/expenses/scan-receipt' || /^\/api\/backup\/import(?:\/|$)/.test(path) || /^\/api\/push(?:\/|$)/.test(path)&&!['GET','HEAD'].includes(req.method))) return res.status(403).json({success:false,error:'Integrações externas e importação de dados reais estão desligadas no ambiente de testes.'});
  const trials=require('../services/platformTrials');
  if(user.organization_id && trials.blocked(user.organization_id) && !SUSPENDED_ALLOWED.some(rule=>rule.test(path)) && !(/^\/api\/platform(?:\/|$)/.test(path) && require('../services/platformAccess').isPlatformAdmin(user))) return res.status(403).json({success:false,error:'O período de teste terminou ou foi encerrado. Contacte a equipa Santa Paciência.',trial_expired:true});
  if(user.organization_id && trials.isDemo(user.organization_id)) {
    // A demonstração pode explorar dados locais, mas não liga serviços nem importa bases reais.
    if (/^\/auth\/(?:google|email)/.test(path) || /^\/api\/(?:tasks|push)(?:\/|$)/.test(path) && !['GET','HEAD'].includes(req.method) || (/^\/api\/backup\/import(?:\/|$)/.test(path) || path==='/api/expenses/scan-receipt')) return res.status(403).json({success:false,error:'Esta operação externa está desligada na demonstração.'});
  }
  req.user = user;
  req.sessionId = sessionId;
  require('../services/platformDiagnostics').observe(req, res);
  next();
}

module.exports = requireAuth;
