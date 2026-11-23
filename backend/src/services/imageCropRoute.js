// `/uploads/<ficheiro>?crop=<formato>&w=<largura>[&a=<alojamento>][&v=…]`
// (app.js). Os mesmos limites das miniaturas: só as larguras permitidas, só
// ficheiros diretamente em data/uploads, nomes já validados pelo app.js. O
// retângulo vem sempre da base (nunca do pedido): da capa ou do logótipo que
// usa este ficheiro; sem nenhum, o recorte automático ao centro.
const { db } = require('../config/database');
const { cropped, THUMB_WIDTHS } = require('./imageOptimizer');
const crops = require('./imageCrops');

const DEFAULT_WIDTH = 1024;
const one = value => (Array.isArray(value) ? undefined : value);

function coverRow(url, accommodationId) {
  if (accommodationId) {
    return db.prepare('SELECT cover_focal, cover_crops FROM accommodations WHERE id = ? AND cover_image = ?').get(accommodationId, url);
  }
  // Várias unidades com a mesma capa: a que a afinou à mão primeiro.
  return db.prepare(`SELECT cover_focal, cover_crops FROM accommodations WHERE cover_image = ?
    ORDER BY (cover_crops IS NULL), (cover_focal IS NULL), rowid LIMIT 1`).get(url);
}

// null → 404; { status: 400 } → pedido inválido; { file, type } → servir.
async function serve(url, query) {
  const format = one(query.crop);
  const width = query.w === undefined ? DEFAULT_WIDTH : Number(one(query.w));
  const accommodationId = one(query.a);
  if (typeof format !== 'string' || !Object.hasOwn(crops.FORMATS, format)) return { status: 400 };
  if (!THUMB_WIDTHS.has(width)) return { status: 400 };
  if (accommodationId !== undefined && (typeof accommodationId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(accommodationId))) return { status: 400 };
  if (query.v !== undefined && (typeof query.v !== 'string' || !/^[a-z0-9]{1,16}$/.test(query.v))) return { status: 400 };

  let source = url;
  let resolve;
  if (format === 'logo' || format === 'mark') {
    // O retângulo é relativo ao original (`logo_original_url`), que fica
    // guardado quando `logo_url` passa a ser a versão recortada.
    // Do alojamento ou, se nenhum o usa, da organização (Área do proprietário → Marca).
    const row = db.prepare(`SELECT logo_original_url, logo_crop, logo_square_crop FROM accommodations
      WHERE logo_url = ? OR logo_original_url = ? ORDER BY (logo_square_crop IS NULL), rowid LIMIT 1`).get(url, url)
      || db.prepare(`SELECT logo_original_url, logo_crop, logo_square_crop FROM organizations
      WHERE logo_url = ? OR logo_original_url = ? ORDER BY (logo_square_crop IS NULL), rowid LIMIT 1`).get(url, url);
    if (row?.logo_original_url) source = row.logo_original_url;
    const rect = crops.parse(format === 'mark' ? row?.logo_square_crop : row?.logo_crop);
    resolve = (w, h) => {
      if (rect) { try { return crops.validateRect(rect, format, w, h); } catch { /* automático */ } }
      return crops.autoCrop(format, w, h, null);
    };
  } else {
    const row = coverRow(url, accommodationId);
    resolve = (w, h) => crops.effectiveCrop(format, w, h, { focal: row?.cover_focal, crops: row?.cover_crops });
  }
  try {
    return await cropped(source, format, width, resolve);
  } catch {
    return { status: 400 };
  }
}

module.exports = { serve };
