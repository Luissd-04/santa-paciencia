require('dotenv').config();
const app = require('./app');
const { startScheduler } = require('./services/reservationScheduler');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Santa Paciência a correr na porta ${PORT}`);
  startScheduler();
});

server.on('error', (error) => {
  console.error(`❌ Não foi possível arrancar o servidor na porta ${PORT}:`, error.message);
  process.exit(1);
});
