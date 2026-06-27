// Cloudflare Turnstile — CAPTCHA invisível/leve, gratuito, sem cookies.
// Docs: https://developers.cloudflare.com/turnstile/
//
// Variáveis de ambiente:
//   TURNSTILE_SITE_KEY    — chave pública (frontend)
//   TURNSTILE_SECRET_KEY  — chave secreta (backend)
//
// Se a secret não estiver definida, a verificação é saltada (modo dev). Em
// produção (NODE_ENV=production) sem secret, falha para evitar arrancar sem
// proteção.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isConfigured() {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

function getSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || '';
}

/**
 * Verifica o token recebido do widget Turnstile.
 * Retorna `{ success: boolean, error?: string }`.
 */
async function verify(token, remoteIp) {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return { success: false, error: 'CAPTCHA não configurado no servidor.' };
    }
    return { success: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'CAPTCHA em falta.' };
  }
  try {
    const params = new URLSearchParams();
    params.append('secret', process.env.TURNSTILE_SECRET_KEY);
    params.append('response', token);
    if (remoteIp) params.append('remoteip', remoteIp);

    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body: params,
    });
    const data = await response.json();
    if (data.success) return { success: true };
    return { success: false, error: 'CAPTCHA inválido.', codes: data['error-codes'] || [] };
  } catch (err) {
    console.error('Erro a verificar Turnstile:', err.message);
    return { success: false, error: 'Não foi possível verificar o CAPTCHA. Tenta novamente.' };
  }
}

module.exports = { verify, isConfigured, getSiteKey };
