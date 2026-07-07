const webpush = require('web-push');
const crypto = require('crypto');
const { db } = require('../config/database');

// Chaves VAPID persistidas na tabela settings — geradas uma vez na primeira
// utilização, para não obrigar a configurar .env só para testar push.
let _vapid = null;

function getVapidKeys() {
  if (_vapid) return _vapid;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    _vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid_keys'").get();
    if (row) {
      _vapid = JSON.parse(row.value);
    } else {
      _vapid = webpush.generateVAPIDKeys();
      db.prepare("INSERT INTO settings (key, value) VALUES ('vapid_keys', ?)").run(JSON.stringify(_vapid));
      console.log('🔑 Chaves VAPID geradas e guardadas na base de dados');
    }
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@santapaciencia.xyz'}`,
    _vapid.publicKey,
    _vapid.privateKey
  );
  return _vapid;
}

function getPublicKey() {
  return getVapidKeys().publicKey;
}

function saveSubscription(organizationId, userId, subscription) {
  db.prepare(`
    INSERT INTO push_subscriptions (id, organization_id, user_id, endpoint, keys_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET
      organization_id = excluded.organization_id,
      user_id = excluded.user_id,
      keys_json = excluded.keys_json,
      updated_at = datetime('now')
  `).run(crypto.randomUUID(), organizationId, userId, subscription.endpoint, JSON.stringify(subscription.keys || {}));
}

function deleteSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

async function sendToOrganization(organizationId, payload) {
  getVapidKeys();
  const rows = db.prepare('SELECT endpoint, keys_json FROM push_subscriptions WHERE organization_id = ?').all(organizationId);
  const body = JSON.stringify(payload);

  let sent = 0, removed = 0;
  for (const row of rows) {
    const subscription = { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) };
    try {
      await webpush.sendNotification(subscription, body);
      sent++;
    } catch (err) {
      // 404/410 = subscrição morta (app removida do ecrã inicial, etc.)
      if (err.statusCode === 404 || err.statusCode === 410) {
        deleteSubscription(row.endpoint);
        removed++;
      } else {
        console.error('Erro ao enviar push:', err.statusCode || err.message);
      }
    }
  }
  return { total: rows.length, sent, removed };
}

module.exports = { getPublicKey, saveSubscription, deleteSubscription, sendToOrganization };
