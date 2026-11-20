// Dono da instância na consola da plataforma: marca na base. O email também
// tem de estar em PLATFORM_ADMIN_EMAILS (as duas coisas são precisas).
require('dotenv').config();

const { db, initDatabase } = require('../config/database');
const { getUserByEmail, normalizeEmail } = require('../services/authService');
const { cleanRoles, setPlatformRoles, PLATFORM_ROLES } = require('../services/platformAccess');

const [, , command, emailArg, roleArg = 'admin'] = process.argv;
// Cargos separados por vírgulas, por exemplo: admin,marketing ou marketing,support.
const usage = `Uso: npm run platform-admin -- grant|revoke|list [email] [cargos: ${Object.keys(PLATFORM_ROLES).join(',')}]`;
if (!['grant', 'revoke', 'list'].includes(command) || (command !== 'list' && !emailArg)) {
  console.error(usage);
  process.exit(1);
}

const roles = cleanRoles(roleArg);
if (!roles.length || roles.length !== String(roleArg).split(',').filter(Boolean).length) {
  console.error(`Cargos inválidos. Use um ou mais de: ${Object.keys(PLATFORM_ROLES).join(', ')} (separados por vírgulas).`);
  process.exit(1);
}
initDatabase();
const allowed = new Set(String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
const envNote = email => allowed.has(email) ? 'está em PLATFORM_ADMIN_EMAILS' : 'FALTA em PLATFORM_ADMIN_EMAILS (sem isso não tem acesso)';

if (command === 'list') {
  const rows = db.prepare('SELECT id, email, active, platform_role, platform_roles FROM users WHERE platform_admin = 1 ORDER BY email').all();
  if (!rows.length) console.log('Nenhum utilizador marcado como dono da instância.');
  for (const row of rows) {
    const list = cleanRoles(row.platform_roles ?? row.platform_role ?? 'admin').join(', ') || 'sem cargos';
    console.log(`${row.email} (${list})${row.active ? '' : ' (inativo)'} — ${envNote(row.email)}`);
  }
  process.exit(0);
}

const user = getUserByEmail(emailArg);
if (!user) {
  console.error(`Não existe utilizador com o email ${normalizeEmail(emailArg)}.`);
  process.exit(1);
}

if (command === 'grant') {
  db.prepare(`UPDATE users SET platform_admin = 1, updated_at = datetime('now') WHERE id = ?`).run(user.id);
  setPlatformRoles(user.id, roles);
  console.log(`Acesso à consola: ${user.email} (${roles.join(', ')}) — ${envNote(user.email)}.`);
} else {
  // Revogar fecha também as consolas já desbloqueadas.
  db.transaction(() => {
    db.prepare(`UPDATE users SET platform_admin = 0, updated_at = datetime('now') WHERE id = ?`).run(user.id);
    db.prepare('UPDATE auth_sessions SET platform_unlocked_until = NULL WHERE user_id = ?').run(user.id);
  })();
  console.log(`Acesso à consola da plataforma revogado: ${user.email}.`);
  if (allowed.has(user.email)) console.log('Retira também o email de PLATFORM_ADMIN_EMAILS.');
}
