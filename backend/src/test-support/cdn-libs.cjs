// Bibliotecas externas (CDN) servidas a partir do disco, para os testes de
// browser serem determinísticos e funcionarem sem rede (sandbox, CI isolado).
//
// Procura cada ficheiro em node_modules (chart.js, jspdf, jspdf-autotable,
// leaflet) e, em alternativa, na pasta indicada por SP_CDN_LIBS_DIR (pacotes
// npm extraídos, p. ex. «jspdf-4.2.1/package/dist/...»). Os ficheiros cuja
// soma SHA-384 coincide com a da aplicação passam pela verificação SRI normal;
// os que diferem (o chart.umd.min.js do jsDelivr é minificado na hora) são
// servidos na mesma, com o SRI desligado só para esse URL, no teste.
// Sem ficheiro local, o pedido segue para a rede como de costume.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LIBS = [
  { match: /\/jspdf\/4\.2\.1\/jspdf\.umd\.min\.js$/, files: ['jspdf/dist/jspdf.umd.min.js', 'jspdf-4.2.1/package/dist/jspdf.umd.min.js'], type: 'text/javascript' },
  { match: /\/jspdf-autotable\/5\.0\.8\/jspdf\.plugin\.autotable\.min\.js$/, files: ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf-autotable-5.0.8/package/dist/jspdf.plugin.autotable.min.js'], type: 'text/javascript' },
  { match: /\/chart\.js@4\.4\.0\/dist\/chart\.umd\.min\.js$/, files: ['chart.js/dist/chart.umd.js', 'chart.js-4.4.0/package/dist/chart.umd.js'], type: 'text/javascript' },
  { match: /\/leaflet@1\.9\.4\/dist\/leaflet\.js$/, files: ['leaflet/dist/leaflet.js', 'leaflet-1.9.4/package/dist/leaflet.js'], type: 'text/javascript' },
  { match: /\/leaflet@1\.9\.4\/dist\/leaflet\.css$/, files: ['leaflet/dist/leaflet.css', 'leaflet-1.9.4/package/dist/leaflet.css'], type: 'text/css' },
];

function locate(files) {
  const roots = [path.resolve(__dirname, '../node_modules'), process.env.SP_CDN_LIBS_DIR].filter(Boolean);
  for (const root of roots) for (const file of files) {
    const full = path.join(root, file);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

// Regista as rotas no contexto. Devolve os URLs servidos localmente.
async function serveCdnLibraries(context, frontendPath) {
  const source = fs.readFileSync(path.join(frontendPath, 'js/domain/libraries.js'), 'utf8');
  const integrities = {};
  for (const m of source.matchAll(/"url":\s*"([^"]+)",\s*"integrity":\s*"([^"]+)"/g)) integrities[m[1]] = m[2];
  const served = [], unsigned = [];
  for (const lib of LIBS) {
    const file = locate(lib.files);
    if (!file) continue;
    const body = fs.readFileSync(file);
    const url = Object.keys(integrities).find(u => lib.match.test(u));
    const ok = url && integrities[url] === `sha384-${crypto.createHash('sha384').update(body).digest('base64')}`;
    if (!ok && url) unsigned.push(url);
    served.push(lib.match);
    await context.route(u => lib.match.test(new URL(u).pathname), route => route.fulfill({ status: 200, contentType: lib.type, headers: { 'access-control-allow-origin': '*' }, body }));
  }
  if (unsigned.length) {
    await context.addInitScript(urls => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'integrity');
      Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
        configurable: true, get: descriptor.get,
        set(value) { if (!urls.includes(this.src)) descriptor.set.call(this, value); },
      });
    }, unsigned);
  }
  return served.length;
}

module.exports = { serveCdnLibraries };
