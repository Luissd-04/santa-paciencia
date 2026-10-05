const router = require('express').Router();
const ctrl = require('../controllers/calendarController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
router.get('/status', ctrl.getStatus);
router.post('/sync-all', ctrl.syncAll);
router.post('/clean-duplicates', ctrl.cleanDuplicates);
router.get('/settings', ctrl.getSettings);
// Definição da organização, não da ligação pessoal ao Google.
router.post('/settings', requireRole('manager'), ctrl.saveSettings);

module.exports = router;
