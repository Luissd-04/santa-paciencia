const router = require('express').Router();
const service = require('../services/platformWorkspace');
const trials = require('../services/platformTrials');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Acessos de teste.
router.get('/trials', (_req, res) => ok(res, trials.list()));
router.post('/trials', (req, res) => ok(res, trials.create(req.user, req.body), 201));
router.put('/trials/:id', (req, res) => ok(res, trials.change(req.user, req.params.id, req.body)));
router.post('/trials/:id/invitation', (req, res) => ok(res, trials.invitation(req.user, req.params.id)));

// Clientes, catálogo e resumo.
router.get('/clients/:id', (req, res) => ok(res, service.clientHub(req.user, req.params.id)));
router.get('/catalog', (req, res) => ok(res, service.catalog(req.user)));
router.get('/summary', (req, res) => ok(res, service.summary(req.user, { from: req.query.from, to: req.query.to })));

// Equipa e definições (Administração).
router.get('/team', (req, res) => ok(res, service.team(req.user)));
router.put('/team/:id', (req, res) => ok(res, service.setRole(req.user, req.params.id, req.body?.roles ?? req.body?.role)));
router.get('/settings', (req, res) => ok(res, service.settings(req.user)));
router.put('/settings', (req, res) => ok(res, service.settings(req.user, req.body || {})));
router.get('/export', (req, res) => {
  const data = service.exportData(req.user);
  res.set('Content-Disposition', 'attachment; filename="gestao-interna.json"');
  res.json(data);
});
router.get('/operations', (_req, res) => ok(res, require('../services/opsStatus').opsStatus('')));

// Registos por área.
router.get('/records/:kind', (req, res) => ok(res, service.list(req.user, req.params.kind, req.query)));
router.post('/records/:kind', (req, res) => ok(res, service.save(req.user, req.params.kind, null, req.body), 201));
router.get('/records/:kind/:id', (req, res) => ok(res, service.get(req.user, req.params.kind, req.params.id)));
router.put('/records/:kind/:id', (req, res) => ok(res, service.save(req.user, req.params.kind, req.params.id, req.body)));
router.delete('/records/:kind/:id', (req, res) => {
  service.remove(req.user, req.params.kind, req.params.id);
  res.status(204).end();
});
router.post('/records/:kind/:id/comments', (req, res) => ok(res, service.comment(req.user, req.params.kind, req.params.id, req.body), 201));

module.exports = router;
