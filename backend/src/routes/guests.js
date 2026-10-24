const router = require('express').Router();
const ctrl = require('../controllers/guestController');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('staff'));
// Leitura — qualquer membro da equipa; criar e editar fichas — manager+,
// como nas reservas (dados pessoais e classificações VIP/indesejado).
router.get('/', ctrl.getAll);
router.post('/', requireRole('manager'), ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', requireRole('manager'), ctrl.update);
// Apagar remove também as reservas canceladas do hóspede: mesmo nível da
// eliminação definitiva de reservas.
router.delete('/:id', requireRole('manager'), ctrl.remove);
// Anonimização (hóspedes com registo financeiro que não podem ser apagados):
// irreversível, só o proprietário; primeiro a pré-visualização.
router.get('/:id/anonymization', requireRole('owner'), (req, res, next) => {
  try { res.json({ success: true, data: require('../services/guestAnonymization').previewAnonymization(req.user.organization_id, req.params.id) }); }
  catch (err) { next(err); }
});
router.post('/:id/anonymize', requireRole('owner'), (req, res, next) => {
  try {
    const data = require('../services/guestAnonymization').anonymizeGuest(req.user.organization_id, req.params.id, req.user.id, req.body?.expected_reservations);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
