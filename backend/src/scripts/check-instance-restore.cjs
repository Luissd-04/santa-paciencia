// Ensaio de recuperação completa numa pasta temporária isolada:
// instância sintética → backup → verificações negativas → restauro para pasta
// nova → arranque da aplicação sobre a cópia restaurada.
// Nunca lê nem escreve a base, os uploads ou os tokens reais do projeto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const src = path.resolve(__dirname, '..');
const tool = path.join(__dirname, 'instance-backup.cjs');
const fixture = path.join(src, 'test-support/instance-fixture.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-instance-restore-'));
const dirs = Object.fromEntries(['live', 'backup', 'vault', 'restored', 'tampered'].map(name => [name, path.join(temp, name)]));
const logs = [];

function run(args, { cwd = src, env = {}, expectCode = 0 } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', env: { ...process.env, TOKEN_ENCRYPTION_KEY: '', TOKEN_ENCRYPTION_KEY_FILE: '', ...env },
  });
  logs.push(result.stdout, result.stderr);
  assert.equal(result.status, expectCode, `${path.basename(args[0])} ${args[1] || ''}: código ${result.status}\n${result.stderr}`);
  return result.stdout;
}
const json = text => JSON.parse(text.slice(text.indexOf('{')));

try {
  // 1. Instância «em uso» sintética: base, uploads, chave gerada, tokens legados.
  fs.mkdirSync(path.join(dirs.live, 'data'), { recursive: true });
  const expectedFile = path.join(temp, 'expected.json');
  run([fixture, 'seed', expectedFile], { cwd: dirs.live, env: { DB_PATH: path.join(dirs.live, 'data/santapaciencia.db') } });
  const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
  const liveKey = fs.readFileSync(path.join(dirs.live, 'data/token-encryption.key'));

  // 2. Backup: chave obrigatoriamente fora do diretório do backup.
  run([tool, 'backup', '--data', path.join(dirs.live, 'data'), '--out', path.join(temp, 'bad'), '--key-out', path.join(temp, 'bad/key')], { expectCode: 1 });
  const backupOut = json(run([tool, 'backup', '--data', path.join(dirs.live, 'data'), '--out', dirs.backup,
    '--key-out', path.join(dirs.vault, 'token-encryption.key'), '--tokens', path.join(dirs.live, 'tokens')]));
  assert.equal(backupOut.integrity, 'ok');
  assert.equal(backupOut.uploads.files, 2);
  assert.equal(backupOut.uploads.missing_references, 0);
  assert.deepEqual(backupOut.token_check, { total: 4, ok: 4, failed: 0 });
  assert.ok(!fs.existsSync(path.join(dirs.backup, 'token-encryption.key')), 'a chave não fica junto do backup');
  assert.deepEqual(fs.readFileSync(path.join(dirs.vault, 'token-encryption.key')), liveKey);
  run([tool, 'backup', '--data', path.join(dirs.live, 'data'), '--out', dirs.backup, '--key-out', path.join(temp, 'k2')], { expectCode: 1 }); // destino não vazio

  // 3. Verificações negativas: chave errada e ficheiro adulterado são detetados.
  const wrongKey = path.join(temp, 'wrong.key');
  fs.writeFileSync(wrongKey, 'ab'.repeat(32) + '\n', { mode: 0o600 });
  const wrong = json(run([tool, 'verify', '--backup', dirs.backup, '--key', wrongKey], { expectCode: 2 }));
  assert.ok(wrong.problems.some(problem => problem.includes('não é a deste backup')));
  assert.equal(wrong.tokens.failed, 4);
  fs.cpSync(dirs.backup, dirs.tampered, { recursive: true });
  fs.appendFileSync(path.join(dirs.tampered, 'uploads/restore-cover.png'), 'x');
  const tampered = json(run([tool, 'verify', '--backup', dirs.tampered, '--key', path.join(dirs.vault, 'token-encryption.key')], { expectCode: 2 }));
  assert.ok(tampered.problems.some(problem => problem.includes('ficheiro alterado')));
  run([tool, 'restore', '--backup', dirs.tampered, '--key', path.join(dirs.vault, 'token-encryption.key'), '--target', path.join(temp, 'never')], { expectCode: 1 });
  assert.ok(!fs.existsSync(path.join(temp, 'never')), 'backup adulterado não é restaurado');
  run([tool, 'restore', '--backup', dirs.backup, '--target', path.join(temp, 'nokey')], { expectCode: 1 });

  // 4. Restauro para pasta nova; restaurar por cima de dados existentes é recusado.
  run([tool, 'restore', '--backup', dirs.backup, '--key', path.join(dirs.vault, 'token-encryption.key'),
    '--target', path.join(dirs.restored, 'data'), '--tokens-target', path.join(dirs.restored, 'tokens')]);
  run([tool, 'restore', '--backup', dirs.backup, '--key', path.join(dirs.vault, 'token-encryption.key'), '--target', path.join(dirs.live, 'data')], { expectCode: 1 });

  // 5. A aplicação arranca sobre a cópia: login, dados, uploads, tokens, VAPID.
  const resultFile = path.join(temp, 'result.json');
  run([fixture, 'check', expectedFile, resultFile], { cwd: dirs.restored, env: { DB_PATH: path.join(dirs.restored, 'data/santapaciencia.db') } });
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  assert.equal(result.integrity, 'ok');
  assert.deepEqual(result.summary, expected.summary);
  assert.equal(result.login, 200);
  assert.equal(result.organization, true);
  assert.equal(result.listed, expected.summary.reservations.n);
  assert.deepEqual(result.uploads, Object.fromEntries(Object.keys(expected.uploads).map(url => [url, true])));
  assert.equal(result.anonymous_receipt, 401);
  assert.deepEqual(result.tokens, { google_calendar_connections: true, google_email_connections: true, google_tasks_connections: true, legacy: true });
  assert.equal(result.vapid, true);
  assert.equal(result.previous_session, 200);

  // 6. Nada de dados pessoais, tokens ou chaves nos registos e no manifesto.
  const exposed = [...logs, fs.readFileSync(path.join(dirs.backup, 'manifest.json'), 'utf8')].join('\n');
  for (const secret of [...expected.secrets, liveKey.toString().trim(), ...expected.emails, expected.password]) {
    assert.ok(!exposed.includes(secret), 'um valor sensível apareceu nos registos ou no manifesto');
  }
  console.log(JSON.stringify({
    backup: { integrity: backupOut.integrity, counts: backupOut.database.counts, uploads: backupOut.uploads.files, token_check: backupOut.token_check, key_source: backupOut.key.source },
    negative: { wrong_key_detected: true, tampered_upload_detected: true, tampered_restore_refused: true, restore_without_key_refused: true, overwrite_refused: true },
    restored: { login: result.login, reservations: result.summary.reservations, payments: result.summary.payments, uploads_identical: true,
      receipt_private: result.anonymous_receipt === 401, google_tokens_decrypt: 4, vapid_preserved: true, previous_sessions_valid: result.previous_session === 200 },
    leaks: 'nenhum valor sensível nos registos ou no manifesto',
  }, null, 2));
  console.log('Ensaio de restauro completo: OK (pasta temporária isolada, dados sintéticos).');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
