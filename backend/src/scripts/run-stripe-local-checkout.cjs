const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

require('dotenv').config({ quiet: true });

const projectRoot = path.resolve(__dirname, '../../..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'santa-paciencia-stripe-'));
const testPort = 3011;
const organizationId = String(process.env.STRIPE_ORGANIZATION_ID || '').trim();
const stripeKey = String(process.env.STRIPE_SECRET_KEY || '').trim();

if (!/^(sk|rk)_test_/.test(stripeKey)) throw new Error('É necessária uma chave Stripe de teste.');
if (!organizationId) throw new Error('STRIPE_ORGANIZATION_ID está em falta.');

const eventTypes = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'payment_intent.succeeded', 'payment_intent.payment_failed',
  'payment_intent.canceled', 'payment_intent.processing',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
].join(',');

const listener = spawn('stripe', [
  'listen', '--events-from', '@self', '--events', eventTypes,
  '--forward-to', `http://127.0.0.1:${testPort}/api/stripe/webhook`,
], {
  env: { ...process.env, STRIPE_API_KEY: stripeKey },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let server;
let db;
let started = false;
let output = '';
let logBuffer = '';

function scrub(value) {
  return String(value).replace(/whsec_[A-Za-z0-9_]+/g, '[segredo ocultado]')
    .replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+/g, '[chave ocultada]');
}

async function startApp(webhookSecret) {
  if (started) return;
  started = true;
  Object.assign(process.env, {
    DB_PATH: path.join(tempDir, 'stripe-test.db'),
    NODE_ENV: 'development',
    EMAIL_ENABLED: 'false',
    FRONTEND_PATH: path.join(projectRoot, 'frontend'),
    PUBLIC_APP_URL: `http://localhost:${testPort}`,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
  });

  const app = require('../app');
  db = require('../config/database').db;
  const token = crypto.randomBytes(32).toString('hex');
  const checkIn = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 62 * 86400000).toISOString().slice(0, 10);
  db.transaction(() => {
    db.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)')
      .run(organizationId, 'Santa Paciência — Teste Stripe', 'stripe-local-test');
    db.prepare('INSERT INTO guests(id,organization_id,name,email) VALUES(?,?,?,?)')
      .run('stripe-test-guest', organizationId, 'Hóspede de Teste', 'teste@example.com');
    db.prepare(`INSERT INTO accommodations
      (id,organization_id,name,type,price_per_night,max_guests,public_slug)
      VALUES(?,?,?,?,?,?,?)`).run('stripe-test-unit', organizationId, 'Casa de Teste', 'alojamento', 6.17, 2, 'stripe-local-test');
    db.prepare(`INSERT INTO reservations
      (id,organization_id,guest_id,accommodation_id,check_in,check_out,nights,num_guests,
       total_amount,status,payment_status,amount_paid,channel,public_token,guest_snapshot)
      VALUES(?,?,?,?,?,?,?,?,?,'aguardar_pagamento','pendente',0,'website',?,?)`)
      .run('SP-STRIPE-TEST', organizationId, 'stripe-test-guest', 'stripe-test-unit',
        checkIn, checkOut, 2, 1, 12.34, token,
        JSON.stringify({ name: 'Hóspede de Teste', email: 'teste@example.com' }));
  }).immediate();

  server = app.listen(testPort, '127.0.0.1', () => {
    console.log('\nTeste Stripe pronto.');
    console.log(`Abrir: http://localhost:${testPort}/reserva/${token}`);
    console.log('Cartão de teste: 4242 4242 4242 4242 · data futura · CVC 123');
    console.log('Aguardar esta janela até o pagamento ficar confirmado.\n');
  });
  server.on('error', error => {
    console.error('Não foi possível iniciar o servidor de teste:', error.message);
    shutdown(1);
  });
}

function consume(chunk) {
  const text = chunk.toString();
  output += text;
  const match = output.match(/whsec_[A-Za-z0-9_]+/);
  if (match) startApp(match[0]).catch(error => { console.error(error.message); shutdown(1); });
  logBuffer += text;
  const lines = logBuffer.split(/\r?\n/);
  logBuffer = lines.pop() || '';
  for (const line of lines.filter(Boolean)) {
    if (!/whsec_|webhook signing secret/i.test(line)) console.log('[Stripe]', scrub(line));
  }
}

listener.stdout.on('data', consume);
listener.stderr.on('data', consume);
listener.on('exit', code => {
  if (!started) {
    console.error(`A escuta de webhooks terminou antes de iniciar (código ${code}).`);
    shutdown(code || 1);
  }
});

function shutdown(code = 0) {
  listener.kill('SIGTERM');
  if (server) server.close();
  if (db?.open) db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  setTimeout(() => process.exit(code), 50).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
