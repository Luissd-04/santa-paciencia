const { OAuth2Client } = require('google-auth-library');
const { db } = require('./database');

const TASKS_SCOPES = ['https://www.googleapis.com/auth/tasks'];

function getTasksOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_TASKS_REDIRECT_URI
  );
}

function getStoredTasksTokens(organizationId) {
  const row = db.prepare(
    'SELECT tokens FROM google_tasks_connections WHERE organization_id = ?'
  ).get(organizationId);
  if (!row?.tokens) return null;
  try { return JSON.parse(row.tokens); } catch { return null; }
}

function saveTasksTokens(organizationId, tokens, email) {
  db.prepare(`
    INSERT INTO google_tasks_connections (organization_id, email, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id)
    DO UPDATE SET tokens = excluded.tokens, email = excluded.email, updated_at = datetime('now')
  `).run(organizationId, email || null, JSON.stringify(tokens));
}

function deleteTasksTokens(organizationId) {
  db.prepare('DELETE FROM google_tasks_connections WHERE organization_id = ?').run(organizationId);
}

function isTasksAuthenticated(organizationId) {
  return !!getStoredTasksTokens(organizationId);
}

function getTasksConnectionInfo(organizationId) {
  const row = db.prepare(
    'SELECT email, tasks_list_id FROM google_tasks_connections WHERE organization_id = ?'
  ).get(organizationId);
  return row
    ? { connected: true, email: row.email, tasksListId: row.tasks_list_id }
    : { connected: false, email: null, tasksListId: null };
}

function saveTasksListId(organizationId, listId) {
  db.prepare(`
    UPDATE google_tasks_connections SET tasks_list_id = ?, updated_at = datetime('now')
    WHERE organization_id = ?
  `).run(listId, organizationId);
}

function getAuthenticatedTasksClient(organizationId) {
  const oAuth2Client = getTasksOAuth2Client();
  const tokens = getStoredTasksTokens(organizationId);
  if (!tokens) throw new Error('Google Tasks não autenticado');
  oAuth2Client.setCredentials(tokens);

  oAuth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    saveTasksTokens(organizationId, merged, null);
  });

  return oAuth2Client;
}

/* Garante que existe uma task list "Santa Paciência" e devolve o ID */
async function getOrCreateTaskList(auth, organizationId) {
  const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
  const info = getTasksConnectionInfo(organizationId);

  if (info.tasksListId) {
    try {
      await auth.request({ url: `${TASKS_BASE}/users/@me/lists/${info.tasksListId}` });
      return info.tasksListId;
    } catch { /* foi apagada — criar nova */ }
  }

  const { data } = await auth.request({
    url: `${TASKS_BASE}/users/@me/lists`,
    method: 'POST',
    data: { title: process.env.PROPERTY_NAME || 'Santa Paciência' },
  });
  saveTasksListId(organizationId, data.id);
  return data.id;
}

module.exports = {
  getTasksOAuth2Client,
  getAuthenticatedTasksClient,
  saveTasksTokens,
  deleteTasksTokens,
  isTasksAuthenticated,
  getTasksConnectionInfo,
  saveTasksListId,
  getOrCreateTaskList,
  TASKS_SCOPES,
};
