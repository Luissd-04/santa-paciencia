const { db } = require('../config/database');
const {
  getEmailSettings, buildVars, buildBlocks, renderEmail, sanitizeUrlVars,
  resolveAccommodationInheritance,
} = require('../services/emailService');

// Ordem cronológica da jornada do hóspede, para a lista ficar percetível
// nas definições (o cancelamento fica no fim, como percurso de exceção).
const TEMPLATE_ORDER = [
  'confirmacao', 'pre_checkin', 'coordenadas',
  'apos_checkin', 'antes_checkout', 'obrigado', 'cancelamento',
];

function sortTemplates(templates) {
  return [...templates].sort((a, b) => {
    const ia = TEMPLATE_ORDER.indexOf(a.slug);
    const ib = TEMPLATE_ORDER.indexOf(b.slug);
    return (ia === -1 ? TEMPLATE_ORDER.length : ia) - (ib === -1 ? TEMPLATE_ORDER.length : ib);
  });
}

function getAll(req, res) {
  const templates = db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ?
    ORDER BY rowid
  `).all(req.user.organization_id);
  const settings = getEmailSettings(null, req.user.organization_id);
  res.json({ success: true, data: sortTemplates(templates), settings });
}

function update(req, res) {
  const { slug } = req.params;
  const existing = db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ? AND slug = ?
  `).get(req.user.organization_id, slug);
  if (!existing) return res.status(404).json({ error: 'Template não encontrado' });

  const {
    subject, body, timing_offset, timing_unit, timing_direction, timing_event, active,
    subject_en, body_en, subject_fr, body_fr, subject_es, body_es,
    subject_de, body_de, subject_it, body_it, subject_nl, body_nl,
    bcc, window_start, window_end,
  } = req.body;

  db.prepare(`
    UPDATE organization_email_templates SET
      subject = COALESCE(?, subject),
      body = COALESCE(?, body),
      timing_offset = COALESCE(?, timing_offset),
      timing_unit = COALESCE(?, timing_unit),
      timing_direction = COALESCE(?, timing_direction),
      timing_event = COALESCE(?, timing_event),
      active = COALESCE(?, active),
      subject_en = COALESCE(?, subject_en), body_en = COALESCE(?, body_en),
      subject_fr = COALESCE(?, subject_fr), body_fr = COALESCE(?, body_fr),
      subject_es = COALESCE(?, subject_es), body_es = COALESCE(?, body_es),
      subject_de = COALESCE(?, subject_de), body_de = COALESCE(?, body_de),
      subject_it = COALESCE(?, subject_it), body_it = COALESCE(?, body_it),
      subject_nl = COALESCE(?, subject_nl), body_nl = COALESCE(?, body_nl),
      bcc = CASE WHEN ? THEN ? ELSE bcc END,
      window_start = CASE WHEN ? THEN ? ELSE window_start END,
      window_end = CASE WHEN ? THEN ? ELSE window_end END,
      updated_at = datetime('now')
    WHERE organization_id = ? AND slug = ?
  `).run(
    subject ?? null, body ?? null,
    timing_offset !== undefined ? Number(timing_offset) : null,
    timing_unit ?? null, timing_direction ?? null, timing_event ?? null,
    active !== undefined ? (active ? 1 : 0) : null,
    subject_en ?? null, body_en ?? null,
    subject_fr ?? null, body_fr ?? null,
    subject_es ?? null, body_es ?? null,
    subject_de ?? null, body_de ?? null,
    subject_it ?? null, body_it ?? null,
    subject_nl ?? null, body_nl ?? null,
    bcc !== undefined ? 1 : 0, bcc || '',
    window_start !== undefined ? 1 : 0, window_start || null,
    window_end !== undefined ? 1 : 0, window_end || null,
    req.user.organization_id, slug
  );

  res.json({
    success: true,
    data: db.prepare('SELECT * FROM organization_email_templates WHERE organization_id = ? AND slug = ?').get(req.user.organization_id, slug)
  });
}

function getSettings(req, res) {
  const keys = ['checkin_time', 'checkout_time', 'social_facebook', 'social_instagram', 'social_website'];
  const rows = db.prepare(`
    SELECT key, value
    FROM organization_settings
    WHERE organization_id = ? AND key IN (${keys.map(() => '?').join(',')})
  `).all(req.user.organization_id, ...keys);
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json({ success: true, data: s });
}

function saveSettings(req, res) {
  const allowed = ['checkin_time', 'checkout_time', 'social_facebook', 'social_instagram', 'social_website'];
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) upsert.run(req.user.organization_id, key, value ?? '');
  }
  res.json({ success: true });
}

const LANGS = ['pt', 'en', 'fr', 'es', 'de', 'it', 'nl'];

function langField(lang, field) {
  return lang === 'pt' ? field : `${field}_${lang}`;
}

// Alojamento de contexto da pré-visualização. Só um alojamento da própria
// organização é aceite — o id vem do cliente e não pode servir para ler
// logótipo, Wi-Fi ou redes sociais de outra organização.
function resolveAccommodationContext(req) {
  const id = req.body?.accommodation_id;
  if (!id) return null;
  const accommodation = db.prepare(
    'SELECT * FROM accommodations WHERE id = ? AND organization_id = ?'
  ).get(String(id), req.user.organization_id);
  if (!accommodation) return null;
  return resolveAccommodationInheritance(accommodation, req.user.organization_id);
}

// Dados fictícios: a pré-visualização nunca lê uma reserva real. O estado é
// escolhido pelo utilizador para poder ver como fica uma reserva pendente.
const PREVIEW_STATUSES = ['confirmada', 'pendente', 'aguardar_pagamento', 'cancelada'];

function buildPreviewContext(req) {
  const orgId = req.user.organization_id;
  const accommodation = resolveAccommodationContext(req);
  const settings = getEmailSettings(accommodation, orgId);
  const status = PREVIEW_STATUSES.includes(req.body?.status) ? req.body.status : 'confirmada';

  const guest = { name: 'Rui Marques Silva', first_name: 'Rui', email: 'hospede.exemplo@example.org' };
  const reservation = {
    id: 'SP-1778013512761',
    status,
    check_in: '2026-05-29',
    check_out: '2026-05-31',
    nights: 2,
    num_guests: 1,
    total_amount: 240,
    organization_id: orgId,
  };
  const accommodationForVars = accommodation || { name: 'Suite Mezzanine Deluxe', city: settings.property_name };

  const vars = sanitizeUrlVars(buildVars(guest, reservation, accommodationForVars, settings, {
    link_pre_checkin: `${req.protocol}://${req.get('host')}/pre-checkin/exemplo`,
    wifi_password: accommodationForVars.wifi_password || '••••••••',
    codigo_porta: accommodationForVars.door_code || '1234#',
  }));

  return { settings, vars, blocks: buildBlocks(vars, settings, reservation), reservation };
}

// Assunto/corpo a compor: o rascunho aberto no editor tem prioridade sobre o
// que está guardado, para a pré-visualização e o envio de teste refletirem o
// que o utilizador está a ver (antes, o envio usava sempre a versão gravada).
function resolveDraft(req, template) {
  const lang = LANGS.includes(req.body?.lang) ? req.body.lang : 'pt';
  const storedSubject = template[langField(lang, 'subject')] || '';
  const storedBody = template[langField(lang, 'body')] || '';

  const hasDraft = typeof req.body?.body === 'string' || typeof req.body?.subject === 'string';
  const subject = typeof req.body?.subject === 'string' ? req.body.subject : storedSubject;
  const body = typeof req.body?.body === 'string' ? req.body.body : storedBody;

  // Tradução em falta: não se inventa texto nem se envia um email vazio —
  // recorre-se ao português e diz-se explicitamente que foi isso que aconteceu.
  const missingTranslation = lang !== 'pt' && !String(body).trim();
  if (missingTranslation) {
    return {
      lang,
      fallback_lang: 'pt',
      missing_translation: true,
      subject: subject || template.subject || '',
      body: template.body || '',
      from_draft: hasDraft,
    };
  }
  return { lang, fallback_lang: null, missing_translation: false, subject, body, from_draft: hasDraft };
}

function loadTemplate(req) {
  return db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ? AND slug = ?
  `).get(req.user.organization_id, req.params.slug);
}

// POST /api/email-templates/:slug/preview-html — compõe e devolve o HTML, sem
// enviar nada. É a mesma composição do envio (emailService.renderEmail), por
// isso a pré-visualização não pode voltar a divergir do que o hóspede recebe.
function previewHtml(req, res) {
  const template = loadTemplate(req);
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  const draft = resolveDraft(req, template);
  const { settings, vars, blocks } = buildPreviewContext(req);
  const rendered = renderEmail({ subject: draft.subject, body: draft.body, vars, blocks, settings });

  res.json({
    success: true,
    html: rendered.html,
    subject: rendered.subject,
    lang: draft.lang,
    fallback_lang: draft.fallback_lang,
    missing_translation: draft.missing_translation,
  });
}

// POST /api/email-templates/:slug/preview — envio de teste para um endereço,
// com o MESMO rascunho e a MESMA composição da pré-visualização.
async function preview(req, res) {
  const template = loadTemplate(req);
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  if (process.env.EMAIL_ENABLED === 'false') {
    return res.status(400).json({ error: 'Email desativado (EMAIL_ENABLED=false)' });
  }

  const draft = resolveDraft(req, template);
  const { settings, vars, blocks } = buildPreviewContext(req);
  const rendered = renderEmail({ subject: draft.subject, body: draft.body, vars, blocks, settings });

  const { isEmailAuthenticated, getEmailConnectionInfo, sendViaGmail } = require('../config/googleEmail');
  const orgId = req.user.organization_id;
  const gmailInfo = getEmailConnectionInfo(orgId);
  // Só a caixa ligada da própria organização: um destinatário arbitrário no
  // corpo do pedido tornaria este endpoint um relay para enviar a hóspedes.
  const previewTo = gmailInfo.email;
  if (!previewTo) return res.status(400).json({ error: 'Sem endereço de destino configurado' });
  if (!isEmailAuthenticated(orgId)) {
    return res.status(400).json({ error: 'Gmail não ligado — liga a conta Google nas definições' });
  }

  try {
    await sendViaGmail(orgId, { to: previewTo, subject: `[PREVIEW] ${rendered.subject}`, html: rendered.html });
    res.json({
      success: true,
      message: `Preview enviado para ${previewTo}`,
      missing_translation: draft.missing_translation,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { getAll, update, getSettings, saveSettings, preview, previewHtml };
