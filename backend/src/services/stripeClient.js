const Stripe = require('stripe');
const { configuredOrigin } = require('./publicOrigin');

let client;
let clientKey;
function stripeConfig() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const organizationId = String(process.env.STRIPE_ORGANIZATION_ID || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const requestedMode = String(process.env.STRIPE_MODE || 'test').trim().toLowerCase();
  const mode = ['test', 'live'].includes(requestedMode) ? requestedMode : 'invalid';
  const livemode = mode === 'live';
  const keyMatchesMode = mode !== 'invalid' && new RegExp(`^(sk|rk)_${mode}_`).test(key);
  // Cobranças reais exigem duas decisões explícitas: modo live e ambiente de
  // produção. Isto impede uma chave live colada por engano no desenvolvimento.
  const environmentAllowed = !livemode || process.env.NODE_ENV === 'production';
  const ready = keyMatchesMode && environmentAllowed && webhookSecret.startsWith('whsec_')
    && !!organizationId && !!configuredOrigin();
  return { key, organizationId, webhookSecret, mode, livemode, ready };
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
