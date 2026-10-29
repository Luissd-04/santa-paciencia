const { db } = require('../config/database');
const {
  getEmailSettings, renderEmail, resolveAccommodationInheritance, BLOCK_NAMES, isDeliverableEmail,
} = require('../services/emailService');

const samples = require('../services/emailSamples');
const { sortTemplates } = samples;

function getAll(req, res) {
  const templates = db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ?
    ORDER BY rowid
  `).all(req.user.organization_id);
  const settings = getEmailSettings(null, req.user.organization_id);
  res.json({ success: true, data: sortTemplates(templates), settings, blocks: BLOCK_NAMES });
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
  res.json({ success: true, data: require('../services/settingsService').getMany(req.user.organization_id, keys) });
}

function saveSettings(req, res) {
  const allowed = ['checkin_time', 'checkout_time', 'social_facebook', 'social_instagram', 'social_website'];
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) require('../services/settingsService').set(req.user.organization_id, key, value ?? '');
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

// Dados fictícios (emailSamples): a pré-visualização nunca lê uma reserva
// real. O estado é escolhido pelo utilizador para ver, por exemplo, como fica
// uma reserva pendente.
const baseUrl = req => `${req.protocol}://${req.get('host')}`;
function buildPreviewContext(req) {
  return samples.previewContext(req.user.organization_id, {
    baseUrl: baseUrl(req), status: req.body?.status, accommodation: resolveAccommodationContext(req),
  });
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

  const { isEmailAuthenticated, getEmailConnectionInfo } = require('../config/googleEmail');
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
    // Mesmo caminho dos envios reais, para o remetente ser o mesmo.
    await require('../services/emailService').sendMail(orgId, { to: previewTo, subject: `[PREVIEW] ${rendered.subject}`, html: rendered.html });
    res.json({
      success: true,
      message: `Preview enviado para ${previewTo}`,
      missing_translation: draft.missing_translation,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// POST /api/email-templates/send-samples — envia um exemplo de cada email da
// plataforma (hóspede, equipa, conta) para `to`, com dados e códigos de
// exemplo. Um envio por organização de cada vez, com pausa entre envios, para
// não servir de canal de envio em massa.
const SAMPLES_COOLDOWN_MS = 2 * 60 * 1000;
const samplesSentAt = new Map();
async function sendSamples(req, res) {
  const orgId = req.user.organization_id;
  const to = String(req.body?.to || '').trim();
  if (!isDeliverableEmail(to)) return res.status(400).json({ error: 'Indique um endereço de email válido.' });
  if (process.env.EMAIL_ENABLED === 'false') return res.status(400).json({ error: 'Email desativado (EMAIL_ENABLED=false)' });
  if (!require('../config/googleEmail').isEmailAuthenticated(orgId)) {
    return res.status(400).json({ error: 'Gmail não ligado — liga a conta Google nas definições' });
  }
  const wait = (samplesSentAt.get(orgId) || 0) + SAMPLES_COOLDOWN_MS - Date.now();
  if (wait > 0) return res.status(429).json({ error: `Os exemplos acabaram de ser enviados. Tente de novo daqui a ${Math.ceil(wait / 60000)} min.` });
  samplesSentAt.set(orgId, Date.now());
  try {
    const result = await samples.sendAll(orgId, to, { baseUrl: baseUrl(req) });
    if (!result.sent) samplesSentAt.delete(orgId);
    res.status(result.sent ? 200 : 502).json({ success: result.sent > 0, to, ...result });
  } catch (e) {
    samplesSentAt.delete(orgId);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { getAll, update, getSettings, saveSettings, preview, previewHtml, sendSamples, _samplesSentAt: samplesSentAt };
