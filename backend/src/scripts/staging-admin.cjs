// Corre apenas dentro do contentor dedicado de testes. Nunca altera contas existentes.
const { randomBytes } = require('node:crypto');
const { isStaging, assertStagingEnvironment } = require('../services/stagingPolicy');
if (!isStaging() || process.env.DB_PATH !== '/app/data/staging.db') {
  console.error('Este comando só funciona no contentor de staging e na base dedicada.');
  process.exit(1);
}
assertStagingEnvironment();
const email = 'admin@testes.invalid';
const allowed = String(process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase());
if (!allowed.includes(email)) { console.error('Inclua admin@testes.invalid em PLATFORM_ADMIN_EMAILS no .env.staging.'); process.exit(1); }
const { db, initDatabase } = require('../config/database');
initDatabase();
const auth = require('../services/authService');
const orgs = require('../services/orgService');
if (auth.getUserByEmail(email)) {
  console.log('A conta de testes já existe. A palavra-passe foi conservada.');
  db.close();
  process.exit(0);
}
const password = randomBytes(18).toString('base64url') + 'Aa1!';
db.transaction(() => {
  const user = auth.createUser({ name: 'Administração — TESTES', email, password });
  db.prepare("UPDATE users SET platform_admin=1,platform_role='admin',platform_roles='admin' WHERE id=?").run(user.id);
  const org = orgs.createOrganization('Estabelecimento de TESTES');
  orgs.createMembership({ organizationId: org.id, userId: user.id, role: 'owner' });
})();
console.log('Conta criada apenas no ambiente de testes. Guarde a palavra-passe: só é mostrada nesta execução.');
console.log(`Email: ${email}`);
console.log(`Palavra-passe: ${password}`);
db.close();
