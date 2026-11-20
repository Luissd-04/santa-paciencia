// Pacotes (consola). Já atrás do requirePlatformAdmin e da consola
// desbloqueada (routes/platform.js). Todas as alterações ficam auditadas.
const router = require('express').Router();
const plans = require('../services/plansService');
const { recordPlatformAudit } = require('../services/platformAccess');

const audit = (req, action, plan, details = null) => recordPlatformAudit({
  userId: req.user.id, action, targetType: 'plan', targetId: plan.id, details: { name: plan.name, ...details }, ip: req.ip,
});
const FIELDS = ['name', 'max_accommodations', 'max_members', 'features', 'sort'];
const limits = plan => ({ max_accommodations: plan.max_accommodations, max_members: plan.max_members });

router.get('/', (_req, res) => res.json({ success: true, data: plans.listPlans() }));
router.get('/near-limit', (_req, res) => res.json({ success: true, data: plans.nearLimit() }));

router.post('/', (req, res) => {
  const plan = plans.createPlan(req.body || {});
  audit(req, 'plan.create', plan, limits(plan));
  res.status(201).json({ success: true, data: plan });
});

router.put('/:id', (req, res) => {
  const plan = plans.updatePlan(req.params.id, req.body || {});
  audit(req, 'plan.update', plan, { ...limits(plan), fields: FIELDS.filter(f => req.body?.[f] !== undefined) });
  res.json({ success: true, data: plan });
});

router.delete('/:id', (req, res) => {
  const plan = plans.deletePlan(req.params.id);
  audit(req, 'plan.delete', plan);
  res.json({ success: true, data: { id: plan.id } });
});

module.exports = router;
