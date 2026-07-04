const router = require('express').Router();
const ctrl = require('../controllers/calendarController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/status', ctrl.getStatus);
router.post('/sync-all', ctrl.syncAll);
router.post('/clean-duplicates', ctrl.cleanDuplicates);
router.get('/settings', ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);

module.exports = router;
