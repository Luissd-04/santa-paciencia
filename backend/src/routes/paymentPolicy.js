const router = require('express').Router();
const role = require('../middleware/requireRole');
const policy = require('../services/paymentPolicy');
router.use(role('manager'));
router.get('/', (req, res, next) => {
  try { res.json({ success: true, data: policy.getPolicy(req.user.organization_id) }); } catch (e) { next(e); }
});
router.put('/', (req, res, next) => {
  try {
    const saved = policy.savePolicy(req.user.organization_id, req.body);
    require('../services/auditLog').recordAudit({ organizationId: req.user.organization_id, userId: req.user.id, action: 'settings.payment_policy_changed' });
    res.json({ success: true, data: saved });
  } catch (e) { next(e); }
});
router.post('/simulate', (req, res, next) => {
  try { res.json({ success: true, data: policy.calculate(req.body.policy, req.body.example || {}) }); } catch (e) { next(e); }
});
module.exports = router;
