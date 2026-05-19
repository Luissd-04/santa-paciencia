const router = require('express').Router();
const ctrl = require('../controllers/publicBookingController');

router.get('/booking/:slug', ctrl.getLanding);
router.get('/booking/:slug/availability', ctrl.getAvailability);
router.get('/booking/:slug/voucher', ctrl.validatePublicVoucher);
router.post('/booking/:slug/reservations', ctrl.createReservation);

module.exports = router;
