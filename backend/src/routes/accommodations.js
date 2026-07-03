const router = require('express').Router();
const express = require('express');
const ctrl = require('../controllers/accommodationController');
const requireRole = require('../middleware/requireRole');

const uploadParser = express.json({ limit: '15mb' });

router.use(requireRole('manager'));
router.get('/',                     ctrl.getAll);
router.get('/settings',             ctrl.getSettings);
router.post('/settings',            ctrl.saveSettings);
router.get('/blocks',               ctrl.listBlocks);
router.delete('/blocks/:blockId',   ctrl.deleteBlock);
router.get('/:id',                  ctrl.getById);
router.post('/',                    ctrl.create);
router.put('/:id',                  ctrl.update);
router.post('/:id/cover',           uploadParser, ctrl.uploadCover);
router.delete('/:id/cover',         ctrl.removeCover);
router.post('/:id/images',          uploadParser, ctrl.uploadImages);
router.patch('/:id/images',         ctrl.patchImages);
router.delete('/:id/images',        ctrl.deleteImage);
router.delete('/:id',               ctrl.remove);
router.get('/:id/pricing-periods',              ctrl.getPricingPeriods);
router.post('/:id/pricing-periods',             ctrl.createPricingPeriod);
router.post('/:id/pricing-periods/bulk',        ctrl.bulkCreatePricingPeriods);
router.put('/:id/pricing-periods/:periodId',    ctrl.updatePricingPeriod);
router.delete('/:id/pricing-periods/:periodId', ctrl.deletePricingPeriod);
router.post('/:id/blocks',          ctrl.createBlock);

module.exports = router;
