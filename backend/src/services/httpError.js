// Erro com estado HTTP, tratado pelo middleware de erros.
function httpError(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}
module.exports = { httpError };
