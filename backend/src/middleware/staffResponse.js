// Bearer capabilities must never be exposed by a read-only team response.
const hidden = new Set(['public_token', 'precheckin_token', 'pre_checkin_url', 'public_url', 'stripe_customer_id', 'stripe_payment_method_id', 'policy_auto_consent']);
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !hidden.has(key)).map(([key, item]) => [key, redact(item)]));
}
module.exports = function staffResponse(req, res, next) {
  if (req.user.role === 'staff') {
    const json = res.json.bind(res);
    res.json = body => json(redact(body));
  }
  next();
};
