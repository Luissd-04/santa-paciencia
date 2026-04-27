const router = require('express').Router();
const ctrl = require('../controllers/reservationController');

router.get('/stats/dashboard', ctrl.getDashboardStats);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.cancel);

module.exports = router;