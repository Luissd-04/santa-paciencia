const { getStripe, stripeConfig } = require('../services/stripeClient');
const { createCheckout, processWebhook } = require('../services/stripePayments');

async function checkout(req, res, next) {
  try {
    // The token identifies the reservation. All monetary and guest data comes
    // from the database; request.body is deliberately never used.
    res.json({ success: true, data: await createCheckout(req.params.token) });
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
module.exports = { checkout, webhook };
