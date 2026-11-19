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

// Dados do alojamento usados nos emails ao hóspede, e o fim da licença
// fictícia «12345/AL» que o esquema punha por omissão (chegava às reservas e
// ao rodapé dos emails como se fosse real).
function accommodationGuestInfo(db) {
  const id = '20261119_accommodation_guest_info';
  if (done(db, id)) return;
  db.transaction(() => {
    for (const column of ['contact_email', 'contact_phone', 'arrival_instructions', 'entry_instructions', 'checkout_instructions', 'review_url']) {
      if (!has(db, 'accommodations', column)) db.exec(`ALTER TABLE accommodations ADD COLUMN ${column} TEXT`);
    }
    if (!has(db, 'accommodations', 'no_wifi')) db.exec('ALTER TABLE accommodations ADD COLUMN no_wifi INTEGER NOT NULL DEFAULT 0');
    db.exec("UPDATE accommodations SET license_number = '' WHERE license_number = '12345/AL'");
    db.exec("UPDATE reservations SET license_number = NULL WHERE license_number = '12345/AL'");
    mark(db, id);
  }).immediate();
}

module.exports = db => {
  depositDeadline(db);
  accommodationGuestInfo(db);
};
