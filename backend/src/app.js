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
app.use(helmet({
  contentSecurityPolicy: false, // SPA inline scripts — ativar mais tarde com nonces
  crossOriginEmbedderPolicy: false,
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

// SPA catch-all: serve index.html para todas as rotas de frontend
if (process.env.FRONTEND_PATH) {
  app.get(['/reservar/:slug', '/reserva/:token'], (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'public-reservation.html'));
  });
  app.get('/pre-checkin/:token', (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'pre-checkin.html'));
  });
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(path.resolve(process.env.FRONTEND_PATH), 'index.html'));
  });
}

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;
