// Cargos da equipa da plataforma: uma pessoa pode ter vários (por exemplo
// Marketing e Administração). Lista separada por vírgulas em platform_roles;
// NULL quer dizer «ainda não migrado» e lê-se a coluna antiga platform_role.
module.exports = db => {
  const id = '20261112_platform_roles';
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id)) return;
  db.transaction(() => {
    db.exec('ALTER TABLE users ADD COLUMN platform_roles TEXT');
    db.exec("UPDATE users SET platform_roles = platform_role WHERE platform_admin = 1");
    db.prepare('INSERT INTO schema_migrations(id) VALUES (?)').run(id);
  })();
};
