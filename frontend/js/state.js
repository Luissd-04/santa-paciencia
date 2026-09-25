// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  accommodations: { get: () => accommodations, set: value => { accommodations = value; } },
  API_BASE: { get: () => API_BASE },
  calMonth: { get: () => calMonth, set: value => { calMonth = value; } },
  calYear: { get: () => calYear, set: value => { calYear = value; } },
  currentUser: { get: () => currentUser, set: value => { currentUser = value; } },
  editingId: { get: () => editingId, set: value => { editingId = value; } },
  openingReservationDetail: { get: () => openingReservationDetail, set: value => { openingReservationDetail = value; } },
  reservas: { get: () => reservas, set: value => { reservas = value; } },
  servicosData: { get: () => servicosData, set: value => { servicosData = value; } },
  SS: { get: () => SS },
});

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

let openingReservationDetail = false;

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('state.js', () => {
  reservas = [];
  accommodations = [];
  editingId = null;
  currentUser = null;
  servicosData = [
  { id: 'breakfast', name: 'Pequeno-almoço', value: 19 },
  { id: 'tourist_tax', name: 'Taxa turística', value: 3 },
];
});

})();
