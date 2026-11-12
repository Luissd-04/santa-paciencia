// Revisão de segurança (A12): um cabeçalho Date inválido numa mensagem do Gmail
// já não deita abaixo o pedido da conversa. Testa a função de conversão.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
const { db } = require('../config/database');
const { mapGmailMessage, toIsoDate } = require('../routes/emailMessages');
after(() => db.close());

const message = (date, internalDate) => ({
  id: 'm1', threadId: 't1', snippet: 's', internalDate,
  payload: { mimeType: 'text/plain', body: { data: Buffer.from('olá').toString('base64') }, headers: [
    { name: 'From', value: 'Casa <casa@example.invalid>' }, { name: 'To', value: 'h@example.invalid' },
    ...(date === undefined ? [] : [{ name: 'Date', value: date }]),
  ] },
});

test('Date válido é normalizado para ISO', () => {
  const m = mapGmailMessage(message('Tue, 03 Nov 2026 10:00:00 +0000', '0'), 'casa@example.invalid');
  assert.equal(m.date, '2026-11-03T10:00:00.000Z');
  assert.equal(m.direction, 'sent');
});

test('Date inválido recorre ao internalDate do Gmail, sem lançar RangeError', () => {
  const internal = String(Date.UTC(2026, 10, 4, 8, 30));
  const m = mapGmailMessage(message('isto não é uma data', internal), 'outro@example.invalid');
  assert.equal(m.date, '2026-11-04T08:30:00.000Z');
  assert.equal(m.direction, 'received');
});

test('sem Date nem internalDate válidos a data é null', () => {
  assert.equal(mapGmailMessage(message('lixo', 'também lixo'), 'x').date, null);
  assert.equal(mapGmailMessage(message(undefined, undefined), 'x').date, null);
  assert.equal(toIsoDate(NaN), null);
});
