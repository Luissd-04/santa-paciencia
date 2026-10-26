(() => {
AppModules.define('definicoes', { loadPaymentPolicy: { get: () => loadPaymentPolicy } });
const $ = id => document.getElementById(id);
const esc = value => AppModules.core.escapeHtml(String(value ?? ''));
let loaded = false;
function readRules(kind) {
  return [...document.querySelectorAll(`#pp-${kind}-rows tr`)].map(row => ({
    minDays: row.querySelector('[data-field="minDays"]').valueAsNumber,
    maxDays: row.querySelector('[data-field="maxDays"]').value === '' ? null : row.querySelector('[data-field="maxDays"]').valueAsNumber,
    percent: row.querySelector('[data-field="percent"]').valueAsNumber,
  }));
}
function readPolicy() {
  return { enabled: $('pp-enabled').checked, automaticCharge: $('pp-auto').checked,
    refundBasis: $('pp-basis').value, balanceDays: $('pp-days').valueAsNumber, graceHours: $('pp-grace').valueAsNumber,
    depositRules: readRules('deposit'), refundRules: readRules('refund') };
}
function renderRules(kind, rows) {
  $(`pp-${kind}-rows`).innerHTML = rows.map((r, i) => `<tr>
    <td data-label="Desde (dias)"><input aria-label="${kind === 'deposit' ? 'Pagamento inicial' : 'Reembolso'}: desde, intervalo ${i + 1}" data-field="minDays" type="number" min="0" step="1" required value="${esc(r.minDays)}"></td>
    <td data-label="Até (dias)"><input aria-label="${kind === 'deposit' ? 'Pagamento inicial' : 'Reembolso'}: até, intervalo ${i + 1}" data-field="maxDays" type="number" min="0" step="1" placeholder="Sem limite" value="${esc(r.maxDays)}"></td>
    <td data-label="Percentagem"><input aria-label="${kind === 'deposit' ? 'Pagamento inicial' : 'Reembolso'}: percentagem, intervalo ${i + 1}" data-field="percent" type="number" min="${kind === 'deposit' ? 1 : 0}" max="100" step="0.01" required value="${esc(r.percent)}"></td>
    <td><button class="btn btn-ghost btn-sm" type="button" ${AppActions.attrs('click', 'payment-policy-remove-row', [kind, i])} aria-label="Remover intervalo ${i + 1} de ${kind === 'deposit' ? 'pagamento inicial' : 'reembolso'}">Remover</button></td>
  </tr>`).join('');
}
function table(kind, title, description) {
  return `<section class="card pp-card"><h3>${title}</h3><p>${description}</p>
    <table class="pp-table"><thead><tr><th>Desde (dias)</th><th>Até (dias)</th><th>Percentagem (%)</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody id="pp-${kind}-rows"></tbody></table>
    <button class="btn btn-ghost" type="button" ${AppActions.attrs('click', 'payment-policy-add-row', [kind])}>Adicionar intervalo</button>
    <p class="pp-help">Limites incluídos. Comece em 0 e cubra todos os dias, sem sobreposições. Último limite superior vazio = sem limite.</p></section>`;
}
function render(policy) {
  const today = window.ReservationDates.localIso();
  const checkIn = window.ReservationDates.localIso(new Date(), 120);
  $('pp-content').innerHTML = `<form id="pp-form" data-on-submit="payment-policy-save">
    <section class="card pp-card"><h3>Política para novas reservas</h3>
      <label class="pp-check"><input id="pp-enabled" type="checkbox" ${policy.enabled ? 'checked' : ''}> Ativar pagamentos faseados e cancelamentos</label>
      <p>As reservas guardam estas regras. Alterar esta página só afeta novas reservas. Os valores iniciais são exemplos: reveja-os antes de ativar.</p>
    </section>
    ${table('deposit', '1. Pagamento inicial', 'Percentagem do total necessária para confirmar, consoante os dias entre a criação da reserva e o check-in.')}
    <section class="card pp-card"><h3>2. Pagamento do restante</h3><div class="pp-fields">
      <label>Cobrar quantos dias antes do check-in?<input id="pp-days" type="number" min="1" max="365" step="1" required value="${esc(policy.balanceDays)}"></label>
      <label>Prazo adicional após aviso (horas)<input id="pp-grace" type="number" min="1" max="168" step="1" required value="${esc(policy.graceHours)}"></label>
    </div>
    <label class="pp-check"><input id="pp-auto" type="checkbox" ${policy.automaticCharge ? 'checked' : ''}> Permitir cobrança automática do cartão autorizado pelo hóspede</label>
    <p>Vencimento às 12:00, hora de Lisboa. Reservas feitas já dentro deste prazo pagam 100% inicialmente. Com MB WAY, ou sem autorização do cartão, enviamos um link para pagar o restante.</p>
    <p>Se o restante não for pago no prazo adicional, a reserva é cancelada sem reembolso. O prazo começa após o aviso enviado ao hóspede; pagamentos em processamento impedem o cancelamento. É necessária uma ligação Gmail ativa para enviar os avisos; se o envio falhar, o cancelamento automático fica suspenso.</p></section>
    <section class="card pp-card"><h3>3. Base do reembolso</h3>
      <label>Calcular a antecedência a partir de<select id="pp-basis"><option value="cancellation" ${policy.refundBasis === 'cancellation' ? 'selected' : ''}>Quando o cancelamento é pedido</option><option value="booking" ${policy.refundBasis === 'booking' ? 'selected' : ''}>Quando a reserva foi feita</option></select></label>
      <p id="pp-basis-help">Se escolher a data da reserva, o hóspede mantém essa percentagem mesmo cancelando perto da chegada.</p>
    </section>
    ${table('refund', 'Reembolso por intervalo', 'Percentagem do montante já pago a devolver quando o hóspede cancela, segundo a base escolhida acima.')}
    <div class="pp-save"><button id="pp-save" type="submit" class="btn btn-primary">Guardar política</button><span id="pp-result" role="status" aria-live="polite"></span></div>
  </form>
  <section class="card pp-card"><h3>4. Simular uma reserva</h3><p>Usa os valores atualmente preenchidos, mesmo antes de guardar ou ativar.</p>
    <div class="pp-fields">
      <label>Total (€)<input id="pp-sim-total" type="number" min="0" step="0.01" value="250"></label>
      <label>Já pago (€)<input id="pp-sim-paid" type="number" min="0" step="0.01" value="50"></label>
      <label>Data da reserva<input id="pp-sim-booked" type="date" value="${today}"></label>
      <label>Check-in<input id="pp-sim-checkin" type="date" value="${checkIn}"></label>
      <label>Data do cancelamento<input id="pp-sim-cancel" type="date" value="${today}"></label>
    </div><button id="pp-simulate" type="button" class="btn btn-ghost" data-on-click="payment-policy-simulate">Simular</button>
    <div id="pp-sim-result" role="status" aria-live="polite"></div>
  </section>`;
  renderRules('deposit', policy.depositRules); renderRules('refund', policy.refundRules);
  loaded = AppModules.core.currentUser?.organization_id;
}
async function loadPaymentPolicy() {
  if (!['owner', 'manager'].includes(AppModules.core.currentUser?.role)) {
    $('pp-content').textContent = 'A configuração financeira está disponível aos gestores.'; return;
  }
  // Conservar alterações por guardar ao trocar de separador.
  if (loaded === AppModules.core.currentUser?.organization_id && $('pp-form')) return;
  $('pp-content').textContent = 'A carregar a política…';
  try { const result = await AppModules.core.apiGet('/api/payment-policy'); render(result.data); }
  catch (e) { $('pp-content').textContent = e.message || 'Não foi possível carregar. Volte a abrir este separador.'; }
}
async function save(event) {
  event.preventDefault();
  const button = $('pp-save'); button.disabled = true;
  $('pp-result').textContent = 'A guardar…';
  try {
    const result = await AppModules.core.apiPut('/api/payment-policy', readPolicy());
    renderRules('deposit', result.data.depositRules); renderRules('refund', result.data.refundRules);
    $('pp-result').textContent = result.data.enabled ? 'Política guardada e ativa para novas reservas.' : 'Política guardada. Continua desativada.';
  } catch (e) { $('pp-result').textContent = e.payload?.error || e.message || 'Não foi possível guardar.'; }
  finally { button.disabled = false; }
}
async function simulate() {
  $('pp-simulate').disabled = true;
  try {
    const result = await AppModules.core.apiPost('/api/payment-policy/simulate', { policy: readPolicy(), example: {
      total: $('pp-sim-total').valueAsNumber, paid: $('pp-sim-paid').valueAsNumber,
      bookedOn: $('pp-sim-booked').value, checkIn: $('pp-sim-checkin').value, cancelOn: $('pp-sim-cancel').value,
    } });
    const p = result.data;
    const money = cents => ReservationMoney.format(cents / 100);
    const date = value => new Date(value).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
    $('pp-sim-result').innerHTML = `<dl class="pp-simulation"><div><dt>Pagamento inicial</dt><dd>${money(p.depositCents)} (${p.depositPercent}%${p.depositAdjusted ? ', ajustado ao mínimo de 0,50 € por pagamento' : ''})</dd></div>
      <div><dt>Restante</dt><dd>${money(p.balanceCents)}${p.balanceCents ? ` até ${date(p.dueAt)}` : ''}</dd></div>
      <div><dt>Reembolso no cancelamento</dt><dd>${money(p.refundCents)} (${p.refundPercent}% do já pago)</dd></div>
      ${p.balanceCents ? `<div><dt>Fim do prazo adicional, se avisado no vencimento</dt><dd>${date(p.deadline)} · Lisboa</dd></div>` : ''}</dl>`;
  } catch (e) { $('pp-sim-result').textContent = e.payload?.error || e.message || 'Verifique os valores da simulação.'; }
  finally { $('pp-simulate').disabled = false; }
}
AppActions.register({
  'payment-policy-open': () => AppModules.core.switchSettingsTab('payments'),
  'payment-policy-add-row': (el, event, args) => {
    const rows = readRules(args[0]);
    const last = rows[rows.length - 1];
    const start = last ? (last.maxDays === null ? last.minDays + 30 : last.maxDays + 1) : 0;
    if (last && last.maxDays === null) last.maxDays = start - 1;
    rows.push({ minDays: start, maxDays: null, percent: last?.percent || 100 });
    renderRules(args[0], rows);
  },
  'payment-policy-remove-row': (el, event, args) => {
    const rows = readRules(args[0]); rows.splice(args[1], 1); renderRules(args[0], rows);
  },
  'payment-policy-simulate': () => simulate(),
}, 'click');
AppActions.register({ 'payment-policy-save': (el, event) => save(event) }, 'submit');
})();
