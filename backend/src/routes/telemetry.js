// Totais de utilização (POST /api/telemetry): páginas abertas e modo de
// visualização (PWA instalada ou browser). Qualquer membro; sem papel mínimo.
const router = require('express').Router();
const { telemetryLimiter } = require('../middleware/rateLimiter');
const { recordUsage } = require('../services/usageTelemetry');

router.post('/', telemetryLimiter, (req, res) => {
  // Não muda nada que as páginas abertas mostrem: sem avisos em direto.
  res.locals.liveQuiet = true;
  const { views, display_mode: displayMode } = req.body || {};
  recordUsage({ organizationId: req.user.organization_id, sessionId: req.sessionId, views, displayMode });
  res.status(204).end();
});

module.exports = router;
