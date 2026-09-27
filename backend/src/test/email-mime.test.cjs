const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-email-mime-')));
process.env.DB_PATH = ':memory:';
delete process.env.PUBLIC_APP_URL;
delete process.env.FRONTEND_PUBLIC_URL;
const { db, initDatabase } = require('../config/database');
initDatabase();
const { UPLOADS_DIR } = require('../services/mediaStorage');
const { buildEmailMimeBody } = require('../services/emailMime');
const { baseTemplate } = require('../services/emailService');
const googleEmail = require('../config/googleEmail');
const { OAuth2Client } = require('google-auth-library');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=', 'base64');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.writeFileSync(path.join(UPLOADS_DIR, 'logo_test.png'), png);
db.exec(`INSERT INTO organizations (id,name,slug) VALUES ('mime-org','Marca','mime-org'),('mime-other','Outra','mime-other');
  INSERT INTO accommodations (id,organization_id,name,type,price_per_night,max_guests,logo_url)
    VALUES ('mime-house','mime-org','Casa','alojamento',100,2,'/uploads/logo_test.png');`);

function parseParts(mime) {
  const boundary = mime.match(/boundary="([^"]+)"/)[1];
  return mime.split(`--${boundary}`).slice(1, -1).map(part => {
    const [headers, ...body] = part.trim().split('\r\n\r\n');
    return { headers, data: Buffer.from(body.join('\r\n\r\n'), 'base64') };
  });
}

test('logótipo local segue uma só vez por CID, com os bytes originais e HTML intacto', async () => {
  const html = '<p>Olá Paciência &amp; Rui</p><img src="http://localhost:3001/uploads/logo_test.png" width="220" />'
    + '<img src="/uploads/logo_test.png" />';
  const mime = await buildEmailMimeBody('mime-org', html);
  const parts = parseParts(mime);
  assert.equal(parts.length, 2);
  const cid = parts[1].headers.match(/Content-ID: <([^>]+)>/)[1];
  assert.match(parts[1].headers, /Content-Disposition: inline/);
  assert.match(parts[1].headers, /Content-Type: image\/png/);
  assert.deepEqual(parts[1].data, png);
  assert.equal(parts[0].data.toString(), html.replaceAll('http://localhost:3001/uploads/logo_test.png', `cid:${cid}`).replaceAll('/uploads/logo_test.png', `cid:${cid}`));
});

test('não incorpora uploads de outra organização, caminhos livres ou imagens remotas', async () => {
  const html = '<img src="http://localhost:3001/uploads/logo_test.png" />'
    + '<img src="file:///etc/passwd" /><img src="https://externo.invalid/uploads/logo_test.png" />';
  for (const org of ['mime-other', null]) {
    const mime = await buildEmailMimeBody(org, html);
    assert.doesNotMatch(mime, /multipart\/related|Content-ID:/);
    assert.equal(Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString(), html);
  }
  const external = await buildEmailMimeBody('mime-org', '<img src="https://externo.invalid/uploads/logo_test.png" />');
  assert.doesNotMatch(external, /multipart\/related/);
});

test('logótipo num domínio público configurado também segue incorporado', async () => {
  process.env.PUBLIC_APP_URL = 'https://app.example.invalid/';
  try {
    const parts = parseParts(await buildEmailMimeBody('mime-org', '<img src="https://app.example.invalid/uploads/logo_test.png" />'));
    assert.deepEqual(parts[1].data, png);
  } finally { delete process.env.PUBLIC_APP_URL; }
});

test('Gmail recebe MIME completo com o logótipo, mantendo assunto, Bcc e resposta', async () => {
  googleEmail.saveEmailTokens('mime-org', { access_token: 'token-ficticio' }, 'origem@example.invalid');
  const original = OAuth2Client.prototype.request;
  let sent;
  OAuth2Client.prototype.request = async function (request) {
    if (request.method === 'POST') {
      sent = request.data;
      return { data: { id: 'message-test', threadId: 'thread-test' } };
    }
    return { data: { payload: { headers: [{ name: 'Message-ID', value: '<real@example.invalid>' }] } } };
  };
  try {
    const html = baseTemplate('<p>Olá Rui</p>', { property_name: 'Marca', logo_url: 'http://localhost:3001/uploads/logo_test.png' });
    const result = await googleEmail.sendViaGmail('mime-org', {
      to: 'destino@example.invalid', subject: 'Pré-visualização', html,
      bcc: 'copia@example.invalid', threadId: 'thread-test', inReplyTo: '<anterior@example.invalid>',
    });
    assert.equal(sent.threadId, 'thread-test');
    const raw = Buffer.from(sent.raw, 'base64url').toString();
    assert.match(raw, /Bcc: copia@example.invalid/);
    assert.match(raw, /In-Reply-To: <anterior@example.invalid>/);
    assert.match(raw, /References: <anterior@example.invalid>/);
    assert.ok(raw.includes(Buffer.from('Pré-visualização').toString('base64')));
    const parts = parseParts(raw);
    assert.deepEqual(parts[1].data, png);
    assert.match(parts[0].data.toString(), /<img src="cid:logo-/);
    assert.doesNotMatch(parts[0].data.toString(), /localhost:3001/);
    assert.equal(result.messageIdHeader, '<real@example.invalid>');
  } finally { OAuth2Client.prototype.request = original; }
});
