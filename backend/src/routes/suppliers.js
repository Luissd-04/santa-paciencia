const router = require('express').Router();
const ctrl = require('../controllers/supplierController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.post('/seed', ctrl.seed);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
