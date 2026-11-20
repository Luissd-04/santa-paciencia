// Agregado diário e durável de browser, sistema, dispositivo e modo de
// apresentação por organização. Sem user agent em bruto, IP ou pessoas: o
// histórico sobrevive ao fim das sessões (auth_sessions apaga-se no logout).
module.exports = db => {
  const id = '20261115_platform_device_daily';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id)) return;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS platform_device_daily (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      browser TEXT NOT NULL, os TEXT NOT NULL, device TEXT NOT NULL,
      display_mode TEXT NOT NULL DEFAULT 'unknown',
      sessions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, day, browser, os, device, display_mode));
      CREATE INDEX IF NOT EXISTS idx_platform_device_daily_day ON platform_device_daily(day)`);
    db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(id);
  })();
};
