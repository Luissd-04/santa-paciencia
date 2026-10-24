#!/usr/bin/env node
// Uploads órfãos. Correr na raiz da instância (onde está ./data/uploads) com o
// DB_PATH da instância, ex.: docker compose exec backend node scripts/uploads-orphans.cjs
//   (sem opções)                         lista: número, tamanho e caminhos
//   --min-age-hours <h>                  idade mínima (24 por omissão)
//   --delete --expected <n>              apaga, só se continuarem a ser <n>
// Fazer backup antes de apagar (docs/OPERACOES.md).
const { findOrphans, removeOrphans } = require('../services/uploadOrphans');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const minAgeHours = option('--min-age-hours') ?? 24;
try {
  if (args.includes('--delete')) {
    if (option('--expected') === undefined) throw new Error('Indique --expected com o número mostrado na listagem.');
    console.log(JSON.stringify(removeOrphans({ expected: option('--expected'), minAgeHours }), null, 2));
  } else {
    const found = findOrphans({ minAgeHours });
    console.log(JSON.stringify({ count: found.count, bytes: found.bytes, min_age_hours: found.min_age_hours }, null, 2));
    for (const file of found.files) console.log(`${file.kind}\t${file.bytes}\t${file.modified}\t${file.path}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  require('../config/database').db.close();
}
