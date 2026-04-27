const router = require('express').Router();
const ctrl = require('../controllers/calendarController');

router.get('/status', ctrl.getStatus);

module.exports = router;