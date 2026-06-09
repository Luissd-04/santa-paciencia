const router = require('express').Router();
const ctrl = require('../controllers/reservationController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/stats/dashboard', ctrl.getDashboardStats);
router.get('/availability', ctrl.getAvailability);
router.get('/notifications', ctrl.getNotifications);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.post('/:id/approve', ctrl.approve);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.cancel);
router.post('/:id/payments', ctrl.addPayment);
router.delete('/:id/payments/:paymentId', ctrl.deletePayment);

module.exports = router;
