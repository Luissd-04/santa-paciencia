const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const ctrl = require('../controllers/teamController');

router.get('/members', requireRole('staff'), ctrl.getMembers);

router.use(requireRole('owner'));

router.get('/', ctrl.getOverview);
router.post('/invitations', ctrl.invite);
router.delete('/invitations/:id', ctrl.removeInvitation);
router.patch('/members/:id', ctrl.updateMemberRole);
router.delete('/members/:id', ctrl.removeMember);

module.exports = router;
