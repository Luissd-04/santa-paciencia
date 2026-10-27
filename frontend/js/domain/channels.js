// Estado privado; interface partilhada em AppModules.core.
(() => {
AppModules.define('core', {
  CHANNELS: { get: () => CHANNELS },
  channelLabel: { get: () => channelLabel },
  fillChannelControls: { get: () => fillChannelControls },
});

// Canais de reserva — fonte única no frontend. A ordem é a dos botões da nova
// reserva no telemóvel; os filtros e os relatórios usam a mesma lista.
const CHANNELS = [
  { id: 'direto', label: 'Direto', color: '#843424' },
  { id: 'booking', label: 'Booking.com', color: '#003580' },
  { id: 'airbnb', label: 'Airbnb', color: '#FF5A5F' },
  { id: 'longaventura', label: 'Longaventura', color: '#E07A1F' },
  { id: 'secretplaces', label: 'SecretPlaces', color: '#2F5D50' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
  { id: 'instagram', label: 'Instagram', color: '#C13584' },
  { id: 'expedia', label: 'Expedia', color: '#FFC72C' },
  { id: 'vrbo', label: 'VRBO', color: '#195ABA' },
  { id: 'website', label: 'Site', color: '#a8643f' },
  { id: 'outro', label: 'Outro', color: '#8a8278' },
];
// O site é o canal das reservas feitas pela página pública: fica nas listas
// (para editar essas reservas sem perder o canal), mas não tem botão.
const PICKABLE = CHANNELS.filter(c => c.id !== 'website');
const byId = new Map(CHANNELS.map(c => [c.id, c]));
const channelLabel = id => byId.get(id)?.label || id || '';

// Preenche os <select data-channel-options> (o valor do atributo, se houver,
// é a opção "todos") e os grupos de botões [data-channel-chips] de `root`.
// Corre no arranque e sempre que chega a marcação de uma vista.
function fillChannelControls(root = document) {
  const esc = AppModules.core.escapeHtml;
  root.querySelectorAll('select[data-channel-options]').forEach(select => {
    const all = select.dataset.channelOptions;
    const current = select.value;
    select.innerHTML = (all ? `<option value="">${esc(all)}</option>` : '')
      + CHANNELS.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    if (current) select.value = current;
  });
  root.querySelectorAll('[data-channel-chips]').forEach(group => {
    group.innerHTML = PICKABLE.map(c => `<button type="button" class="resf-chip" data-canal="${c.id}" ${AppActions.attrs('click', 'index-mobile-canal')} aria-pressed="false">${esc(c.label)}</button>`).join('');
  });
}

fillChannelControls();
})();
