const express = require('express');
const cors = require('cors');
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
const teamRoutes = require('./routes/team');

const app = express();

// Middlewares globais — aceitar origens locais e ngrok
app.use(cors({
  origin: function (origin, callback) {
    // Sem origem = pedido direto (ex: curl, Postman) — sempre permitir
    if (!origin) return callback(null, true);

    const allowed = [
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
      /^https:\/\/[a-z0-9-]+\.ngrok[a-z0-9.-]*$/,
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
      /^https?:\/\/santapaciencia\.xyz$/,
    ];
    if (allowed.some(r => r.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pelo CORS: ' + origin));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

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
app.use('/api', requireAuth);
app.use('/api/reservations', reservationRoutes);
app.use('/api/accommodations', accommodationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/team', teamRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;
