require('dotenv').config();
const app = require('./app');
const { startScheduler } = require('./services/reservationScheduler');
const { startScheduler: startPushScheduler } = require('./services/pushScheduler');
const { startScheduler: startEmailScheduler } = require('./services/emailScheduler');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Santa Paciência a correr na porta ${PORT}`);
  startScheduler();
  startPushScheduler();
  startEmailScheduler();
});

server.on('error', (error) => {
  console.error(`❌ Não foi possível arrancar o servidor na porta ${PORT}:`, error.message);
  process.exit(1);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  require('./services/reservationScheduler').stopScheduler();
  require('./services/emailScheduler').stopScheduler();
  require('./services/pushScheduler').stopScheduler();
  server.close(() => {
    require('./config/database').db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
