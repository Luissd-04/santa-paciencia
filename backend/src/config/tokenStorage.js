const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
let cachedKey;

function getKey() {
  if (cachedKey) return cachedKey;
  let value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value && process.env.DB_PATH === ':memory:') return (cachedKey = crypto.randomBytes(32));
  if (!value) {
    const databasePath = process.env.DB_PATH || path.join(__dirname, '../data/santapaciencia.db');
    const keyPath = process.env.TOKEN_ENCRYPTION_KEY_FILE || path.join(path.dirname(databasePath), 'token-encryption.key');
    if (!fs.existsSync(keyPath)) {
      // Publica o ficheiro completo de forma atómica, inclusive com dois processos.
      const temporary = keyPath + '.' + crypto.randomUUID() + '.tmp';
      fs.writeFileSync(temporary, crypto.randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
      try { fs.linkSync(temporary, keyPath); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { fs.unlinkSync(temporary); }
    }
    value = fs.readFileSync(keyPath, 'utf8').trim();
  }
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Chave de proteção das integrações inválida: são necessários 64 caracteres hexadecimais.');
  return (cachedKey = Buffer.from(value, 'hex'));
}

function encodeTokens(tokens, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return JSON.stringify({ protected: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
}

function decodeTokens(value, context) {
  try {
    const envelope = JSON.parse(value);
    if (envelope.protected !== 1) throw new Error('Unprotected credential');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Não foi possível abrir as credenciais Google. Verifica a chave de proteção das integrações.');
  }
}

function protectStoredTokens(db) {
  db.transaction(() => {
    for (const [table, provider, perUser] of [
      ['google_calendar_connections', 'calendar', true],
      ['google_email_connections', 'email', false],
      ['google_tasks_connections', 'tasks', false],
    ]) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        if (!row.tokens) continue;
        const context = `${provider}:${row.organization_id}${perUser ? ':' + row.user_id : ''}`;
        const parsed = JSON.parse(row.tokens);
        if (parsed.protected === 1) { decodeTokens(row.tokens, context); continue; }
        db.prepare(`UPDATE ${table} SET tokens=? WHERE organization_id=?${perUser ? ' AND user_id=?' : ''}`)
          .run(encodeTokens(parsed, context), row.organization_id, ...(perUser ? [row.user_id] : []));
      }
    }
  }).immediate();
}

module.exports = { encodeTokens, decodeTokens, protectStoredTokens };
