const router = require('express').Router();
const ctrl = require('../controllers/calendarController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/status', ctrl.getStatus);
router.post('/sync-all', ctrl.syncAll);

module.exports = router;
