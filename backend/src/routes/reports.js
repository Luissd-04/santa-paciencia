const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reportController');

router.get('/financial', ctrl.getFinancialReport);
router.get('/expenses', ctrl.getExpenseReport);

module.exports = router;
