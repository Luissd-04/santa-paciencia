const crypto = require('crypto');
const { db } = require('../config/database');

const ROLES = ['owner', 'manager', 'staff'];

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `workspace-${Date.now()}`;
}

function ensureRole(role) {
  if (!ROLES.includes(role)) throw new Error('Role inválido.');
  return role;
}

function generateUniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let idx = 1;
  while (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) {
    idx += 1;
    slug = `${base}-${idx}`;
  }
  return slug;
}

function getClaimableLegacyOrganization() {
  return db.prepare(`
    SELECT o.*
    FROM organizations o
    LEFT JOIN memberships m ON m.organization_id = o.id
    GROUP BY o.id
    HAVING COUNT(m.id) = 0
    ORDER BY o.created_at ASC
    LIMIT 1
  `).get();
}

function seedOrganizationSettings(organizationId) {
  const defaults = db.prepare('SELECT key, value FROM settings').all();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO organization_settings (organization_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  defaults.forEach(row => stmt.run(organizationId, row.key, row.value));
}

function seedOrganizationEmailTemplates(organizationId) {
  const defaults = db.prepare('SELECT * FROM email_templates ORDER BY rowid').all();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO organization_email_templates (
      organization_id, slug, name, subject, body,
      timing_offset, timing_unit, timing_direction, timing_event, active, updated_at,
      subject_en, body_en, subject_fr, body_fr, subject_es, body_es,
      subject_de, body_de, subject_it, body_it, subject_nl, body_nl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaults.forEach(tpl => stmt.run(
    organizationId, tpl.slug, tpl.name, tpl.subject, tpl.body,
    tpl.timing_offset, tpl.timing_unit, tpl.timing_direction, tpl.timing_event, tpl.active,
    tpl.subject_en || '', tpl.body_en || '',
    tpl.subject_fr || '', tpl.body_fr || '',
    tpl.subject_es || '', tpl.body_es || '',
    tpl.subject_de || '', tpl.body_de || '',
    tpl.subject_it || '', tpl.body_it || '',
    tpl.subject_nl || '', tpl.body_nl || ''
  ));
}

function seedOrganizationAccommodations(organizationId) {
  const legacyRows = db.prepare(`
    SELECT COUNT(*) as c FROM accommodations WHERE organization_id = ?
  `).get(organizationId).c;
  if (legacyRows > 0) return;

  const suites = [
    { id: 'suite-mezzanine-deluxe', name: 'Suite Mezzanine Deluxe', type: 'suite', price_per_night: 120, max_guests: 2 },
    { id: 'suite-familiar-deluxe', name: 'Suite Familiar Deluxe', type: 'suite', price_per_night: 150, max_guests: 4 },
    { id: 'suite-king-deluxe', name: 'Suite King Deluxe', type: 'suite', price_per_night: 130, max_guests: 2 },
    { id: 'suite-queen-deluxe', name: 'Suite Queen Deluxe', type: 'suite', price_per_night: 110, max_guests: 2 },
  ];

  const insert = db.prepare(`
    INSERT INTO accommodations (
      id, organization_id, name, type, price_per_night, max_guests, license_number
    ) VALUES (@id, @organization_id, @name, @type, @price_per_night, @max_guests, @license_number)
  `);

  db.transaction(() => {
    suites.forEach((suite, index) => insert.run({
      ...suite,
      id: `${suite.id}-${organizationId.slice(0, 6)}-${index + 1}`,
      organization_id: organizationId,
      license_number: process.env.LICENSE_NUMBER || '12345/AL',
    }));
  })();
}

function seedOrganizationDefaults(organizationId) {
  seedOrganizationSettings(organizationId);
  seedOrganizationEmailTemplates(organizationId);
  seedOrganizationAccommodations(organizationId);
}

function createOrganization(name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('O nome do espaço é obrigatório.');

  const id = crypto.randomUUID();
  const slug = generateUniqueSlug(trimmedName);
  db.prepare(`
    INSERT INTO organizations (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, trimmedName, slug);
  seedOrganizationDefaults(id);
  return db.prepare('SELECT * FROM organizations WHERE id = ?').get(id);
}

function createMembership({ organizationId, userId, role = 'staff', invitedByUserId = null }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO memberships (
      id, organization_id, user_id, role, active, invited_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).run(id, organizationId, userId, ensureRole(role), invitedByUserId);
  return db.prepare('SELECT * FROM memberships WHERE id = ?').get(id);
}

function getPrimaryMembership(userId) {
  return db.prepare(`
    SELECT m.*, o.name as organization_name, o.slug as organization_slug
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ? AND m.active = 1
    ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, m.created_at ASC
    LIMIT 1
  `).get(userId);
}

function getMembershipByUserAndOrganization(userId, organizationId) {
  return db.prepare(`
    SELECT * FROM memberships
    WHERE user_id = ? AND organization_id = ? AND active = 1
  `).get(userId, organizationId);
}

function listMembers(organizationId) {
  return db.prepare(`
    SELECT
      m.id, m.role, m.active, m.created_at, m.updated_at,
      u.id as user_id, u.name, u.email
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.organization_id = ?
    ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, u.name ASC
  `).all(organizationId);
}

function listInvitations(organizationId) {
  return db.prepare(`
    SELECT
      i.id, i.email, i.role, i.expires_at, i.accepted_at, i.created_at,
      u.name as invited_by_name
    FROM invitations i
    LEFT JOIN users u ON u.id = i.invited_by_user_id
    WHERE i.organization_id = ? AND i.accepted_at IS NULL
    ORDER BY i.created_at DESC
  `).all(organizationId);
}

function createInvitation({ organizationId, email, role, invitedByUserId }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  ensureRole(role);
  if (!normalizedEmail) throw new Error('O email do convite é obrigatório.');

  const existingPending = db.prepare(`
    SELECT id FROM invitations
    WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND datetime(expires_at) > datetime('now')
  `).get(organizationId, normalizedEmail);
  if (existingPending) {
    throw new Error('Já existe um convite ativo para este email.');
  }

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

  db.prepare(`
    INSERT INTO invitations (
      id, organization_id, email, role, token, invited_by_user_id, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, organizationId, normalizedEmail, role, token, invitedByUserId || null, expiresAt);

  return db.prepare('SELECT * FROM invitations WHERE id = ?').get(id);
}

function getInvitationByToken(token) {
  return db.prepare(`
    SELECT i.*, o.name as organization_name
    FROM invitations i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.token = ?
  `).get(token);
}

function acceptInvitation({ invitationId, userId }) {
  const invitation = db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitationId);
  if (!invitation) throw new Error('Convite inválido.');
  if (invitation.accepted_at) throw new Error('Este convite já foi utilizado.');
  if (new Date(invitation.expires_at).getTime() <= Date.now()) throw new Error('Este convite expirou.');

  createMembership({
    organizationId: invitation.organization_id,
    userId,
    role: invitation.role,
    invitedByUserId: invitation.invited_by_user_id || null,
  });

  db.prepare(`
    UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?
  `).run(invitationId);

  return invitation;
}

function buildInvitationUrl(token) {
  const base = process.env.PUBLIC_APP_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/?invite=${token}`;
}

module.exports = {
  ROLES,
  acceptInvitation,
  buildInvitationUrl,
  createInvitation,
  createMembership,
  createOrganization,
  ensureRole,
  getClaimableLegacyOrganization,
  getInvitationByToken,
  getMembershipByUserAndOrganization,
  getPrimaryMembership,
  listInvitations,
  listMembers,
  seedOrganizationDefaults,
  slugify,
};
