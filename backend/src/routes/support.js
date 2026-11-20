// «Ajuda e feedback» (/api/support): qualquer membro da organização da sessão.
// Quem vê cada pedido decide-o services/supportAccess.js. O parser de 15 MB das
// rotas com anexos está em app.js (tem de correr antes do parser geral).
const router = require('express').Router();
const support = require('../services/supportService');
const { findVisibleTicket } = require('../services/supportAccess');
const attachments = require('../services/supportAttachments');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const { supportTicketLimiter, supportMessageLimiter } = require('../middleware/rateLimiter');

// O limite por conta corre em app.js antes do parser de anexos. Se por algum
// caminho o pedido chegar aqui sem ele, aplica-se agora (nunca duas vezes).
const limitOnce = limiter => (req, res, next) => (req.supportLimitApplied ? next() : limiter(req, res, next));

router.get('/summary', async (req, res) => ok(res, await support.summary(req.user)));
router.get('/tickets', async (req, res) => ok(res, await support.listForUser(req.user, { status: req.query.status })));
router.get('/tickets/:id', async (req, res) => ok(res, await support.getForUser(req.user, req.params.id)));
router.post('/tickets', limitOnce(supportTicketLimiter), async (req, res) => ok(res, await support.create(req.user, req.body || {},
  { userAgent: req.get('user-agent') || '', ip: req.ip }), 201));
router.post('/tickets/:id/messages', limitOnce(supportMessageLimiter), async (req, res) => ok(res, await support.addCustomerMessage(req.user, req.params.id, req.body || {}), 201));
router.post('/tickets/:id/feedback', async (req, res) => ok(res, await support.feedback(req.user, req.params.id, req.body?.resolved)));

// O mesmo 404 para um anexo inexistente e para um de um pedido que não se vê.
router.get('/attachments/:id', (req, res) => {
  const row = attachments.findAttachment(req.params.id);
  try {
    if (!row) throw new Error();
    findVisibleTicket(req.user, row.ticket_id);
  } catch {
    return res.status(404).json({ success: false, error: 'Anexo não encontrado.' });
  }
  attachments.streamAttachment(res, row);
});

// 501 sai com a mensagem (o tratamento global esconde mensagens 5xx em produção).
router.use((err, _req, res, next) => {
  if (err.status === 501) return res.status(501).json({ success: false, error: err.message });
  next(err);
});

module.exports = router;
