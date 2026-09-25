// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  ensureLibrary: { get: () => ensureLibrary },
  loadLibrary: { get: () => loadLibrary },
});

// Lista fechada de recursos: os URLs nunca vêm de dados introduzidos pelo utilizador.
const optionalAssets = {
  "chart": {
    "url": "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
    "integrity": "sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g"
  },
  "xlsx": {
    "url": "/js/vendor/xlsx-0.20.3.min.js"
  },
  "pdf": {
    "url": "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
    "integrity": "sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3"
  },
  "pdfTable": {
    "url": "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js",
    "integrity": "sha384-5jk55M0XWoAw7LyhlXJe19ErOr3doBAPzxw9vahPFbvolqWa2yDk4fhHa2zuYeOa"
  },
  "mapCss": {
    "url": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "integrity": "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H",
    "css": true
  },
  "map": {
    "url": "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "integrity": "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
  }
};
const optionalAssetRequests = new Map();
const optionalLibraries = {
  xlsx: { assets: ['xlsx'], ready: () => !!window.XLSX },
  pdf: { assets: ['pdf', 'pdfTable'], ready: () => !!window.jspdf?.jsPDF?.API?.autoTable },
  chart: { assets: ['chart'], ready: () => !!window.Chart },
  map: { assets: ['mapCss', 'map'], ready: () => !!window.L },
};

function loadOptionalAsset(name) {
  if (optionalAssetRequests.has(name)) return optionalAssetRequests.get(name);
  const asset = optionalAssets[name];
  const request = new Promise((resolve, reject) => {
    const element = document.createElement(asset.css ? 'link' : 'script');
    if (asset.css) { element.rel = 'stylesheet'; element.href = asset.url; }
    else { element.src = asset.url; element.async = true; }
    if (asset.integrity) { element.integrity = asset.integrity; element.crossOrigin = 'anonymous'; }
    const timer = setTimeout(() => fail(), 30000);
    const fail = () => {
      clearTimeout(timer); element.onload = null; element.onerror = null; element.remove();
      optionalAssetRequests.delete(name);
      reject(new Error('Não foi possível carregar os recursos. Verifica a ligação e tenta novamente.'));
    };
    element.onload = () => { clearTimeout(timer); element.onload = null; element.onerror = null; resolve(); };
    element.onerror = fail;
    document.head.appendChild(element);
  });
  optionalAssetRequests.set(name, request);
  return request;
}

async function loadLibrary(name) {
  const library = optionalLibraries[name];
  if (!library) throw new Error('Biblioteca desconhecida.');
  if (library.ready()) return;
  // O plugin PDF depende do jsPDF já executado.
  for (const asset of library.assets) await loadOptionalAsset(asset);
  if (!library.ready()) {
    for (const asset of library.assets) optionalAssetRequests.delete(asset);
    throw new Error('O recurso não ficou disponível. Tenta novamente.');
  }
}

async function ensureLibrary(name) {
  try { await loadLibrary(name); return true; }
  catch (error) { AppModules.core.toast(error.message, 'error'); return false; }
}

})();
