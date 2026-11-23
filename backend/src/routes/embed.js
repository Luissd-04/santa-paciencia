// Reservas no site do cliente: sites autorizados e o código a colar.
// Só o proprietário: decide que sites podem mostrar a página de reservas.
const router = require('express').Router();
const role = require('../middleware/requireRole');
const embed = require('../services/bookingEmbed');
const { publicOrigin } = require('../services/publicOrigin');

router.use(role('owner'));

router.get('/settings', (req, res, next) => {
  try { res.json({ success: true, data: embed.getSettings(req.user.organization_id, publicOrigin(req)) }); } catch (e) { next(e); }
});

router.put('/settings', (req, res, next) => {
  try {
    const before = embed.storedOrigins(req.user.organization_id);
    const origins = embed.saveOrigins(req.user.organization_id, req.body?.origins);
    require('../services/auditLog').recordAudit({
      organizationId: req.user.organization_id, userId: req.user.id, action: 'settings.embed_origins_changed',
      meta: { before, after: origins },
    });
    res.json({ success: true, data: embed.getSettings(req.user.organization_id, publicOrigin(req)) });
  } catch (e) { next(e); }
});

module.exports = router;
