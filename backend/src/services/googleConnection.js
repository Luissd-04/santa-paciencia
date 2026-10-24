// Ligação Google (Gmail, Calendar, Tasks): reconhecer uma autorização
// expirada ou revogada da mesma forma em todas as rotas.
function isAuthExpiredError(err) {
  const message = String(err?.message || '');
  const data = err?.response?.data?.error;
  return ['invalid_grant', 'Login Required', 'Token has been expired', 'Invalid Credentials'].some(text => message.includes(text))
    || data === 'invalid_grant' || err?.status === 401 || err?.code === 401;
}
module.exports = { isAuthExpiredError };
