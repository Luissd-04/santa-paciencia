const router = require('express').Router();
const ctrl = require('../controllers/eventController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/settings', ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
