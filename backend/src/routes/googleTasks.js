const router = require('express').Router();
const { db } = require('../config/database');
const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1';
const {
  getAuthenticatedTasksClient,
  getTasksConnectionInfo,
  getOrCreateTaskList,
} = require('../config/googleTasks');

const TASK_TYPE_LABELS = {
  check_in:        'Check-in',
  check_out:       'Check-out',
  limpeza:         'Limpeza',
  pequeno_almoco:  'Pequeno-almoço',
  manutencao:      'Manutenção',
  agenda_local:    'Agenda Local',
  outro:           'Tarefa',
};

/* ── GET /api/tasks/status ── */
router.get('/status', (req, res) => {
  const info = getTasksConnectionInfo(req.user.organization_id);
  if (!info.connected) return res.json({ success: true, data: { connected: false } });

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM operational_events
    WHERE organization_id = ? AND status != 'cancelado' AND google_task_id IS NOT NULL
  `).get(req.user.organization_id)?.c ?? 0;

  const pending = db.prepare(`
    SELECT COUNT(*) as c FROM operational_events
    WHERE organization_id = ? AND status != 'cancelado' AND date >= date('now') AND google_task_id IS NULL
  `).get(req.user.organization_id)?.c ?? 0;

  res.json({ success: true, data: { connected: true, email: info.email, synced: total, pending } });
});

/* ── POST /api/tasks/sync ── */
router.post('/sync', async (req, res) => {
  const orgId = req.user.organization_id;
  if (!getTasksConnectionInfo(orgId).connected) {
    return res.status(400).json({ success: false, error: 'Google Tasks não ligado.' });
  }

  try {
    const auth = getAuthenticatedTasksClient(orgId);
    const listId = await getOrCreateTaskList(auth, orgId);

    /* Buscar eventos dos próximos 90 dias que não estão cancelados */
    const events = db.prepare(`
      SELECT e.*, a.name as accommodation_name
      FROM operational_events e
      LEFT JOIN accommodations a ON a.id = e.accommodation_id
      WHERE e.organization_id = ?
        AND e.status != 'cancelado'
        AND e.date >= date('now', '-1 day')
        AND e.date <= date('now', '+90 days')
      ORDER BY e.date ASC, e.start_time ASC
    `).all(orgId);

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

    res.json({ success: true, data: { created, updated, errors, total: events.length } });
  } catch (err) {
    console.error('Tasks sync erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── POST /api/tasks/clean-duplicates ──
   Remove tarefas duplicadas na lista da app (mesmo título + data de vencimento),
   mantendo uma de cada. Seguro: só mexe na lista dedicada da app; prefere manter
   a tarefa ainda referenciada localmente. Corrige órfãos do bug antigo de sync. */
router.post('/clean-duplicates', async (req, res) => {
  const orgId = req.user.organization_id;
  if (!getTasksConnectionInfo(orgId).connected) {
    return res.status(400).json({ success: false, error: 'Google Tasks não ligado.' });
  }

  try {
    const auth = getAuthenticatedTasksClient(orgId);
    const listId = await getOrCreateTaskList(auth, orgId);

    /* Listar todas as tarefas da lista (inclui concluídas e ocultas) */
    const all = [];
    let pageToken = null;
    do {
      let url = `${TASKS_BASE}/lists/${listId}/tasks?maxResults=100&showCompleted=true&showHidden=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
      const { data } = await auth.request({ url, method: 'GET' });
      for (const t of (data.items || [])) all.push(t);
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    /* Ids ainda referenciados localmente (preferir mantê-los) */
    const localIds = new Set(
      db.prepare(`
        SELECT google_task_id AS gid FROM operational_events
        WHERE organization_id = ? AND google_task_id IS NOT NULL
      `).all(orgId).map(r => r.gid)
    );

    /* Agrupar por título + data de vencimento */
    const groups = new Map(); // "title|due" -> [task,...]
    for (const t of all) {
      const key = `${t.title || ''}|${(t.due || '').slice(0, 10)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    let deleted = 0;
    const removedIds = [];
    for (const tasks of groups.values()) {
      if (tasks.length < 2) continue;
      let keepIdx = tasks.findIndex(t => localIds.has(t.id));
      if (keepIdx < 0) keepIdx = 0;
      for (let i = 0; i < tasks.length; i++) {
        if (i === keepIdx) continue;
        try {
          await auth.request({ url: `${TASKS_BASE}/lists/${listId}/tasks/${tasks[i].id}`, method: 'DELETE' });
          deleted++;
          removedIds.push(tasks[i].id);
        } catch (err) {
          console.error('Erro a apagar tarefa duplicada:', err.message);
        }
      }
    }

    /* Limpar referências locais que apontavam para tarefas apagadas */
    if (removedIds.length) {
      const clearRef = db.prepare(
        "UPDATE operational_events SET google_task_id = NULL, updated_at = datetime('now') WHERE organization_id = ? AND google_task_id = ?"
      );
      db.transaction(() => { for (const id of removedIds) clearRef.run(orgId, id); })();
    }

    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Tasks clean-duplicates erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── DELETE /api/tasks/clear ── limpa google_task_id de todos os eventos ── */
router.delete('/clear', (req, res) => {
  db.prepare(`
    UPDATE operational_events SET google_task_id = NULL, updated_at = datetime('now')
    WHERE organization_id = ?
  `).run(req.user.organization_id);
  res.json({ success: true });
});

module.exports = router;
