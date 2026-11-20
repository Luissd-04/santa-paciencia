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

// Nome legível do dispositivo a partir do User-Agent (ex.: "iPhone · Safari"),
// com a mesma leitura das estatísticas (services/userAgent.js).
// Nota: a PWA instalada no iOS não inclui o token "Safari" — fica só "iPhone".
const DEVICE_NAMES = { iOS: 'iPhone', iPadOS: 'iPad', macOS: 'Mac', Outro: 'Dispositivo' };
function deviceLabelFromUA(ua = '') {
  const { browser, os } = require('./userAgent').parseUserAgent(ua);
  const name = DEVICE_NAMES[os] || os;
  return browser === 'Outro' ? name : `${name} · ${browser}`;
}

// O servidor faz POST ao endpoint recebido: aceitar só os serviços de push
// dos browsers evita usar a subscrição para chegar a hosts internos.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];
function isValidPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && PUSH_HOSTS.some(pattern => pattern.test(url.hostname));
}

function saveSubscription(organizationId, userId, subscription, deviceName = null) {
  // Reativar sempre ao (re)subscrever: é um opt-in explícito do dispositivo.
  db.prepare(`
    INSERT INTO push_subscriptions (id, organization_id, user_id, endpoint, keys_json, device_name, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (endpoint) DO UPDATE SET
      organization_id = excluded.organization_id,
      user_id = excluded.user_id,
      keys_json = excluded.keys_json,
      device_name = COALESCE(excluded.device_name, push_subscriptions.device_name),
      active = 1,
      updated_at = datetime('now')
  `).run(crypto.randomUUID(), organizationId, userId, subscription.endpoint, JSON.stringify(subscription.keys || {}), deviceName);
}

function deleteSubscription(organizationId, userId, endpoint) {
  const info = db.prepare(`DELETE FROM push_subscriptions
    WHERE endpoint = ? AND organization_id = ? AND user_id = ?`)
    .run(endpoint, organizationId, userId);
  return info.changes > 0;
}

// ── Gestão de dispositivos (lista nas Definições → Notificações) ──

function listDevices(organizationId) {
  return db.prepare(`
    SELECT s.id, s.device_name, s.active, s.created_at, s.updated_at, s.endpoint,
           u.name AS user_name
    FROM push_subscriptions s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.organization_id = ?
    ORDER BY s.created_at DESC
  `).all(organizationId).map(d => ({
    id: d.id,
    device_name: d.device_name || 'Dispositivo',
    user_name: d.user_name || '—',
    active: !!d.active,
    created_at: d.created_at,
    // Só a cauda do endpoint (para o browser identificar "este dispositivo"
    // sem expor o URL-capacidade completo a toda a equipa)
    endpoint_tail: String(d.endpoint).slice(-16),
  }));
}

function setDeviceActive(organizationId, id, active) {
  const info = db.prepare(`
    UPDATE push_subscriptions SET active = ?, updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `).run(active ? 1 : 0, id, organizationId);
  return info.changes > 0;
}

function deleteDeviceById(organizationId, id) {
  const info = db.prepare('DELETE FROM push_subscriptions WHERE id = ? AND organization_id = ?').run(id, organizationId);
  return info.changes > 0;
}

// ── Preferências por tipo (switches nas Definições, guardadas por utilizador) ──

const PUSH_TYPES = ['new_reservation', 'cancellation', 'payment', 'precheckin', 'daily_summary', 'ops_alert'];
const DEFAULT_PUSH_PREFS = Object.fromEntries(PUSH_TYPES.map(t => [t, true]));

function getUserPushPrefs(organizationId, userId) {
  return { ...DEFAULT_PUSH_PREFS, ...require('./settingsService').getJson(organizationId, `push_prefs:${userId}`, {}) };
}

function saveUserPushPrefs(organizationId, userId, prefs = {}) {
  const next = { ...DEFAULT_PUSH_PREFS };
  PUSH_TYPES.forEach(t => { if (prefs[t] !== undefined) next[t] = !!prefs[t]; });
  require('./settingsService').set(organizationId, `push_prefs:${userId}`, next);
  return next;
}

// Envia para todos os dispositivos da organização.
// options.excludeUserId — não notificar quem fez a ação.
// options.type — tipo de notificação; respeita os switches de cada utilizador.
// options.roles — só estes papéis (ex.: ['owner', 'manager']).
// options.userIds — só os dispositivos destes utilizadores (lista vazia: nenhum).
async function sendToOrganization(organizationId, payload, options = {}) {
  // Ambiente de testes, demonstração ou teste terminado: sem notificações.
  if (!require('./orgPolicy').externalAllowed(organizationId)) return;
  getVapidKeys();
  const { excludeUserId = null, type = null, roles = null, userIds = null } = options;
  let rows = db.prepare('SELECT s.endpoint, s.keys_json, s.user_id, s.organization_id, m.role FROM push_subscriptions s JOIN memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id JOIN users u ON u.id=s.user_id WHERE s.organization_id = ? AND s.active = 1 AND m.active = 1 AND u.active = 1').all(organizationId);
  // Subscrições gravadas antes da validação também não podem ser usadas.
  rows = rows.filter(r => isValidPushEndpoint(r.endpoint));
  if (excludeUserId) rows = rows.filter(r => r.user_id !== excludeUserId);
  if (roles) rows = rows.filter(r => roles.includes(r.role));
  if (Array.isArray(userIds)) rows = rows.filter(r => userIds.includes(r.user_id));
  if (type) {
    const prefsCache = {};
    rows = rows.filter(r => {
      if (!(r.user_id in prefsCache)) prefsCache[r.user_id] = getUserPushPrefs(organizationId, r.user_id);
      return prefsCache[r.user_id][type] !== false;
    });
  }
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
        deleteSubscription(row.organization_id, row.user_id, row.endpoint);
        removed++;
      } else {
        console.error('Erro ao enviar push:', err.statusCode || err.message);
      }
    }
  }
  return { total: rows.length, sent, removed };
}

module.exports = {
  isValidPushEndpoint,
  getPublicKey, saveSubscription, deleteSubscription, sendToOrganization,
  getUserPushPrefs, saveUserPushPrefs, PUSH_TYPES,
  deviceLabelFromUA, listDevices, setDeviceActive, deleteDeviceById,
};
