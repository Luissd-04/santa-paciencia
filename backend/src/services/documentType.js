// Valores canónicos partilhados com os seletores do backoffice.
function normalizeDocumentType(value) {
  const type = String(value || '').trim();
  const aliases = { passport: 'passaporte', id_card: 'cc', other: 'outro' };
  return Object.hasOwn(aliases, type) ? aliases[type] : type;
}
module.exports = { normalizeDocumentType };
