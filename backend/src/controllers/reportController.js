const { db } = require('../config/database');

function getFinancialReport(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const year  = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || 0; // 0 = ano inteiro; 1-12 = mês
    const isMonth = month >= 1 && month <= 12;
    const accommodationId = req.query.accommodation_id || null;

    const mm = String(month).padStart(2, '0');
    const startDate = isMonth ? `${year}-${mm}-01` : `${year}-01-01`;
    const endDate = isMonth
      ? (month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      : `${year + 1}-01-01`;

    const params = [orgId, startDate, endDate];
    const accFilter = accommodationId ? ' AND r.accommodation_id = ?' : '';
    if (accommodationId) params.push(accommodationId);

    const baseWhere = `r.organization_id = ? AND r.status != 'cancelada' AND r.check_in >= ? AND r.check_in < ?${accFilter}`;

    const channels = db.prepare(`
      SELECT r.channel,
             COUNT(*) AS reservations,
             SUM(r.total_amount) AS revenue
      FROM reservations r
      WHERE ${baseWhere}
      GROUP BY r.channel
      ORDER BY revenue DESC
    `).all(...params);

    const accData = db.prepare(`
      SELECT a.id, a.name, a.color,
             COUNT(*) AS reservations,
             SUM(r.nights) AS nights,
             SUM(r.total_amount) AS revenue
      FROM reservations r
      JOIN accommodations a ON a.id = r.accommodation_id
      WHERE ${baseWhere}
      GROUP BY a.id
      ORDER BY revenue DESC
    `).all(...params);

    const accCount = accommodationId ? 1 :
      (db.prepare(`SELECT COUNT(*) AS cnt FROM accommodations WHERE organization_id = ?`).get(orgId)?.cnt || 1);

    let months = null, days = null;

    if (isMonth) {
      const dailyRaw = db.prepare(`
        SELECT CAST(strftime('%d', r.check_in) AS INTEGER) AS day,
               COUNT(*) AS reservations, SUM(r.nights) AS nights, SUM(r.total_amount) AS revenue
        FROM reservations r WHERE ${baseWhere} GROUP BY day ORDER BY day
      `).all(...params);
      const daysInMonth = new Date(year, month, 0).getDate();
      days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = dailyRaw.find(x => x.day === i + 1) || {};
        return { day: i + 1, reservations: d.reservations || 0, nights: d.nights || 0, revenue: d.revenue || 0 };
      });
    } else {
      const monthlyRaw = db.prepare(`
        SELECT CAST(strftime('%m', r.check_in) AS INTEGER) - 1 AS month_idx,
               COUNT(*) AS reservations, SUM(r.nights) AS nights, SUM(r.total_amount) AS revenue
        FROM reservations r WHERE ${baseWhere} GROUP BY month_idx ORDER BY month_idx
      `).all(...params);
      months = Array.from({ length: 12 }, (_, i) => {
        const m = monthlyRaw.find(r => r.month_idx === i) || {};
        const daysInMonth = new Date(year, i + 1, 0).getDate();
        const occupiedNights = m.nights || 0;
        const totalNights = daysInMonth * accCount;
        return {
          month: i,
          reservations: m.reservations || 0,
          nights: occupiedNights,
          revenue: m.revenue || 0,
          occupancy_rate: totalNights > 0 ? Math.min(100, Math.round(occupiedNights / totalNights * 100)) : 0,
        };
      });
    }

    const series = isMonth ? days : months;
    const totals = series.reduce((acc, m) => ({
      reservations: acc.reservations + m.reservations,
      nights:       acc.nights       + m.nights,
      revenue:      acc.revenue      + m.revenue,
    }), { reservations: 0, nights: 0, revenue: 0 });

    const periodNights = isMonth
      ? new Date(year, month, 0).getDate() * accCount
      : 365 * accCount;
    const avgOccupancy = isMonth
      ? (periodNights > 0 ? Math.min(100, Math.round(totals.nights / periodNights * 100)) : 0)
      : Math.round(months.reduce((s, m) => s + m.occupancy_rate, 0) / 12);
    const revpar = totals.nights > 0 ? totals.revenue / totals.nights : 0;

    const availableYears = db.prepare(`
      SELECT DISTINCT CAST(strftime('%Y', check_in) AS INTEGER) AS yr
      FROM reservations WHERE organization_id = ? AND status != 'cancelada'
      ORDER BY yr DESC
    `).all(orgId).map(r => r.yr);
    if (!availableYears.includes(year)) availableYears.push(year);
    availableYears.sort((a, b) => b - a);

    res.json({
      success: true,
      data: {
        year, month: isMonth ? month : null, granularity: isMonth ? 'day' : 'month',
        months, days, channels,
        accommodations: accData,
        totals: { ...totals, avg_occupancy: avgOccupancy, revpar },
        available_years: availableYears,
      }
    });
  } catch (err) {
    next(err);
  }
}

function getExpenseReport(req, res, next) {
  try {
    const orgId = req.user.organization_id;
    const year  = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || 0;
    const isMonth = month >= 1 && month <= 12;

    const mm = String(month).padStart(2, '0');
    const startDate = isMonth ? `${year}-${mm}-01` : `${year}-01-01`;
    const endDate = isMonth
      ? (month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`)
      : `${year + 1}-01-01`;

    const byCategory = db.prepare(`
      SELECT category, SUM(amount) AS total, COUNT(*) AS cnt
      FROM expenses
      WHERE organization_id = ? AND date >= ? AND date < ?
      GROUP BY category
      ORDER BY total DESC
    `).all(orgId, startDate, endDate);

    let months = null, days = null;

    if (isMonth) {
      const dailyRaw = db.prepare(`
        SELECT CAST(strftime('%d', date) AS INTEGER) AS day, SUM(amount) AS total, COUNT(*) AS cnt
        FROM expenses WHERE organization_id = ? AND date >= ? AND date < ?
        GROUP BY day ORDER BY day
      `).all(orgId, startDate, endDate);
      const daysInMonth = new Date(year, month, 0).getDate();
      days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = dailyRaw.find(x => x.day === i + 1) || {};
        return { day: i + 1, total: d.total || 0, count: d.cnt || 0 };
      });
    } else {
      const monthlyRaw = db.prepare(`
        SELECT CAST(strftime('%m', date) AS INTEGER) - 1 AS month_idx, SUM(amount) AS total, COUNT(*) AS cnt
        FROM expenses WHERE organization_id = ? AND date >= ? AND date < ?
        GROUP BY month_idx ORDER BY month_idx
      `).all(orgId, startDate, endDate);
      months = Array.from({ length: 12 }, (_, i) => {
        const m = monthlyRaw.find(r => r.month_idx === i) || {};
        return { month: i, total: m.total || 0, count: m.cnt || 0 };
      });
    }

    const series = isMonth ? days : months;
    const periodTotal = series.reduce((s, m) => s + m.total, 0);
    const count       = series.reduce((s, m) => s + m.count, 0);
    const avgMonthly  = isMonth ? periodTotal : periodTotal / 12;

    const availableYears = db.prepare(`
      SELECT DISTINCT CAST(strftime('%Y', date) AS INTEGER) AS yr
      FROM expenses WHERE organization_id = ?
      ORDER BY yr DESC
    `).all(orgId).map(r => r.yr);
    if (!availableYears.includes(year)) availableYears.push(year);
    availableYears.sort((a, b) => b - a);

    res.json({
      success: true,
      data: {
        year, month: isMonth ? month : null, granularity: isMonth ? 'day' : 'month',
        months, days, byCategory,
        totals: { year_total: periodTotal, count, avg_monthly: avgMonthly },
        available_years: availableYears,
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getFinancialReport, getExpenseReport };
