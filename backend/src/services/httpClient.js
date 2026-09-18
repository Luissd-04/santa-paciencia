async function fetchWithTimeout(url, options = {}) {
  const timeout = AbortSignal.timeout(30000);
  return fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
}
module.exports = { fetchWithTimeout };
