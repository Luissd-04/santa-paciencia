// Campos que as suites/quartos herdam do alojamento principal (morada, Wi-Fi,
// código da porta, horas, redes sociais, logótipo). A ficha do alojamento e os
// emails usam esta lista; antes cada um tinha a sua cópia.
const { db } = require('../config/database');

const INHERITED_FIELDS = [
  'address', 'postal_code', 'city', 'region', 'country',
  'wifi_name', 'wifi_password', 'door_code', 'checkin_time', 'checkout_time',
  'social_facebook', 'social_instagram', 'social_website', 'social_tripadvisor', 'logo_url',
  'email_social_links',
  'contact_email', 'contact_phone', 'arrival_instructions', 'entry_instructions', 'checkout_instructions', 'review_url', 'no_wifi',
];

// Para emails e mensagens: os campos vazios da unidade vêm do alojamento
// principal; um valor próprio prevalece.
function withInheritedFields(accommodation, organizationId) {
  if (!accommodation?.parent_id) return accommodation;
  try {
    const parent = organizationId
      ? db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(accommodation.parent_id, organizationId)
      : db.prepare('SELECT * FROM accommodations WHERE id = ?').get(accommodation.parent_id);
    if (!parent) return accommodation;
    const resolved = { ...accommodation };
    for (const field of INHERITED_FIELDS) {
      // «Sem Wi-Fi» é 0/1 (nunca vazio) e só se define no alojamento principal.
      if (field === 'no_wifi') { resolved[field] = parent[field]; continue; }
      if (resolved[field] === null || resolved[field] === undefined || resolved[field] === '') resolved[field] = parent[field];
    }
    return resolved;
  } catch {
    return accommodation;
  }
}

module.exports = { INHERITED_FIELDS, withInheritedFields };
