const { db } = require('../config/database');
const { interpolate, baseTemplate, getEmailSettings } = require('../services/emailService');

function getAll(req, res) {
  const templates = db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ?
    ORDER BY rowid
  `).all(req.user.organization_id);
  const settings = getEmailSettings(null, req.user.organization_id);
  res.json({ success: true, data: templates, settings });
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

async function preview(req, res) {
  const { slug } = req.params;
  const template = db.prepare(`
    SELECT * FROM organization_email_templates
    WHERE organization_id = ? AND slug = ?
  `).get(req.user.organization_id, slug);
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });

  if (process.env.EMAIL_ENABLED === 'false') {
    return res.status(400).json({ error: 'Email desativado (EMAIL_ENABLED=false)' });
  }

  const settings = getEmailSettings(null, req.user.organization_id);
  const fakeVars = {
    nome_hospede: 'João Silva',
    primeiro_nome: 'João',
    alojamento: 'Suite Mezzanine Deluxe',
    data_checkin: 'sábado, 15 de junho de 2025',
    hora_checkin: settings.checkin_time || '15:00',
    data_checkout: 'segunda-feira, 17 de junho de 2025',
    hora_checkout: settings.checkout_time || '11:00',
    noites: '2',
    num_hospedes: '2',
    total: '€250.00',
    referencia: 'SP-PREVIEW-001',
    wifi_nome: 'SantaPaciencia_WiFi',
    wifi_password: '••••••••',
  };

  const subject = interpolate(template.subject, fakeVars);
  const body = interpolate(template.body, fakeVars);
  const html = baseTemplate(body, settings);
  const previewTo = req.body.to || process.env.EMAIL_USER;
  if (!previewTo) return res.status(400).json({ error: 'EMAIL_USER não configurado' });

  try {
    const transporter = require('../config/email');
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to: previewTo, subject: `[PREVIEW] ${subject}`, html });
    res.json({ success: true, message: `Preview enviado para ${previewTo}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { getAll, update, getSettings, saveSettings, preview };
