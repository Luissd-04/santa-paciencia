// Impressão digital do frontend servido, calculada no arranque. Muda a cada
// publicação sem depender de números de versão mantidos à mão. O browser
// compara-a com a do arranque da página: se mudou, os módulos que ainda vai
// pedir já não são da versão que tem em memória (ver helpers.js/features.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function compute(root) {
  const hash = crypto.createHash('sha256');
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:js|css|html|json|webmanifest)$/.test(entry.name)) {
        hash.update(path.relative(root, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return hash.digest('hex').slice(0, 16);
}

const root = process.env.FRONTEND_PATH ? path.resolve(process.env.FRONTEND_PATH) : null;

// Commit do Git em execução, para se ver na app qual é a versão instalada.
// Vem de APP_BUILD (scripts/staging.sh passa-o; na produção, ver OPERACOES.md).
// Só se aceita um hash hexadecimal; outro valor (ex.: «staging-local») fica null.
const commit = /^[0-9a-f]{7,40}$/i.test(String(process.env.APP_BUILD || '').trim())
  ? String(process.env.APP_BUILD).trim().toLowerCase().slice(0, 12) : null;
const startedAt = new Date().toISOString();

module.exports = { value: root && fs.existsSync(root) ? compute(root) : null, commit, startedAt };
