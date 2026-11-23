// Reservas no site do cliente: sites autorizados, aspeto e o código a colar.
// PUT aceita { origins } e/ou { style } (pedidos antigos só com origins
// continuam a funcionar).
// Só o proprietário: decide que sites podem mostrar a página de reservas.
const router = require('express').Router();
const role = require('../middleware/requireRole');
const embed = require('../services/bookingEmbed');
const embedStyle = require('../services/embedStyle');
const { httpError } = require('../services/httpError');
const { recordAudit } = require('../services/auditLog');
const { publicOrigin } = require('../services/publicOrigin');

router.use(role('owner'));

router.get('/settings', (req, res, next) => {
  try { res.json({ success: true, data: embed.getSettings(req.user.organization_id, publicOrigin(req)) }); } catch (e) { next(e); }
});

router.put('/settings', (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const hasOrigins = Object.prototype.hasOwnProperty.call(body, 'origins');
    const hasStyle = Object.prototype.hasOwnProperty.call(body, 'style');
    if (!hasOrigins && !hasStyle) throw httpError('Nada para guardar.', 400);
    const org = req.user.organization_id;
    if (!embed.planAllows(org)) throw httpError('Disponível no plano Premium.', 403, { feature: embed.FEATURE });
    // Valida tudo antes de gravar: um aspeto inválido não deixa as origens a meio.
    if (hasStyle) embedStyle.normalizeStyle(body.style, embedStyle.storedStyle(org));
    if (hasOrigins) {
      const before = embed.storedOrigins(org);
      const origins = embed.saveOrigins(org, body.origins);
      recordAudit({ organizationId: org, userId: req.user.id, action: 'settings.embed_origins_changed', meta: { before, after: origins } });
    }
    if (hasStyle) {
      const before = embedStyle.storedStyle(org);
      const after = embed.saveStyle(org, body.style);
      recordAudit({ organizationId: org, userId: req.user.id, action: 'settings.embed_style_changed', meta: { before, after } });
    }
    res.json({ success: true, data: embed.getSettings(org, publicOrigin(req)) });
  } catch (e) { next(e); }
});

module.exports = router;
