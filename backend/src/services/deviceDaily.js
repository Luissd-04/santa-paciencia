// Contagem diária e durável de sessões por browser, sistema, dispositivo e
// modo de apresentação (platform_device_daily). Conta uma vez por sessão e por
// dia, ao criar a sessão ou na primeira vez que é vista nesse dia. Só grava
// grandes grupos (parseUserAgent): nunca o user agent, o IP ou a pessoa.
const { db } = require('../config/database');
const { localDay } = require('./dates');
const { parseUserAgent } = require('./userAgent');

const MODES = new Set(['standalone', 'browser']);
const modeOf = mode => (MODES.has(mode) ? mode : 'unknown');

function bump(organizationId, userAgent, mode, delta, day = localDay()) {
  const ua = parseUserAgent(userAgent);
  const key = [organizationId, day, ua.browser, ua.os, ua.device, modeOf(mode)];
  if (delta < 0) {
    db.prepare(`UPDATE platform_device_daily SET sessions = MAX(0, sessions + ?) WHERE organization_id = ? AND day = ?
      AND browser = ? AND os = ? AND device = ? AND display_mode = ?`).run(delta, ...key);
    return;
  }
  db.prepare(`INSERT INTO platform_device_daily (organization_id, day, browser, os, device, display_mode, sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, day, browser, os, device, display_mode) DO UPDATE SET sessions = sessions + excluded.sessions`)
    .run(...key, delta);
}

function recordSession({ organizationId, userAgent, displayMode, day }) {
  if (organizationId) bump(organizationId, userAgent, displayMode, 1, day);
}

// A consola só diz o modo depois de a sessão começar: passa a contagem de hoje
// do modo anterior (normalmente «desconhecido») para o novo.
function changeMode({ organizationId, userAgent, from, to }) {
  if (!organizationId || modeOf(from) === modeOf(to)) return;
  bump(organizationId, userAgent, from, -1);
  bump(organizationId, userAgent, to, 1);
}

// Dia local de um carimbo do SQLite («AAAA-MM-DD HH:MM:SS», UTC) ou ISO.
function dayOfStamp(stamp) {
  if (!stamp) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp);
  return Number.isNaN(date.getTime()) ? null : localDay(date);
}

module.exports = { recordSession, changeMode, dayOfStamp };
