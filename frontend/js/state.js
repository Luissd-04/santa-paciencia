//const API_BASE = 'http://localhost:3001';
const API_BASE = '';

let reservas = [];
let accommodations = [];
let editingId = null;
let calYear, calMonth;
let servicosData = [
  { id: 'breakfast', name: 'Pequeno-almoço', value: 19 },
  { id: 'tourist_tax', name: 'Taxa turística', value: 3 },
];
const now = new Date();
calYear = now.getFullYear();
calMonth = now.getMonth();
