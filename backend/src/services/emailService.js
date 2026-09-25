const EMAIL_DISABLED = process.env.EMAIL_ENABLED === 'false';
const crypto = require('crypto');

const { isEmailAuthenticated, sendViaGmail, getEmailConnectionInfo } = require('../config/googleEmail');
const composer = require('./emailComposer');

async function sendMail(organizationId, { to, subject, html, bcc, threadId, inReplyTo, references }) {
  if (EMAIL_DISABLED) return null;
  if (!organizationId || !isEmailAuthenticated(organizationId)) {
    console.warn('⚠️ Email não enviado: Gmail não ligado para a organização', organizationId || '(sem organização)');
    return null;
  }
  const info = getEmailConnectionInfo(organizationId);
  const fromName = process.env.PROPERTY_NAME || 'Santa Paciência';
  const from = info.email ? `${fromName} <${info.email}>` : fromName;
  return sendViaGmail(organizationId, { to, subject, html, from, bcc: bcc || undefined, threadId, inReplyTo, references });
}

// Janela horária de envio de um template (ex.: só entre as 09:00 e as 20:00).
// Sem janela definida, envia sempre que for chamado.
function isWithinSendWindow(template, now = new Date()) {
  if (!template.window_start || !template.window_end) return true;
  const [sh, sm] = template.window_start.split(':').map(Number);
  const [eh, em] = template.window_end.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end);
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
// ver INHERITABLE_ACCOMMODATION_FIELDS). Guardado como caminho relativo
// (/uploads/...) — resolve para absoluto porque os clientes de email
// carregam a imagem a partir da internet, não do servidor local. Sem
// alojamento associado (preview do editor, exports em PDF de todos os
// alojamentos), cai no logótipo por omissão.
function resolveLogoUrl(value) {
  if (!value) return DEFAULT_LOGO_URL;
  if (/^https?:\/\//i.test(value)) return value;
  const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
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
    const rows = orgId
      ? db.prepare(`SELECT key,value FROM organization_settings WHERE organization_id = ? AND key IN (${keys.map(() => '?').join(',')})`).all(orgId, ...keys)
      : db.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys);
    const s = {};
    rows.forEach(r => s[r.key] = r.value);

    let orgName = s.property_name;
    if (!orgName && orgId) {
      const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);
      orgName = org?.name;
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
      logo_url:         resolveLogoUrl(accommodation?.logo_url),
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
function baseTemplate(content, settings) {
  const s = settings || getEmailSettings();
  return composer.composeEmail(composer.sanitizeBodyHtml(content, { placeholders: false }), s);
}

// Mantido para os testes e chamadas antigas; o bloco social passou a ser
// inserido pelo próprio corpo do template, via {{acompanhe_nos}}, porque só o
// email de boas-vindas o mostra (ver prints de referência).
function buildSocialButtons(settings) {
  return composer.buildSocialBlock(settings || getEmailSettings());
}

// Como cada estado de reserva se apresenta ao hóspede. O template chama-se
// "confirmacao" mas dispara na criação da reserva, e a criação aceita estados
// pendente/aguardar_pagamento — sem isto uma reserva por aprovar chegava ao
// hóspede anunciada como confirmada.
const STATUS_PRESENTATION = {
  confirmada:         { title: 'Reserva confirmada',            glyph: '✓', message: 'A sua reserva foi confirmada. Aguardamos a sua visita!' },
  check_in:           { title: 'Reserva confirmada',            glyph: '✓', message: 'A sua reserva foi confirmada. Aguardamos a sua visita!' },
  checkin:            { title: 'Reserva confirmada',            glyph: '✓', message: 'A sua reserva foi confirmada. Aguardamos a sua visita!' },
  checked_in:         { title: 'Reserva confirmada',            glyph: '✓', message: 'A sua reserva foi confirmada. Aguardamos a sua visita!' },
  pendente:           { title: 'Pedido de reserva recebido',    glyph: '•', message: 'Recebemos o seu pedido de reserva. Confirmamos a disponibilidade e entramos em contacto em breve.' },
  aguardar_pagamento: { title: 'Reserva por confirmar',         glyph: '•', message: 'A sua reserva fica confirmada assim que o pagamento for registado.' },
  cancelada:          { title: 'Reserva cancelada',             glyph: '×', message: 'A sua reserva foi cancelada.' },
};

const STATUS_FALLBACK = { title: 'A sua reserva', glyph: '•', message: 'Aqui ficam os detalhes da sua reserva.' };

function statusPresentation(reservation) {
  return STATUS_PRESENTATION[String(reservation?.status || '').toLowerCase()] || STATUS_FALLBACK;
}

// Blocos gerados pelo servidor e inseridos no corpo por {{nome}}. Ao contrário
// das variáveis de texto (que são escapadas), estes são HTML de confiança —
// por isso são construídos aqui e nunca a partir do que o utilizador escreve.
function buildBlocks(vars, settings, reservation) {
  const pres = statusPresentation(reservation);
  const s = settings || {};
  const cardRows = [
    { label: 'Alojamento', value: vars.alojamento },
    { label: 'Check-in',   value: vars.data_checkin  ? `${vars.data_checkin} às ${vars.hora_checkin}` : '' },
    { label: 'Check-out',  value: vars.data_checkout ? `${vars.data_checkout} até às ${vars.hora_checkout}` : '' },
    { label: 'Noites',     value: vars.noites },
    { label: 'Hóspedes',   value: vars.num_hospedes },
    { label: 'Referência', value: vars.referencia },
  ];
  return {
    titulo_reserva: composer.buildReservationTitle(pres.title, pres.glyph),
    titulo_boas_vindas: composer.buildWelcomeTitle(`Bem-vindo à ${s.property_name || 'Santa Paciência'}`),
    cartao_reserva: composer.buildReservationCard(cardRows, vars.total),
    // Mesmo cartão sem a faixa do total — numa reserva cancelada, mostrar um
    // total a pagar seria enganador.
    cartao_reserva_sem_total: composer.buildReservationCard(cardRows, ''),
    botao_alojamento: composer.buildCtaBlock(s.website, 'Conhecer o alojamento'),
    botao_pre_checkin: composer.buildCtaBlock(vars.link_pre_checkin, 'Completar pré check-in'),
    acompanhe_nos: composer.buildSocialBlock(s),
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
  let vars = { ...(context?.vars || {}) };
  let blocks = {};

  if (guest && reservation && accommodation) {
    const extra = {};
    if (reservation.precheckin_token) {
      const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
      extra.link_pre_checkin = `${base}/pre-checkin/${encodeURIComponent(reservation.precheckin_token)}`;
    }
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
    wifi_nome: accommodation.wifi_name || '—',
    wifi_password: accommodation.wifi_password || '—',
    codigo_porta: accommodation.door_code || '—',
    ...extra,
  };
}

// Variáveis cujo valor acaba num href têm de passar pelo filtro de protocolos
// antes de chegar ao template — o sanitizador do corpo deixa passar o
// marcador {{...}} intacto, por isso a validação tem de ser feita no valor.
const URL_VARS = ['link_pre_checkin'];
function sanitizeUrlVars(vars) {
  for (const key of URL_VARS) {
    if (vars[key] !== undefined) vars[key] = composer.safeUrl(vars[key]);
  }
  return vars;
}

const INHERITABLE_ACCOMMODATION_FIELDS = [
  'address', 'postal_code', 'city', 'region', 'country',
  'wifi_name', 'wifi_password', 'door_code', 'checkin_time', 'checkout_time',
  'social_facebook', 'social_instagram', 'social_website', 'social_tripadvisor', 'logo_url',
  'email_social_links',
];

// Suites/quartos filhos de um alojamento principal não repetem Wi-Fi/redes
// sociais/etc — herdam do pai (mesma lógica de accommodationController.js
// INHERITED_FIELDS). Sem isto, um email para uma reserva numa suite via
// sendTemplatedEmail() via qualquer valor próprio a null, mesmo que o
// alojamento principal tenha os dados preenchidos.
function resolveAccommodationInheritance(accommodation, organizationId) {
  if (!accommodation?.parent_id) return accommodation;
  try {
    const { db } = require('../config/database');
    const parent = organizationId
      ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation.parent_id, organizationId)
      : db.prepare('SELECT * FROM accommodations WHERE id = ?').get(accommodation.parent_id);
    if (!parent) return accommodation;
    const resolved = { ...accommodation };
    for (const field of INHERITABLE_ACCOMMODATION_FIELDS) {
      if (resolved[field] === null || resolved[field] === undefined || resolved[field] === '') {
        resolved[field] = parent[field];
      }
    }
    return resolved;
  } catch {
    return accommodation;
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Calcula o intervalo real de estadia (check-in/check-out ajustados às horas
// configuradas para o alojamento) — extraído para reutilizar entre a escolha
// de reserva "ativa" e a nova janela de elegibilidade de templates.
function computeStayWindow(reservation, settings) {
  const [ih, im] = String(settings.checkin_time  || '15:00').split(':').map(Number);
  const [oh, om] = String(settings.checkout_time || '11:00').split(':').map(Number);
  const checkinDt  = new Date(`${reservation.check_in}T${String(ih || 0).padStart(2, '0')}:${String(im || 0).padStart(2, '0')}:00`);
  const checkoutDt = new Date(`${reservation.check_out}T${String(oh || 0).padStart(2, '0')}:${String(om || 0).padStart(2, '0')}:00`);
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-PT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function sendTemplatedEmail(slug, guest, reservation, accommodation, extraVars) {
  if (EMAIL_DISABLED) { console.log(`Email ${slug} ignorado (EMAIL_ENABLED=false)`); return null; }
  const { db } = require('../config/database');
  const orgId = reservation.organization_id || accommodation.organization_id;
  const template = orgId
    ? db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ? AND slug = ? AND active=1').get(orgId, slug)
    : db.prepare('SELECT * FROM email_templates WHERE slug=? AND active=1').get(slug);
  if (!template) { console.log(`Template ${slug} não encontrado ou inativo`); return null; }
  if (!require('./emailEligibility').canSendTemplate(template, reservation)) return null;
  const to = guest.email;
  if (!to) return null;

  accommodation = resolveAccommodationInheritance(accommodation, orgId);

  // Fora da janela de envio configurada para este template: adia para a
  // próxima passagem do scheduler em vez de enviar já (ver flushQueuedEmails).
  if (orgId && !isWithinSendWindow(template)) {
    db.prepare(`
      INSERT OR IGNORE INTO organization_email_queue (id, organization_id, template_slug, reservation_id)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), orgId, slug, reservation.id);
    console.log(`📧 Email ${slug} → reserva ${reservation.id} adiado (fora da janela de envio)`);
    return { queued: true };
  }

  let vars_extra = extraVars || {};
  if (slug === 'pre_checkin' && !vars_extra.link_pre_checkin && reservation.precheckin_token) {
    const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
    vars_extra = { ...vars_extra, link_pre_checkin: `${base}/pre-checkin/${reservation.precheckin_token}` };
  }

  const settings = getEmailSettings(accommodation, orgId);
  const vars = sanitizeUrlVars(buildVars(guest, reservation, accommodation, settings, vars_extra));
  const blocks = buildBlocks(vars, settings, reservation);
  const rendered = renderEmail({ subject: template.subject, body: template.body, vars, blocks, settings });
  // A intenção de envio sobrevive a falhas de rede e reinícios.
  db.prepare(`INSERT OR IGNORE INTO organization_email_queue (id, organization_id, template_slug, reservation_id)
    VALUES (?, ?, ?, ?)`).run(crypto.randomUUID(), orgId, slug, reservation.id);
  const result = await sendMail(orgId, {
    to,
    subject: rendered.subject,
    html: rendered.html,
    bcc: template.bcc || undefined,
  });
  if (result) db.transaction(() => {
    if (['checkin', 'checkout'].includes(template.timing_event)) {
      db.prepare('INSERT OR IGNORE INTO organization_email_log (id,organization_id,template_slug,reservation_id) VALUES (?,?,?,?)')
        .run(crypto.randomUUID(), orgId, slug, reservation.id);
    }
    db.prepare('DELETE FROM organization_email_queue WHERE organization_id=? AND template_slug=? AND reservation_id=?')
      .run(orgId, slug, reservation.id);
  })();
  return result;
}

async function sendConfirmationEmail(guest, reservation, accommodation) {
  return sendTemplatedEmail('confirmacao', guest, reservation, accommodation);
}

async function sendCancellationEmail(guest, reservation, accommodation) {
  return sendTemplatedEmail('cancelamento', guest, reservation, accommodation);
}

async function sendPaymentConfirmationEmail(guest, reservation, accommodation) {
  if (EMAIL_DISABLED) return null;
  const { db } = require('../config/database');
  const orgId = reservation.organization_id || accommodation.organization_id;
  const template = orgId
    ? db.prepare("SELECT * FROM organization_email_templates WHERE organization_id = ? AND slug='pagamento' AND active=1").get(orgId)
    : db.prepare("SELECT * FROM email_templates WHERE slug='pagamento' AND active=1").get();
  if (template) return sendTemplatedEmail('pagamento', guest, reservation, accommodation);
  accommodation = resolveAccommodationInheritance(accommodation, orgId);
  const settings = getEmailSettings(accommodation, orgId);
  const content = `${composer.buildReservationTitle('Pagamento confirmado', '✓')}
    <p style="margin:0 0 14px;">Olá <strong>${escapeHtml(guest.first_name || (guest.name || '').split(' ')[0] || guest.name || '')}</strong>,</p>
    <p style="margin:0 0 6px;">Confirmamos a receção do pagamento da sua reserva em <strong>${escapeHtml(accommodation.name || '')}</strong>.</p>
    ${composer.buildReservationCard([
      { label: 'Alojamento', value: accommodation.name || '' },
      { label: 'Referência', value: reservation.id || '' },
    ], composer.formatCurrency(reservation.total_amount || 0))}`;
  return sendMail(orgId, {
    to: guest.email,
    subject: `Pagamento confirmado — ${settings.property_name}`,
    html: baseTemplate(content, settings),
  });
}

async function sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl) {
  if (EMAIL_DISABLED) return null;
  const { db } = require('../config/database');
  const orgId = reservation.organization_id || accommodation.organization_id;
  const template = orgId
    ? db.prepare("SELECT 1 FROM organization_email_templates WHERE organization_id = ? AND slug='pre_checkin' AND active=1").get(orgId)
    : null;
  if (template) {
    return sendTemplatedEmail('pre_checkin', guest, reservation, accommodation, { link_pre_checkin: preCheckinUrl });
  }
  accommodation = resolveAccommodationInheritance(accommodation, orgId);
  const settings = getEmailSettings(accommodation, orgId);
  const content = `${composer.buildReservationTitle('Pré check-in', '•')}
    <p style="margin:0 0 14px;">Olá <strong>${escapeHtml(guest.first_name || (guest.name || '').split(' ')[0] || guest.name || '')}</strong>,</p>
    <p style="margin:0 0 6px;">A sua reserva em <strong>${escapeHtml(accommodation.name || '')}</strong> foi aprovada. Para prepararmos a chegada, pedimos que complete o pré check-in com a hora prevista de chegada e os dados legais dos hóspedes.</p>
    ${composer.buildCtaBlock(preCheckinUrl, 'Completar pré check-in')}
    <p style="font-size:13.5px;color:${composer.PALETTE.muted};margin:18px 0 0;">Referência da reserva: <strong>${escapeHtml(reservation.id)}</strong></p>`;
  return sendMail(orgId, {
    to: guest.email,
    subject: `Pré check-in da sua reserva — ${settings.property_name}`,
    html: baseTemplate(content, settings),
  });
}

async function sendReservationRequestApprovedEmail(guest, reservation, accommodation, preCheckinUrl) {
  return sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl);
}

async function sendOwnerNewReservationEmail(organizationId, guest, reservation, accommodation, appUrl) {
  if (EMAIL_DISABLED) return null;
  const { db } = require('../config/database');

  const owners = db.prepare(`
    SELECT u.email FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE m.organization_id = ? AND m.role IN ('owner', 'manager') AND m.active = 1 AND u.active = 1
    ORDER BY CASE m.role WHEN 'owner' THEN 1 ELSE 2 END
  `).all(organizationId);

  if (!owners.length) return null;

  accommodation = resolveAccommodationInheritance(accommodation, organizationId);
  const settings = getEmailSettings(accommodation, organizationId);
  const reservationUrl = appUrl ? `${appUrl}/reservas?reserva=${encodeURIComponent(reservation.id)}` : '';

  const content = `
    ${composer.buildReservationTitle('Nova reserva recebida', '•')}
    ${composer.buildReservationCard([
      { label: 'Referência',  value: reservation.id || '' },
      { label: 'Hóspede',     value: `${guest.name || ''} <${guest.email || ''}>` },
      { label: 'Alojamento',  value: accommodation.name || '' },
      { label: 'Check-in',    value: formatDate(reservation.check_in) },
      { label: 'Check-out',   value: formatDate(reservation.check_out) },
      { label: 'Hóspedes',    value: String(reservation.num_guests || 1) },
      { label: 'Estado',      value: statusPresentation(reservation).title },
    ], composer.formatCurrency(reservation.total_amount || 0))}
    ${composer.buildCtaBlock(reservationUrl, 'Ver reserva no backoffice')}
  `;

  for (const owner of owners) {
    try {
      await sendMail(organizationId, {
        to: owner.email,
        subject: `Nova reserva — ${guest.name} · ${reservation.id}`,
        html: baseTemplate(content, settings),
      });
    } catch (err) {
      console.error(`Notificação owner nova reserva (${owner.email}):`, err.message);
    }
  }
}

module.exports = {
  sendMail,
  sendConfirmationEmail,
  sendCancellationEmail,
  sendPaymentConfirmationEmail,
  sendPreCheckinEmail,
  sendReservationRequestApprovedEmail,
  sendOwnerNewReservationEmail,
  sendTemplatedEmail,
  baseTemplate,
  buildSocialButtons,
  interpolate,
  buildVars,
  buildBlocks,
  renderEmail,
  renderManualEmail,
  statusPresentation,
  sanitizeUrlVars,
  escapeVars,
  getEmailSettings,
  formatDate,
  resolveAccommodationInheritance,
  findGuestEmailContext,
};
