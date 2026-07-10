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

// Nome legível do dispositivo a partir do User-Agent (ex.: "iPhone · Safari").
// Nota: a PWA instalada no iOS não inclui o token "Safari" — fica só "iPhone".
function deviceLabelFromUA(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari'
    : '';
  return browser ? `${os} · ${browser}` : os;
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

function deleteSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
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

const PUSH_TYPES = ['new_reservation', 'cancellation', 'precheckin', 'daily_summary'];
const DEFAULT_PUSH_PREFS = Object.fromEntries(PUSH_TYPES.map(t => [t, true]));

function getUserPushPrefs(organizationId, userId) {
  const row = db.prepare('SELECT value FROM organization_settings WHERE organization_id = ? AND key = ?')
    .get(organizationId, `push_prefs:${userId}`);
  try {
    return { ...DEFAULT_PUSH_PREFS, ...(row ? JSON.parse(row.value) : {}) };
  } catch {
    return { ...DEFAULT_PUSH_PREFS };
  }
}

function saveUserPushPrefs(organizationId, userId, prefs = {}) {
  const next = { ...DEFAULT_PUSH_PREFS };
  PUSH_TYPES.forEach(t => { if (prefs[t] !== undefined) next[t] = !!prefs[t]; });
  db.prepare(`
    INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(organizationId, `push_prefs:${userId}`, JSON.stringify(next));
  return next;
}

// Envia para todos os dispositivos da organização.
// options.excludeUserId — não notificar quem fez a ação.
// options.type — tipo de notificação; respeita os switches de cada utilizador.
async function sendToOrganization(organizationId, payload, options = {}) {
  getVapidKeys();
  const { excludeUserId = null, type = null } = options;
  let rows = db.prepare('SELECT endpoint, keys_json, user_id FROM push_subscriptions WHERE organization_id = ? AND active = 1').all(organizationId);
  if (excludeUserId) rows = rows.filter(r => r.user_id !== excludeUserId);
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
        deleteSubscription(row.endpoint);
        removed++;
      } else {
        console.error('Erro ao enviar push:', err.statusCode || err.message);
      }
    }
  }
  return { total: rows.length, sent, removed };
}

// Fire-and-forget para usar nos controllers sem nunca falhar o request.
function notifyOrganization(organizationId, type, { title, body, url = '/', excludeUserId = null, requireInteraction = false, tag = null }) {
  sendToOrganization(organizationId, { title, body, url, tag: tag || `sp-${type}`, requireInteraction }, { type, excludeUserId })
    .catch(err => console.error('Erro ao enviar push:', err.message));
}

module.exports = {
  getPublicKey, saveSubscription, deleteSubscription, sendToOrganization,
  notifyOrganization, getUserPushPrefs, saveUserPushPrefs, PUSH_TYPES,
  deviceLabelFromUA, listDevices, setDeviceActive, deleteDeviceById,
};
