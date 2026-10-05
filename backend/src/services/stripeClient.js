const Stripe = require('stripe');
const { configuredOrigin } = require('./publicOrigin');

let client;
let clientKey;
function stripeConfig() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const organizationId = String(process.env.STRIPE_ORGANIZATION_ID || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  // This integration intentionally accepts test credentials only.
  const ready = /^(sk|rk)_test_/.test(key) && webhookSecret.startsWith('whsec_') && !!organizationId && !!configuredOrigin();
  return { key, organizationId, webhookSecret, ready };
}
function stripeEnabled(organizationId) {
  const config = stripeConfig();
  return config.ready && config.organizationId === organizationId;
}
function getStripe() {
  const config = stripeConfig();
  if (!config.ready) throw Object.assign(new Error('Pagamento online indisponível. Contacte o alojamento.'), { status: 503 });
  if (!client || clientKey !== config.key) {
    client = new Stripe(config.key, { maxNetworkRetries: 2, timeout: 15000 });
    clientKey = config.key;
  }
  return client;
}
module.exports = { getStripe, stripeConfig, stripeEnabled };
