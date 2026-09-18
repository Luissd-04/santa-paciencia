const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
let checked = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'vendor', 'data', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:js|cjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status) throw new Error(result.stderr);
      checked++;
    }
  }
}
walk(path.join(root, 'backend/src')); walk(path.join(root, 'frontend'));
const frontend = path.join(root, 'frontend');
for (const page of fs.readdirSync(frontend).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(frontend, page), 'utf8');
  const scripts = [];
  for (const match of html.matchAll(/<(script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
    const url = match[2];
    if (/^(?:https?:|data:|#)/.test(url)) continue;
    const file = path.join(frontend, url.replace(/^\//, '').split('?')[0]);
    if (!fs.existsSync(file)) throw new Error(`${page}: recurso inexistente ${url}`);
    if (match[1] === 'script') scripts.push(fs.readFileSync(file, 'utf8'));
  }
  // Todos os scripts clássicos partilham o mesmo âmbito lexical no browser.
  new vm.Script(scripts.join('\n;\n'), { filename: page });
}
const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'js/features/manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
for (const feature of Object.values(manifest)) {
  let previous = -1;
  for (const source of feature.scripts) {
    const index = html.indexOf(`src="${source}"`);
    if (index <= previous) throw new Error(`Ordem de scripts inválida: ${source}`);
    previous = index;
  }
}
console.log(`${checked} ficheiros JavaScript: sintaxe válida; recursos HTML e ordem dos módulos verificados.`);
