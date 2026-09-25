const { publicOrigin } = require('../services/publicOrigin');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defesa adicional ao SameSite=Lax. Browsers modernos enviam Origin e/ou
// Sec-Fetch-Site em pedidos de escrita; clientes de automação sem estes
// cabeçalhos continuam suportados.
module.exports = function verifyRequestOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return res.status(403).json({ success: false, error: 'Origem do pedido não permitida.' });
  }

  const origin = req.get('origin');
  if (!origin) return next();
  let normalized;
  try { normalized = new URL(origin).origin; } catch {
    return res.status(403).json({ success: false, error: 'Origem do pedido inválida.' });
  }
  if (normalized !== publicOrigin(req)) {
    return res.status(403).json({ success: false, error: 'Origem do pedido não permitida.' });
  }
  next();
};
