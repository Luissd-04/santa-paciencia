require('dotenv').config();

const { initDatabase } = require('../config/database');
const { createUser, getUserByEmail, normalizeEmail } = require('../services/authService');

const [, , nameArg, emailArg, passwordArg] = process.argv;

if (!nameArg || !emailArg || !passwordArg) {
  console.error('Uso: node scripts/create-admin.js "Nome" "email@dominio.com" "password"');
  process.exit(1);
}

initDatabase();

const email = normalizeEmail(emailArg);
if (getUserByEmail(email)) {
  console.error(`Já existe um utilizador com o email ${email}.`);
  process.exit(1);
}

const user = createUser({
  name: nameArg,
  email,
  password: passwordArg,
  role: 'admin',
});

console.log(`Admin criado com sucesso: ${user.email}`);
