const { randomUUID } = require('crypto');
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number(err.status) >= 400 && Number(err.status) < 600 ? Number(err.status) : 500;
  const requestId = req.id || randomUUID();
  console.error(JSON.stringify({ level: 'error', requestId, status, method: req.method, route: req.route?.path || 'unmatched', code: err.code || err.name }));
  res.status(status).json({ success: false, requestId,
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Erro interno do servidor.' : err.message || 'Erro interno do servidor.' });
}
module.exports = errorHandler;
