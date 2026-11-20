// Consola da plataforma: Incidentes por fornecedor, mais a instância.
(() => {
AppModules.define('consola', {
  incidentes: { get: () => page },
});

const fmt = AppModules.consola.fmt;
const api = AppModules.consola.api;
const { esc, num } = fmt;

function incidentHtml(item) {
  const orgs = Array.isArray(item.organizations) ? item.organizations : [];
  const extra = Math.max(0, (Number(item.count) || 0) - orgs.length);
  return `<div class="v2-row pl-incident">
    <span class="v2-row-text"><b>${esc(item.title || fmt.providerLabel(item.provider))}</b>${item.detail ? `<span>${esc(item.detail)}</span>` : ''}
      ${orgs.length || extra ? `<span class="pl-affected">${orgs.map(o => fmt.link(fmt.orgHref(o.id), esc(o.name), 'v2-chip neutral')).join('')}${extra ? `<span class="pl-muted">e mais ${num(extra)}</span>` : ''}</span>` : ''}</span>
    <span class="pl-since">${esc(fmt.since(item.since))}</span></div>`;
}

function instanceHtml(overview, incidents) {
  const instance = overview.instance || {};
  const disk = instance.disk;
  const used = disk && disk.total_bytes ? Math.min(100, Math.round((1 - disk.free_bytes / disk.total_bytes) * 100)) : null;
  const line = (label, value) => `<div class="pl-kv"><span>${label}</span><b>${value}</b></div>`;
  return `<div class="v2-card v2-dense pl-instance"><div class="v2-card-h"><h3>Instância</h3></div>
    ${line('Build', esc(instance.app_build || '—'))}
    ${line('Tempo ligado', esc(fmt.duration(instance.uptime_seconds)))}
    ${line('Tamanho da base', esc(fmt.bytes(instance.database_bytes)))}
    ${line('Disco', disk ? `${esc(fmt.bytes(disk.free_bytes))} livres de ${esc(fmt.bytes(disk.total_bytes))}` : '—')}
    ${used === null ? '' : `<div class="v2-bar" role="img" aria-label="Disco usado: ${used}%"><i style="width:${used}%;background:${used >= 90 ? 'var(--v2-bad)' : 'var(--v2-accent)'}"></i></div>`}
    ${incidents.length ? incidents.map(i => `<div class="v2-row pl-incident"><span class="v2-row-text"><b>${esc(i.title || 'Incidente')}</b>${i.detail ? `<span>${esc(i.detail)}</span>` : ''}</span>${fmt.chip('bad', 'Incidente')}</div>`).join('')
      : fmt.empty('Sem incidentes da instância.', 'check-circle')}</div>`;
}

const page = {
  async render(ctx) {
    const [overview, data] = await Promise.all([api.overview(), api.incidents()]);
    if (ctx.stale()) return;
    const groups = new Map();
    for (const item of data.incidents) {
      const key = fmt.providerKey(item.provider);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const known = fmt.PROVIDERS.map(([key]) => key);
    const keys = [...known.filter(k => groups.has(k)), ...[...groups.keys()].filter(k => !known.includes(k))];
    const cards = keys.map(key => {
      const items = groups.get(key);
      return `<div class="v2-card v2-dense"><div class="v2-card-h"><h3>${esc(fmt.providerLabel(key))}</h3>${fmt.chip('bad', `${items.length} ${items.length === 1 ? 'incidente' : 'incidentes'}`)}</div>${items.map(incidentHtml).join('')}</div>`;
    }).join('');
    ctx.host.innerHTML = `<div class="pl-page pl-incidents">
      <div class="pl-col">${cards || `<div class="v2-card v2-dense">${fmt.empty('Sem incidentes de fornecedores.', 'check-circle')}</div>`}</div>
      ${instanceHtml(overview, data.instance)}</div>`;
  },
};
})();
