// Leitura tolerante de JSON guardado na base (colunas TEXT): um valor vazio ou
// ilegível devolve `fallback`; um objeto já lido passa sem alteração.
function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
module.exports = { safeJson };
