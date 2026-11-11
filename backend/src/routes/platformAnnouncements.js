// Comunicados (consola): criar, editar, terminar e apagar. Tudo auditado.
const router = require('express').Router();
const { recordPlatformAudit } = require('../services/platformAccess');
const announcements = require('../services/announcements');

const audit = (req, action, id, details) =>
  recordPlatformAudit({ userId: req.user.id, action, targetType: 'announcement', targetId: id, details, ip: req.ip });

router.get('/', (_req, res) => res.json({ success: true, data: announcements.listAll() }));

router.post('/', (req, res) => {
  const data = announcements.create(req.user.id, req.body);
  audit(req, 'announcement.create', data.id, { kind: data.kind, title: data.title, audience: data.audience });
  res.status(201).json({ success: true, data });
});

router.put('/:id', (req, res) => {
  const data = announcements.update(req.params.id, req.body);
  audit(req, 'announcement.update', data.id, { kind: data.kind, title: data.title, audience: data.audience });
  res.json({ success: true, data });
});

router.post('/:id/end', (req, res) => {
  const data = announcements.end(req.params.id);
  audit(req, 'announcement.end', data.id, { title: data.title });
  res.json({ success: true, data });
});

router.delete('/:id', (req, res) => {
  const removed = announcements.remove(req.params.id);
  audit(req, 'announcement.delete', removed.id, { title: removed.title });
  res.json({ success: true, data: { id: removed.id } });
});

module.exports = router;
