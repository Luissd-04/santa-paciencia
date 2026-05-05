const { SESSION_COOKIE, getSessionUser } = require('../services/authService');

function parseCookies(header = '') {
  return header.split(';').reduce((acc, entry) => {
    const idx = entry.indexOf('=');
    if (idx === -1) return acc;
    const key = entry.slice(0, idx).trim();
    const value = decodeURIComponent(entry.slice(idx + 1).trim());
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  const user = getSessionUser(sessionId);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
  }

  req.user = user;
  req.sessionId = sessionId;
  next();
}

module.exports = requireAuth;
