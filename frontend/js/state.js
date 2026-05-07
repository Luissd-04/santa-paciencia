//const API_BASE = 'http://localhost:3001';
const API_BASE = '';

// ── Persistent session state ──
const SS = {
  get(k, def = null) {
    try { const v = sessionStorage.getItem('sp:' + k); return v !== null ? JSON.parse(v) : def; } catch { return def; }
  },
  set(k, v) {
    try { sessionStorage.setItem('sp:' + k, JSON.stringify(v)); } catch {}
  },
};

let reservas = [];
let accommodations = [];
let editingId = null;
let calYear, calMonth;
let currentUser = null;
let servicosData = [
  { id: 'breakfast', name: 'Pequeno-almoço', value: 19 },
  { id: 'tourist_tax', name: 'Taxa turística', value: 3 },
];
const now = new Date();
calYear  = SS.get('calYear',  now.getFullYear());
calMonth = SS.get('calMonth', now.getMonth());
