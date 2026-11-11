const router = require('express').Router();
const ctrl = require('../controllers/publicBookingController');
const {
  publicBookingLimiter, voucherLimiter, preCheckinLookupLimiter, preCheckinSubmitLimiter,
} = require('../middleware/rateLimiter');

router.use((req,res,next)=>{
  const match=/^\/(booking|reservation|pre-checkin)\/([^/]+)/.exec(req.path);
  if(!match)return next();
  let key;try{key=decodeURIComponent(match[2]);}catch{return res.status(404).end();}
  const {db}=require('../config/database');
  const row=match[1]==='booking'?db.prepare('SELECT organization_id FROM accommodations WHERE public_slug=?').get(key):match[1]==='reservation'?db.prepare('SELECT organization_id FROM reservations WHERE public_token=?').get(key):db.prepare('SELECT organization_id FROM reservations WHERE precheckin_token=?').get(key);
  const trials=require('../services/platformTrials');
  if(row&&(trials.isDemo(row.organization_id)||trials.blocked(row.organization_id)))return res.status(404).json({success:false,error:'Página indisponível.'});
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
