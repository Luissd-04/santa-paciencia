const router = require('express').Router();
const ctrl = require('../controllers/accommodationController');

router.get('/',                     ctrl.getAll);
router.get('/settings',             ctrl.getSettings);
router.post('/settings',            ctrl.saveSettings);
router.get('/:id',                  ctrl.getById);
router.post('/',                    ctrl.create);
router.put('/:id',                  ctrl.update);
router.post('/:id/cover',           ctrl.uploadCover);
router.post('/:id/images',          ctrl.uploadImages);
router.patch('/:id/images',         ctrl.patchImages);
router.delete('/:id/images',        ctrl.deleteImage);

module.exports = router;