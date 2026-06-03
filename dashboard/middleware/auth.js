function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect('/');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect('/');
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };