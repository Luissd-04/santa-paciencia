const rateLimit = require('express-rate-limit');

// Login — máximo 10 tentativas por IP em 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas tentativas. Tenta novamente em 15 minutos.' },
});

// Reservas públicas — máximo 20 reservas por IP por hora
const publicBookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados pedidos. Tenta novamente mais tarde.' },
});

// Validação de voucher público — máximo 30 tentativas por IP por hora (anti-enumeration)
const voucherLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas tentativas. Tenta novamente mais tarde.' },
});

// Forgot password — máximo 5 por IP por hora
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados pedidos de recuperação. Tenta novamente em 1 hora.' },
});

// OAuth callbacks (Google Calendar/Email/Tasks) — máximo 30 por IP em 15 min.
// O `state` é HMAC-SHA256 truncado a 32 chars (~128 bits de entropia), praticamente
// impossível de brute-forçar, mas o limiter previne abuso do endpoint
// (DoS por chamadas repetidas que tocam DB e disco).
const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas tentativas. Tenta novamente em 15 minutos.' },
});

module.exports = { loginLimiter, publicBookingLimiter, voucherLimiter, forgotPasswordLimiter, oauthCallbackLimiter };
