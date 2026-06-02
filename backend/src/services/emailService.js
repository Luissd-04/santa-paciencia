const EMAIL_DISABLED = process.env.EMAIL_ENABLED === 'false';

let transporter = null;
if (!EMAIL_DISABLED) {
  try { transporter = require('../config/email'); } catch (e) {
    console.warn('⚠️ Email transporter não carregado:', e.message);
  }
}

const { isEmailAuthenticated, sendViaGmail, getEmailConnectionInfo } = require('../config/googleEmail');

async function sendMail(organizationId, { to, subject, html }) {
  if (EMAIL_DISABLED) return null;
  if (organizationId && isEmailAuthenticated(organizationId)) {
    const info = getEmailConnectionInfo(organizationId);
    const fromName = process.env.PROPERTY_NAME || 'Santa Paciência';
    const from = info.email ? `${fromName} <${info.email}>` : fromName;
    return sendViaGmail(organizationId, { to, subject, html, from });
  }
  if (!transporter) return null;
  return transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
}

const BRAND_COLOR = '#843424';
const ACCENT_COLOR = '#c9a84c';

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
      facebook:         accommodation?.social_facebook  || s.social_facebook  || '',
      instagram:        accommodation?.social_instagram || s.social_instagram || '',
      website:          accommodation?.social_website   || s.social_website   || '',
      property_name:    orgName || process.env.PROPERTY_NAME || 'Santa Paciência',
      property_address: s.property_address || process.env.PROPERTY_ADDRESS || '',
      license_number:   s.license_number   || process.env.LICENSE_NUMBER   || '',
      email_contact:    s.email_contact    || process.env.EMAIL_USER        || '',
    };
  } catch {
    return {
      checkin_time: '15:00', checkout_time: '11:00',
      facebook: '', instagram: '', website: '',
      property_name:    process.env.PROPERTY_NAME    || 'Santa Paciência',
      property_address: process.env.PROPERTY_ADDRESS || '',
      license_number:   process.env.LICENSE_NUMBER   || '',
      email_contact:    process.env.EMAIL_USER        || '',
    };
  }
}

// SVG icons as base64 data URIs for email client compatibility
const FB_ICON  = `<img src="https://cdn.simpleicons.org/facebook/ffffff" width="20" height="20" alt="f" style="vertical-align:middle;">`;
const IG_ICON  = `<img src="https://cdn.simpleicons.org/instagram/ffffff" width="20" height="20" alt="ig" style="vertical-align:middle;">`;
const WEB_ICON = `<img src="https://cdn.simpleicons.org/googlechrome/ffffff" width="20" height="20" alt="web" style="vertical-align:middle;">`;

function buildSocialButtons(settings) {
  const btns = [];
  if (settings.facebook)  btns.push(`<a href="${settings.facebook}"  style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:#1877f2;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">${FB_ICON} Facebook</a>`);
  if (settings.instagram) btns.push(`<a href="${settings.instagram}" style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:#e1306c;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">${IG_ICON} Instagram</a>`);
  if (settings.website)   btns.push(`<a href="${settings.website}"   style="display:inline-flex;align-items:center;gap:7px;margin:0 5px;padding:9px 18px;background:${BRAND_COLOR};color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;font-family:sans-serif;">${WEB_ICON} Website</a>`);
  if (!btns.length) return '';
  return `<tr><td style="background:${BRAND_COLOR};padding:20px 40px;border-top:1px solid rgba(255,255,255,.1);text-align:center;">
    <p style="color:rgba(255,255,255,.65);font-size:12px;margin:0 0 14px;letter-spacing:.5px;text-transform:uppercase;font-family:sans-serif;">Siga-nos nas redes sociais</p>
    <div>${btns.join('')}</div>
  </td></tr>`;
}

function baseTemplate(content, settings) {
  const s = settings || getEmailSettings();
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Santa Paciência</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <tr><td style="background:${BRAND_COLOR};padding:30px;text-align:center;">
        <img src="https://santapaciencia.pt/wp-content/uploads/2024/04/cropped-Logo-Transparente-Cinza-280x60-1.png"
             alt="Santa Paciência" style="max-width:180px;height:auto;margin-bottom:10px;" />
        <p style="color:rgba(255,255,255,.6);margin:5px 0 0;font-size:13px;letter-spacing:1px;">ALOJAMENTO LOCAL</p>
      </td></tr>
      <tr><td style="padding:35px 40px;">${content}</td></tr>
      ${buildSocialButtons(s)}
      <tr><td style="background:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;text-align:center;">
        <p style="color:#999;font-size:12px;margin:0;">
          ${s.property_name} · ${s.property_address}<br>
          Licença AL: ${s.license_number}<br>
          <a href="mailto:${s.email_contact}" style="color:${ACCENT_COLOR};">${s.email_contact}</a>
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

function buildVars(guest, reservation, accommodation, settings) {
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
  };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-PT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function sendTemplatedEmail(slug, guest, reservation, accommodation) {
  if (EMAIL_DISABLED) { console.log(`Email ${slug} ignorado (EMAIL_ENABLED=false)`); return null; }
  const { db } = require('../config/database');
  const orgId = reservation.organization_id || accommodation.organization_id;
  const template = orgId
    ? db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ? AND slug = ? AND active=1').get(orgId, slug)
    : db.prepare('SELECT * FROM email_templates WHERE slug=? AND active=1').get(slug);
  if (!template) { console.log(`Template ${slug} não encontrado ou inativo`); return null; }
  const settings = getEmailSettings(accommodation, orgId);
  const vars = buildVars(guest, reservation, accommodation, settings);
  const to = guest.email;
  if (!to) return null;
  return sendMail(orgId, {
    to,
    subject: interpolate(template.subject, vars),
    html: baseTemplate(interpolate(template.body, vars), settings),
  });
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
  const settings = getEmailSettings(null, orgId);
  const content = `<h2 style="color:#27ae60;margin-top:0;">💶 Pagamento Confirmado</h2>
    <p style="color:#555;">Olá <strong>${guest.name}</strong>,</p>
    <p style="color:#555;">Confirmamos a receção do pagamento da sua reserva em <strong>${accommodation.name || ''}</strong>.</p>
    <p style="color:#27ae60;font-weight:bold;font-size:20px;">€${Number(reservation.total_amount || 0).toFixed(2)}</p>`;
  return sendMail(orgId, {
    to: guest.email,
    subject: '💶 Pagamento Confirmado — Santa Paciência',
    html: baseTemplate(content, settings),
  });
}

async function sendPreCheckinEmail(guest, reservation, accommodation, preCheckinUrl) {
  if (EMAIL_DISABLED) return null;
  const orgId = reservation.organization_id || accommodation.organization_id;
  const settings = getEmailSettings(accommodation, orgId);
  const content = `<h2 style="color:${BRAND_COLOR};margin-top:0;">Pré check-in</h2>
    <p style="color:#555;">Olá <strong>${guest.name || ''}</strong>,</p>
    <p style="color:#555;">A sua reserva em <strong>${accommodation.name || ''}</strong> foi aprovada. Para prepararmos a chegada, pedimos que complete o pré check-in com a hora prevista de chegada e os dados legais dos hóspedes.</p>
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

module.exports = {
  sendMail,
  sendConfirmationEmail,
  sendCancellationEmail,
  sendPaymentConfirmationEmail,
  sendPreCheckinEmail,
  sendReservationRequestApprovedEmail,
  sendTemplatedEmail,
  baseTemplate,
  interpolate,
  buildVars,
  getEmailSettings,
  formatDate,
};
