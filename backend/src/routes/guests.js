const router = require('express').Router();
const ctrl = require('../controllers/guestController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
// Apagar remove também as reservas canceladas do hóspede: mesmo nível da
// eliminação definitiva de reservas.
router.delete('/:id', requireRole('manager'), ctrl.remove);

module.exports = router;
