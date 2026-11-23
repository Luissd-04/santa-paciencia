// Área do proprietário (/proprietario, routes/owner.js): resumo, dados da
// empresa, marca da organização, plano, registo de atividade e pedidos à
// plataforma (mudança de plano, encerramento). A transferência de
// propriedade está em ownershipTransfer.js.
//
// Dados da empresa e marca: colunas de `organizations` (migração
// migrations-platform/owner-area.js). O email de contacto para hóspedes é a
// chave `email_contact` das definições, que os emails e o RGPD já leem.
const crypto = require('crypto');
const { db } = require('../config/database');
const { httpError } = require('./httpError');
const { recordAudit } = require('./auditLog');

const LIMITS = { name: 120, legal_name: 160, tax_id: 20, fiscal_address: 300, email: 160, phone: 40 };
const BACKUP_FRESH_MS = 24 * 3600000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const text = value => (typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim()));

// ── NIF ──
// NIF português: 9 algarismos, o primeiro identifica o tipo de contribuinte
// (0 e 4 não existem, exceto 45 — não residentes) e o último é o dígito de
// controlo (módulo 11 sobre os oito primeiros, pesos 9 a 2).
function isValidPortugueseNif(value) {
  const nif = String(value || '');
  if (!/^\d{9}$/.test(nif)) return false;
  if (nif[0] === '0' || (nif[0] === '4' && nif[1] !== '5')) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(nif[i]) * (9 - i);
  const rest = sum % 11;
  const check = rest < 2 ? 0 : 11 - rest;
  return check === Number(nif[8]);
}

// Normaliza e valida o NIF conforme o país. Vazio é permitido (por completar).
function normalizeTaxId(value, country) {
  let id = text(value).toUpperCase().replace(/[\s.-]/g, '');
  if (!id) return '';
  if (country === 'PT') {
    if (id.startsWith('PT')) id = id.slice(2);
    if (!isValidPortugueseNif(id)) throw httpError('O NIF não é válido: confirme os 9 algarismos.', 400, { field: 'tax_id' });
    return id;
  }
  if (id.length > LIMITS.tax_id || !/^[A-Z0-9]+$/.test(id)) throw httpError('O número fiscal só pode ter letras e algarismos (até 20).', 400, { field: 'tax_id' });
  return id;
}

function cleanText(value, field, label, { required = false } = {}) {
  const out = text(value);
  if (required && !out) throw httpError(`${label} é obrigatório.`, 400, { field });
  if (out.length > LIMITS[field]) throw httpError(`${label} pode ter no máximo ${LIMITS[field]} caracteres.`, 400, { field });
  if (CONTROL.test(out)) throw httpError(`${label} tem caracteres inválidos.`, 400, { field });
  return out;
}

function cleanEmail(value, field, label) {
  const out = text(value).toLowerCase();
  if (!out) return '';
  if (out.length > LIMITS.email || !require('./authService').isValidEmail(out)) throw httpError(`${label} não é um email válido.`, 400, { field });
  return out;
}

function cleanPhone(value) {
  const out = text(value);
  if (!out) return '';
  if (out.length > LIMITS.phone || !/^\+?[0-9 ()./-]{6,}$/.test(out)) throw httpError('O telefone só pode ter algarismos, espaços e + ( ) - .', 400, { field: 'phone' });
  return out;
}

function cleanCountry(value) {
  const out = text(value || 'PT').toUpperCase();
  if (!/^[A-Z]{2}$/.test(out)) throw httpError('País inválido.', 400, { field: 'tax_country' });
  return out;
}

// ── Empresa ──
function organizationRow(organizationId) {
  const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(organizationId);
  if (!row) throw httpError('Organização não encontrada.', 404);
  return row;
}

function getCompany(organizationId) {
  const row = organizationRow(organizationId);
  return {
    name: row.name || '',
    legal_name: row.legal_name || '',
    tax_country: row.tax_country || 'PT',
    tax_id: row.tax_id || '',
    fiscal_address: row.fiscal_address || '',
    billing_email: row.billing_email || '',
    phone: row.phone || '',
    guest_email: require('./settingsService').get(organizationId, 'email_contact', '') || '',
  };
}

const COMPANY_FIELDS = ['name', 'legal_name', 'tax_country', 'tax_id', 'fiscal_address', 'billing_email', 'phone'];

function validateCompany(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Pedido inválido.', 400);
  const country = cleanCountry(input.tax_country);
  return {
    name: cleanText(input.name, 'name', 'O nome comercial', { required: true }),
    legal_name: cleanText(input.legal_name, 'legal_name', 'A denominação legal'),
    tax_country: country,
    tax_id: normalizeTaxId(input.tax_id, country),
    fiscal_address: cleanText(input.fiscal_address, 'fiscal_address', 'A morada fiscal'),
    billing_email: cleanEmail(input.billing_email, 'billing_email', 'O email de faturação'),
    phone: cleanPhone(input.phone),
    guest_email: cleanEmail(input.guest_email, 'guest_email', 'O email de contacto para hóspedes'),
  };
}

function updateCompany(organizationId, input, userId) {
  const data = validateCompany(input);
  const before = getCompany(organizationId);
  const changed = Object.keys(data).filter(key => data[key] !== before[key]);
  db.transaction(() => {
    db.prepare(`UPDATE organizations SET ${COMPANY_FIELDS.map(f => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...COMPANY_FIELDS.map(f => data[f] || (f === 'tax_country' ? 'PT' : (f === 'name' ? data.name : null))), organizationId);
    require('./settingsService').set(organizationId, 'email_contact', data.guest_email);
    if (changed.length) recordAudit({ organizationId, userId, action: 'organization.company_updated', targetType: 'organization', targetId: organizationId, meta: { fields: changed } });
  })();
  if (changed.includes('name')) {
    try { require('./platformService').invalidateSnapshot(); } catch { /* a consola refaz o resumo na próxima leitura */ }
  }
  return getCompany(organizationId);
}

// ── Marca ──
const hexColor = value => (/^#[0-9a-f]{6}$/i.test(text(value)) ? text(value).toLowerCase() : '');

function logoMarkUrl(row) {
  const crops = require('./imageCrops');
  const square = crops.parse(row?.logo_square_crop);
  if (!row?.logo_url || !crops.isLocalUpload(row.logo_url) || !square) return '';
  return `${row.logo_url}?crop=mark&w=160&v=${crops.version(square)}`;
}

function getBrand(organizationId) {
  const row = organizationRow(organizationId);
  const crops = require('./imageCrops');
  return {
    logo_url: row.logo_url || null,
    logo_original_url: row.logo_original_url || null,
    logo_crop: crops.parse(row.logo_crop),
    logo_square_crop: crops.parse(row.logo_square_crop),
    logo_mark_url: logoMarkUrl(row) || null,
    brand_color: hexColor(row.brand_color) || null,
  };
}

// O que /auth/me leva da organização: a marca e os dados que entram nos
// documentos (cabeçalho dos PDF quando o alojamento não tem os seus).
function sessionOrganization(organizationId) {
  if (!organizationId) return null;
  const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(organizationId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    legal_name: row.legal_name || '',
    nif: row.tax_id || '',
    fiscal_address: row.fiscal_address || '',
    phone: row.phone || '',
    logo_url: row.logo_url || '',
    logo_mark_url: logoMarkUrl(row),
    brand_color: hexColor(row.brand_color),
  };
}

const LOGO_COLUMNS = 'logo_url = ?, logo_original_url = ?, logo_crop = ?, logo_square_crop = ?';

function replaceLogo(organizationId, userId, fields, action) {
  const before = organizationRow(organizationId);
  db.prepare(`UPDATE organizations SET ${LOGO_COLUMNS}, updated_at = datetime('now') WHERE id = ?`)
    .run(fields.logo_url, fields.logo_original_url, fields.logo_crop, fields.logo_square_crop, organizationId);
  const { removeUnreferencedImage } = require('./mediaStorage');
  for (const old of [before.logo_url, before.logo_original_url]) {
    if (old && old !== fields.logo_url && old !== fields.logo_original_url) removeUnreferencedImage(old);
  }
  if (action) recordAudit({ organizationId, userId, action, targetType: 'organization', targetId: organizationId });
  return getBrand(organizationId);
}

// Mesmo caminho do logótipo dos alojamentos: validação dos bytes, otimização
// (sharp) e ficheiro novo com nome imutável.
async function uploadLogo(organizationId, userId, dataUri) {
  const { parseImageDataUri } = require('../controllers/accommodationMediaController');
  const { optimizeLogoUpload } = require('./imageOptimizer');
  const parsed = parseImageDataUri(dataUri);
  if (!parsed) throw httpError('Formato de imagem inválido. Tipos aceites: JPEG, PNG, GIF, WebP, AVIF.', 400);
  const optimized = await optimizeLogoUpload(parsed.data, parsed.ext);
  const url = writeUpload('orglogo', optimized.data, optimized.ext);
  return replaceLogo(organizationId, userId, { logo_url: url, logo_original_url: null, logo_crop: null, logo_square_crop: null }, 'organization.logo_updated');
}

function writeUpload(prefix, data, ext) {
  const fs = require('fs');
  const path = require('path');
  const { UPLOADS_DIR } = require('./mediaStorage');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${prefix}_${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), data);
  return `/uploads/${filename}`;
}

function removeLogo(organizationId, userId) {
  return replaceLogo(organizationId, userId, { logo_url: null, logo_original_url: null, logo_crop: null, logo_square_crop: null }, 'organization.logo_removed');
}

function logoSource(organizationId) {
  const fs = require('fs');
  const { uploadPath } = require('./mediaStorage');
  const row = organizationRow(organizationId);
  const original = row.logo_original_url || row.logo_url;
  const file = uploadPath(original);
  if (!file || !fs.existsSync(file)) throw httpError('Carregue primeiro um logótipo.', 400);
  return { row, original, file };
}

async function trimLogo(organizationId) {
  const { orientedSize, trimSuggestion } = require('./imageOptimizer');
  const { file } = logoSource(organizationId);
  const size = await orientedSize(file);
  return { crop: await trimSuggestion(file), width: size.width, height: size.height };
}

// Os mesmos recortes do logótipo do alojamento: `crop` (sem margens) gera um
// ficheiro próprio a partir do original; `square` é o quadrado da barra recolhida.
async function saveLogoCrops(organizationId, userId, body = {}) {
  const crops = require('./imageCrops');
  const { orientedSize, extractToBuffer } = require('./imageOptimizer');
  const { row, original, file } = logoSource(organizationId);
  const size = await orientedSize(file);
  const crop = body.crop ? crops.validateRect(body.crop, 'logo', size.width, size.height) : null;
  const square = body.square ? crops.validateRect(body.square, 'mark', size.width, size.height) : null;
  const whole = crop && crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
  let logoUrl = original;
  if (crop && !whole) logoUrl = writeUpload('orglogo', await extractToBuffer(file, crop), 'png');
  const fields = {
    logo_url: logoUrl,
    logo_original_url: logoUrl === original ? null : original,
    logo_crop: crop && !whole ? JSON.stringify(crop) : null,
    logo_square_crop: square ? JSON.stringify(square) : null,
  };
  // O original fica (é a base dos recortes); só sai o recorte anterior.
  db.prepare(`UPDATE organizations SET ${LOGO_COLUMNS}, updated_at = datetime('now') WHERE id = ?`)
    .run(fields.logo_url, fields.logo_original_url, fields.logo_crop, fields.logo_square_crop, organizationId);
  if (row.logo_url && row.logo_url !== original && row.logo_url !== logoUrl) require('./mediaStorage').removeUnreferencedImage(row.logo_url);
  recordAudit({ organizationId, userId, action: 'organization.logo_updated', targetType: 'organization', targetId: organizationId });
  return getBrand(organizationId);
}

function setBrandColor(organizationId, userId, value) {
  const color = value === null || value === '' ? '' : hexColor(value);
  if (value && !color) throw httpError('A cor tem de estar no formato #RRGGBB.', 400, { field: 'brand_color' });
  db.prepare("UPDATE organizations SET brand_color = ?, updated_at = datetime('now') WHERE id = ?").run(color || null, organizationId);
  recordAudit({ organizationId, userId, action: 'organization.brand_color_updated', targetType: 'organization', targetId: organizationId, meta: { color: color || null } });
  return getBrand(organizationId);
}

// ── Plano ──
function parseData(json) {
  try { const v = JSON.parse(json || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

// Subscrição ativa registada à mão na consola (platform_records): só a
// periodicidade, o valor e o próximo vencimento.
function activeSubscription(organizationId) {
  const row = db.prepare("SELECT id, data_json FROM platform_records WHERE kind = 'subscription' AND status = 'active' AND organization_id = ?").get(organizationId);
  if (!row) return null;
  const data = parseData(row.data_json);
  return {
    billing: ['monthly', 'yearly'].includes(data.billing) ? data.billing : null,
    amount_cents: Number.isInteger(data.amount_cents) ? data.amount_cents : null,
    next_date: /^\d{4}-\d{2}-\d{2}$/.test(data.next_date || '') ? data.next_date : null,
  };
}

function plans(organizationId) {
  const current = db.prepare('SELECT plan_id FROM organizations WHERE id = ?').get(organizationId)?.plan_id || null;
  const list = db.prepare('SELECT * FROM plans ORDER BY sort, name COLLATE NOCASE').all().map(p => ({
    id: p.id, name: p.name, max_accommodations: p.max_accommodations, max_members: p.max_members,
    features: parseData(p.features_json), current: p.id === current,
  }));
  return { current_plan_id: current, plans: list, subscription: activeSubscription(organizationId), request: openRequest(organizationId, 'plan_change') };
}

// Faturas/pagamentos da subscrição: movimentos de recebimento desta
// organização registados na consola, com valor e data. Só leitura e só os
// campos mínimos (nada das notas internas da plataforma).
function invoices(organizationId) {
  const rows = db.prepare(`SELECT e.id, e.status, e.data_json, s.kind AS related_kind FROM platform_records e
    LEFT JOIN platform_records s ON s.id = e.related_id
    WHERE e.kind = 'entry' AND e.organization_id = ? AND e.status IN ('pending', 'paid')
    ORDER BY e.created_at DESC LIMIT 200`).all(organizationId);
  return rows.map(row => ({ row, data: parseData(row.data_json) }))
    .filter(({ row, data }) => data.direction === 'income' && Number.isInteger(data.amount_cents) && /^\d{4}-\d{2}-\d{2}$/.test(data.date || '')
      && (!row.related_kind || row.related_kind === 'subscription'))
    .map(({ row, data }) => ({ id: row.id, date: data.date, amount_cents: data.amount_cents, status: row.status,
      paid_date: /^\d{4}-\d{2}-\d{2}$/.test(data.paid_date || '') ? data.paid_date : null }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── Pedidos à plataforma (um aberto de cada tipo) ──
function openRequest(organizationId, kind) {
  const row = db.prepare(`SELECT r.id, r.kind, r.plan_id, r.created_at, t.id AS ticket_id, t.org_number, t.number, t.status, p.name AS plan_name
    FROM owner_requests r JOIN support_tickets t ON t.id = r.ticket_id LEFT JOIN plans p ON p.id = r.plan_id
    WHERE r.organization_id = ? AND r.kind = ? AND t.status != 'resolved'
    ORDER BY r.created_at DESC LIMIT 1`).get(organizationId, kind);
  if (!row) return null;
  return { id: row.id, kind: row.kind, plan_id: row.plan_id, plan_name: row.plan_name || null, created_at: row.created_at,
    ticket: { id: row.ticket_id, number: `SP-${String(row.org_number ?? row.number).padStart(4, '0')}`, status: row.status } };
}

function createRequest(user, kind, { subject, body, planId = null, meta = {} }) {
  if (openRequest(user.organization_id, kind)) {
    throw httpError(kind === 'plan_change' ? 'Já há um pedido de mudança de plano em aberto.' : 'Já há um pedido de encerramento em aberto.', 409);
  }
  const ticket = require('./supportService').create(user, { type: 'question', subject, body, context: { page: 'proprietario' } }, { userAgent: meta.userAgent || '' });
  db.prepare('INSERT INTO owner_requests (id, organization_id, kind, ticket_id, plan_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), user.organization_id, kind, ticket.id, planId, user.id);
  return { request: openRequest(user.organization_id, kind), ticket };
}

const planLimits = p => [
  p.max_accommodations == null ? 'alojamentos sem limite' : `até ${p.max_accommodations} alojamentos`,
  p.max_members == null ? 'equipa sem limite' : `até ${p.max_members} pessoas na equipa`,
].join(' · ');

function requestPlanChange(user, input = {}, meta = {}) {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(text(input.plan_id));
  if (!plan) throw httpError('Escolha um dos planos.', 400);
  const current = db.prepare('SELECT p.* FROM organizations o LEFT JOIN plans p ON p.id = o.plan_id WHERE o.id = ?').get(user.organization_id);
  if (current?.id === plan.id) throw httpError('Esse já é o plano atual.', 400);
  const note = text(input.note);
  if (note.length > 1000) throw httpError('A nota pode ter no máximo 1000 caracteres.', 400);
  const usage = require('./plansService').usage(user.organization_id);
  const body = [
    `Pedido de mudança de plano feito na Área do proprietário por ${user.name || user.email}.`,
    `Plano atual: ${current?.name || 'sem plano atribuído'}.`,
    `Plano pedido: ${plan.name} (${planLimits(plan)}).`,
    `Uso atual: ${usage.accommodations} alojamentos · ${usage.members} pessoas na equipa.`,
    note ? `\nNota do proprietário:\n${note}` : '',
  ].filter(Boolean).join('\n');
  const result = createRequest(user, 'plan_change', { subject: `Mudança de plano: ${plan.name}`, body, planId: plan.id, meta });
  recordAudit({ organizationId: user.organization_id, userId: user.id, action: 'organization.plan_change_requested', targetType: 'plan', targetId: plan.id,
    meta: { from: current?.name || null, to: plan.name } });
  return result;
}

// ── Cópias de segurança ──
function lastBackupAt(organizationId) {
  return db.prepare("SELECT MAX(created_at) AS at FROM audit_events WHERE organization_id = ? AND action = 'backup.exported'").get(organizationId)?.at || null;
}

function backupIsFresh(organizationId, now = Date.now()) {
  const at = lastBackupAt(organizationId);
  return Boolean(at && now - Date.parse(at) <= BACKUP_FRESH_MS);
}

// Encerramento: nada é apagado aqui; o pedido segue para a plataforma. Exige
// uma cópia descarregada nas últimas 24 h ou a confirmação explícita de que a
// pessoa não a quer.
function requestClosure(user, input = {}, meta = {}) {
  const fresh = backupIsFresh(user.organization_id);
  const confirmed = input.confirm_without_backup === true;
  if (!fresh && !confirmed) {
    throw httpError('Descarregue primeiro a cópia de segurança completa (ou confirme que não a quer).', 409, { code: 'backup_required' });
  }
  const reason = text(input.reason);
  if (reason.length > 2000) throw httpError('O motivo pode ter no máximo 2000 caracteres.', 400);
  const org = organizationRow(user.organization_id);
  const body = [
    `Pedido de encerramento da conta «${org.name}» feito na Área do proprietário por ${user.name || user.email}.`,
    fresh ? `Cópia de segurança descarregada a ${lastBackupAt(user.organization_id)}.` : 'O proprietário confirmou que não quer descarregar a cópia de segurança.',
    'Nada foi apagado automaticamente.',
    reason ? `\nMotivo:\n${reason}` : '',
  ].filter(Boolean).join('\n');
  const result = createRequest(user, 'closure', { subject: 'Pedido de encerramento da conta', body, meta });
  recordAudit({ organizationId: user.organization_id, userId: user.id, action: 'organization.closure_requested', targetType: 'organization', targetId: user.organization_id,
    meta: { backup: fresh } });
  return result;
}

// ── Resumo ──
function summary(organizationId) {
  const plansService = require('./plansService');
  const plan = plansService.organizationPlan(organizationId);
  const usage = plan?.usage || plansService.usage(organizationId);
  const company = getCompany(organizationId);
  const brand = getBrand(organizationId);
  const todo = [];
  if (!company.tax_id) todo.push({ key: 'tax_id', section: 'empresa', text: 'Falta o NIF da empresa — aparece nos documentos e nas condições.', action: 'Completar' });
  if (!company.legal_name) todo.push({ key: 'legal_name', section: 'empresa', text: 'Falta a denominação legal da empresa.', action: 'Completar' });
  if (!company.fiscal_address) todo.push({ key: 'fiscal_address', section: 'empresa', text: 'Falta a morada fiscal.', action: 'Completar' });
  if (!company.guest_email) todo.push({ key: 'guest_email', section: 'empresa', text: 'Sem email de contacto para hóspedes — os emails saem sem ele quando o alojamento não tem o seu.', action: 'Completar' });
  if (!brand.logo_url) todo.push({ key: 'logo', section: 'marca', text: 'Sem logótipo da organização — a barra lateral usa o do alojamento principal.', action: 'Carregar' });
  for (const cover of require('./imageSizes').smallCovers(organizationId)) {
    todo.push({ key: 'cover:' + cover.id, section: 'alojamentos', accommodation_id: cover.id,
      text: `A capa de ${cover.name} tem só ${cover.width} px e aparece desfocada.`, action: 'Ver fotografias' });
  }
  const last = lastBackupAt(organizationId);
  if (!last) todo.push({ key: 'backup', section: 'dados', text: 'Ainda não descarregou nenhuma cópia de segurança completa.', action: 'Descarregar' });
  return {
    organization: { name: company.name },
    plan: plan ? { name: plan.name, max_accommodations: plan.max_accommodations, max_members: plan.max_members } : null,
    subscription: activeSubscription(organizationId),
    usage,
    last_backup_at: last,
    todo,
    transfer: require('./ownershipTransfer').pendingForOrganization(organizationId),
    requests: { plan_change: openRequest(organizationId, 'plan_change'), closure: openRequest(organizationId, 'closure') },
  };
}

module.exports = {
  isValidPortugueseNif, normalizeTaxId, getCompany, updateCompany, validateCompany,
  getBrand, sessionOrganization, uploadLogo, removeLogo, trimLogo, saveLogoCrops, setBrandColor, logoMarkUrl,
  plans, invoices, requestPlanChange, requestClosure, openRequest, lastBackupAt, backupIsFresh, summary,
  BACKUP_FRESH_MS,
};
