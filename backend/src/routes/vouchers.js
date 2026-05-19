const router = require('express').Router();
const ctrl = require('../controllers/voucherController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));
router.get('/validate', ctrl.validate);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/apply', ctrl.apply);
router.delete('/:id', ctrl.remove);

module.exports = router;
