// Emails de conta: todos pelo mesmo envio e com o mesmo desenho.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-account-mail-'));
const originalCwd = process.cwd();
process.chdir(temp);
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { db, initDatabase } = require('../config/database');
initDatabase();
const sent = [];
require('../services/emailService').sendMail = async (org, message) => { sent.push({ org, ...message }); return { id: 'm1' }; };
const mail = require('../services/accountEmails');
after(() => { db.close(); process.chdir(originalCwd); fs.rmSync(temp, { recursive: true, force: true }); });

test('cada email de conta sai pela organização certa, com o link e sem HTML do utilizador', async () => {
  db.exec(`INSERT INTO organizations(id,name,slug) VALUES ('org-1','Um','um'), ('org-2','Dois','dois');
    INSERT INTO users(id,name,email,password_hash) VALUES ('u1','<b>Ana</b> Silva','ana@example.invalid','x');
    INSERT INTO memberships(id,organization_id,user_id,role) VALUES ('m1','org-2','u1','owner');
    INSERT INTO google_email_connections(organization_id,email,tokens) VALUES ('org-2','mail@example.invalid','{}');`);
  const user = db.prepare("SELECT * FROM users WHERE id='u1'").get();
  await mail.sendPasswordReset(user, { to: 'ana@example.invalid', url: 'https://app.example.invalid/?reset=abc' });
  await mail.sendEmailChangeConfirmation('org-1', { to: 'novo@example.invalid', url: 'https://app.example.invalid/auth/confirm-email?token=t' });
  await mail.sendEmailChangedNotice('org-1', { to: 'antigo@example.invalid' });
  await mail.sendTeamInvitation('org-1', { to: 'x@example.invalid', organizationName: 'Um', role: '<script>', url: 'https://app.example.invalid/convite/abc' });
  await mail.sendGmailTest('org-1', { to: 'mail@example.invalid' });

  assert.deepEqual(sent.map(m => [m.org, m.subject]), [
    ['org-2', 'Recuperar palavra-passe — Santa Paciência'],
    ['org-1', 'Confirmar alteração de email'],
    ['org-1', 'Email de acesso alterado'],
    ['org-1', 'Convite para a equipa Um — Santa Paciência'],
    ['org-1', 'Teste de email - Santa Paciência'],
  ]);
  assert.match(sent[0].html, /\?reset=abc/);
  assert.match(sent[0].html, /Olá, &lt;b&gt;Ana&lt;\/b&gt;\./);
  assert.match(sent[1].html, /confirm-email\?token=t/);
  assert.match(sent[3].html, /convite\/abc/);
  assert.doesNotMatch(sent[3].html, /<script>/);
});

test('sem Gmail ligado em nenhuma organização, a recuperação não é enviada', async () => {
  db.exec("DELETE FROM google_email_connections");
  await assert.rejects(mail.sendPasswordReset(db.prepare("SELECT * FROM users WHERE id='u1'").get(), { to: 'ana@example.invalid', url: 'https://x.invalid' }), /Sem remetente/);
});
