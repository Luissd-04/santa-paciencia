// Área do proprietário (/api/owner): só o proprietário da organização da
// sessão. A única exceção é /api/owner/incoming, onde o gestor a quem foi
// pedida a transferência de propriedade vê, aceita ou recusa o pedido.
// Equipa (/api/team), cópias de segurança (/api/backup) e estado do sistema
// (/api/ops/status) continuam nas suas rotas, também só do proprietário.
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const owner = require('../services/ownerArea');
const transfers = require('../services/ownershipTransfer');
const audit = require('../services/ownerAudit');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const meta = req => ({ userAgent: req.get('user-agent') || '' });

// Transferência recebida (gestor destinatário).
router.get('/incoming', requireRole('manager'), (req, res) => ok(res, { transfer: transfers.pendingForUser(req.user) }));
router.post('/incoming/accept', requireRole('manager'), (req, res) => ok(res, transfers.accept(req.user, { id: req.body?.id, token: req.body?.token })));
router.post('/incoming/decline', requireRole('manager'), (req, res) => ok(res, transfers.decline(req.user, { id: req.body?.id, token: req.body?.token })));

router.use(requireRole('owner'));

router.get('/summary', (req, res) => ok(res, owner.summary(req.user.organization_id)));

router.get('/company', (req, res) => ok(res, owner.getCompany(req.user.organization_id)));
router.put('/company', (req, res) => ok(res, owner.updateCompany(req.user.organization_id, req.body, req.user.id)));

router.get('/brand', (req, res) => ok(res, owner.getBrand(req.user.organization_id)));
// O parser de 15 MB desta rota está em app.js (tem de correr antes do geral).
router.post('/brand/logo', async (req, res) => ok(res, await owner.uploadLogo(req.user.organization_id, req.user.id, req.body?.image)));
router.delete('/brand/logo', (req, res) => ok(res, owner.removeLogo(req.user.organization_id, req.user.id)));
router.post('/brand/logo/trim', async (req, res) => ok(res, await owner.trimLogo(req.user.organization_id)));
router.put('/brand/logo/crops', async (req, res) => ok(res, await owner.saveLogoCrops(req.user.organization_id, req.user.id, req.body || {})));
router.put('/brand/color', (req, res) => ok(res, owner.setBrandColor(req.user.organization_id, req.user.id, req.body?.brand_color ?? null)));

router.get('/plans', (req, res) => ok(res, owner.plans(req.user.organization_id)));
router.get('/invoices', (req, res) => ok(res, { invoices: owner.invoices(req.user.organization_id) }));
router.post('/plan-request', (req, res) => ok(res, owner.requestPlanChange(req.user, req.body || {}, meta(req)), 201));

router.get('/audit', (req, res) => ok(res, {
  ...audit.list(req.user.organization_id, { userId: req.query.user || null, type: req.query.type || null, before: req.query.before || null, limit: req.query.limit }),
  ...(req.query.before ? {} : { people: audit.people(req.user.organization_id), types: audit.TYPES }),
}));
router.get('/audit.csv', (req, res) => {
  const body = audit.csv(req.user.organization_id, { userId: req.query.user || null, type: req.query.type || null });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="registo-atividade-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(body);
});

router.get('/transfer', (req, res) => ok(res, { transfer: transfers.pendingForOrganization(req.user.organization_id), candidates: transfers.candidates(req.user.organization_id) }));
router.post('/transfer', async (req, res) => ok(res, await transfers.start(req.user, { membershipId: req.body?.membership_id }), 201));
router.delete('/transfer', (req, res) => ok(res, transfers.cancel(req.user)));

router.get('/closure', (req, res) => ok(res, {
  request: owner.openRequest(req.user.organization_id, 'closure'),
  last_backup_at: owner.lastBackupAt(req.user.organization_id),
  backup_fresh: owner.backupIsFresh(req.user.organization_id),
}));
router.post('/closure', (req, res) => {
  try {
    ok(res, owner.requestClosure(req.user, req.body || {}, meta(req)), 201);
  } catch (err) {
    if (err.code === 'backup_required') return res.status(409).json({ success: false, error: err.message, code: err.code });
    throw err;
  }
});

module.exports = router;
