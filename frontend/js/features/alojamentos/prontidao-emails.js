// Cartão «Emails aos hóspedes» da ficha do alojamento: cada email ativo e os
// dados que lhe faltam (GET /api/accommodations/:id/email-readiness). Sem os
// obrigatórios, o email não sai e o sino avisa (services/emailReadiness.js).
(() => {
AppModules.define('alojamentos', {
  loadEmailReadiness: { get: () => loadEmailReadiness },
});

let pedido = 0;

async function loadEmailReadiness(id) {
  const list = document.getElementById('aloj-email-readiness');
  const chip = document.getElementById('aloj-email-ready-chip');
  if (!list || !id) return;
  const atual = ++pedido;
  try {
    const { data } = await AppModules.core.apiGet(`/api/accommodations/${encodeURIComponent(id)}/email-readiness`);
    if (atual !== pedido) return;
    render(list, chip, data);
  } catch {
    if (atual === pedido) { list.innerHTML = ''; if (chip) chip.hidden = true; }
  }
}

function render(list, chip, data) {
  const esc = AppModules.core.escapeHtml;
  const emails = data?.emails || [];
  list.innerHTML = emails.map(e => {
    const falta = e.missing.map(m => m.label);
    return `<div class="aloj-ready-row${falta.length ? ' is-missing' : ''}">
      <div>${esc(e.name)}<small>${falta.length ? `Falta: ${esc(falta.join(', '))}` : 'Tem tudo o que precisa'}</small></div>
      <span class="tag">${falta.length ? 'Em falta' : 'Pronto'}</span>
    </div>`;
  }).join('');
  if (chip) {
    chip.hidden = !emails.length;
    chip.textContent = `${data.ready} de ${data.total} prontos`;
    chip.classList.toggle('is-ok', data.ready === data.total);
  }
}
})();
