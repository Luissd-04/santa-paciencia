// Consola da plataforma: formatação e peças de HTML partilhadas pelas páginas.
// Todo o texto vindo da API passa por esc().
(() => {
AppModules.define('consola', {
  fmt: { get: () => fmt },
});

const core = () => AppModules.core;
const esc = value => core().escapeHtml(value);

const STATUS = {
  active: { label: 'Ativa', tone: 'ok' },
  trial: { label: 'Teste', tone: 'warn' },
  suspended: { label: 'Suspensa', tone: 'bad' },
};
const INTEGRATIONS = [['google', 'Google'], ['gmail', 'Gmail'], ['stripe', 'Stripe']];
const INTEGRATION_STATE = { ok: ['ok', 'ligado'], error: ['bad', 'com erro'], off: ['neutral', 'desligado'] };
const PROVIDERS = [['gmail', 'Gmail'], ['google_calendar', 'Google Calendar'], ['google_tasks', 'Google Tasks'], ['stripe', 'Stripe'], ['payments', 'Pagamentos']];
const PROVIDER_ALIASES = { calendar: 'google_calendar', gcal: 'google_calendar', tasks: 'google_tasks', pagamentos: 'payments', payment: 'payments', instance: 'instance' };
// Nomes das páginas da app (VIEW_TITLES em js/app.js), com os nomes curtos do menu.
const VIEW_NAMES = {
  dashboard: 'Dashboard', reservas: 'Reservas', calendario: 'Calendário', eventos: 'Eventos', hospedes: 'Hóspedes',
  notificacoes: 'Notificações', alojamentos: 'Alojamentos', invoice: 'Mensagens', despesas: 'Despesas',
  relatorios: 'Relatórios', vouchers: 'Vouchers', precos: 'Preços', definicoes: 'Definições',
  'hospede-detalhe': 'Ficha de hóspede', 'alojamento-detalhe': 'Ficha de alojamento',
};
const DEVICES = { desktop: 'Computador', mobile: 'Telemóvel', tablet: 'Tablet' };
const DISPLAY = { standalone: 'App instalada', browser: 'Browser', unknown: 'Sem informação' };
const ROLES = { owner: 'Proprietários', manager: 'Gestores', staff: 'Equipa' };
const BUCKETS = { '1': '1 pessoa', '2-3': '2 a 3', '4-6': '4 a 6', '7+': '7 ou mais' };

const TICKET_STATUS = {
  open: { label: 'Aberto', tone: 'info' },
  in_review: { label: 'Em análise', tone: 'warn' },
  needs_customer: { label: 'Precisa do cliente', tone: 'violet' },
  resolved: { label: 'Resolvido', tone: 'ok' },
};
const TICKET_TYPE = {
  problem: { label: 'Problema', icon: 'bug' },
  improvement: { label: 'Melhoria', icon: 'lightbulb' },
  question: { label: 'Pergunta', icon: 'help-circle' },
};

const num = value => (Number(value) || 0).toLocaleString('pt-PT');

function parseDate(value) {
  if (!value) return null;
  let text = String(value).trim();
  if (!text.includes('T')) text = text.replace(' ', 'T');
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(text)) text += 'Z';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativo(value, empty = 'Sem atividade') {
  const date = parseDate(value);
  if (!date) return empty;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.round(days / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

const since = value => { const text = relativo(value, '—'); return text === '—' ? text : text === 'agora mesmo' ? 'desde agora' : `desde ${text}`; };

function dateTime(value) {
  const date = parseDate(value);
  return date ? date.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

// «AAAA-MM-DD» (sem fuso) → data local.
function isoDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
const dateLong = value => isoDay(value)?.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }) || '';
const weekLabel = value => isoDay(value)?.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace(/\.$/, '') || String(value || '');

function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = n;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toLocaleString('pt-PT', { maximumFractionDigits: i < 2 ? 0 : 1 })} ${units[i]}`;
}

function duration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function providerKey(raw) {
  const key = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  return PROVIDER_ALIASES[key] || key;
}
function providerLabel(raw) {
  const key = providerKey(raw);
  if (key === 'instance') return 'Instância';
  return PROVIDERS.find(([k]) => k === key)?.[1] || String(raw || 'Outro');
}

function viewName(view) {
  const key = String(view || '').toLowerCase();
  if (VIEW_NAMES[key]) return VIEW_NAMES[key];
  const text = key.replace(/[-_]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Outra';
}

const icon = (name, size = 16) => core().lcIcon(name, size);
const statusOf = org => STATUS[org?.status] || { label: org?.status || '—', tone: 'neutral' };
const chip = (tone, text) => `<span class="v2-chip ${tone}">${esc(text)}</span>`;
const stateHtml = org => { const s = statusOf(org); return `<span class="pl-state"><i class="v2-dot pl-${s.tone}"></i>${esc(s.label)}</span>`; };
// O pacote chega como {id, name}, texto (versões antigas) ou null.
const planName = plan => String((plan && typeof plan === 'object' ? plan.name : plan) || '').trim();
const planHtml = org => { const name = planName(org?.plan); return name ? chip('info', name) : chip('neutral', 'Sem pacote'); };
const empty = (text, name = '') => `<p class="v2-empty">${name ? icon(name, 16) : ''}<span>${esc(text)}</span></p>`;
const orgHref = id => `/plataforma/clientes/${encodeURIComponent(id)}`;
// Ligação interna: o clique passa pelo router (shell.js), o href fica para abrir noutro separador.
const link = (href, inner, cls = '') => `<a class="${cls}" href="${esc(href)}" ${AppActions.attrs('click', 'pl-ir')}>${inner}</a>`;

function integrationsHtml(org) {
  return `<span class="pl-ints">${INTEGRATIONS.map(([key, label]) => {
    const [tone, text] = INTEGRATION_STATE[org.integrations?.[key]] || INTEGRATION_STATE.off;
    return `<span class="pl-int" title="${esc(label)}: ${text}" aria-label="${esc(label)}: ${text}"><i class="v2-dot pl-${tone}"></i>${esc(label)}</span>`;
  }).join('')}</span>`;
}

const fmt = {
  STATUS, TICKET_STATUS, TICKET_TYPE, INTEGRATIONS, INTEGRATION_STATE, PROVIDERS, DEVICES, DISPLAY, ROLES, BUCKETS,
  esc, num, parseDate, relativo, since, dateTime, dateLong, weekLabel, bytes, duration,
  providerKey, providerLabel, viewName, icon, statusOf, chip, stateHtml, planName, planHtml, empty, orgHref, link, integrationsHtml,
};
})();
