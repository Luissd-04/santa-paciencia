const router = require('express').Router();
const ctrl = require('../controllers/publicBookingController');
const {
  publicBookingLimiter, voucherLimiter, preCheckinLookupLimiter, preCheckinSubmitLimiter,
} = require('../middleware/rateLimiter');

router.get('/booking/:slug', ctrl.getLanding);
router.get('/booking/:slug/availability', ctrl.getAvailability);
router.get('/booking/:slug/voucher', voucherLimiter, ctrl.validatePublicVoucher);
router.post('/booking/:slug/reservations', publicBookingLimiter, ctrl.createReservation);
router.get('/reservation/:token', preCheckinLookupLimiter, ctrl.getReservationStatus);
router.get('/pre-checkin/:token', preCheckinLookupLimiter, ctrl.getPreCheckin);
router.post('/pre-checkin/:token', preCheckinSubmitLimiter, ctrl.submitPreCheckin);

module.exports = router;
