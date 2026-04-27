// frontend/api.js
const API_BASE = '/api';

const API = {
  // Reservas
  async getReservations(filters = {}) {
    const params = new URLSearchParams(filters);
    const query = params.toString();
    const res = await fetch(`${API_BASE}/reservations${query ? `?${query}` : ''}`);
    return res.json();
  },

  async createReservation(data) {
    const res = await fetch(`${API_BASE}/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async updateReservation(id, data) {
    const res = await fetch(`${API_BASE}/reservations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async cancelReservation(id) {
    const res = await fetch(`${API_BASE}/reservations/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async getDashboardStats() {
    const res = await fetch(`${API_BASE}/reservations/stats/dashboard`);
    return res.json();
  },

  // Alojamentos
  async getAccommodations() {
    const res = await fetch(`${API_BASE}/accommodations`);
    return res.json();
  },

  // Calendar
  async getCalendarStatus() {
    const res = await fetch(`${API_BASE}/calendar/status`);
    return res.json();
  },

  async connectGoogleCalendar() {
    window.open('/auth/google', '_blank', 'width=600,height=600');
  },

  async disconnectGoogleCalendar() {
    const res = await fetch('/auth/google', {
      method: 'DELETE'
    });
    return res.json();
  }
};

// Carregar dashboard ao iniciar
async function loadDashboard() {
  try {
    const [stats, accommodations, calendarStatus] = await Promise.all([
      API.getDashboardStats(),
      API.getAccommodations(),
      API.getCalendarStatus()
    ]);

    if (stats.success) {
      document.querySelector('[data-stat="total-billed"]').textContent =
        `€${stats.data.totalBilled.toFixed(2)}`;

      document.querySelector('[data-stat="confirmed"]').textContent =
        stats.data.confirmedReservations;

      document.querySelector('[data-stat="nights"]').textContent =
        stats.data.nightsThisMonth;

      document.querySelector('[data-stat="occupancy"]').textContent =
        `${stats.data.occupancyRate}%`;
    }

    const calendarBtn = document.querySelector('[data-action="calendar-toggle"]');
    if (calendarBtn) {
      calendarBtn.textContent = calendarStatus.data?.connected
        ? '🟢 Google Calendar ligado'
        : '⚪ Ligar Google Calendar';
    }

  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

document.addEventListener('DOMContentLoaded', loadDashboard);