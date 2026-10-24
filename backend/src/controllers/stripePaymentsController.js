const { getStripe, stripeConfig } = require('../services/stripeClient');
const { createCheckout, processWebhook } = require('../services/stripePayments');

async function checkout(req, res, next) {
  try {
    // The token identifies the reservation. All monetary and guest data comes
    // from the database; only consent is accepted from request.body.
    res.json({ success: true, data: await createCheckout(req.params.token, req.body?.consent) });
  } catch (error) {
    if (error.type?.startsWith('Stripe')) {
      console.warn(JSON.stringify({ event: 'stripe_checkout_failed', code: error.code || error.type }));
      return res.status(502).json({ success: false, error: 'Não foi possível abrir o pagamento. Tente novamente; a sua reserva está guardada.' });
    }
    next(error);
  }
}
async function webhook(req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!stripeConfig().ready) return res.status(503).json({ success: false, error: 'Stripe não configurada.' });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, req.get('stripe-signature'), stripeConfig().webhookSecret);
  } catch {
    return res.status(400).json({ success: false, error: 'Assinatura Stripe inválida.' });
  }
  try {
    await processWebhook(event);
    res.json({ received: true });
  } catch (error) { next(error); }
}
async function cancel(req, res, next) {
  try {
    const r = require('../services/stripePayments').lookup(req.params.token);
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, error: 'Confirme o cancelamento.' });
    const data = await require('../services/paymentPolicyAutomation').cancelByPolicy(r.id, {
      expectedRefundCents: req.body.refundCents, key: req.body.key,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
}
module.exports = { checkout, webhook, cancel };
