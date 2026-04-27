const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Rotas
const reservationRoutes = require('./routes/reservations');
const accommodationRoutes = require('./routes/accommodations');
const calendarRoutes = require('./routes/calendar');
const authRoutes = require('./routes/auth');

const app = express();

// Middlewares globais — aceitar qualquer origem local (localhost ou 127.0.0.1, qualquer porta)
app.use(cors({
  origin: function (origin, callback) {
    // Sem origem = pedido direto (ex: curl, Postman) — sempre permitir
    if (!origin) return callback(null, true);

    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (allowed.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pelo CORS: ' + origin));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar base de dados
initDatabase();

// Rotas
app.use('/api/reservations', reservationRoutes);
app.use('/api/accommodations', accommodationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;