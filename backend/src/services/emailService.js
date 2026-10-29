// Lido em cada envio: desligar o email (EMAIL_ENABLED=false) não exige reiniciar módulos.
const emailDisabled = () => process.env.EMAIL_ENABLED === 'false';
const { httpError } = require('./httpError');

// Lido no momento do envio (e não desestruturado), para a ligação Gmail poder
// ser substituída nos testes.
const googleEmail = require('../config/googleEmail');
const composer = require('./emailComposer');

const { isDeliverableEmail, isPlaceholderEmail } = require('./emailAddress');

async function sendMail(organizationId, { to, subject, html, bcc, threadId, inReplyTo, references }) {
  if (emailDisabled()) return null;
  if (isPlaceholderEmail(to)) {
    console.warn('⚠️ Email não enviado: destinatário sem endereço real');
    return null;
  }
  if (!organizationId || !googleEmail.isEmailAuthenticated(organizationId)) {
    console.warn('⚠️ Email não enviado: Gmail não ligado para a organização', organizationId || '(sem organização)');
    return null;
  }
  const info = googleEmail.getEmailConnectionInfo(organizationId);
  const fromName = getEmailSettings(null, organizationId).property_name;
  const from = info.email ? `${fromName} <${info.email}>` : fromName;
  return googleEmail.sendViaGmail(organizationId, { to, subject, html, from, bcc: bcc || undefined, threadId, inReplyTo, references });
}

// Janela horária de envio de um template (ex.: só entre as 09:00 e as 20:00).
// Sem janela definida, envia sempre que for chamado.
function isWithinSendWindow(template, now = new Date()) {
  if (!template.window_start || !template.window_end) return true;
  const [sh, sm] = template.window_start.split(':').map(Number);
  const [eh, em] = template.window_end.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return true;
  const { hour, minute } = require('./dates').localTime(now);
  const cur = hour * 60 + minute;
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end);
}

// Próxima abertura da janela de envio do modelo (no fuso do alojamento).
function nextWindowStart(template, now = new Date()) {
  const dates = require('./dates');
  const today = dates.localDay(now);
  const start = dates.zonedDateTime(today, template.window_start);
  return start > now ? start : dates.zonedDateTime(dates.addDays(today, 1), template.window_start);
}

const BRAND_COLOR = composer.PALETTE.brand;
const ACCENT_COLOR = composer.PALETTE.accent;

// Escape de HTML para dados do hóspede/reserva interpolados nos templates (S10).
// O nome/email vêm do formulário público — sem escape, permitem injetar
// links de phishing ou partir a estrutura do email enviado ao owner.
const escapeHtml = composer.escapeHtml;

// Versão escapada das vars para uso em corpos HTML (o subject usa as raw,
// porque é texto simples — entidades HTML apareceriam literalmente).
function escapeVars(vars) {
  const out = {};
  for (const [key, value] of Object.entries(vars)) out[key] = escapeHtml(value);
  return out;
}

const DEFAULT_LOGO_URL = 'https://santapaciencia.pt/wp-content/uploads/2024/04/cropped-Logo-Transparente-Cinza-280x60-1.png';

// Fallback hardcoded do Facebook — usado quando não há alojamento associado
// (preview do editor de templates) e o valor a nível de organização nunca foi
// preenchido (não há UI para isso, ao contrário do Instagram/Website que já
// tinham valor). Sem UI dedicada porque o utilizador decidiu não valer a pena.
const DEFAULT_FACEBOOK_URL = 'https://www.facebook.com/al.santapaciencia/';

// Logótipo configurável por alojamento (herdado pelas suites do principal —
// ver services/accommodationInheritance.js). Guardado como caminho relativo
// (/uploads/...) — resolve para absoluto porque os clientes de email
// carregam a imagem a partir da internet, não do servidor local. Sem
// alojamento associado (preview do editor, exports em PDF de todos os
// alojamentos), usa o logótipo do único alojamento principal da organização.
// Se houver vários, é necessário selecionar um contexto para evitar escolher
// a marca de outro alojamento; nesse caso mantém-se o recurso por omissão.
function resolveLogoUrl(value) {
  if (!value) return DEFAULT_LOGO_URL;
  if (/^https?:\/\//i.test(value)) return value;
  try { return require('./publicLinks').absoluteUrl(value); } catch { return DEFAULT_LOGO_URL; }
}

// Aceita string JSON crua (linha da base) ou já em array (chamadas em teste).
function parseSocialLinksEnabled(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getEmailSettings(accommodation, organizationId) {
  try {
    const { db } = require('../config/database');
    const orgId = organizationId || accommodation?.organization_id;
    const keys = ['checkin_time','checkout_time','social_facebook','social_instagram','social_website','social_tripadvisor',
                  'property_name','property_address','license_number','email_contact'];
    let s = {};
    if (orgId) s = require('./settingsService').getMany(orgId, keys);
    else db.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys).forEach(r => { s[r.key] = r.value; });

    let orgName = s.property_name;
    if (!orgName && orgId) {
      const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);
      orgName = org?.name;
    }

    let logo = accommodation?.logo_url;
    if (!accommodation && orgId) {
      const roots = db.prepare(`SELECT logo_url FROM accommodations
        WHERE organization_id = ? AND (parent_id IS NULL OR parent_id = '') LIMIT 2`).all(orgId);
      if (roots.length === 1) logo = roots[0].logo_url;
    }

    return {
      checkin_time:     accommodation?.checkin_time  || s.checkin_time  || '15:00',
      checkout_time:    accommodation?.checkout_time || s.checkout_time || '11:00',
      facebook:         accommodation?.social_facebook  || s.social_facebook  || DEFAULT_FACEBOOK_URL,
      instagram:        accommodation?.social_instagram || s.social_instagram || '',
      website:          accommodation?.social_website   || s.social_website   || '',
      tripadvisor:      accommodation?.social_tripadvisor || s.social_tripadvisor || '',
      // null = mostrar todos os configurados (omisso, comportamento anterior
      // a este campo); um array filtra o bloco "Acompanhe-nos" mesmo que o
      // link esteja preenchido.
      social_links_enabled: parseSocialLinksEnabled(accommodation?.email_social_links),
      property_name:    orgName || process.env.PROPERTY_NAME || 'Santa Paciência',
      property_address: s.property_address || process.env.PROPERTY_ADDRESS || '',
      license_number:   s.license_number   || process.env.LICENSE_NUMBER   || '',
      email_contact:    s.email_contact    || '',
      logo_url:         resolveLogoUrl(logo),
    };
  } catch {
    return {
      checkin_time: '15:00', checkout_time: '11:00',
      facebook: DEFAULT_FACEBOOK_URL, instagram: '', website: '', tripadvisor: '',
      property_name:    process.env.PROPERTY_NAME    || 'Santa Paciência',
      property_address: process.env.PROPERTY_ADDRESS || '',
      license_number:   process.env.LICENSE_NUMBER   || '',
      email_contact:    '',
      logo_url:         resolveLogoUrl(null),
    };
  }
}

// O desenho vive todo em emailComposer.js — envio e pré-visualização usam a
// mesma composição, por isso não podem divergir. baseTemplate() mantém-se como
// ponto de entrada porque há mensagens avulsas (pagamento, pré check-in,
// notificação ao owner) que compõem o conteúdo em código e não por template.
function baseTemplate(content, settings, options = {}) {
  const s = settings || getEmailSettings();
  return composer.composeEmail(composer.sanitizeBodyHtml(content, { placeholders: false }), s, options);
}

// Mantido para os testes e chamadas antigas; o bloco social passou a ser
// inserido pelo próprio corpo do template, via {{acompanhe_nos}}, porque só o
// email de boas-vindas o mostra (ver prints de referência).
function buildSocialButtons(settings) {
  return composer.buildSocialBlock(settings || getEmailSettings());
}

// Como cada estado de reserva se apresenta ao hóspede: etiqueta, cor, frase
// principal e mensagem. O modelo "confirmacao" dispara na criação da reserva,
// que aceita pré-reserva, pendente e aguardar_pagamento — sem isto uma reserva
// por aprovar chegava ao hóspede anunciada como confirmada.
const CONFIRMED = {
  title: 'Reserva confirmada', eyebrow: 'Reserva confirmada', tone: 'ok',
  headline: v => v.data_checkin_extenso ? `Está tudo pronto para ${v.data_checkin_extenso}` : 'A sua reserva está confirmada',
  message: 'A sua reserva está confirmada. Guardámos aqui o essencial.',
};
const STATUS_PRESENTATION = {
  confirmada: CONFIRMED,
  check_in: CONFIRMED,
  checkin: CONFIRMED,
  checked_in: CONFIRMED,
  pre_reserva:        { title: 'Pré-reserva', eyebrow: 'Pré-reserva', tone: 'muted', headline: () => 'Datas guardadas para si',
    message: 'Guardámos estas datas para si. Falta confirmar a reserva; entramos em contacto com os próximos passos.' },
  pendente:           { title: 'Pedido de reserva recebido', eyebrow: 'Pedido recebido', tone: 'muted', headline: () => 'Recebemos o seu pedido',
    message: 'Vamos confirmar a disponibilidade e responder em breve. Ainda não precisa de pagar nada.' },
  aguardar_pagamento: { title: 'Reserva por confirmar', eyebrow: 'Aguarda o sinal', tone: 'warn', headline: () => 'Falta o sinal para confirmar',
    message: 'Guardámos as datas. A reserva fica confirmada assim que recebermos o sinal.' },
  cancelada:          { title: 'Reserva cancelada', eyebrow: 'Reserva cancelada', tone: 'muted', headline: () => 'A sua reserva foi cancelada',
    message: 'A sua reserva foi cancelada.' },
};

const STATUS_FALLBACK = { title: 'A sua reserva', eyebrow: '', tone: 'brand', headline: () => 'A sua reserva', message: 'Aqui ficam os detalhes da sua reserva.' };

function statusPresentation(reservation) {
  return STATUS_PRESENTATION[String(reservation?.status || '').toLowerCase()] || STATUS_FALLBACK;
}

const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// Blocos gerados pelo servidor e inseridos no corpo por {{nome}}. Ao contrário
// das variáveis de texto (que são escapadas), estes são HTML de confiança —
// por isso são construídos aqui e nunca a partir do que o utilizador escreve.
function buildBlocks(vars, settings, reservation) {
  const pres = statusPresentation(reservation);
  const s = settings || {};
  const status = String(reservation?.status || '').toLowerCase();
  const esc = escapeHtml;
  const button = (url, label, options) => composer.buildButton(url, label, options);
  const cardRows = [
    { label: 'Alojamento', value: vars.alojamento },
    { label: 'Check-in',   value: vars.data_checkin  ? `${vars.data_checkin} às ${vars.hora_checkin}` : '' },
    { label: 'Check-out',  value: vars.data_checkout ? `${vars.data_checkout} até às ${vars.hora_checkout}` : '' },
    { label: 'Noites',     value: vars.noites },
    { label: 'Hóspedes',   value: vars.num_hospedes },
    { label: 'Referência', value: vars.referencia },
  ];
  const stay = composer.buildStay({
    checkin: vars.data_checkin_curta, checkinNote: vars.hora_checkin ? `a partir das ${vars.hora_checkin}` : '',
    checkout: vars.data_checkout_curta, checkoutNote: vars.hora_checkout ? `até às ${vars.hora_checkout}` : '',
    summary: [vars.alojamento, vars.noites && plural(vars.noites, 'noite', 'noites'), vars.num_hospedes && plural(vars.num_hospedes, 'hóspede', 'hóspedes'), vars.referencia && `Ref. ${vars.referencia}`].filter(Boolean).join(' · '),
  });
  const progress = composer.buildPaymentProgress({
    paid: vars.total_pago, total: vars.total, missing: vars.valor_em_falta, deadline: vars.prazo_pagamento_curto,
    percent: vars.percentagem_paga, settled: Boolean(vars.pagamento_liquidado),
  });
  const mapButton = button(vars.link_mapa, 'Como chegar', { secondary: true });
  const precheckinDone = Boolean(reservation?.precheckin_submitted_at);

  // O que o hóspede faz a seguir, segundo o estado da reserva.
  const nextStep = {
    confirmada: () => (vars.link_pre_checkin && !precheckinDone
      ? composer.buildNote({ heading: 'Próximo passo', html: 'Complete o pré-check-in: hora de chegada e dados dos hóspedes. Demora cerca de 2 minutos.' })
        + button(vars.link_pre_checkin, 'Fazer o pré-check-in')
      : '') + mapButton,
    aguardar_pagamento: () => button(vars.link_reserva, vars.valor_sinal ? `Pagar o sinal · ${vars.valor_sinal}` : 'Pagar o sinal'),
    pendente: () => composer.buildSteps(['Confirmamos a disponibilidade', 'Enviamos a confirmação e os próximos passos', 'Prepara a sua chegada com o pré-check-in']),
    pre_reserva: () => button(vars.link_reserva, 'Ver a reserva', { secondary: true }),
  };
  nextStep.check_in = nextStep.confirmada;

  return {
    // ── Título segundo o estado (modelo da reserva) ──
    titulo_reserva: composer.buildTitle({ eyebrow: pres.eyebrow, tone: pres.tone, headline: pres.headline(vars) }),
    estadia: stay,
    // Pedidos ainda sem pagamento mostram só o total previsto.
    resumo_pagamento: ['pendente', 'pre_reserva'].includes(status)
      ? composer.buildRows([{ label: 'Total previsto', value: vars.total }])
      : progress,
    proximo_passo: (nextStep[status] || (() => ''))(),
    contacto: composer.buildContactLine(s),
    botao_mapa: mapButton,

    // ── Pré-check-in ──
    titulo_pre_checkin: composer.buildTitle({ eyebrow: 'Falta um passo', tone: 'warn', headline: 'Complete o pré-check-in' }),
    lista_pre_checkin: composer.buildChecklist(['Hora prevista de chegada', 'Nome e documento de cada hóspede (obrigatório por lei)', 'Pedidos especiais (berço, almofadas, alergias)']),
    botao_pre_checkin: button(vars.link_pre_checkin, 'Completar o pré-check-in'),

    // ── Chegada ──
    titulo_chegada: composer.buildTitle({ eyebrow: 'Chegada', tone: 'ok', headline: 'Tudo para a sua chegada' }),
    // Só com a reserva paga na totalidade (emailEligibility): sem isso os
    // códigos chegam vazios e as linhas não aparecem.
    // O nome da rede fica num valor (e não no rótulo em maiúsculas): tem de
    // aparecer exatamente como está escrito.
    codigos_acesso: composer.buildCodes([
      { label: 'Código da porta', value: vars.codigo_porta && vars.codigo_porta !== '—' ? vars.codigo_porta : '' },
      ...(vars.wifi_password && vars.wifi_password !== '—' ? [
        { label: 'Rede Wi-Fi', value: vars.wifi_nome && vars.wifi_nome !== '—' ? vars.wifi_nome : '' },
        { label: 'Senha do Wi-Fi', value: vars.wifi_password },
      ] : []),
    ]),

    // ── Durante a estadia ──
    titulo_boas_vindas: composer.buildTitle({ headline: vars.primeiro_nome ? `Bem-vindo, ${vars.primeiro_nome}` : `Bem-vindo à ${s.property_name || 'Santa Paciência'}` }),
    info_estadia: composer.buildRows([
      { label: 'Wi-Fi', value: vars.wifi_nome && vars.wifi_nome !== '—' ? vars.wifi_nome : '' },
      { label: 'Senha', value: vars.wifi_password && vars.wifi_password !== '—' ? vars.wifi_password : '' },
      { label: 'Check-out', value: vars.data_checkout_curta ? `${vars.data_checkout_curta}, até às ${vars.hora_checkout}` : '' },
    ]),
    botao_alojamento: button(s.website, 'Conhecer o alojamento', { secondary: true }),

    // ── Saída e depois ──
    titulo_checkout: composer.buildTitle({ eyebrow: 'Lembrete', tone: 'muted', headline: vars.data_checkout_curta ? `Check-out ${vars.data_checkout_curta}, até às ${vars.hora_checkout}` : 'Lembrete de check-out' }),
    lista_checkout: composer.buildChecklist(['Deixe as chaves conforme o combinado', 'Feche as janelas e desligue as luzes e o ar condicionado', 'Verifique se não fica nada esquecido']),
    nota_checkout_tardio: composer.buildNote({ heading: 'Precisa de mais tempo?', html: 'Responda a este email: se o alojamento estiver livre, tentamos ajudar com um check-out mais tarde.' }),
    titulo_obrigado: composer.buildTitle({ eyebrow: 'Obrigado', tone: 'brand', headline: vars.primeiro_nome ? `Obrigado pela visita, ${vars.primeiro_nome}` : 'Obrigado pela visita' }),
    botao_avaliar: button(s.tripadvisor, 'Avaliar no TripAdvisor'),

    // ── Cancelamento ──
    resumo_cancelamento: composer.buildRows([
      { label: 'Alojamento', value: vars.alojamento },
      { label: 'Datas', value: vars.datas_curtas },
      { label: 'Referência', value: vars.referencia },
    ]),
    titulo_reembolso: composer.buildTitle({ eyebrow: 'Reserva cancelada', tone: 'muted', headline: vars.valor_reembolso ? `Reembolso de ${vars.valor_reembolso}` : 'A sua reserva foi cancelada' }),
    resumo_reembolso: composer.buildRows([
      { label: 'Total pago', value: vars.total_pago },
      { label: 'A devolver', value: vars.valor_reembolso },
    ]),

    // ── Pagamentos ──
    titulo_pagamento: composer.buildTitle(vars.pagamento_liquidado
      ? { eyebrow: 'Pagamento concluído', tone: 'ok', headline: 'A reserva está paga na totalidade' }
      : { eyebrow: 'Pagamento recebido', tone: 'ok', headline: vars.valor_pagamento ? `Recebemos ${vars.valor_pagamento}` : 'Pagamento recebido' }),
    titulo_aviso_pagamento: composer.buildTitle({ eyebrow: 'Pagamento em falta', tone: 'warn', headline: vars.valor_em_falta ? `Faltam ${vars.valor_em_falta} para concluir` : 'Pagamento em falta' }),
    botao_pagar: button(vars.link_reserva, vars.valor_em_falta ? `Pagar ${vars.valor_em_falta}` : 'Pagar'),
    aviso_prazo: vars.prazo_pagamento
      ? composer.buildNote({ tone: 'warn', heading: 'Importante', html: `Se o pagamento não chegar até <strong>${esc(vars.prazo_pagamento)}</strong> (hora de Lisboa), a reserva é cancelada e os montantes já pagos não são devolvidos.` })
      : '',
    botao_reserva: button(vars.link_reserva, 'Ver a reserva e os pagamentos', { secondary: true }),

    // ── Blocos dos modelos antigos (continuam a funcionar nos textos guardados) ──
    cartao_reserva: composer.buildReservationCard(cardRows, vars.total),
    // Mesmo cartão sem a faixa do total — numa reserva cancelada, mostrar um
    // total a pagar seria enganador.
    cartao_reserva_sem_total: composer.buildReservationCard(cardRows, ''),
    cartao_pagamento: composer.buildReservationCard([
      { label: 'Alojamento', value: vars.alojamento },
      { label: 'Referência', value: vars.referencia },
      { label: 'Total pago', value: vars.total_pago },
      ...(vars.pagamento_liquidado ? [] : [{ label: 'Em falta', value: vars.valor_em_falta }]),
    ], vars.total),
    // As redes sociais passaram para o rodapé de todos os emails ao hóspede.
    acompanhe_nos: '',
  };
}


// Composição única: o corpo editável é sanitizado, as variáveis de texto são
// escapadas e os blocos entram como HTML. Uma única passagem de substituição
// impede que um valor interpolado seja re-analisado (um hóspede chamado
// "{{acompanhe_nos}}" não injeta o bloco).
function renderEmail({ subject, body, vars, blocks, settings }) {
  const merged = { ...escapeVars(vars || {}), ...(blocks || {}) };
  const renderedSubject = interpolate(String(subject || ''), vars || {});
  const renderedBody = interpolate(composer.sanitizeBodyHtml(body || ''), merged);
  return {
    subject: renderedSubject,
    html: composer.composeEmail(composer.sanitizeBodyHtml(renderedBody, { placeholders: false }), settings, { title: renderedSubject }),
  };
}

// As mensagens escolhidas manualmente no separador Mensagens usam exatamente
// a mesma composição dos envios automáticos. O cliente interpola texto para
// feedback imediato, mas deixa blocos como {{cartao_reserva}} intactos; esses
// blocos só podem ser gerados com segurança no servidor.
function renderManualEmail({ organizationId, subject, body, context }) {
  const guest = context?.guest || null;
  const reservation = context?.reservation || null;
  const accommodation = context?.accommodation || null;
  const settings = getEmailSettings(accommodation, organizationId);
  if (!require('./emailEligibility').canSendTemplate({ subject, body }, reservation) && /\{\{\s*(codigo_porta|door_code|wifi_password|password_wifi|codigos_acesso)\s*\}\}/i.test(`${subject} ${body}`)) {
    throw httpError('Os códigos de acesso só podem ser enviados numa reserva confirmada e integralmente paga.', 409);
  }
  let vars = { ...(context?.vars || {}) };
  let blocks = {};

  if (guest && reservation && accommodation) {
    const extra = {};
    if (reservation.precheckin_token) extra.link_pre_checkin = require('./publicLinks').precheckinUrl(reservation);
    vars = sanitizeUrlVars(buildVars(guest, reservation, accommodation, settings, extra));
    blocks = buildBlocks(vars, settings, reservation);
  }

  return renderEmail({ subject, body, vars, blocks, settings });
}

function interpolate(body, vars) {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    vars[key] !== undefined && vars[key] !== null ? vars[key] : match
  );
}

function buildVars(guest, reservation, accommodation, settings, extra) {
  const s = settings || getEmailSettings();
  const firstName = guest.first_name || (guest.name || '').split(' ')[0] || '';
  return {
    nome_hospede: guest.name || '',
    primeiro_nome: firstName,
    alojamento: accommodation.name || accommodation.accommodation_name || '',
    data_checkin: formatDate(reservation.check_in),
    hora_checkin: s.checkin_time || '15:00',
    data_checkout: formatDate(reservation.check_out),
    hora_checkout: s.checkout_time || '11:00',
    // Formas curtas para os blocos: «sáb, 14 nov» e «14 de novembro».
    data_checkin_curta: formatWeekdayDate(reservation.check_in),
    data_checkout_curta: formatWeekdayDate(reservation.check_out),
    data_checkin_extenso: formatDayMonth(reservation.check_in),
    datas_curtas: reservation.check_in && reservation.check_out ? require('./dates').shortRange(reservation.check_in, reservation.check_out) : '',
    link_mapa: mapUrl(accommodation, s),
    noites: String(reservation.nights || ''),
    num_hospedes: String(reservation.num_guests || ''),
    // Formato português: 240,00 € — o símbolo vem do Intl, por isso os
    // templates nunca devem acrescentar outro.
    total: composer.formatCurrency(reservation.total_amount || 0),
    referencia: reservation.id || '',
    // Localidade do alojamento (herdada do alojamento principal pelas suites).
    // Cai no nome quando a cidade não está preenchida, para a frase de
    // boas-vindas não ficar truncada.
    localidade: accommodation.city || accommodation.name || accommodation.accommodation_name || '',
    // Estado real da reserva, em texto — para o assunto, que não aceita blocos.
    titulo_estado: statusPresentation(reservation).title,
    mensagem_estado: statusPresentation(reservation).message,
    ...paymentVars(reservation),
    wifi_nome: accommodation.wifi_name || '—',
    wifi_password: require('./emailEligibility').canSendTemplate({ slug: 'codigo_porta' }, reservation) ? (accommodation.wifi_password || '—') : '',
    codigo_porta: require('./emailEligibility').canSendTemplate({ slug: 'codigo_porta' }, reservation) ? (accommodation.door_code || '—') : '',
    ...extra,
  };
}

// Variáveis cujo valor acaba num href têm de passar pelo filtro de protocolos
// antes de chegar ao template — o sanitizador do corpo deixa passar o
// marcador {{...}} intacto, por isso a validação tem de ser feita no valor.
const URL_VARS = ['link_pre_checkin', 'link_reserva', 'link_mapa'];
function sanitizeUrlVars(vars) {
  for (const key of URL_VARS) {
    if (vars[key] !== undefined) vars[key] = composer.safeUrl(vars[key]);
  }
  return vars;
}

// Suites/quartos filhos herdam Wi-Fi, redes sociais, etc. do alojamento
// principal (services/accommodationInheritance.js).
const resolveAccommodationInheritance = (accommodation, organizationId) =>
  require('./accommodationInheritance').withInheritedFields(accommodation, organizationId);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Calcula o intervalo real de estadia (check-in/check-out ajustados às horas
// configuradas para o alojamento) — extraído para reutilizar entre a escolha
// de reserva "ativa" e a nova janela de elegibilidade de templates.
function computeStayWindow(reservation, settings) {
  const { zonedDateTime } = require('./dates');
  const checkinDt  = zonedDateTime(reservation.check_in, settings.checkin_time || '15:00');
  const checkoutDt = zonedDateTime(reservation.check_out, settings.checkout_time || '11:00');
  return { checkinDt, checkoutDt };
}

// Para mensagens avulsas (separador Mensagens): dado um email de destino,
// encontra o hóspede e a reserva mais relevante para lhe escrever agora.
// Prioridade: estadia ativa neste momento > check-in nos próximos 7 dias >
// check-out nos últimos 7 dias — usada para decidir se os templates (que só
// fazem sentido junto de uma reserva) devem ficar disponíveis (`eligible`).
function findGuestEmailContext(organizationId, email) {
  const empty = { guest: null, reservation: null, accommodation: null, active: false, eligible: false, eligible_reason: null, vars: {} };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !organizationId) return empty;

  const { db } = require('../config/database');
  const guest = db.prepare(
    'SELECT * FROM guests WHERE organization_id = ? AND lower(email) = ? ORDER BY created_at DESC LIMIT 1'
  ).get(organizationId, normalizedEmail);
  if (!guest) return empty;

  const candidates = db.prepare(`
    SELECT * FROM reservations
    WHERE organization_id = ? AND guest_id = ? AND status != 'cancelada'
    ORDER BY check_in DESC
  `).all(organizationId, guest.id);

  const now = new Date();
  const PRIORITY = { active: 3, upcoming_checkin: 2, recent_checkout: 1 };
  let best = null; // { reservation, accommodation, reason }

  for (const r of candidates) {
    const accom = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(r.accommodation_id, organizationId);
    if (!accom) continue;
    const resolvedAccom = resolveAccommodationInheritance(accom, organizationId);
    const settings = getEmailSettings(resolvedAccom, organizationId);
    const { checkinDt, checkoutDt } = computeStayWindow(r, settings);

    let reason = null;
    if (now >= checkinDt && now <= checkoutDt) reason = 'active';
    else if (checkinDt > now && (checkinDt - now) <= SEVEN_DAYS_MS) reason = 'upcoming_checkin';
    else if (checkoutDt < now && (now - checkoutDt) <= SEVEN_DAYS_MS) reason = 'recent_checkout';

    if (reason && (!best || PRIORITY[reason] > PRIORITY[best.reason])) {
      best = { reservation: r, accommodation: resolvedAccom, reason };
    }
  }

  const reservation   = best?.reservation   || null;
  const accommodation = best?.accommodation || null;

  const vars = {
    nome_hospede: guest.name || '',
    primeiro_nome: guest.first_name || (guest.name || '').split(' ')[0] || '',
  };
  if (reservation && accommodation) {
    const settings = getEmailSettings(accommodation, organizationId);
    Object.assign(vars, buildVars(guest, reservation, accommodation, settings));
  }

  return {
    guest, reservation, accommodation,
    active: best?.reason === 'active',
    eligible: !!best,
    eligible_reason: best?.reason || null,
    vars,
  };
}

// «sáb, 14 nov» (com o ano só quando não é o corrente).
const formatWeekdayDate = dateStr => (dateStr ? require('./dates').weekdayDate(dateStr) : '');

// «14 de novembro».
function formatDayMonth(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
}

// Ligação para o mapa a partir da morada do alojamento (ou a da organização).
function mapUrl(accommodation, settings) {
  const address = [accommodation?.address, accommodation?.postal_code, accommodation?.city].filter(Boolean).join(', ')
    || String(settings?.property_address || '').trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-PT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Avisos com prazo (política de pagamento): a janela horária não os adia.
const IMMEDIATE_TEMPLATES = new Set(['aviso_restante', 'cancelamento_politica']);

// Devolve { id } quando enviado, null quando não se aplica, ou { queued, until }
// quando tem de esperar (janela de envio, Gmail indisponível, envio por
// confirmar): a fila de acontecimentos volta a tentar a essa hora.
// `ignoreWindow`: envio pedido pela equipa nesse momento.
async function sendTemplatedEmail(slug, guest, reservation, accommodation, extraVars, { ignoreWindow = false } = {}) {
  if (emailDisabled()) { console.log(`Email ${slug} ignorado (EMAIL_ENABLED=false)`); return null; }
  const { db } = require('../config/database');
  const orgId = reservation.organization_id || accommodation.organization_id;
  const template = orgId
    ? db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ? AND slug = ? AND active=1').get(orgId, slug)
    : db.prepare('SELECT * FROM email_templates WHERE slug=? AND active=1').get(slug);
  if (!template) { console.log(`Template ${slug} não encontrado ou inativo`); return null; }
  if (!require('./emailEligibility').canSendTemplate(template, reservation)) return null;
  const current = db.prepare('SELECT * FROM reservations WHERE id=? AND organization_id=?').get(reservation.id, orgId);
  if (current) reservation = current;
  if (!require('./emailEligibility').canSendTemplate(template, reservation)) return null;
  const to = guest.email;
  if (!isDeliverableEmail(to)) return null;

  accommodation = resolveAccommodationInheritance(accommodation, orgId);

  // Fora da janela de envio configurada para este template: espera pela
  // próxima abertura (a fila de acontecimentos repete-o a essa hora).
  if (orgId && !ignoreWindow && !IMMEDIATE_TEMPLATES.has(slug) && !isWithinSendWindow(template)) {
    console.log(`📧 Email ${slug} → reserva ${reservation.id} adiado (fora da janela de envio)`);
    return { queued: true, delivery_status: 'window', until: nextWindowStart(template) };
  }

  let vars_extra = extraVars || {};
  if (slug === 'pre_checkin' && !vars_extra.link_pre_checkin && reservation.precheckin_token) {
    vars_extra = { ...vars_extra, link_pre_checkin: require('./publicLinks').precheckinUrl(reservation) };
  }

  const settings = getEmailSettings(accommodation, orgId);
  const vars = sanitizeUrlVars(buildVars(guest, reservation, accommodation, settings, vars_extra));
  const blocks = buildBlocks(vars, settings, reservation);
  const rendered = renderEmail({ subject: template.subject, body: template.body, vars, blocks, settings });
  const delivery = require('./emailDelivery');
  const result = await delivery.deliverTemplate({ orgId, slug, reservation, to, rendered }, () => sendMail(orgId, {
    to, subject: rendered.subject, html: rendered.html, bcc: template.bcc || undefined,
  }));
  if (result?.id) db.transaction(() => delivery.afterSent({ orgId, reservationId: reservation.id, slug, timingEvent: template.timing_event }))();
  return result;
}

async function sendConfirmationEmail(guest, reservation, accommodation) {
  return sendTemplatedEmail('confirmacao', guest, reservation, accommodation);
}

async function sendCancellationEmail(guest, reservation, accommodation) {
  return sendTemplatedEmail('cancelamento', guest, reservation, accommodation);
}

// Valores de pagamento e da política, calculados a partir da reserva, para
// que um envio repetido mais tarde (fila) mostre os mesmos dados.
function paymentVars(reservation) {
  const { cents } = require('./money');
  const paidCents = cents(reservation.amount_paid || 0);
  const missingCents = Math.max(0, cents(reservation.total_amount || 0) - paidCents);
  let refund = '';
  try {
    const cancellation = reservation.policy_cancellation_json && JSON.parse(reservation.policy_cancellation_json);
    if (cancellation) refund = composer.formatCurrency(cancellation.refundCents / 100);
  } catch { /* sem cancelamento por política */ }
  let link = '';
  try { link = require('./publicLinks').reservationPageUrl(reservation); } catch { /* origem por configurar */ }
  const totalCents = cents(reservation.total_amount || 0);
  let depositCents = 0;
  try { depositCents = require('./paymentPolicy').requiredDepositCents(reservation); } catch { /* sem política */ }
  return {
    percentagem_paga: totalCents > 0 ? String(Math.round(Math.min(paidCents, totalCents) / totalCents * 100)) : '0',
    valor_sinal: depositCents > paidCents ? composer.formatCurrency((depositCents - paidCents) / 100) : '',
    prazo_pagamento_curto: reservation.balance_deadline ? formatWeekdayDate(require('./dates').localDay(new Date(reservation.balance_deadline))) : '',
    total_pago: composer.formatCurrency(paidCents / 100),
    valor_pagamento: composer.formatCurrency(paidCents / 100),
    valor_em_falta: composer.formatCurrency(missingCents / 100),
    pagamento_liquidado: missingCents === 0 ? '1' : '',
    prazo_pagamento: reservation.balance_deadline ? formatDateTimeLisbon(reservation.balance_deadline) : '',
    valor_reembolso: refund,
    link_reserva: link,
  };
}

function formatDateTimeLisbon(value) {
  return new Date(value).toLocaleString('pt-PT', { timeZone: require('./dates').businessTimeZone(), dateStyle: 'long', timeStyle: 'short' });
}

// Enviado em cada pagamento recebido (sinal, restante ou pagamento único);
// `payment.amount` é o valor deste pagamento.
async function sendPaymentConfirmationEmail(guest, reservation, accommodation, payment = {}) {
  const extra = payment.amount != null ? { valor_pagamento: composer.formatCurrency(Number(payment.amount)) } : {};
  return sendTemplatedEmail('pagamento', guest, reservation, accommodation, extra);
}

async function sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl, options) {
  return sendTemplatedEmail('pre_checkin', guest, reservation, accommodation, preCheckinUrl ? { link_pre_checkin: preCheckinUrl } : {}, options);
}

async function sendReservationRequestApprovedEmail(guest, reservation, accommodation, preCheckinUrl) {
  return sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl);
}

// Aviso à equipa de um pedido novo do site público (staffNotifier).
// Pedidos por aprovar ou à espera do sinal chamam a atenção (âmbar).
const STAFF_NEW_LABEL = { pendente: ['Novo pedido · por aprovar', 'warn'], aguardar_pagamento: ['Nova reserva · aguarda sinal', 'warn'] };

// Aviso à equipa de uma reserva nova (também usado pelos exemplos).
function ownerNewReservationMessage(guest, reservation, accommodation, appUrl) {
  const dates = require('./dates');
  const [eyebrow, tone] = STAFF_NEW_LABEL[reservation.status] || ['Nova reserva', 'ok'];
  const nights = Number(reservation.nights) || dates.daysBetween(reservation.check_in, reservation.check_out);
  return {
    subject: `Nova reserva — ${guest.name} · ${reservation.id}`,
    eyebrow, tone,
    headline: `${guest.name || 'Hóspede'} · ${dates.shortRange(reservation.check_in, reservation.check_out)}`,
    accommodation,
    rows: [
      { label: 'Alojamento',        value: accommodation.name || '' },
      { label: 'Noites · hóspedes', value: `${nights} · ${reservation.num_guests || 1}` },
      { label: 'Canal',             value: require('../config/channels').channelLabel(reservation.channel || 'website') },
      { label: 'Total',             value: composer.formatCurrency(reservation.total_amount || 0) },
      { label: 'Email',             value: isDeliverableEmail(guest.email) ? guest.email : '' },
      { label: 'Telefone',          value: guest.phone || '' },
    ],
    url: appUrl ? `${appUrl}/reservas?reserva=${encodeURIComponent(reservation.id)}` : '',
    footnote: `Referência ${reservation.id}`,
  };
}

async function sendOwnerNewReservationEmail(organizationId, guest, reservation, accommodation, appUrl) {
  if (emailDisabled()) return null;
  return require('./staffNotifier').email(organizationId, ownerNewReservationMessage(guest, reservation, accommodation, appUrl));
}

// Nomes dos blocos {{…}} que o servidor constrói. Fonte única para quem
// precisa de os distinguir de variáveis em falta (ex.: envio manual).
const BLOCK_NAMES = Object.freeze(Object.keys(buildBlocks({}, {}, null)));

module.exports = {
  emailDisabled,
  isDeliverableEmail,
  sendMail,
  sendConfirmationEmail,
  sendCancellationEmail,
  sendPaymentConfirmationEmail,
  sendPreCheckinEmail,
  sendReservationRequestApprovedEmail,
  sendOwnerNewReservationEmail,
  ownerNewReservationMessage,
  sendTemplatedEmail,
  baseTemplate,
  buildSocialButtons,
  interpolate,
  buildVars,
  buildBlocks,
  BLOCK_NAMES,
  renderEmail,
  renderManualEmail,
  statusPresentation,
  sanitizeUrlVars,
  escapeVars,
  getEmailSettings,
  formatDate,
  formatDateTimeLisbon,
  paymentVars,
  resolveAccommodationInheritance,
  findGuestEmailContext,
};
