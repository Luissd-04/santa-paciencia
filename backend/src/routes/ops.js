// Operação: auditoria de ações sensíveis e estado das filas (proprietário).
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const { listAudit } = require('../services/auditLog');
const { opsStatus } = require('../services/opsStatus');

router.use(requireRole('owner'));
router.get('/audit', (req, res) => {
  res.json({ success: true, data: listAudit(req.user.organization_id, { limit: req.query.limit, before: req.query.before || null }) });
});
router.get('/status', (req, res) => {
  res.json({ success: true, data: opsStatus(req.user.organization_id, { includeUploads: req.query.uploads === '1' }) });
});
module.exports = router;
