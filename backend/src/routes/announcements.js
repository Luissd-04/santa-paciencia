// Comunicados ativos para a organização da sessão (barra no topo da app e
// «Ajuda e feedback»). Qualquer membro; fechar guarda-se por pessoa.
const router = require('express').Router();
const announcements = require('../services/announcements');

router.get('/', (req, res) => {
  // Só leitura: não mexe em nada que as páginas abertas mostrem.
  res.locals.liveQuiet = true;
  res.json({ success: true, data: announcements.listForSession({ organizationId: req.user.organization_id, userId: req.user.id }) });
});

router.post('/:id/dismiss', (req, res) => {
  res.locals.liveQuiet = true;
  res.json({ success: true, data: announcements.dismiss({ organizationId: req.user.organization_id, userId: req.user.id, id: req.params.id }) });
});

module.exports = router;
