require('dotenv').config();
const app = require('./app');
const scheduledTasks = require('./services/scheduledTasks');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Santa Paciência a correr na porta ${PORT}`);
  scheduledTasks.start();
});

server.on('error', (error) => {
  console.error(`❌ Não foi possível arrancar o servidor na porta ${PORT}:`, error.message);
  process.exit(1);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Parar as tarefas automáticas e esperar pelas que estão a meio (até 10 s).
  const tasksStopped = scheduledTasks.stop(10000);
  server.close(async () => {
    await tasksStopped;
    require('./config/database').db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
