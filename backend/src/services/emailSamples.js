// Exemplos dos emails da plataforma com dados fictícios: a pré-visualização do
// editor de modelos e o envio de todos os exemplos para um endereço
// (Definições → Emails). Nunca lê uma reserva real.
const { db } = require('../config/database');
const emailService = require('./emailService');

// Estados que a pré-visualização deixa escolher.
const PREVIEW_STATUSES = ['confirmada', 'pre_reserva', 'pendente', 'aguardar_pagamento', 'cancelada'];

// Ordem cronológica da jornada do hóspede (o cancelamento fica no fim, como
// percurso de exceção). Modelos fora da lista vêm a seguir.
const TEMPLATE_ORDER = [
  'confirmacao', 'pagamento', 'aviso_restante', 'pre_checkin', 'coordenadas',
  'apos_checkin', 'antes_checkout', 'obrigado', 'cancelamento', 'cancelamento_politica',
];

function sortTemplates(templates) {
  const rank = slug => (i => (i === -1 ? TEMPLATE_ORDER.length : i))(TEMPLATE_ORDER.indexOf(slug));
  return [...templates].sort((a, b) => rank(a.slug) - rank(b.slug));
}

const GUEST = { name: 'Rui Marques Silva', first_name: 'Rui', email: 'hospede.exemplo@example.org', phone: '+351 912 345 678' };
const SAMPLE_ACCOMMODATION = { name: 'Suite Mezzanine Deluxe' };

function sampleReservation(orgId, overrides = {}) {
  return {
    id: 'SP-1778013512761',
    status: 'confirmada',
    check_in: '2026-05-29',
    check_out: '2026-05-31',
    nights: 2,
    num_guests: 1,
    total_amount: 240,
    amount_paid: 80,
    public_token: 'exemplo',
    balance_deadline: '2026-05-14T11:00:00Z',
    policy_cancellation_json: JSON.stringify({ refundCents: 4000 }),
    channel: 'website',
    organization_id: orgId,
    ...overrides,
  };
}

// Variáveis e blocos de um modelo do hóspede. Com `accommodation` (já com a
// herança resolvida) usam-se os dados dele, incluindo os códigos; sem ele, um
// alojamento e códigos de exemplo.
function previewContext(orgId, { baseUrl = '', status = 'confirmada', accommodation = null, reservation: overrides = {} } = {}) {
  const settings = emailService.getEmailSettings(accommodation, orgId);
  const reservation = sampleReservation(orgId, { status: PREVIEW_STATUSES.includes(status) ? status : 'confirmada', ...overrides });
  const unit = accommodation || { ...SAMPLE_ACCOMMODATION, city: settings.property_name };
  const vars = emailService.sanitizeUrlVars(emailService.buildVars(GUEST, reservation, unit, settings, {
    link_pre_checkin: `${baseUrl}/pre-checkin/exemplo`,
    wifi_password: unit.wifi_password || '••••••••',
    codigo_porta: unit.door_code || '1234#',
    valor_pagamento: '80,00 €',
  }));
  return { settings, vars, blocks: emailService.buildBlocks(vars, settings, reservation), reservation };
}

// Reserva de exemplo que faz sentido para cada modelo (ex.: as coordenadas só
// mostram os códigos com a reserva paga; o obrigado vem depois da saída).
const PAID = { amount_paid: 240 };
const GUEST_CASES = {
  confirmacao: [
    { label: 'confirmada', status: 'confirmada' },
    { label: 'aguarda o sinal', status: 'aguardar_pagamento', reservation: { amount_paid: 0 } },
    { label: 'pedido por aprovar', status: 'pendente', reservation: { amount_paid: 0 } },
    { label: 'pré-reserva', status: 'pre_reserva', reservation: { amount_paid: 0 } },
  ],
  coordenadas: [{ reservation: PAID }],
  apos_checkin: [{ reservation: { status: 'check_in', ...PAID } }],
  antes_checkout: [{ reservation: { status: 'check_in', ...PAID } }],
  obrigado: [{ reservation: { status: 'check_out', ...PAID } }],
  cancelamento: [{ status: 'cancelada', reservation: { amount_paid: 0 } }],
  cancelamento_politica: [{ status: 'cancelada' }],
};

function guestSamples(orgId, { baseUrl }) {
  const templates = sortTemplates(db.prepare('SELECT slug, name, subject, body FROM organization_email_templates WHERE organization_id = ?').all(orgId))
    .filter(t => String(t.subject || '').trim() && String(t.body || '').trim());
  return templates.flatMap(t => (GUEST_CASES[t.slug] || [{}]).map(c => {
    const { settings, vars, blocks } = previewContext(orgId, { baseUrl, status: c.status, reservation: c.reservation });
    const rendered = emailService.renderEmail({ subject: t.subject, body: t.body, vars, blocks, settings });
    return { group: 'Hóspede', name: c.label ? `${t.name || t.slug} (${c.label})` : (t.name || t.slug), ...rendered };
  }));
}

function staffSamples(orgId, { baseUrl }) {
  const staff = require('./staffNotifier');
  const reservation = sampleReservation(orgId, { status: 'pendente', amount_paid: 0 });
  const cancelled = sampleReservation(orgId, { status: 'cancelada' });
  const url = `${baseUrl}/reservas?reserva=${reservation.id}`;
  return [
    { name: 'Nova reserva', message: emailService.ownerNewReservationMessage(GUEST, reservation, SAMPLE_ACCOMMODATION, baseUrl) },
    { name: 'Reserva cancelada', message: require('./reservationEffects').staffCancelledMessage(
      { guest: GUEST, reservation: cancelled, accommodation: SAMPLE_ACCOMMODATION }, 'guest', url) },
  ].map(({ name, message }) => ({ group: 'Equipa', name, ...staff.compose(orgId, { ...message, accommodation: null }) }));
}

function accountSamples(orgId, { baseUrl }) {
  const { MESSAGES, compose } = require('./accountEmails');
  const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);
  return [
    ['Convite para a equipa', MESSAGES.teamInvitation({ organizationName: org?.name || 'Santa Paciência', role: 'manager', url: `${baseUrl}/convite/exemplo` })],
    ['Recuperar a palavra-passe', MESSAGES.passwordReset({ name: 'Luís', url: `${baseUrl}/?reset=exemplo` })],
    ['Confirmar o novo email', MESSAGES.emailChangeConfirmation({ to: 'novo.email@example.org', url: `${baseUrl}/?confirmar=exemplo` })],
    ['Email de acesso alterado', MESSAGES.emailChanged()],
    ['Teste do Gmail', MESSAGES.gmailTest()],
  ].map(([name, message]) => ({ group: 'Conta', name, ...compose(orgId, message) }));
}

// Todos os exemplos, pela ordem em que chegam à caixa: hóspede, equipa, conta.
function allSamples(orgId, { baseUrl = '' } = {}) {
  return [...guestSamples(orgId, { baseUrl }), ...staffSamples(orgId, { baseUrl }), ...accountSamples(orgId, { baseUrl })];
}

// Envia cada exemplo para `to`, numerado no assunto para ficar por ordem.
// Uma falha não pára os restantes.
async function sendAll(orgId, to, { baseUrl = '' } = {}) {
  const samples = allSamples(orgId, { baseUrl });
  const pad = n => String(n).padStart(String(samples.length).length, '0');
  let sent = 0;
  const failed = [];
  for (const [i, sample] of samples.entries()) {
    try {
      await emailService.sendMail(orgId, { to, subject: `[Exemplo ${pad(i + 1)}/${samples.length}] ${sample.subject}`, html: sample.html });
      sent++;
    } catch (err) {
      failed.push(sample.name);
      console.error(`Exemplo de email "${sample.name}":`, err.message);
    }
  }
  return { total: samples.length, sent, failed };
}

module.exports = { PREVIEW_STATUSES, sortTemplates, previewContext, allSamples, sendAll };
