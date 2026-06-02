const router = require('express').Router();
const ctrl = require('../controllers/publicBookingController');
const { publicBookingLimiter, voucherLimiter } = require('../middleware/rateLimiter');

router.get('/booking/:slug', ctrl.getLanding);
router.get('/booking/:slug/availability', ctrl.getAvailability);
router.get('/booking/:slug/voucher', voucherLimiter, ctrl.validatePublicVoucher);
router.post('/booking/:slug/reservations', publicBookingLimiter, ctrl.createReservation);
router.get('/pre-checkin/:token', ctrl.getPreCheckin);
router.post('/pre-checkin/:token', ctrl.submitPreCheckin);

module.exports = router;
