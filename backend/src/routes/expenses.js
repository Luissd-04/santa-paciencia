const router = require('express').Router();
const ctrl = require('../controllers/expenseController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));
router.get('/summary', ctrl.getSummary);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
