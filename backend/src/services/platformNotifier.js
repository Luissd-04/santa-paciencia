// Avisos aos admins da plataforma (dono da instância): push para os
// dispositivos de cada admin, em cada organização onde é membro (as
// subscrições são por organização), e um email pela primeira dessas
// organizações com Gmail. Usado pelo Suporte (supportService.notifyPlatform) e
// pelos alertas da instância (opsAlerts). Uma falha num passo nunca impede os
// outros: vai para `onError(step, err)`.
const { db } = require('../config/database');

// Só quem tem a marca e o email em PLATFORM_ADMIN_EMAILS (platformAccess).
function admins() {
  const access = require('./platformAccess');
  return db.prepare('SELECT id, email FROM users WHERE platform_admin = 1 AND active = 1').all().filter(u => access.isPlatformAdmin(u));
}

const defaultError = (step, err) => console.error(JSON.stringify({ level: 'warn', event: 'platform_notify_failed', step, error: err?.message || String(err) }));

// `push`: payload pronto (staffNotifier.pushPayload). `email(orgId)`: devolve
// { subject, html }, composto com as definições da organização que o envia.
// Devolve { admins, pushed, emailed }.
async function notifyAdmins({ push = null, email = null, onError = defaultError }) {
  const attempt = async (step, fn) => { try { return await fn(); } catch (err) { onError(step, err); return undefined; } };
  const list = await attempt('admins', admins) || [];
  let pushed = 0, emailed = 0;
  for (const admin of list) {
    const orgIds = await attempt('memberships', () => db.prepare('SELECT organization_id FROM memberships WHERE user_id = ? AND active = 1 ORDER BY rowid')
      .all(admin.id).map(r => r.organization_id)) || [];
    if (push) {
      for (const orgId of orgIds) {
        const result = await attempt('push_platform', () => require('./pushService').sendToOrganization(orgId, push, { userIds: [admin.id] }));
        pushed += result?.sent || 0;
      }
    }
    if (email && admin.email) {
      for (const orgId of orgIds) {
        const sent = await attempt('email_platform', () => require('./emailService').sendMail(orgId, { to: admin.email, ...email(orgId) }));
        if (sent) { emailed++; break; }
      }
    }
  }
  return { admins: list.length, pushed, emailed };
}

module.exports = { admins, notifyAdmins };
