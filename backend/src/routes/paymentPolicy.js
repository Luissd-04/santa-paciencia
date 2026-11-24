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
// Como o hóspede paga sem Stripe (texto livre): vai no email «Reserva aceite».
router.get('/instructions', (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    res.json({ success: true, data: { instructions: require('../services/settingsService').get(orgId, 'payment_instructions', ''),
      stripe_enabled: require('../services/stripeClient').stripeEnabled(orgId) } });
  } catch (e) { next(e); }
});
router.put('/instructions', (req, res, next) => {
  try {
    const raw = req.body?.instructions;
    if (raw !== undefined && typeof raw !== 'string') return res.status(400).json({ error: 'Instruções inválidas.' });
    const text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (text.length > 1000) return res.status(400).json({ error: 'As instruções podem ter até 1000 caracteres.' });
    require('../services/settingsService').set(req.user.organization_id, 'payment_instructions', text);
    require('../services/auditLog').recordAudit({ organizationId: req.user.organization_id, userId: req.user.id, action: 'settings.payment_instructions_changed' });
    res.json({ success: true, data: { instructions: text } });
  } catch (e) { next(e); }
});
router.post('/simulate', (req, res, next) => {
  try { res.json({ success: true, data: policy.calculate(req.body.policy, req.body.example || {}) }); } catch (e) { next(e); }
});
module.exports = router;
