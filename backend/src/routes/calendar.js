const router = require('express').Router();
const ctrl = require('../controllers/calendarController');

router.get('/status', ctrl.getStatus);
router.post('/sync-all', ctrl.syncAll);

module.exports = router;