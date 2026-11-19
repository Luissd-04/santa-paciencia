// Percurso do hóspede (19/11/2026): pedido sempre por aprovar, sinal com prazo
// depois de aceite, emails revistos e dados do alojamento usados nos emails.
// Cada parte tem a sua marca em schema_migrations.
const has = (db, table, column) => db.pragma(`table_info(${table})`).some(c => c.name === column);
const done = (db, id) => Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id));
const mark = (db, id) => db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);

// Prazo do sinal: definido ao aceitar o pedido (reservationLifecycle.approve).
function depositDeadline(db) {
  const id = '20261119_deposit_deadline';
  if (done(db, id)) return;
  db.transaction(() => {
    if (!has(db, 'reservations', 'deposit_deadline')) db.exec('ALTER TABLE reservations ADD COLUMN deposit_deadline TEXT');
    mark(db, id);
  }).immediate();
}

module.exports = db => {
  depositDeadline(db);
};
