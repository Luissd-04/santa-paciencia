const ROLE_RANK = {
  owner: 3,
  manager: 2,
  staff: 1,
};

function requireRole(...roles) {
  const minRank = Math.max(...roles.map(role => ROLE_RANK[role] || 0));
  return (req, res, next) => {
    const userRank = ROLE_RANK[req.user?.role] || 0;
    if (userRank < minRank) {
      return res.status(403).json({ success: false, error: 'Não tens permissões para esta ação.' });
    }
    next();
  };
}

// O utilizador tem pelo menos este papel (para regras dentro dos serviços).
requireRole.atLeast = (user, role) => (ROLE_RANK[user?.role] || 0) >= (ROLE_RANK[role] || 0);

module.exports = requireRole;
