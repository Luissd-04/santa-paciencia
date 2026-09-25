// Estado privado; interface partilhada em AppModules.hospedes.
(() => {
AppModules.define('hospedes', {
  editingGuestId: { get: () => editingGuestId, set: value => { editingGuestId = value; } },
  getHospedesQuery: { get: () => getHospedesQuery },
  hospedes: { get: () => hospedes, set: value => { hospedes = value; } },
  hospedesPaged: { get: () => hospedesPaged },
  hospedesSortAsc: { get: () => hospedesSortAsc, set: value => { hospedesSortAsc = value; } },
  hospedesSortCol: { get: () => hospedesSortCol, set: value => { hospedesSortCol = value; } },
  hospedesViewMode: { get: () => hospedesViewMode, set: value => { hospedesViewMode = value; } },
});

let hospedes = [];
let hospedesViewMode = AppModules.core.SS.get('hsp:mode', 'cards');
let hospedesSortCol  = AppModules.core.SS.get('hsp:sort', 'name');
let hospedesSortAsc  = AppModules.core.SS.get('hsp:asc', true);
let editingGuestId = null;

const hospedesPaged = AppModules.core.createPagedCollection('/api/guests', state => {
  hospedes = state.rows;
  AppModules.hospedes.drawHospedes();
});

function getHospedesQuery() {
  const search = document.getElementById('hospedes-search')?.value.trim() || '';
  return { search, sort: hospedesSortCol, direction: hospedesSortAsc ? 'asc' : 'desc' };
}

// Limpeza da funcionalidade ao sair ou trocar de organização.
AppModules.onReset('hospedes.js', () => {
  hospedes = [];
  editingGuestId = null;
  hospedesPaged.reset();
});

})();
