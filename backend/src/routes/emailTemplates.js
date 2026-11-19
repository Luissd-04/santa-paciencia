const router = require('express').Router();
const ctrl = require('../controllers/emailTemplateController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('manager'));
router.get('/', ctrl.getAll);
router.get('/email-settings', ctrl.getSettings);
router.put('/email-settings', ctrl.saveSettings);
// Envia um exemplo de cada email da plataforma para um endereço.
router.post('/send-samples', ctrl.sendSamples);
// Reservas reais para escolher na pré-visualização.
router.get('/preview-reservations', ctrl.previewReservations);
router.put('/:slug', ctrl.update);
// Repõe o assunto e o texto originais (com cópia da versão atual).
router.post('/:slug/reset', ctrl.reset);
router.post('/:slug/preview', ctrl.preview);
// Compõe o HTML da pré-visualização sem enviar email. Mesma permissão
// (manager) e mesmo isolamento por organização do resto do módulo.
router.post('/:slug/preview-html', ctrl.previewHtml);

module.exports = router;
