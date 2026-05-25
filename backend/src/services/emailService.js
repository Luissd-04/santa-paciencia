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
  // If accommodation object provided, prefer its social links
  if (accommodation) {
    return {
      checkin_time:  accommodation.checkin_time  || '15:00',
      checkout_time: accommodation.checkout_time || '11:00',
      facebook:  accommodation.social_facebook  || '',
      instagram: accommodation.social_instagram || '',
      website:   accommodation.social_website   || '',
    };
  }
  try {
    const { db } = require('../config/database');
    const keys = ['checkin_time','checkout_time','social_facebook','social_instagram','social_website'];
    const orgId = organizationId || accommodation?.organization_id;
    const rows = orgId
      ? db.prepare(`SELECT key,value FROM organization_settings WHERE organization_id = ? AND key IN (${keys.map(() => '?').join(',')})`).all(orgId, ...keys)
      : db.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys);
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    return {
      checkin_time: s.checkin_time || '15:00',
      checkout_time: s.checkout_time || '11:00',
      facebook:  s.social_facebook  || '',
      instagram: s.social_instagram || '',
      website:   s.social_website   || '',
    };
  } catch { return { checkin_time: '15:00', checkout_time: '11:00', facebook:'', instagram:'', website:'' }; }
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
          ${process.env.PROPERTY_NAME || 'Santa Paciência'} · ${process.env.PROPERTY_ADDRESS || ''}<br>
          Licença AL: ${process.env.LICENSE_NUMBER || ''}<br>
          <a href="mailto:${process.env.EMAIL_USER || ''}" style="color:${ACCENT_COLOR};">${process.env.EMAIL_USER || ''}</a>
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

module.exports = {
  sendMail,
  sendConfirmationEmail,
  sendCancellationEmail,
  sendPaymentConfirmationEmail,
  sendTemplatedEmail,
  baseTemplate,
  interpolate,
  buildVars,
  getEmailSettings,
  formatDate,
};
