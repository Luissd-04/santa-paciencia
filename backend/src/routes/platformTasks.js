// Tarefas internas (consola). Atrás de requirePlatformAdmin (ver routes/platform.js).
const router = require('express').Router();
const tasks = require('../services/platformTasks');
const { recordPlatformAudit } = require('../services/platformAccess');

const audit = (req, action, id, details = null) =>
  recordPlatformAudit({ userId: req.user.id, action, targetType: 'platform_task', targetId: id, details, ip: req.ip });

router.get('/', (req, res) => res.json({ success: true, data: tasks.list(req.user, { assignee: req.query.assignee, type: req.query.type }) }));
router.get('/summary', (req, res) => res.json({ success: true, data: tasks.summary(req.user) }));
router.get('/:id', (req, res) => res.json({ success: true, data: tasks.get(req.params.id) }));
router.post('/', (req, res) => {
  const data = tasks.create(req.user, req.body || {});
  audit(req, 'task.create', data.id, { type: data.type, status: data.status });
  res.status(201).json({ success: true, data });
});
router.put('/:id', (req, res) => {
  const { task, changes, from } = tasks.update(req.user, req.params.id, req.body || {});
  if (changes.length) audit(req, 'task.update', task.id, { fields: changes, ...(changes.includes('status') ? { from, status: task.status } : {}) });
  res.json({ success: true, data: task });
});
router.delete('/:id', (req, res) => {
  const { id } = tasks.remove(req.params.id);
  audit(req, 'task.delete', id);
  res.json({ success: true, data: { id } });
});
router.post('/:id/comments', (req, res) => {
  const data = tasks.addComment(req.user, req.params.id, req.body || {});
  audit(req, 'task.comment', req.params.id);
  res.status(201).json({ success: true, data });
});

module.exports = router;
