const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { initDatabase } = require('./config/database');
const requireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const verifyRequestOrigin = require('./middleware/verifyRequestOrigin');
const { clearExpiredSessions } = require('./services/authService');
const { configuredOrigin } = require('./services/publicOrigin');

// Rotas
const reservationRoutes = require('./routes/reservations');
const accommodationRoutes = require('./routes/accommodations');
const calendarRoutes = require('./routes/calendar');
const authRoutes = require('./routes/auth');
const guestRoutes = require('./routes/guests');
const emailTemplateRoutes = require('./routes/emailTemplates');
const expenseRoutes = require('./routes/expenses');
const supplierRoutes = require('./routes/suppliers');
const backupRoutes = require('./routes/backup');
const teamRoutes   = require('./routes/team');
const reportRoutes = require('./routes/reports');
const publicBookingRoutes = require('./routes/publicBooking');
const eventRoutes = require('./routes/events');
const voucherRoutes = require('./routes/vouchers');
const googleTasksRoutes = require('./routes/googleTasks');
const pushRoutes = require('./routes/push');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';
const trustProxy = String(process.env.TRUST_PROXY || (IS_PROD ? 'loopback' : '')).trim();
if (/^(true|false)$/i.test(trustProxy)) throw new Error('TRUST_PROXY deve indicar proxies concretos; não use true/false.');
if (trustProxy) app.set('trust proxy', trustProxy.split(',').map(value => value.trim()).filter(Boolean));
if (IS_PROD) configuredOrigin();
app.disable('x-powered-by');

// Eventos e scripts da aplicação são externos. CSS inline continua necessário
// nos componentes e nos modelos; não dá permissão para executar JavaScript.
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://challenges.cloudflare.com', // Cloudflare Turnstile
  ],
  scriptSrcAttr: ["'none'"],
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
  // connect-src também governa os fetch() feitos DENTRO do service worker —
  // que interceta os CDNs (cache-first). Sem estes hosts, o SW devolve 503
  // para todos os assets externos e a app fica sem ícones/fonts/libs.
  connectSrc: [
    "'self'",
    'https://challenges.cloudflare.com',
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
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
app.use(compression({ threshold: 1024 }));

// CORS — em produção só aceita a origem do domínio; em dev aceita localhost e túneis
const ALLOWED_ORIGINS_DEV = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.ngrok[a-z0-9.-]*$/,
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
  // LAN privada + Tailscale (CGNAT 100.64.0.0/10) + MagicDNS *.ts.net —
  // para abrir a app noutro PC da rede durante o desenvolvimento.
  /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/,
  /^https?:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+(:\d+)?$/i, // hostname simples (MagicDNS curto, ex. http://mac:3001)
];
const ALLOWED_ORIGINS_PROD = [
  /^https?:\/\/santapaciencia\.xyz$/,
];
const ALLOWED_ORIGINS = IS_PROD ? ALLOWED_ORIGINS_PROD : [...ALLOWED_ORIGINS_DEV, /^https?:\/\/santapaciencia\.xyz$/];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.some(r => r.test(origin))) return callback(null, true);
    callback(Object.assign(new Error('Origem não permitida pelo CORS: ' + origin), { status: 403, code: 'ORIGIN_NOT_ALLOWED' }));
  },
  credentials: true
}));

// Os parsers maiores só ficam acessíveis depois de autenticar e autorizar.
app.use('/api/backup/import', requireAuth, require('./middleware/requireRole')('owner'), express.json({ limit: '100mb' }));
const uploadParser = express.json({ limit: '15mb' });
app.use(['/api/accommodations', '/api/expenses'], (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  requireAuth(req, res, () => require('./middleware/requireRole')('manager')(req, res, () => uploadParser(req, res, next)));
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 200 }));

const path = require('path');

// Servir ficheiros de upload (imagens dos alojamentos)
// Documentos de despesas nunca são recursos públicos.
app.use('/uploads/receipts', requireAuth, require('./middleware/requireRole')('manager'), (req, res, next) => {
  const url = '/uploads/receipts' + req.path;
  const owned = require('./config/database').db.prepare('SELECT 1 FROM expenses WHERE organization_id = ? AND receipt_image = ?').get(req.user.organization_id, url);
  res.set('Cache-Control', 'no-store');
  if (!owned) return res.status(404).json({ success: false, error: 'Documento não encontrado.' });
  next();
}, express.static(path.resolve('./data/uploads/receipts'), { fallthrough: false }));
app.use('/uploads', (req, res, next) => {
  // Impede contornar a rota privada com nomes de pasta percent-encoded.
  if (!/^\/[A-Za-z0-9_.-]+$/.test(req.path)) return res.status(404).end();
  next();
}, express.static(path.resolve('./data/uploads')));
app.use(['/api', '/auth'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Servir frontend estático (apenas em produção via Docker)
if (process.env.FRONTEND_PATH) {
  app.use(express.static(process.env.FRONTEND_PATH, {
    setHeaders(res, filePath) {
      const name = path.basename(filePath);
      if (name === 'service-worker.js' || filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/[/\\](?:vendor|img)[/\\]/.test(filePath) || /(?:^|[-.])v?\d+(?:\.\d+)+/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  }));
}

// Inicializar base de dados
initDatabase();
clearExpiredSessions();

// Rotas
app.use(['/auth', '/api'], verifyRequestOrigin);
app.use('/auth', authRoutes);
app.use('/api/public', publicBookingRoutes);
app.use('/api', requireAuth);
app.use('/api/reservations', reservationRoutes);
app.use('/api/accommodations', accommodationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/tasks', googleTasksRoutes);
app.use('/api/push', pushRoutes);

// Health check
app.get('/health', (req, res) => {
  try {
    require('./config/database').db.prepare('SELECT 1').get();
    res.json({ status: 'ok', apiVersion: 2 });
  } catch { res.status(503).json({ status: 'unavailable' }); }
});

// 404 explícito para /api/* — evita que o SPA catch-all engula erros e
// devolva HTML em vez de JSON para um endpoint que não existe.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint não encontrado.' });
});

// SPA catch-all: serve index.html para todas as rotas de frontend
if (process.env.FRONTEND_PATH) {
  app.get('/reservar/:slug', (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'public-reservation.html'));
  });
  app.get('/reserva/:token', (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'reservation-status.html'));
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
