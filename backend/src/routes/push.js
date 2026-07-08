const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const push = require('../services/pushService');

router.use(requireRole('staff'));

// Chave pública VAPID para o browser criar a subscrição
router.get('/public-key', (req, res) => {
  res.json({ success: true, data: { publicKey: push.getPublicKey() } });
});

// Registar subscrição do browser/dispositivo
router.post('/subscribe', (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ success: false, error: 'Subscrição inválida.' });
  }
  push.saveSubscription(req.user.organization_id, req.user.id, sub);
  res.json({ success: true });
});

router.post('/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ success: false, error: 'Endpoint em falta.' });
  push.deleteSubscription(endpoint);
  res.json({ success: true });
});

// Preferências por tipo de notificação (switches nas Definições)
router.get('/prefs', (req, res) => {
  res.json({ success: true, data: push.getUserPushPrefs(req.user.organization_id, req.user.id) });
});

router.post('/prefs', (req, res) => {
  const prefs = push.saveUserPushPrefs(req.user.organization_id, req.user.id, req.body || {});
  res.json({ success: true, data: prefs });
});

// Envio de teste para todos os dispositivos da organização
router.post('/test', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, error: 'Escreva uma mensagem.' });
    if (message.length > 500) return res.status(400).json({ success: false, error: 'Mensagem demasiado longa (máx. 500).' });

    const result = await push.sendToOrganization(req.user.organization_id, {
      title: 'Santa Paciência',
      body: message,
      tag: 'sp-test',
      url: '/',
    });
    if (result.total === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum dispositivo subscrito. Ative as notificações primeiro.' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
