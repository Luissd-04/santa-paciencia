const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { db } = require('../config/database');
const { deleteEmailTokens } = require('../config/googleEmail');

module.exports = function registerEmailMessages(router) {
// ── EMAIL: conversas paginadas (vista Mensagens) ──
// Substitui o carregamento de TODAS as reservas e TODOS os hóspedes no
// cliente: o cruzamento reserva↔hóspede↔última mensagem passou para o
// servidor e só volta a página pedida.
router.get('/email/threads', requireAuth, requireRole('manager'), (req, res, next) => {
  try {
    const { listMessageThreads } = require('../services/listQueries');
    res.json({ success: true, ...listMessageThreads(req.user.organization_id, req.query) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// ── EMAIL: dados do hóspede/reserva ativa para um destinatário (Mensagens) ──
router.get('/email/lookup', requireAuth, requireRole('manager'), (req, res) => {
  const to_email = String(req.query.to_email || '').trim();
  if (!to_email) return res.status(400).json({ success: false, error: 'to_email é obrigatório.' });
  const { findGuestEmailContext } = require('../services/emailService');
  const context = findGuestEmailContext(req.user.organization_id, to_email);
  res.json({ success: true, data: context });
});

// ── EMAIL: envio avulso (Invoice / Conversas) ──
router.post('/email/send', requireAuth, requireRole('manager'), async (req, res) => {
  const { to, subject, html, to_name, reservation_id, thread_id, in_reply_to_message_id, references } = req.body || {};
  if (!to || !subject || !html) {
    return res.status(400).json({ success: false, error: 'to, subject e html são obrigatórios.' });
  }
  try {
    const { sendMail, renderManualEmail, resolveAccommodationInheritance, findGuestEmailContext } = require('../services/emailService');
    const orgId = req.user.organization_id;

    let context = findGuestEmailContext(orgId, to);
    if (reservation_id) {
      const reservation = db.prepare('SELECT * FROM reservations WHERE id = ? AND organization_id = ?').get(reservation_id, orgId);
      if (reservation) {
        const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND organization_id = ?').get(reservation.guest_id, orgId);
        const accom = db.prepare('SELECT * FROM accommodations WHERE id = ? AND organization_id = ?').get(reservation.accommodation_id, orgId);
        if (guest && accom) {
          context = {
            guest,
            reservation,
            accommodation: resolveAccommodationInheritance(accom, orgId),
            vars: {},
          };
        }
      }
    }
    const rendered = renderManualEmail({ organizationId: orgId, subject, body: html, context });
    // Depois da composição, qualquer marcador restante é realmente um dado
    // desconhecido/em falta e nunca pode seguir para o hóspede.
    if (/\{\{\s*\w+\s*\}\}/.test(rendered.subject) || /\{\{\s*\w+\s*\}\}/.test(rendered.html)) {
      return res.status(400).json({ success: false, error: 'A mensagem tem campos por preencher (ex.: {{primeiro_nome}}) — confirma os dados antes de enviar.' });
    }

    // thread_id/in_reply_to_message_id só chegam quando o utilizador clicou
    // explicitamente em "responder" a uma mensagem específica — por defeito
    // (nenhum dos dois presente) é sempre uma mensagem nova e solta.
    const sendResult = await sendMail(orgId, {
      to, subject: rendered.subject, html: rendered.html,
      threadId: thread_id || undefined,
      inReplyTo: in_reply_to_message_id || undefined,
      references: references || undefined,
    });

    const { randomUUID } = require('crypto');
    db.prepare(`
      INSERT INTO invoice_messages
        (id, organization_id, to_email, to_name, subject, body_html, reservation_id, sent_by_user_id,
         gmail_message_id, gmail_thread_id, message_id_header, in_reply_to_message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      orgId,
      to,
      to_name || null,
      rendered.subject,
      rendered.html,
      reservation_id || null,
      req.user.id,
      sendResult?.id || null,
      sendResult?.threadId || null,
      sendResult?.messageIdHeader || null,
      in_reply_to_message_id || null
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar email avulso:', { type: err.name, status: err.status || err.response?.status });
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('Login Required')
      || errMsg.includes('invalid_grant')
      || errMsg.includes('Token has been expired')
      || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant'
      || err.status === 401 || err.code === 401;
    if (isAuthError) {
      deleteEmailTokens(req.user.organization_id);
      return res.status(401).json({
        success: false,
        needs_reauth: true,
        error: 'A ligação ao Gmail expirou. Vai a Definições → Gmail e volta a ligar a conta.',
      });
    }
    res.status(500).json({ success: false, error: 'Não foi possível concluir a operação no Gmail.' });
  }
});

router.get('/email/inbox', requireAuth, requireRole('manager'), async (req, res) => {
  const { to_email, max = 25, page_token } = req.query;
  if (!to_email) return res.status(400).json({ success: false, error: 'to_email é obrigatório.' });

  const { getAuthenticatedEmailClient, getEmailConnectionInfo } = require('../config/googleEmail');
  const info = getEmailConnectionInfo(req.user.organization_id);
  if (!info.connected) return res.json({ success: true, data: { messages: [], needs_reauth: false } });

  try {
    const auth = getAuthenticatedEmailClient(req.user.organization_id);

    /* Pesquisar mensagens to/from este email */
    const q = `from:${to_email} OR to:${to_email}`;
    const listRes = await auth.request({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      params: { q, maxResults: Number(max) || 25, pageToken: page_token || undefined },
    });

    const msgIds = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    if (!msgIds.length) return res.json({ success: true, data: { messages: [], next_page_token: nextPageToken } });

    /* Buscar cada mensagem em paralelo (batch de 10 para não sobrecarregar) */
    const fetchBatch = async (ids) => Promise.all(
      ids.map(({ id }) =>
        auth.request({
          url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
          params: { format: 'full' },
        }).then(r => r.data).catch(() => null)
      )
    );

    const batchSize = 10;
    const rawMessages = [];
    for (let i = 0; i < msgIds.length; i += batchSize) {
      const batch = await fetchBatch(msgIds.slice(i, i + batchSize));
      rawMessages.push(...batch.filter(Boolean));
    }

    const myEmail = (info.email || '').toLowerCase();

    const messages = rawMessages.map(msg => {
      const headers = {};
      (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      const from            = headers['from']       || '';
      const to              = headers['to']         || '';
      const subject         = headers['subject']    || '(sem assunto)';
      const dateStr         = headers['date']       || '';
      const messageIdHeader = headers['message-id'] || null;
      const date    = dateStr ? new Date(dateStr).toISOString() : new Date(msg.internalDate ? Number(msg.internalDate) : Date.now()).toISOString();

      const fromEmail = (from.match(/<([^>]+)>/) || [])[1] || from;
      const direction = fromEmail.toLowerCase() === myEmail ? 'sent' : 'received';

      const body = extractBody(msg.payload);
      const attachments = extractAttachments(msg.payload);

      return {
        id: msg.id, threadId: msg.threadId, from, to, subject, date, direction, body,
        snippet: msg.snippet || '', messageIdHeader, attachments,
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, data: { messages, next_page_token: nextPageToken } });
  } catch (err) {
    const errMsg = err.message || '';
    const errData = err.response?.data?.error || '';
    const isAuthError = errMsg.includes('invalid_grant') || errMsg.includes('Login Required')
      || errMsg.includes('Token has been expired') || errMsg.includes('Invalid Credentials')
      || errData === 'invalid_grant' || err.status === 401 || err.code === 401;
    if (isAuthError) deleteEmailTokens(req.user.organization_id);
    const needs_reauth = isAuthError || errMsg.includes('insufficient') || err.code === 403;
    console.error('Gmail inbox error:', { type: err.name, status: err.status || err.response?.status });
    res.json({ success: true, data: { messages: [], needs_reauth, error: 'Não foi possível carregar as mensagens do Gmail.' } });
  }
});

/* Extrai o body HTML ou texto de um payload MIME (recursivo) */
function extractBody(payload) {
  if (!payload) return '';

  const decodeB64 = (data) => {
    if (!data) return '';
    try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); } catch { return ''; }
  };

  /* Preferir text/html, fallback text/plain */
  if (payload.mimeType === 'text/html')  return decodeB64(payload.body?.data);
  if (payload.mimeType === 'text/plain') return decodeB64(payload.body?.data).replace(/\n/g, '<br>');

  if (payload.parts) {
    let html = '', plain = '';
    for (const part of payload.parts) {
      const content = extractBody(part);
      if (part.mimeType === 'text/html' || part.mimeType?.startsWith('multipart/')) html = html || content;
      else if (part.mimeType === 'text/plain') plain = plain || content;
    }
    return html || plain;
  }

  return decodeB64(payload.body?.data);
}

/* Percorre o payload MIME (recursivo) e recolhe os anexos reais (com attachmentId) */
function extractAttachments(payload, out = []) {
  if (!payload) return out;
  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      size: payload.body.size || 0,
      attachmentId: payload.body.attachmentId,
    });
  }
  (payload.parts || []).forEach(p => extractAttachments(p, out));
  return out;
}

/* Download/preview de um anexo de uma mensagem Gmail (referenciado no histórico) */
router.get('/email/attachment', requireAuth, requireRole('manager'), async (req, res) => {
  const { message_id, attachment_id, filename } = req.query;
  if (!message_id || !attachment_id) {
    return res.status(400).json({ success: false, error: 'message_id e attachment_id são obrigatórios.' });
  }
  try {
    const { getAuthenticatedEmailClient } = require('../config/googleEmail');
    const auth = getAuthenticatedEmailClient(req.user.organization_id);
    const r = await auth.request({
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message_id)}/attachments/${encodeURIComponent(attachment_id)}`,
    });
    const buf = Buffer.from(String(r.data.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const safeName = String(filename || 'anexo').replace(/[\r\n"]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Não foi possível concluir a operação no Gmail.' });
  }
});

router.get('/email/messages', requireAuth, requireRole('manager'), (req, res) => {
  const { to_email, reservation_id, limit = 200, before } = req.query;
  let query = `
    SELECT m.*, u.name as sent_by_name
    FROM invoice_messages m
    LEFT JOIN users u ON u.id = m.sent_by_user_id
    WHERE m.organization_id = ?
  `;
  const params = [req.user.organization_id];
  if (to_email)       { query += ' AND m.to_email = ?';       params.push(to_email); }
  if (reservation_id) { query += ' AND m.reservation_id = ?'; params.push(reservation_id); }
  if (before)          { query += ' AND m.sent_at < ?';        params.push(before); }
  const lim = Math.min(Number(limit) || 200, 500);
  query += ` ORDER BY m.sent_at DESC LIMIT ${lim}`;
  const rows = db.prepare(query).all(...params);
  const messages = rows.map(m => ({
    ...m,
    // SQLite guarda datetime('now') em UTC mas sem indicação de fuso
    // ("2026-09-11 12:28:00") — sem o "Z", o browser lê isto como hora local
    // e desloca a hora mostrada. Normalizar para ISO 8601 UTC explícito.
    sent_at: m.sent_at ? m.sent_at.replace(' ', 'T') + 'Z' : m.sent_at,
  }));
  const next_cursor = rows.length === lim ? rows[rows.length - 1].sent_at : null;
  res.json({ success: true, data: { messages, next_cursor } });
});

// Apaga só a nossa cópia local (invoice_messages) de uma conversa arquivada —
// o correio real fica no Gmail e continua a aparecer via /email/inbox; isto
// só limpa o histórico que a app guardou das mensagens que ENVIÁMOS.
router.delete('/email/messages', requireAuth, requireRole('manager'), (req, res) => {
  const { to_email, reservation_id } = req.query;
  if (!to_email) return res.status(400).json({ success: false, error: 'to_email é obrigatório.' });
  let query = 'DELETE FROM invoice_messages WHERE organization_id = ? AND to_email = ?';
  const params = [req.user.organization_id, to_email];
  if (reservation_id) { query += ' AND reservation_id = ?'; params.push(reservation_id); }
  const result = db.prepare(query).run(...params);
  res.json({ success: true, deleted: result.changes });
});

// ── CONVERSATION ARCHIVES ──
router.get('/email/archives', requireAuth, requireRole('manager'), (req, res) => {
  const rows = db.prepare('SELECT thread_key, key_type FROM conversation_archives WHERE organization_id = ?')
    .all(req.user.organization_id);
  res.json({ success: true, data: rows });
});

router.post('/email/archives', requireAuth, requireRole('manager'), (req, res) => {
  const { thread_key, key_type = 'reservation' } = req.body || {};
  if (!thread_key) return res.status(400).json({ error: 'thread_key obrigatório' });
  const { randomUUID } = require('crypto');
  db.prepare(`INSERT OR REPLACE INTO conversation_archives (id, organization_id, thread_key, key_type)
    VALUES (?, ?, ?, ?)`).run(randomUUID(), req.user.organization_id, thread_key, key_type);
  res.json({ success: true });
});

router.delete('/email/archives/:thread_key', requireAuth, requireRole('manager'), (req, res) => {
  db.prepare('DELETE FROM conversation_archives WHERE organization_id = ? AND thread_key = ?')
    .run(req.user.organization_id, req.params.thread_key);
  res.json({ success: true });
});

};
