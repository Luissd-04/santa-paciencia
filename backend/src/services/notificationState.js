// Estado das notificações por pessoa. Os avisos (check-in hoje, pagamento em
// falta, …) são calculados na hora em reservationOperationsController; aqui
// guarda-se, para cada pessoa e organização, quando cada um apareceu pela
// primeira vez (para «há 2 h» e para agrupar por dia) e quando foi lido.
// Um aviso que deixa de existir sai da tabela: se voltar, é novo outra vez.
const { db } = require('../config/database');

function notificationKey(n) {
  return [n.type, n.reservation_id || '', n.event_id || '', n.template_slug || ''].join('|');
}

function annotate(userId, organizationId, notifications, now = new Date().toISOString()) {
  const keys = notifications.map(notificationKey);
  const rows = db.transaction(() => {
    const insert = db.prepare('INSERT OR IGNORE INTO notification_state(user_id, organization_id, notif_key, first_seen_at) VALUES (?,?,?,?)');
    for (const key of new Set(keys)) insert.run(userId, organizationId, key, now);
    const current = db.prepare('SELECT notif_key, first_seen_at, read_at FROM notification_state WHERE user_id=? AND organization_id=?').all(userId, organizationId);
    const keep = new Set(keys);
    const remove = db.prepare('DELETE FROM notification_state WHERE user_id=? AND organization_id=? AND notif_key=?');
    for (const row of current) if (!keep.has(row.notif_key)) remove.run(userId, organizationId, row.notif_key);
    return new Map(current.filter(row => keep.has(row.notif_key)).map(row => [row.notif_key, row]));
  }).immediate();
  return notifications.map((n, i) => {
    const row = rows.get(keys[i]);
    return { ...n, key: keys[i], first_seen_at: row?.first_seen_at || now, read: Boolean(row?.read_at) };
  });
}

// `keys` é uma lista de chaves, ou 'all' para todas as desta pessoa.
function markRead(userId, organizationId, keys, now = new Date().toISOString()) {
  if (keys === 'all') {
    return db.prepare('UPDATE notification_state SET read_at=? WHERE user_id=? AND organization_id=? AND read_at IS NULL').run(now, userId, organizationId).changes;
  }
  const update = db.prepare('UPDATE notification_state SET read_at=? WHERE user_id=? AND organization_id=? AND notif_key=? AND read_at IS NULL');
  return db.transaction(() => keys.reduce((total, key) => total + update.run(now, userId, organizationId, String(key)).changes, 0))();
}

module.exports = { annotate, markRead, notificationKey };
