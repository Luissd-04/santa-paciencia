const EMAIL_DISABLED = process.env.EMAIL_ENABLED === 'false';
const crypto = require('crypto');

const { isEmailAuthenticated, sendViaGmail, getEmailConnectionInfo } = require('../config/googleEmail');

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

const BRAND_COLOR = '#843424';
const ACCENT_COLOR = '#c9a84c';

// Escape de HTML para dados do hóspede/reserva interpolados nos templates (S10).
// O nome/email vêm do formulário público — sem escape, permitem injetar
// links de phishing ou partir a estrutura do email enviado ao owner.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function getEmailSettings(accommodation, organizationId) {
  try {
    const { db } = require('../config/database');
    const orgId = organizationId || accommodation?.organization_id;
    const keys = ['checkin_time','checkout_time','social_facebook','social_instagram','social_website',
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
      property_name:    orgName || process.env.PROPERTY_NAME || 'Santa Paciência',
      property_address: s.property_address || process.env.PROPERTY_ADDRESS || '',
      license_number:   s.license_number   || process.env.LICENSE_NUMBER   || '',
      email_contact:    s.email_contact    || '',
      logo_url:         resolveLogoUrl(accommodation?.logo_url),
    };
  } catch {
    return {
      checkin_time: '15:00', checkout_time: '11:00',
      facebook: DEFAULT_FACEBOOK_URL, instagram: '', website: '',
      property_name:    process.env.PROPERTY_NAME    || 'Santa Paciência',
      property_address: process.env.PROPERTY_ADDRESS || '',
      license_number:   process.env.LICENSE_NUMBER   || '',
      email_contact:    '',
      logo_url:         resolveLogoUrl(null),
    };
  }
}

// Nem <svg> inline nem <img> de CDN externo servem aqui: a app do Gmail
// (Android/iOS) remove <svg> do corpo do email por completo (fica um círculo
// vazio, sem erro nenhum — foi o que se via nos ecrãs reais), e imagens
// externas dependem do cliente ir buscá-las (e podem falhar de forma
// intermitente para um ícone e não para outro). Emoji são texto simples —
// carregam sempre, sem depender de nada — mesmo padrão já usado no resto dos
// templates (🏨, ✅, etc.).
function buildSocialButtons(settings) {
  const btns = [];
  if (settings.facebook)  btns.push(`<a href="${settings.facebook}"  style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:#1877f2;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">📘 Facebook</a>`);
  if (settings.instagram) btns.push(`<a href="${settings.instagram}" style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:#e1306c;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">📷 Instagram</a>`);
  if (settings.website)   btns.push(`<a href="${settings.website}"   style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:${BRAND_COLOR};color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">🌐 Website</a>`);
  if (!btns.length) return '';
  return `<tr><td bgcolor="${BRAND_COLOR}" class="email-brand-bg" style="background:${BRAND_COLOR};padding:20px 40px;border-top:1px solid rgba(255,255,255,.1);text-align:center;">
    <p style="color:rgba(255,255,255,.65);font-size:12px;margin:0 0 14px;letter-spacing:.5px;text-transform:uppercase;font-family:sans-serif;">Siga-nos nas redes sociais</p>
    <div>${btns.join('')}</div>
  </td></tr>`;
}

function baseTemplate(content, settings) {
  const s = settings || getEmailSettings();
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Santa Paciência</title>
<style>
  /* A app do Gmail (Android/iOS) reescreve cores de fundo quando o telemóvel
     está em modo escuro, ignorando os metas color-scheme acima — o castanho
     da marca fica rosa/salmão. [data-ogsc]/[data-ogsb] são os hooks que a
     própria Gmail app injeta nesses elementos, e servem exatamente para os
     conseguirmos repor com !important (única forma documentada de os travar). */
  [data-ogsc] .email-brand-bg, [data-ogsb] .email-brand-bg { background-color: ${BRAND_COLOR} !important; }
  [data-ogsc] .email-body-bg, [data-ogsb] .email-body-bg { background-color: #ffffff !important; }
  [data-ogsc] .email-footer-bg, [data-ogsb] .email-footer-bg { background-color: #f8f8f8 !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" class="email-body-bg" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <tr><td bgcolor="${BRAND_COLOR}" class="email-brand-bg" style="background:${BRAND_COLOR};padding:30px;text-align:center;">
        <img src="${s.logo_url || resolveLogoUrl(null)}"
             alt="${s.property_name || 'Logótipo'}" style="max-width:180px;height:auto;margin-bottom:10px;" />
        <p style="color:rgba(255,255,255,.6);margin:5px 0 0;font-size:13px;letter-spacing:1px;">ALOJAMENTO LOCAL</p>
      </td></tr>
      <tr><td class="email-body-bg" style="background:#fff;padding:35px 40px;">${content}</td></tr>
      ${buildSocialButtons(s)}
      <tr><td bgcolor="#f8f8f8" class="email-footer-bg" style="background:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;text-align:center;">
        <p style="color:#999;font-size:12px;margin:0;">
          ${s.property_name} · ${s.property_address}<br>
          Licença AL: ${s.license_number}<br>
          ${s.email_contact ? `<a href="mailto:${s.email_contact}" style="color:${ACCENT_COLOR};">${s.email_contact}</a>` : ''}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
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
    total: `€${Number(reservation.total_amount || 0).toFixed(2)}`,
    referencia: reservation.id || '',
    wifi_nome: accommodation.wifi_name || '—',
    wifi_password: accommodation.wifi_password || '—',
    codigo_porta: accommodation.door_code || '—',
    ...extra,
  };
}

const INHERITABLE_ACCOMMODATION_FIELDS = [
  'address', 'postal_code', 'city', 'region', 'country',
  'wifi_name', 'wifi_password', 'door_code', 'checkin_time', 'checkout_time',
  'social_facebook', 'social_instagram', 'social_website', 'logo_url',
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
    try {
      db.prepare(`
        INSERT OR IGNORE INTO organization_email_queue (id, organization_id, template_slug, reservation_id)
        VALUES (?, ?, ?, ?)
      `).run(crypto.randomUUID(), orgId, slug, reservation.id);
    } catch {}
    console.log(`📧 Email ${slug} → reserva ${reservation.id} adiado (fora da janela de envio)`);
    return { queued: true };
  }

  let vars_extra = extraVars || {};
  if (slug === 'pre_checkin' && !vars_extra.link_pre_checkin && reservation.precheckin_token) {
    const base = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');
    vars_extra = { ...vars_extra, link_pre_checkin: `${base}/pre-checkin/${reservation.precheckin_token}` };
  }

  const settings = getEmailSettings(accommodation, orgId);
  const vars = buildVars(guest, reservation, accommodation, settings, vars_extra);
  // A intenção de envio sobrevive a falhas de rede e reinícios.
  db.prepare(`INSERT OR IGNORE INTO organization_email_queue (id, organization_id, template_slug, reservation_id)
    VALUES (?, ?, ?, ?)`).run(crypto.randomUUID(), orgId, slug, reservation.id);
  const result = await sendMail(orgId, {
    to,
    subject: interpolate(template.subject, vars),
    html: baseTemplate(interpolate(template.body, escapeVars(vars)), settings),
    bcc: template.bcc || undefined,
  });
  if (result) db.prepare('DELETE FROM organization_email_queue WHERE organization_id=? AND template_slug=? AND reservation_id=?').run(orgId, slug, reservation.id);
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
  const content = `<h2 style="color:#27ae60;margin-top:0;">💶 Pagamento Confirmado</h2>
    <p style="color:#555;">Olá <strong>${escapeHtml(guest.name)}</strong>,</p>
    <p style="color:#555;">Confirmamos a receção do pagamento da sua reserva em <strong>${escapeHtml(accommodation.name || '')}</strong>.</p>
    <p style="color:#27ae60;font-weight:bold;font-size:20px;">€${Number(reservation.total_amount || 0).toFixed(2)}</p>`;
  return sendMail(orgId, {
    to: guest.email,
    subject: '💶 Pagamento Confirmado — Santa Paciência',
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
  const content = `<h2 style="color:${BRAND_COLOR};margin-top:0;">Pré check-in</h2>
    <p style="color:#555;">Olá <strong>${escapeHtml(guest.name || '')}</strong>,</p>
    <p style="color:#555;">A sua reserva em <strong>${escapeHtml(accommodation.name || '')}</strong> foi aprovada. Para prepararmos a chegada, pedimos que complete o pré check-in com a hora prevista de chegada e os dados legais dos hóspedes.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${preCheckinUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:8px;padding:13px 22px;font-family:sans-serif;font-weight:700;">Completar pré check-in</a>
    </p>
    <p style="color:#777;font-size:13px;">Referência da reserva: <strong>${reservation.id}</strong></p>`;
  return sendMail(orgId, {
    to: guest.email,
    subject: 'Pré check-in da sua reserva — Santa Paciência',
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

  const row = (label, value) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e8e0;color:#888;width:130px;">${label}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #f0e8e0;">${value}</td></tr>`;

  const content = `
    <h2 style="color:${BRAND_COLOR};margin-top:0;">Nova reserva recebida</h2>
    <table style="width:100%;border-collapse:collapse;font-size:15px;color:#444;">
      ${row('Referência',  `<strong>${escapeHtml(reservation.id)}</strong>`)}
      ${row('Hóspede',     `${escapeHtml(guest.name || '')} &lt;${escapeHtml(guest.email || '')}&gt;`)}
      ${row('Alojamento',  escapeHtml(accommodation.name || ''))}
      ${row('Check-in',    formatDate(reservation.check_in))}
      ${row('Check-out',   formatDate(reservation.check_out))}
      ${row('Hóspedes',    String(reservation.num_guests || 1))}
      <tr><td style="padding:8px 0;color:#888;">Total</td>
          <td style="padding:8px 0;font-weight:700;color:${BRAND_COLOR};">€${Number(reservation.total_amount || 0).toFixed(2)}</td></tr>
    </table>
    ${reservationUrl
      ? `<p style="text-align:center;margin:28px 0;">
           <a href="${reservationUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:8px;padding:13px 22px;font-family:sans-serif;font-weight:700;">Ver reserva no backoffice</a>
         </p>`
      : ''}
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
  interpolate,
  buildVars,
  getEmailSettings,
  formatDate,
  resolveAccommodationInheritance,
  findGuestEmailContext,
};
