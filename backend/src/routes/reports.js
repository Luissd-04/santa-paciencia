const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reportController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));

router.get('/financial', ctrl.getFinancialReport);
router.get('/expenses', ctrl.getExpenseReport);

module.exports = router;
