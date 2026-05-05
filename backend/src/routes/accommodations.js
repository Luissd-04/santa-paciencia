const router = require('express').Router();
const ctrl = require('../controllers/accommodationController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));
router.get('/',                     ctrl.getAll);
router.get('/settings',             ctrl.getSettings);
router.post('/settings',            ctrl.saveSettings);
router.get('/:id',                  ctrl.getById);
router.post('/',                    ctrl.create);
router.put('/:id',                  ctrl.update);
router.post('/:id/cover',           ctrl.uploadCover);
router.delete('/:id/cover',         ctrl.removeCover);
router.post('/:id/images',          ctrl.uploadImages);
router.patch('/:id/images',         ctrl.patchImages);
router.delete('/:id/images',        ctrl.deleteImage);
router.delete('/:id',               ctrl.remove);

module.exports = router;
