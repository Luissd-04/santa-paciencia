#!/usr/bin/env node
// Backup e restauro da instância completa: base SQLite (contas, sessões,
// ligações Google, chaves VAPID, todas as organizações), uploads, tokens
// Google legados e a chave que desencripta os tokens.
//
// O ZIP de «Exportar dados» é por organização e não substitui isto.
// Nada é escrito em stdout além de contagens, caminhos e impressões digitais:
// sem dados pessoais, tokens ou chaves.
//
//   backup  --data <dir> --out <dir> --key-out <ficheiro> [--tokens <dir>]
//   verify  --backup <dir> [--key <ficheiro>]
//   restore --backup <dir> --key <ficheiro> --target <dir novo> [--tokens-target <dir novo>]
//
// O restauro nunca escreve num diretório existente e não vazio: restaurar por
// cima da instância em uso é uma decisão manual, depois de validar a cópia.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const FORMAT = 1;
const DB_NAME = 'santapaciencia.db';
const KEY_NAME = 'token-encryption.key';
// Tabelas com tokens Google encriptados e o contexto usado na encriptação.
const TOKEN_TABLES = [
  ['google_calendar_connections', row => `calendar:${row.organization_id}:${row.user_id}`],
  ['google_email_connections', row => `email:${row.organization_id}`],
  ['google_tasks_connections', row => `tasks:${row.organization_id}`],
];
// Contagens no manifesto (verificação depois do restauro). Só números.
const COUNTED = ['organizations', 'users', 'memberships', 'auth_sessions', 'accommodations', 'guests', 'reservations',
  'reservation_payments', 'vouchers', 'voucher_redemptions', 'expenses', 'stripe_payment_attempts', 'organization_email_queue',
  'google_calendar_connections', 'google_email_connections', 'google_tasks_connections', 'push_subscriptions', 'schema_migrations'];

function fail(message) { const error = new Error(message); error.expected = true; throw error; }
function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(argv[i]);
  }
  return out;
}
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const fileHash = file => sha256(fs.readFileSync(file));
function readKey(file) {
  const value = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) fail('Chave inválida: são necessários 64 caracteres hexadecimais.');
  return Buffer.from(value, 'hex');
}
// Impressão digital da chave (não permite reconstruí-la): confirma que a chave
// guardada à parte é a deste backup.
const keyFingerprint = key => sha256(Buffer.concat([Buffer.from('santa-paciencia-token-key:'), key])).slice(0, 16);

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`Ligação simbólica recusada: ${path.relative(base, full)}`);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile() && entry.name !== '.DS_Store') out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}
function copyTree(files, from, to) {
  const hashes = {};
  for (const relative of files) {
    const target = path.join(to, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(from, relative), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
    hashes[relative] = fileHash(target);
  }
  return hashes;
}
function assertNewDirectory(dir, label) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) fail(`${label} já existe e não está vazio: ${dir}. Escolha um diretório novo.`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function counts(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  return Object.fromEntries(COUNTED.filter(name => tables.has(name)).map(name => [name, db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));
}
// Referências a uploads guardadas na base (capas, galerias, logótipos, talões).
function referencedUploads(db) {
  const urls = new Set();
  const add = value => { if (typeof value === 'string' && /^\/uploads\/[\w./-]+$/.test(value) && !value.includes('..')) urls.add(value.slice('/uploads/'.length)); };
  for (const row of db.prepare('SELECT cover_image, logo_url, images FROM accommodations').all()) {
    add(row.cover_image); add(row.logo_url);
    let images = {};
    try { images = JSON.parse(row.images || '{}'); } catch { /* ignorar */ }
    for (const [key, list] of Object.entries(images || {})) if (key !== '_sections' && Array.isArray(list)) list.forEach(add);
  }
  for (const row of db.prepare('SELECT receipt_image FROM expenses').all()) add(row.receipt_image);
  return [...urls].sort();
}
function decryptOk(key, value, context) {
  try {
    const envelope = JSON.parse(value);
    if (envelope.protected !== 1) return false;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    return true;
  } catch { return false; }
}
function tokenCheck(db, key, legacyFile) {
  const result = { total: 0, ok: 0, failed: 0 };
  for (const [table, context] of TOKEN_TABLES) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    for (const row of db.prepare(`SELECT * FROM ${table} WHERE tokens IS NOT NULL AND tokens != ''`).all()) {
      result.total++;
      decryptOk(key, row.tokens, context(row)) ? result.ok++ : result.failed++;
    }
  }
  if (legacyFile && fs.existsSync(legacyFile)) {
    result.total++;
    decryptOk(key, fs.readFileSync(legacyFile, 'utf8'), 'calendar:legacy') ? result.ok++ : result.failed++;
  }
  return result;
}

async function backup(options) {
  const data = path.resolve(options.data || fail('Indique --data (diretório com a base e os uploads).'));
  const out = path.resolve(options.out || fail('Indique --out (diretório novo para o backup).'));
  const source = path.join(data, DB_NAME);
  if (!fs.existsSync(source)) fail(`Base de dados não encontrada: ${source}`);
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  const keyFile = process.env.TOKEN_ENCRYPTION_KEY_FILE || path.join(data, KEY_NAME);
  if (!envKey && !fs.existsSync(keyFile)) fail(`Chave dos tokens não encontrada em ${keyFile}.`);
  if (!envKey && !options['key-out']) fail('Indique --key-out: a chave é guardada à parte do backup (ex.: cofre ou suporte separado).');
  assertNewDirectory(out, 'O destino do backup');

  // API de backup do SQLite: cópia consistente mesmo com a aplicação a escrever (WAL).
  const live = new Database(source, { readonly: true, fileMustExist: true });
  const dbCopy = path.join(out, DB_NAME);
  try { await live.backup(dbCopy); } finally { live.close(); }
  fs.chmodSync(dbCopy, 0o600);
  const copy = new Database(dbCopy, { readonly: true });
  const integrity = copy.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') { copy.close(); fail('A cópia da base falhou a verificação de integridade.'); }
  const missing = referencedUploads(copy).filter(relative => !fs.existsSync(path.join(data, 'uploads', relative)));

  const uploads = copyTree(walk(path.join(data, 'uploads')), path.join(data, 'uploads'), path.join(out, 'uploads'));
  const tokensDir = options.tokens ? path.resolve(options.tokens) : null;
  const legacy = tokensDir ? copyTree(walk(tokensDir), tokensDir, path.join(out, 'tokens')) : {};

  let key;
  if (envKey) key = Buffer.from(envKey.trim(), 'hex');
  else {
    key = readKey(keyFile);
    const keyOut = path.resolve(options['key-out']);
    if (keyOut.startsWith(out + path.sep)) fail('--key-out tem de ficar fora do diretório do backup.');
    fs.mkdirSync(path.dirname(keyOut), { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyOut, key.toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
  }
  const tokens = tokenCheck(copy, key, tokensDir ? path.join(out, 'tokens', 'google_token.json') : null);
  const manifest = {
    format: FORMAT, created_at: new Date().toISOString(), integrity,
    database: { file: DB_NAME, sha256: fileHash(dbCopy), counts: counts(copy),
      migrations: copy.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map(row => row.id) },
    uploads: { files: Object.keys(uploads).length, sha256: uploads, missing_references: missing.length },
    tokens_dir: { files: Object.keys(legacy).length, sha256: legacy },
    key: { source: envKey ? 'environment' : 'file', fingerprint: keyFingerprint(key) },
    token_check: tokens,
  };
  copy.close();
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return manifest;
}

function verify(options) {
  const dir = path.resolve(options.backup || fail('Indique --backup.'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.format !== FORMAT) fail('Formato de backup desconhecido.');
  const problems = [];
  if (fileHash(path.join(dir, DB_NAME)) !== manifest.database.sha256) problems.push('base de dados alterada ou corrompida');
  for (const [section, folder] of [['uploads', 'uploads'], ['tokens_dir', 'tokens']]) {
    const expected = manifest[section].sha256;
    const actual = walk(path.join(dir, folder));
    for (const relative of Object.keys(expected)) {
      if (!actual.includes(relative)) problems.push(`${folder}: ficheiro em falta (${relative})`);
      else if (fileHash(path.join(dir, folder, relative)) !== expected[relative]) problems.push(`${folder}: ficheiro alterado (${relative})`);
    }
    for (const relative of actual) if (!expected[relative]) problems.push(`${folder}: ficheiro inesperado (${relative})`);
  }
  const db = new Database(path.join(dir, DB_NAME), { readonly: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') problems.push('integrity_check falhou');
    const missing = referencedUploads(db).filter(relative => !manifest.uploads.sha256[relative]);
    if (missing.length) problems.push(`${missing.length} upload(s) referenciado(s) sem ficheiro`);
    let tokens = null;
    if (options.key) {
      const key = readKey(options.key);
      if (keyFingerprint(key) !== manifest.key.fingerprint) problems.push('a chave indicada não é a deste backup');
      tokens = tokenCheck(db, key, path.join(dir, 'tokens', 'google_token.json'));
      if (tokens.failed) problems.push(`${tokens.failed} credencial(is) Google não desencriptam com esta chave`);
    }
    return { ok: problems.length === 0, problems, counts: counts(db), tokens };
  } finally { db.close(); }
}

function restore(options) {
  const dir = path.resolve(options.backup || fail('Indique --backup.'));
  const target = path.resolve(options.target || fail('Indique --target (diretório novo).'));
  if (!options.key) fail('Indique --key: sem a chave as ligações Google restauradas não funcionam.');
  const check = verify({ backup: dir, key: options.key });
  if (!check.ok) fail(`Backup recusado: ${check.problems.join('; ')}`);
  assertNewDirectory(target, 'O destino do restauro');
  const tokensTarget = options['tokens-target'] ? path.resolve(options['tokens-target']) : null;
  if (tokensTarget) assertNewDirectory(tokensTarget, 'O destino dos tokens legados');
  fs.copyFileSync(path.join(dir, DB_NAME), path.join(target, DB_NAME), fs.constants.COPYFILE_EXCL);
  fs.chmodSync(path.join(target, DB_NAME), 0o600);
  copyTree(walk(path.join(dir, 'uploads')), path.join(dir, 'uploads'), path.join(target, 'uploads'));
  if (tokensTarget) copyTree(walk(path.join(dir, 'tokens')), path.join(dir, 'tokens'), tokensTarget);
  fs.writeFileSync(path.join(target, KEY_NAME), readKey(options.key).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
  return { target, counts: check.counts, tokens: check.tokens };
}

async function main() {
  const options = args(process.argv.slice(2));
  const command = options._[0];
  let result;
  if (command === 'backup') result = await backup(options);
  else if (command === 'verify') result = verify(options);
  else if (command === 'restore') result = restore(options);
  else fail('Uso: instance-backup.cjs backup|verify|restore (ver o cabeçalho do ficheiro).');
  // Resumo sem hashes por ficheiro (os nomes dos uploads são aleatórios, mas
  // não são necessários no terminal).
  const summary = JSON.parse(JSON.stringify(result));
  if (summary.uploads) summary.uploads = { files: summary.uploads.files, missing_references: summary.uploads.missing_references };
  if (summary.tokens_dir) summary.tokens_dir = { files: summary.tokens_dir.files };
  console.log(JSON.stringify(summary, null, 2));
  if (command === 'verify' && !result.ok) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => { console.error(error.expected ? error.message : error); process.exitCode = 1; });
}
module.exports = { backup, verify, restore, keyFingerprint };
