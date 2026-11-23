// Pesquisa de moradas para o mapa de localização do alojamento (GET /api/geocode?q=).
// Mesmo papel mínimo das definições do alojamento, onde o mapa é usado.
const router = require('express').Router();
const requireRole = require('../middleware/requireRole');
const { geocodeLimiter } = require('../middleware/rateLimiter');
const geocoding = require('../services/geocoding');

router.get('/', requireRole('manager'), geocodeLimiter, async (req, res, next) => {
  res.locals.liveQuiet = true; // só leitura
  try {
    const found = await geocoding.search(req.query.q);
    if (!found) return res.status(404).json({ success: false, error: 'Morada não encontrada. Verifique os dados.' });
    res.json({ success: true, data: found });
  } catch (err) {
    if (err instanceof geocoding.GeocodeError) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

module.exports = router;
