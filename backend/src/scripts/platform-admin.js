// Dono da instância na consola da plataforma: marca na base. O email também
// tem de estar em PLATFORM_ADMIN_EMAILS (as duas coisas são precisas).
require('dotenv').config();

const { db, initDatabase } = require('../config/database');
const { getUserByEmail, normalizeEmail } = require('../services/authService');

const [, , command, emailArg] = process.argv;
const usage = 'Uso: npm run platform-admin -- grant|revoke|list [email]';
if (!['grant', 'revoke', 'list'].includes(command) || (command !== 'list' && !emailArg)) {
  console.error(usage);
  process.exit(1);
}

initDatabase();
const allowed = new Set(String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
const envNote = email => allowed.has(email) ? 'está em PLATFORM_ADMIN_EMAILS' : 'FALTA em PLATFORM_ADMIN_EMAILS (sem isso não tem acesso)';

if (command === 'list') {
  const rows = db.prepare('SELECT email, active FROM users WHERE platform_admin = 1 ORDER BY email').all();
  if (!rows.length) console.log('Nenhum utilizador marcado como dono da instância.');
  for (const row of rows) console.log(`${row.email}${row.active ? '' : ' (inativo)'} — ${envNote(row.email)}`);
  process.exit(0);
}

const user = getUserByEmail(emailArg);
if (!user) {
  console.error(`Não existe utilizador com o email ${normalizeEmail(emailArg)}.`);
  process.exit(1);
}

if (command === 'grant') {
  db.prepare(`UPDATE users SET platform_admin = 1, updated_at = datetime('now') WHERE id = ?`).run(user.id);
  console.log(`Marcado como dono da instância: ${user.email} — ${envNote(user.email)}.`);
} else {
  // Revogar fecha também as consolas já desbloqueadas.
  db.transaction(() => {
    db.prepare(`UPDATE users SET platform_admin = 0, updated_at = datetime('now') WHERE id = ?`).run(user.id);
    db.prepare('UPDATE auth_sessions SET platform_unlocked_until = NULL WHERE user_id = ?').run(user.id);
  })();
  console.log(`Acesso à consola da plataforma revogado: ${user.email}.`);
  if (allowed.has(user.email)) console.log('Retira também o email de PLATFORM_ADMIN_EMAILS.');
}
