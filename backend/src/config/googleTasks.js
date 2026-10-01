const { fetchWithTimeout } = require('../services/httpClient');
const { OAuth2Client } = require('google-auth-library');
const { db } = require('./database');
const { encodeTokens, decodeTokens } = require('./tokenStorage');
const { taskPayload, remotePayload } = require('./googleTaskMapping');

const TASKS_SCOPES = ['https://www.googleapis.com/auth/tasks'];
const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';

function getTasksOAuth2Client() {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_TASKS_REDIRECT_URI,
    transporterOptions: { timeout: 30000 },
  });
}

function getStoredTasksTokens(organizationId) {
  const row = db.prepare(
    'SELECT tokens FROM google_tasks_connections WHERE organization_id = ?'
  ).get(organizationId);
  if (!row?.tokens) return null;
  return decodeTokens(row.tokens, `tasks:${organizationId}`);
}

function saveTasksTokens(organizationId, tokens, email) {
  db.prepare(`
    INSERT INTO google_tasks_connections (organization_id, email, tokens, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(organization_id)
    DO UPDATE SET tokens = excluded.tokens, email = excluded.email, updated_at = datetime('now')
  `).run(organizationId, email || null, encodeTokens(tokens, `tasks:${organizationId}`));
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
    saveTasksTokens(organizationId, merged, getTasksConnectionInfo(organizationId).email);
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
    } catch (err) {
      if (![404, 410].includes(googleErrorStatus(err))) throw err;
    }
  }

  const { data } = await auth.request({
    url: `${TASKS_BASE}/users/@me/lists`,
    method: 'POST',
    data: { title: process.env.PROPERTY_NAME || 'Santa Paciência' },
  });
  db.transaction(() => {
    saveTasksListId(organizationId, data.id);
    // IDs da lista anterior nunca devem ser interpretados como eliminações na nova.
    db.prepare('UPDATE operational_events SET google_task_id = NULL WHERE organization_id = ?').run(organizationId);
    db.prepare('DELETE FROM google_task_sync_state WHERE organization_id = ?').run(organizationId);
    db.prepare('DELETE FROM google_task_cleanup_queue WHERE organization_id = ?').run(organizationId);
  })();
  return data.id;
}

async function revokeTasksTokens(organizationId) {
  const token = getStoredTasksTokens(organizationId);
  const revokeToken = token?.refresh_token || token?.access_token;
  if (!revokeToken) return;
  try {
    await fetchWithTimeout('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(revokeToken), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('Erro ao revogar token do Google Tasks:', err.message);
  }
}

// As operações remotas de uma organização são sequenciais. Uma segunda passagem
// lê a BD depois da primeira, incluindo alterações feitas enquanto a API respondia.
const taskRuns = new Map();
function withTaskLock(organizationId, operation) {
  const previous = taskRuns.get(organizationId) || Promise.resolve();
  const run = previous.catch(() => {}).then(operation);
  taskRuns.set(organizationId, run);
  return run.finally(() => {
    if (taskRuns.get(organizationId) === run) taskRuns.delete(organizationId);
  });
}

// Só esquecer referências depois de confirmar a eliminação remota. Em caso de
// falha, conservar a ligação e permitir repetir antes de desligar a integração.
async function clearSyncedTasks(organizationId) {
  db.transaction(() => {
    const rows = db.prepare(`SELECT google_task_id FROM operational_events
      WHERE organization_id = ? AND google_task_id IS NOT NULL`).all(organizationId);
    for (const row of rows) queueSyncedTaskDeletion(organizationId, row.google_task_id);
  })();
  const result = await processQueuedTaskDeletions(organizationId);
  if (result.pending) throw new Error(`${result.pending} tarefa(s) aguardam eliminação. Tenta novamente antes de desligar.`);
  return result.deleted;
}

function deleteAllSyncedTasks(organizationId) {
  return withTaskLock(organizationId, () => clearSyncedTasks(organizationId));
}

function disconnectTasks(organizationId) {
  return withTaskLock(organizationId, async () => {
    db.prepare(`INSERT INTO organization_settings (organization_id, key, value)
      VALUES (?, 'gcal_sync_tasks', '0') ON CONFLICT(organization_id, key) DO UPDATE SET value = '0'`).run(organizationId);
    const removed = await clearSyncedTasks(organizationId);
    await revokeTasksTokens(organizationId);
    deleteTasksTokens(organizationId);
    return removed;
  });
}

// Inclui eventos passados e distantes: mover uma tarefa para fora de uma janela
// de datas nunca pode deixar a cópia remota na data/estado anterior.
function syncOrganizationTasksToGoogleTasks(organizationId) {
  return withTaskLock(organizationId, () => runOrganizationTaskSync(organizationId));
}

function suppressAutoTask(ev) {
  if (ev.auto_generated && ev.auto_key && ev.reservation_id) {
    db.prepare(`INSERT OR IGNORE INTO auto_task_suppressions (organization_id, reservation_id, auto_key)
      VALUES (?, ?, ?)`).run(ev.organization_id, ev.reservation_id, ev.auto_key);
  }
}

// Comparação por campo: mudanças independentes fundem-se; num conflito no mesmo
// campo, a edição local ainda não enviada prevalece. Não dependemos dos relógios.
function applyRemoteChanges(ev, remote, state) {
  const current = remotePayload(taskPayload(ev));
  const previousLocal = state ? JSON.parse(state.local_payload) : current;
  const previousRemote = state ? JSON.parse(state.remote_payload) : current;
  const accepts = key => current[key] === previousLocal[key] && remote[key] !== previousRemote[key];
  const next = { ...ev };
  if (accepts('status')) {
    next.status = remote.status === 'completed' ? 'concluido' : 'planeado';
    next.completed_at = next.status === 'concluido' ? (remote.completed || new Date().toISOString()) : null;
  }
  if (accepts('title') && remote.title.trim()) {
    const prefix = ev.accommodation_name ? `[${ev.accommodation_name}] ` : '';
    next.title = prefix && remote.title.startsWith(prefix) ? remote.title.slice(prefix.length) : remote.title;
  }
  if (accepts('due') && /^\d{4}-\d{2}-\d{2}$/.test(remote.due)) next.date = remote.due;
  if (accepts('notes')) {
    next.notes = remote.notes.split('--- Santa Paciência ---')[0].trim() || null;
    // A primeira passagem pode encontrar o formato antigo, sem separador.
    if (!remote.notes.includes('--- Santa Paciência ---') && (!state || !previousRemote.notes.includes('--- Santa Paciência ---'))) {
      next.notes = remote.notes.split('\n').filter(line =>
        !line.startsWith('Responsável: ') && !line.startsWith('Hora: ') && !line.startsWith('Estado: ')
      ).join('\n').trim() || null;
    }
  }
  const changed = ['status', 'completed_at', 'title', 'date', 'notes'].some(key => next[key] !== ev[key]);
  if (changed) db.prepare(`UPDATE operational_events SET status = ?, completed_at = ?,
    title = ?, date = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND organization_id = ?`)
    .run(next.status, next.completed_at, next.title, next.date, next.notes, ev.id, ev.organization_id);
  return { event: next, changed };
}

async function listRemoteTasks(auth, listId) {
  const tasks = new Map();
  let pageToken = '';
  do {
    const query = new URLSearchParams({ maxResults: '100', showCompleted: 'true', showHidden: 'true', showDeleted: 'true' });
    if (pageToken) query.set('pageToken', pageToken);
    const { data } = await auth.request({ url: `${TASKS_BASE}/lists/${listId}/tasks?${query}` });
    for (const task of data.items || []) tasks.set(task.id, task);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return tasks;
}

function saveSyncState(ev, listId, localPayload, remote) {
  db.prepare(`INSERT INTO google_task_sync_state
    (event_id, organization_id, google_task_id, tasks_list_id, local_payload, remote_payload)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET
    google_task_id = excluded.google_task_id, tasks_list_id = excluded.tasks_list_id,
    local_payload = excluded.local_payload, remote_payload = excluded.remote_payload`)
    .run(ev.id, ev.organization_id, ev.google_task_id, listId, JSON.stringify(localPayload), JSON.stringify(remotePayload(remote)));
}

async function runOrganizationTaskSync(organizationId) {
  if (!getTasksConnectionInfo(organizationId).connected) {
    return { created: 0, updated: 0, imported: 0, deleted: 0, errors: 0, total: 0 };
  }
  const cleanup = await processQueuedTaskDeletions(organizationId);
  const auth = getAuthenticatedTasksClient(organizationId);
  const listId = await getOrCreateTaskList(auth, organizationId);
  const remoteTasks = await listRemoteTasks(auth, listId);
  const readEvent = db.prepare(`SELECT e.*, a.name AS accommodation_name
    FROM operational_events e LEFT JOIN accommodations a ON a.id = e.accommodation_id
      AND a.organization_id = e.organization_id
    WHERE e.organization_id = ? AND e.id = ?`);
  const events = db.prepare(`SELECT id FROM operational_events
    WHERE organization_id = ? ORDER BY date, start_time`).all(organizationId);
  let created = 0, updated = 0, imported = 0, deleted = 0, errors = cleanup.errors;
  for (const { id } of events) {
    let ev = readEvent.get(organizationId, id);
    if (!ev) continue;
    try {
      if (ev.google_task_id && db.prepare(`SELECT 1 FROM google_task_cleanup_queue
        WHERE organization_id = ? AND google_task_id = ?`).get(organizationId, ev.google_task_id)) continue;
      // Recuperar um POST que chegou ao Google mas cuja resposta se perdeu.
      // O marcador identifica apenas tarefas criadas pela aplicação.
      if (!ev.google_task_id) {
        const matches = [...remoteTasks.values()].filter(task => !task.deleted &&
          (task.notes || '').split('\n').includes(`Evento da aplicação: ${id}`));
        if (matches.length === 1 && !db.prepare(`SELECT 1 FROM google_task_cleanup_queue
          WHERE organization_id = ? AND google_task_id = ?`).get(organizationId, matches[0].id)) {
          ev.google_task_id = matches[0].id;
          db.prepare('UPDATE operational_events SET google_task_id = ? WHERE id = ? AND organization_id = ?')
            .run(ev.google_task_id, id, organizationId);
        }
      }
      let remote = remoteTasks.get(ev.google_task_id);
      let state = db.prepare(`SELECT * FROM google_task_sync_state WHERE event_id = ? AND organization_id = ?`)
        .get(id, organizationId);
      if (state && ((state.google_task_id && state.google_task_id !== ev.google_task_id) || state.tasks_list_id !== listId)) state = null;
      const needsCreate = !ev.google_task_id;
      if (!needsCreate && !remote) {
        // Confirmar individualmente: não interpretar uma listagem incompleta como eliminação.
        try {
          remote = (await auth.request({ url: `${TASKS_BASE}/lists/${listId}/tasks/${ev.google_task_id}` })).data;
        } catch (err) {
          if (![404, 410].includes(googleErrorStatus(err))) throw err;
          remote = { deleted: true };
        }
        ev = readEvent.get(organizationId, id);
        if (!ev) continue;
      }
      if (!needsCreate && remote.deleted) {
        db.transaction(() => {
          suppressAutoTask(ev);
          db.prepare('DELETE FROM operational_events WHERE id = ? AND organization_id = ?').run(id, organizationId);
        })();
        if (ev.google_event_id) await require('../services/calendarService').deleteTaskCalendarEvent(ev,
          { userId: ev.google_calendar_user_id, organizationId });
        deleted++;
        continue;
      }
      let changed = false;
      if (!needsCreate) {
        const before = remotePayload(taskPayload(ev));
        const merged = applyRemoteChanges(ev, { ...remotePayload(remote), completed: remote.completed }, state);
        ev = merged.event;
        changed = merged.changed;
        if (changed) {
          imported++;
          // Confirmar já os campos recebidos, mesmo se o envio seguinte falhar.
          // Campos locais pendentes continuam comparados com a base anterior.
          const baseline = state ? JSON.parse(state.local_payload) : { ...before };
          const after = remotePayload(taskPayload(ev));
          for (const key of Object.keys(baseline)) if (before[key] === baseline[key]) baseline[key] = after[key];
          saveSyncState(ev, listId, baseline, remote);
          if (ev.google_event_id) await require('../services/calendarService').updateTaskCalendarEvent(ev,
            { userId: ev.google_calendar_user_id, organizationId });
          ev = readEvent.get(organizationId, id);
          if (!ev) continue;
        }
      }
      const body = taskPayload(ev);
      const localPayload = JSON.stringify(remotePayload(body));
      if (needsCreate) {
        // Registar o conteúdo tentado antes do POST: se a resposta se perder,
        // recuperar pelo marcador sem confundir edições locais posteriores.
        saveSyncState({ ...ev, google_task_id: '' }, listId, JSON.parse(localPayload), body);
        const { data } = await auth.request({
          url: `${TASKS_BASE}/lists/${listId}/tasks`, method: 'POST', data: body,
        });
        const saved = db.prepare(`UPDATE operational_events SET google_task_id = ?
          WHERE organization_id = ? AND id = ?`).run(data.id, organizationId, id);
        if (!saved.changes) { queueSyncedTaskDeletion(organizationId, data.id); continue; }
        remote = data;
        ev.google_task_id = data.id;
        created++;
      } else if (localPayload !== JSON.stringify(remotePayload(remote))) {
        const { data } = await auth.request({
          url: `${TASKS_BASE}/lists/${listId}/tasks/${ev.google_task_id}`,
          method: 'PATCH', data: body,
          // Se houve uma edição no Google durante esta passagem, repetir depois.
          ...(remote.etag ? { headers: { 'If-Match': remote.etag } } : {}),
        });
        remote = { ...remote, ...body, ...data };
        updated++;
      }
      // O evento pode ter desaparecido enquanto a API respondia.
      if (readEvent.get(organizationId, id)) {
        saveSyncState(ev, listId, JSON.parse(localPayload), remote);
      }
    } catch (err) {
      console.error('Tasks sync erro (evento', id, '):', err.message);
      errors++;
      if (googleErrorStatus(err) === 429) break;
    }
  }
  await processQueuedTaskDeletions(organizationId);
  return { created, updated, imported, deleted, errors, total: events.length };
}

// Reconciliação após falhas/reinícios e para alterações feitas por outros fluxos.
async function syncEnabledOrganizationsToGoogleTasks() {
  const rows = db.prepare(`SELECT c.organization_id FROM google_tasks_connections c
    JOIN organization_settings s ON s.organization_id = c.organization_id
    WHERE s.key = 'gcal_sync_tasks' AND s.value = '1'`).all();
  for (const row of rows) {
    try { await syncOrganizationTasksToGoogleTasks(row.organization_id); }
    catch (err) { console.error('Erro ao repetir sincronização do Google Tasks:', err.message); }
  }
}

function queueSyncedTaskDeletion(organizationId, googleTaskId) {
  if (!organizationId || !googleTaskId) return false;
  db.prepare(`
    INSERT OR IGNORE INTO google_task_cleanup_queue (organization_id, google_task_id)
    VALUES (?, ?)
  `).run(organizationId, googleTaskId);
  return true;
}

function googleErrorStatus(error) {
  return Number(error?.response?.status || error?.status || error?.code) || 0;
}

// Apaga uma única tarefa do Google Tasks. Erros são propagados para que o caller
// possa conservar a referência e repetir; 404 é sucesso idempotente.
async function deleteSyncedTask(organizationId, googleTaskId) {
  const info = getTasksConnectionInfo(organizationId);
  if (!googleTaskId) return false;
  if (!info.connected || !info.tasksListId) {
    const error = new Error('Google Tasks não ligado ou lista da aplicação indisponível.');
    error.status = 503;
    throw error;
  }
  try {
    const auth = getAuthenticatedTasksClient(organizationId);
    await auth.request({ url: `${TASKS_BASE}/lists/${info.tasksListId}/tasks/${googleTaskId}`, method: 'DELETE' });
    return true;
  } catch (err) {
    if ([404, 410].includes(googleErrorStatus(err))) return true;
    throw err;
  }
}

const cleanupRuns = new Map();

async function runQueuedTaskDeletions(organizationId) {
  const result = { deleted: 0, errors: 0, pending: 0 };
  // Ler por lotes permite incluir IDs acrescentados enquanto uma limpeza já está
  // em curso (o fluxo apagar = cancelar e, logo depois, eliminar definitivamente).
  for (let batch = 0; batch < 10; batch++) {
    const rows = db.prepare(`
      SELECT google_task_id
      FROM google_task_cleanup_queue
      WHERE organization_id = ?
      ORDER BY created_at, google_task_id
      LIMIT 100
    `).all(organizationId);
    if (!rows.length) break;

    let madeProgress = false;
    for (const row of rows) {
      try {
        await deleteSyncedTask(organizationId, row.google_task_id);
        db.prepare(`
          DELETE FROM google_task_cleanup_queue
          WHERE organization_id = ? AND google_task_id = ?
        `).run(organizationId, row.google_task_id);
        db.prepare(`UPDATE operational_events SET google_task_id = NULL
          WHERE organization_id = ? AND google_task_id = ?`).run(organizationId, row.google_task_id);
        result.deleted++;
        madeProgress = true;
      } catch (err) {
        result.errors++;
        db.prepare(`
          UPDATE google_task_cleanup_queue
          SET attempts = attempts + 1, last_error = ?, last_attempt_at = datetime('now')
          WHERE organization_id = ? AND google_task_id = ?
        `).run(String(err.message || 'Erro desconhecido').slice(0, 500), organizationId, row.google_task_id);
        console.error('Erro ao apagar tarefa do Google Tasks; eliminação fica pendente:', err.message);
        // Não consumir ainda mais quota quando o fornecedor já pediu para abrandar.
        if (googleErrorStatus(err) === 429) break;
      }
    }
    if (!madeProgress) break;
  }
  result.pending = db.prepare(`
    SELECT COUNT(*) AS total FROM google_task_cleanup_queue WHERE organization_id = ?
  `).get(organizationId).total;
  return result;
}

function processQueuedTaskDeletions(organizationId) {
  if (!organizationId) return Promise.resolve({ deleted: 0, errors: 0, pending: 0 });
  // Se outra limpeza estiver quase a terminar, encadear uma nova passagem. Pode
  // ter entrado um ID depois de a passagem anterior ter lido o último lote.
  if (cleanupRuns.has(organizationId)) {
    return cleanupRuns.get(organizationId).then(() => processQueuedTaskDeletions(organizationId));
  }
  const run = runQueuedTaskDeletions(organizationId)
    .finally(() => cleanupRuns.delete(organizationId));
  cleanupRuns.set(organizationId, run);
  return run;
}

async function processAllQueuedTaskDeletions() {
  const organizations = db.prepare(`
    SELECT DISTINCT organization_id FROM google_task_cleanup_queue ORDER BY organization_id
  `).all();
  const totals = { deleted: 0, errors: 0, pending: 0 };
  for (const row of organizations) {
    const result = await processQueuedTaskDeletions(row.organization_id);
    totals.deleted += result.deleted;
    totals.errors += result.errors;
    totals.pending += result.pending;
  }
  return totals;
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
  disconnectTasks,
  syncOrganizationTasksToGoogleTasks,
  syncEnabledOrganizationsToGoogleTasks,
  withTaskLock,
  suppressAutoTask,
  deleteSyncedTask,
  queueSyncedTaskDeletion,
  processQueuedTaskDeletions,
  processAllQueuedTaskDeletions,
  TASKS_SCOPES,
  TASKS_BASE,
};
