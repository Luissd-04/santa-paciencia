const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const unzipper = require('unzipper');

async function extractArchive(buffer, directory) {
  const zip = await unzipper.Open.buffer(buffer);
  if (zip.files.length > 10000) throw new Error('Backup tem demasiados ficheiros.');
  let total = 0;
  const seen = new Set();
  for (const entry of zip.files) {
    if (entry.type === 'Directory') continue;
    const name = entry.path;
    if ((name !== 'backup.json' && !/^uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(name)) ||
        name.split('/').some(part => part === '.' || part === '..') || seen.has(name)) throw new Error('Caminho inválido no ZIP.');
    seen.add(name);
    const max = name === 'backup.json' ? 40 * 1024 * 1024 : 15 * 1024 * 1024;
    if (entry.uncompressedSize > max || total + entry.uncompressedSize > 250 * 1024 * 1024) throw new Error('Backup demasiado grande.');
    let bytes = 0;
    const limiter = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length; total += chunk.length;
      callback(bytes > max || total > 250 * 1024 * 1024 ? new Error('Limite de extração excedido.') : null, chunk);
    } });
    const output = path.join(directory, name);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await pipeline(entry.stream(), limiter, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  }
  if (!seen.has('backup.json')) throw new Error('ZIP inválido: falta backup.json.');
  return JSON.parse(fs.readFileSync(path.join(directory, 'backup.json'), 'utf8'));
}

module.exports = { extractArchive };
