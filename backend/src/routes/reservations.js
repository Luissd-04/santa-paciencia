const router = require('express').Router();
const ctrl = require('../controllers/reservationController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));

// Leitura — qualquer membro da equipa
router.get('/stats/dashboard', ctrl.getDashboardStats);
router.get('/availability', ctrl.getAvailability);
router.get('/notifications', ctrl.getNotifications);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);

// Criação e edição — manager+
router.post('/', requireRole('manager'), ctrl.create);
router.put('/:id', requireRole('manager'), ctrl.update);
router.post('/:id/approve', requireRole('manager'), ctrl.approve);

// Pagamentos — manager+ (financeiro)
router.post('/:id/payments', requireRole('manager'), ctrl.addPayment);
router.delete('/:id/payments/:paymentId', requireRole('manager'), ctrl.deletePayment);

// Fatura da reserva — manager+
router.put('/:id/invoice', requireRole('manager'), ctrl.saveInvoice);

// Apagar definitivamente — manager+, mas só funciona se status='cancelada'
// (rota mais específica primeiro para evitar match ambíguo com /:id)
router.delete('/:id/permanent', requireRole('manager'), ctrl.hardDelete);

// Cancelar reserva — manager+
router.delete('/:id', requireRole('manager'), ctrl.cancel);

module.exports = router;
