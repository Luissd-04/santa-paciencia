// Duas versões das páginas públicas em paralelo, para testar lado a lado.
// `?layout=novo` liga a versão nova e `?layout=atual` volta à atual; a escolha
// fica no separador (sessionStorage) e acompanha o percurso: reservar →
// pagamento → estado da reserva → pré-check-in → confirmação. Sem o parâmetro,
// o hóspede vê sempre a versão atual.
// Carregado no <head>, antes de a página ser desenhada, para não piscar.
(() => {
  const KEY = 'sp-public-layout';
  const LAYOUTS = ['atual', 'novo'];
  const param = new URLSearchParams(location.search).get('layout');
  let chosen = LAYOUTS.includes(param) ? param : null;
  try {
    if (chosen) sessionStorage.setItem(KEY, chosen);
    else chosen = sessionStorage.getItem(KEY);
  } catch { /* Sem storage, vale só o parâmetro desta página. */ }
  const name = LAYOUTS.includes(chosen) ? chosen : 'atual';
  document.documentElement.dataset.layout = name;

  // Quem está a testar (escolheu uma versão neste separador) vê um botão para
  // trocar; os hóspedes nunca o veem.
  function renderSwitch() {
    if (!chosen) return;
    const other = name === 'novo' ? 'atual' : 'novo';
    const url = new URL(location.href);
    url.searchParams.set('layout', other);
    const link = document.createElement('a');
    link.className = 'layout-switch';
    link.href = url.pathname + url.search + url.hash;
    link.textContent = name === 'novo' ? 'Versão nova · ver a atual' : 'Versão atual · ver a nova';
    document.body.append(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderSwitch, { once: true });
  else renderSwitch();

  window.PublicLayout = Object.freeze({ name, isNew: name === 'novo' });
})();
