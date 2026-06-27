const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initDatabase } = require('./config/database');
const requireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const { clearExpiredSessions } = require('./services/authService');

// Rotas
const reservationRoutes = require('./routes/reservations');
const accommodationRoutes = require('./routes/accommodations');
const calendarRoutes = require('./routes/calendar');
const authRoutes = require('./routes/auth');
const guestRoutes = require('./routes/guests');
const emailTemplateRoutes = require('./routes/emailTemplates');
const expenseRoutes = require('./routes/expenses');
const backupRoutes = require('./routes/backup');
const teamRoutes   = require('./routes/team');
const reportRoutes = require('./routes/reports');
const publicBookingRoutes = require('./routes/publicBooking');
const eventRoutes = require('./routes/events');
const voucherRoutes = require('./routes/vouchers');
const googleTasksRoutes = require('./routes/googleTasks');

const app = express();

const IS_PROD = process.env.NODE_ENV === 'production';

// Security headers
// CSP pragmática (S4): mantemos `unsafe-inline` no script-src e style-src
// porque o frontend ainda tem ~229 `onclick=` inline e centenas de `style=`.
// Migrar tudo para event delegation + classes ficou para uma sprint dedicada.
// Mesmo assim, restringimos:
//   • origens de scripts/styles externos (Lucide, Chart.js, jsPDF, XLSX, Leaflet, Turnstile)
//   • frames (apenas Turnstile)
//   • imagens (self + data: para uploads + https: para CDN)
//   • conexões (self + Turnstile)
//   • form-action a self → previne form hijacking
//   • base-uri 'self' → previne base tag injection
//   • object-src 'none' → bloqueia plugins legacy
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",                  // necessário enquanto houver onclick= inline
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://challenges.cloudflare.com', // Cloudflare Turnstile
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",                  // CSS inline em widgets/templates
    'https://fonts.googleapis.com',
    'https://unpkg.com',                // Leaflet CSS
  ],
  fontSrc: [
    "'self'",
    'https://fonts.gstatic.com',
    'data:',
  ],
  imgSrc: [
    "'self'",
    'data:',                            // upload preview, ícones inline
    'https:',                           // logos de email/etc em CDN externa
    'blob:',                            // canvas captures (XLSX/PDF preview)
  ],
  connectSrc: [
    "'self'",
    'https://challenges.cloudflare.com',
  ],
  frameSrc: [
    'https://challenges.cloudflare.com', // widget Turnstile
  ],
  formAction: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],           // previne clickjacking de fora
  ...(IS_PROD ? { upgradeInsecureRequests: [] } : {}),
};

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: CSP_DIRECTIVES,
  },
  crossOriginEmbedderPolicy: false,
  // COOP pode partir o popup OAuth (window.close em callback) — desligar.
  crossOriginOpenerPolicy: false,
}));

// CORS — em produção só aceita a origem do domínio; em dev aceita localhost e túneis
const ALLOWED_ORIGINS_DEV = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.ngrok[a-z0-9.-]*$/,
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
];
const ALLOWED_ORIGINS_PROD = [
  /^https?:\/\/santapaciencia\.xyz$/,
];
const ALLOWED_ORIGINS = IS_PROD ? ALLOWED_ORIGINS_PROD : [...ALLOWED_ORIGINS_DEV, /^https?:\/\/santapaciencia\.xyz$/];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.some(r => r.test(origin))) return callback(null, true);
    callback(new Error('Origem não permitida pelo CORS: ' + origin));
  },
  credentials: true
}));

// Body limits — global pequeno; rotas de upload usam o seu próprio parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const path = require('path');

// Servir ficheiros de upload (imagens dos alojamentos)
app.use('/uploads', require('express').static(path.resolve('./data/uploads')));

// Servir frontend estático (apenas em produção via Docker)
if (process.env.FRONTEND_PATH) {
  app.use(express.static(process.env.FRONTEND_PATH));
}

// Inicializar base de dados
initDatabase();
clearExpiredSessions();

// Rotas
app.use('/auth', authRoutes);
app.use('/api/public', publicBookingRoutes);
app.use('/api', requireAuth);
app.use('/api/reservations', reservationRoutes);
app.use('/api/accommodations', accommodationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/tasks', googleTasksRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 explícito para /api/* — evita que o SPA catch-all engula erros e
// devolva HTML em vez de JSON para um endpoint que não existe.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint não encontrado.' });
});

// SPA catch-all: serve index.html para todas as rotas de frontend
if (process.env.FRONTEND_PATH) {
  app.get(['/reservar/:slug', '/reserva/:token'], (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'public-reservation.html'));
  });
  app.get('/pre-checkin/:token', (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'pre-checkin.html'));
  });
  app.use((req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'index.html'));
  });
}

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;
