const { OAuth2Client } = require('google-auth-library');
const { db } = require('./database');
const { EVENT_TYPE_LABELS } = require('./eventTypes');

const TASKS_SCOPES = ['https://www.googleapis.com/auth/tasks'];
const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';

// Base partilhada + chaves legacy próprias das operational_events
const TASK_TYPE_LABELS = {
  ...EVENT_TYPE_LABELS,
  check_in:  'Check-in',
  check_out: 'Check-out',
  outro:     'Tarefa',
};

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

async function revokeTasksTokens(organizationId) {
  const token = getStoredTasksTokens(organizationId);
  const revokeToken = token?.refresh_token || token?.access_token;
  if (!revokeToken) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(revokeToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('Erro ao revogar token do Google Tasks:', err.message);
  }
}

// Apaga do Google Tasks todas as tarefas sincronizadas da organização e limpa as
// referências locais. Usado ao desligar a integração.
async function deleteAllSyncedTasks(organizationId) {
  const info = getTasksConnectionInfo(organizationId);
  if (!info.connected || !info.tasksListId) return 0;

  const auth = getAuthenticatedTasksClient(organizationId);
  const rows = db.prepare(`
    SELECT id, google_task_id FROM operational_events
    WHERE organization_id = ? AND google_task_id IS NOT NULL
  `).all(organizationId);

  let deleted = 0;
  for (const row of rows) {
    try {
      await auth.request({ url: `${TASKS_BASE}/lists/${info.tasksListId}/tasks/${row.google_task_id}`, method: 'DELETE' });
      deleted++;
    } catch (err) {
      console.error('Erro ao apagar tarefa do Google Tasks:', err.message);
    }
  }
  db.prepare(`
    UPDATE operational_events SET google_task_id = NULL, updated_at = datetime('now')
    WHERE organization_id = ?
  `).run(organizationId);
  return deleted;
}

// Sincroniza para o Google Tasks todos os eventos operacionais dos próximos 90 dias.
// Usado tanto pelo botão manual "Sincronizar agora" como pelo auto-sync ao criar/editar eventos.
async function syncOrganizationTasksToGoogleTasks(organizationId) {
  if (!getTasksConnectionInfo(organizationId).connected) {
    return { created: 0, updated: 0, errors: 0, total: 0 };
  }

  const auth = getAuthenticatedTasksClient(organizationId);
  const listId = await getOrCreateTaskList(auth, organizationId);

  const events = db.prepare(`
    SELECT e.*, a.name as accommodation_name
    FROM operational_events e
    LEFT JOIN accommodations a ON a.id = e.accommodation_id
    WHERE e.organization_id = ?
      AND e.date >= date('now', '-1 day')
      AND e.date <= date('now', '+90 days')
    ORDER BY e.date ASC, e.start_time ASC
  `).all(organizationId);

  let created = 0, updated = 0, errors = 0;

  for (const ev of events) {
    try {
      const typeLabel = TASK_TYPE_LABELS[ev.type] || ev.type;
      const title = ev.accommodation_name
        ? `[${ev.accommodation_name}] ${ev.title || typeLabel}`
        : (ev.title || typeLabel);

      const notes = [
        ev.notes || '',
        ev.responsible ? `Responsável: ${ev.responsible}` : '',
        ev.start_time  ? `Hora: ${ev.start_time}${ev.end_time ? '–' + ev.end_time : ''}` : '',
        ev.status !== 'planeado' ? `Estado: ${ev.status}` : '',
      ].filter(Boolean).join('\n');

      /* RFC 3339 — Google Tasks quer YYYY-MM-DDT00:00:00.000Z */
      const due = ev.date ? new Date(ev.date + 'T00:00:00Z').toISOString() : undefined;

      const taskBody = { title, notes, due };
      if (ev.status === 'concluido') taskBody.status = 'completed';

      if (ev.google_task_id) {
        await auth.request({
          url: `${TASKS_BASE}/lists/${listId}/tasks/${ev.google_task_id}`,
          method: 'PUT',
          data: taskBody,
        });
        updated++;
      } else {
        const { data } = await auth.request({
          url: `${TASKS_BASE}/lists/${listId}/tasks`,
          method: 'POST',
          data: taskBody,
        });
        db.prepare(`
          UPDATE operational_events SET google_task_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(data.id, ev.id);
        created++;
      }
    } catch (err) {
      console.error('Tasks sync erro (evento', ev.id, '):', err.message);
      errors++;
    }
  }

  return { created, updated, errors, total: events.length };
}

// Apaga uma única tarefa do Google Tasks (usado quando um evento é removido na app).
async function deleteSyncedTask(organizationId, googleTaskId) {
  const info = getTasksConnectionInfo(organizationId);
  if (!info.connected || !info.tasksListId || !googleTaskId) return;
  try {
    const auth = getAuthenticatedTasksClient(organizationId);
    await auth.request({ url: `${TASKS_BASE}/lists/${info.tasksListId}/tasks/${googleTaskId}`, method: 'DELETE' });
  } catch (err) {
    console.error('Erro ao apagar tarefa do Google Tasks:', err.message);
  }
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
  revokeTasksTokens,
  deleteAllSyncedTasks,
  syncOrganizationTasksToGoogleTasks,
  deleteSyncedTask,
  TASKS_SCOPES,
  TASKS_BASE,
};
