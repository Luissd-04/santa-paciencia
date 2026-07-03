const router = require('express').Router();
const express = require('express');
const ctrl = require('../controllers/expenseController');
const requireRole = require('../middleware/requireRole');

// Parser maior para os endpoints que recebem imagens de talões em base64.
const imageParser = express.json({ limit: '15mb' });

router.use(requireRole('manager'));
router.get('/summary', ctrl.getSummary);
router.get('/', ctrl.getAll);
router.post('/scan-receipt', imageParser, ctrl.scanReceipt);
router.post('/bulk', imageParser, ctrl.bulkCreate);
router.post('/', imageParser, ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
