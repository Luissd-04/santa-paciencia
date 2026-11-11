// Consola da plataforma (/api/platform): só para o dono da instância, depois
// de confirmar a palavra-passe nesta sessão. Ver services/platformAccess.js.
const router = require('express').Router();
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const { platformUnlockLimiter } = require('../middleware/rateLimiter');
const { unlock, recordPlatformAudit } = require('../services/platformAccess');
const platform = require('../services/platformService');
const analytics = require('../services/platformAnalytics');
const support = require('../services/supportService');
const supportAttachments = require('../services/supportAttachments');

router.use(requirePlatformAdmin, (_req, res, next) => {
  // Nada disto é da organização aberta: sem avisos em direto às suas páginas.
  res.locals.liveQuiet = true;
  next();
});

router.post('/unlock', platformUnlockLimiter, async (req, res) => {
  const result = await unlock(req.sessionId, req.user.id, req.body?.password);
  recordPlatformAudit({ userId: req.user.id, action: result ? 'platform.unlock' : 'platform.unlock_failed', ip: req.ip });
  // 400 e não 401: o frontend trata 401 como sessão expirada (como em change-password).
  if (!result) return res.status(400).json({ success: false, error: 'Palavra-passe incorreta.' });
  res.json({ success: true, data: { unlocked_until: result.unlockedUntil } });
});

router.get('/overview', (_req, res) => res.json({ success: true, data: platform.getOverview() }));
router.get('/organizations', (_req, res) => res.json({ success: true, data: platform.listOrganizations() }));
router.get('/organizations/:id', (req, res) => res.json({ success: true, data: platform.getOrganization(req.params.id) }));
router.put('/organizations/:id', (req, res) => {
  const { status, notes } = req.body || {};
  const data = platform.updateOrganization(req.params.id, { status, notes });
  recordPlatformAudit({ userId: req.user.id, action: 'organization.update', targetType: 'organization', targetId: req.params.id,
    details: { status: status ?? null, notes_changed: notes !== undefined }, ip: req.ip });
  res.json({ success: true, data });
});
router.get('/trends', (req, res) => res.json({ success: true, data: analytics.getTrends(req.query.weeks) }));
router.get('/usage', (req, res) => res.json({ success: true, data: analytics.getUsage(req.query.days) }));
router.get('/audit', (req, res) => res.json({ success: true, data: analytics.listAudit({ limit: req.query.limit, before: req.query.before }) }));
router.get('/incidents', (_req, res) => res.json({ success: true, data: platform.listIncidents() }));

// Suporte: caixa de entrada de todos os pedidos (já atrás do requirePlatformAdmin
// e da consola desbloqueada). O parser de 15 MB das mensagens está em app.js.
const supportRouter = require('express').Router();
supportRouter.get('/tickets', async (req, res) => {
  const { status, type, q, organization_id } = req.query;
  res.json({ success: true, data: await support.listForPlatform({ status, type, q, organization_id }) });
});
supportRouter.get('/tickets/:id', async (req, res) => res.json({ success: true, data: await support.getForPlatform(req.params.id) }));
supportRouter.post('/tickets/:id/messages', async (req, res) =>
  res.status(201).json({ success: true, data: await support.addPlatformMessage(req.user, req.params.id, req.body || {}) }));
supportRouter.put('/tickets/:id', async (req, res) => {
  const status = req.body?.status;
  const data = await support.setStatus(req.user, req.params.id, status);
  recordPlatformAudit({ userId: req.user.id, action: 'support.status', targetType: 'support_ticket', targetId: req.params.id,
    details: { status }, ip: req.ip });
  res.json({ success: true, data });
});
supportRouter.get('/attachments/:id', (req, res) => {
  const row = supportAttachments.findAttachment(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Anexo não encontrado.' });
  supportAttachments.streamAttachment(res, row);
});
router.use('/support', supportRouter);

// 501 sai com a mensagem (o tratamento global esconde mensagens 5xx em produção).
router.use((err, _req, res, next) => {
  if (err.status === 501) return res.status(501).json({ success: false, error: err.message });
  next(err);
});

module.exports = router;
