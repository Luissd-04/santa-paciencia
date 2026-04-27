const router = require('express').Router();
const ctrl = require('../controllers/emailTemplateController');

router.get('/', ctrl.getAll);
router.get('/email-settings', ctrl.getSettings);
router.put('/email-settings', ctrl.saveSettings);
router.put('/:slug', ctrl.update);
router.post('/:slug/preview', ctrl.preview);

module.exports = router;
