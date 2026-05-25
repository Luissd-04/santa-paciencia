const router = require('express').Router();
const { google } = require('googleapis');
const { db } = require('../config/database');
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
    const tasksClient = google.tasks({ version: 'v1', auth });
    const listId = await getOrCreateTaskList(tasksClient, orgId);

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
          /* atualizar task existente */
          await tasksClient.tasks.update({
            tasklist: listId,
            task: ev.google_task_id,
            requestBody: taskBody,
          });
          updated++;
        } else {
          /* criar nova task */
          const { data } = await tasksClient.tasks.insert({
            tasklist: listId,
            requestBody: taskBody,
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

/* ── DELETE /api/tasks/clear ── limpa google_task_id de todos os eventos ── */
router.delete('/clear', (req, res) => {
  db.prepare(`
    UPDATE operational_events SET google_task_id = NULL, updated_at = datetime('now')
    WHERE organization_id = ?
  `).run(req.user.organization_id);
  res.json({ success: true });
});

module.exports = router;
