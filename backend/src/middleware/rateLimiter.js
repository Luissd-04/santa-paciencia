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

// O token de pré-check-in é uma credencial por posse. Limites separados
// evitam enumeração no GET e spam/replays no POST sem penalizar reservas
// públicas normais.
const preCheckinLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas tentativas. Tenta novamente mais tarde.' },
});

const preCheckinSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas tentativas de envio. Tenta novamente mais tarde.' },
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

// Login por conta, venham as tentativas de onde vierem (ataque distribuído
// por muitos IPs). 50 palavras-passe erradas por hora: um só IP não chega lá
// (o limite por IP são 10 em 15 minutos), por isso não serve para bloquear a
// conta de alguém de propósito.
const loginAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: req => `conta:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: { success: false, error: 'Demasiadas tentativas nesta conta. Tenta novamente mais tarde.' },
});

// Todas as rotas públicas (página de reservas, estado, pré-check-in): um teto
// largo por IP contra recolha automática e excesso de pedidos.
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Demasiados pedidos. Tenta novamente mais tarde.' },
});

const sensitiveAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.user.id,
  message: { success: false, error: 'Demasiadas tentativas nesta conta. Tente novamente em 15 minutos.' },
});
const receiptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.user.organization_id,
  message: { success: false, error: 'Limite de leitura de talões atingido. Tente mais tarde.' },
});
// Desbloqueio da consola da plataforma: só contam as palavras-passe erradas,
// por conta (a rota já exige sessão de dono da instância).
const platformUnlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: req => `plataforma:${req.user.id}`,
  message: { success: false, error: 'Demasiadas tentativas. Tente novamente em 15 minutos.' },
});
// Totais de utilização: 60 envios por minuto por sessão (o browser junta as
// vistas e envia de vez em quando; isto só trava abusos).
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `telemetria:${require('../services/authService').digestToken(req.sessionId)}`,
  message: { success: false, error: 'Demasiados pedidos. Tente novamente mais tarde.' },
});
// Suporte, por conta: pedidos novos e mensagens (cada um pode levar anexos de
// vários MB), para ninguém encher o disco da instância.
const supportTicketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `suporte-pedido:${req.user.id}`,
  message: { success: false, error: 'Enviou demasiados pedidos de suporte. Tente novamente dentro de uma hora.' },
});
const supportMessageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `suporte-mensagem:${req.user.id}`,
  message: { success: false, error: 'Enviou demasiadas mensagens de suporte. Tente novamente dentro de uma hora.' },
});
module.exports = {
  supportTicketLimiter, supportMessageLimiter, telemetryLimiter, platformUnlockLimiter, sensitiveAccountLimiter, receiptLimiter, loginLimiter, loginAccountLimiter, publicApiLimiter, publicBookingLimiter, voucherLimiter, preCheckinLookupLimiter,
  preCheckinSubmitLimiter, forgotPasswordLimiter, oauthCallbackLimiter,
};
