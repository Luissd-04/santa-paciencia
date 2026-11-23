// Recortes não destrutivos das imagens (PENDENTES, ponto 15): ponto principal
// e recortes por formato da capa, tamanho da capa (para posicionar o ponto
// principal sem abrir o ficheiro), recortes do logótipo e o original do
// logótipo quando o `logo_url` passa a ser a versão recortada.
const has = (db, table, column) => db.pragma(`table_info(${table})`).some(c => c.name === column);

module.exports = db => {
  const id = '20261123_image_crops';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    for (const column of ['cover_focal', 'cover_crops', 'cover_size', 'logo_crop', 'logo_square_crop', 'logo_original_url']) {
      if (!has(db, 'accommodations', column)) db.exec(`ALTER TABLE accommodations ADD COLUMN ${column} TEXT`);
    }
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  }).immediate();
};
