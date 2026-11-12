const router = require('express').Router();
const ctrl = require('../controllers/publicBookingController');
const {
  publicBookingLimiter, voucherLimiter, preCheckinLookupLimiter, preCheckinSubmitLimiter,
} = require('../middleware/rateLimiter');

// Demonstrações e testes terminados não têm páginas públicas (services/orgPolicy.js).
// router.param corre para as rotas que o Express de facto encaminha — sem
// reconhecer caminhos à parte, que divergiam em maiúsculas — e procura a
// organização como os controladores: o slug do alojamento, ou o token da
// reserva em qualquer das formas aceites (public_token, precheckin_token).
function hidePublicPage(res) {
  return res.status(404).json({ success: false, error: 'Página indisponível.' });
}
router.param('slug', (req, res, next, slug) => {
  const { db } = require('../config/database');
  const row = db.prepare('SELECT organization_id FROM accommodations WHERE public_slug = ?').get(String(slug));
  if (row && !require('../services/orgPolicy').publicPagesAllowed(row.organization_id)) return hidePublicPage(res);
  next();
});
router.param('token', (req, res, next, token) => {
  const { db } = require('../config/database');
  const value = String(token).trim();
  const rows = db.prepare('SELECT DISTINCT organization_id FROM reservations WHERE public_token = ? OR precheckin_token = ?').all(value, value);
  if (rows.some(row => !require('../services/orgPolicy').publicPagesAllowed(row.organization_id))) return hidePublicPage(res);
  next();
});
router.get('/booking/:slug', ctrl.getLanding);
router.get('/booking/:slug/availability', ctrl.getAvailability);
router.get('/booking/:slug/voucher', voucherLimiter, ctrl.validatePublicVoucher);
router.get('/booking/:slug/payment-plan', ctrl.getPaymentPlan);
router.post('/booking/:slug/reservations', publicBookingLimiter, ctrl.createReservation);
router.get('/reservation/:token', preCheckinLookupLimiter, ctrl.getReservationStatus);
router.post('/reservation/:token/checkout', publicBookingLimiter, require('../controllers/stripePaymentsController').checkout);
router.post('/reservation/:token/cancel', publicBookingLimiter, require('../controllers/stripePaymentsController').cancel);
router.get('/pre-checkin/:token', preCheckinLookupLimiter, ctrl.getPreCheckin);
router.post('/pre-checkin/:token', preCheckinSubmitLimiter, ctrl.submitPreCheckin);

module.exports = router;
