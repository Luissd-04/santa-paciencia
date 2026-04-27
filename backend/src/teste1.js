// Corre este ficheiro UMA VEZ para adicionar os novos campos à tabela accommodations
// Uso: node migrate_accommodations.js
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/santapaciencia.db';
const db = new Database(path.resolve(dbPath));

const columns = [
  ['description',   'TEXT'],
  ['address',       'TEXT'],
  ['postal_code',   'TEXT'],
  ['city',          'TEXT'],
  ['region',        'TEXT DEFAULT "Continente"'],
  ['country',       'TEXT DEFAULT "Portugal"'],
  ['area',          'INTEGER'],
  ['num_rooms',     'INTEGER DEFAULT 1'],
  ['num_bathrooms', 'INTEGER DEFAULT 1'],
  ['amenities',     'TEXT DEFAULT "[]"'],
];

const existing = db.pragma('table_info(accommodations)').map(c => c.name);

for (const [col, type] of columns) {
  if (!existing.includes(col)) {
    db.exec(`ALTER TABLE accommodations ADD COLUMN ${col} ${type}`);
    console.log(`✅ Coluna adicionada: ${col}`);
  } else {
    console.log(`⏭  Já existe: ${col}`);
  }
}

console.log('\n✅ Migração concluída.');
db.close();