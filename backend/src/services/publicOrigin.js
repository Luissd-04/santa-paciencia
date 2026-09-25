function configuredOrigin() {
  const value = String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || '').trim();
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('PUBLIC_APP_URL não é um URL válido.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_APP_URL deve conter apenas uma origem HTTP(S), sem caminho, query ou credenciais.');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('PUBLIC_APP_URL tem de usar HTTPS em produção.');
  }
  return parsed.origin;
}

function publicOrigin(req) {
  const configured = configuredOrigin();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PUBLIC_APP_URL é obrigatório em produção.');
  }
  // req.protocol só usa X-Forwarded-Proto quando o emissor corresponde à
  // configuração trust proxy; não confiar diretamente no header.
  const proto = req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

module.exports = { configuredOrigin, publicOrigin };
