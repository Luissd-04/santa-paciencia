// Moldura comum a todas as páginas: <head>, cabeçalho, rodapé e componentes.
const cfg = require('./config.cjs');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (p) => cfg.siteUrl + p;

const ICONS = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.500M16 4.800a3.5 3.5 0 0 1 0 6.400M18.5 14.900c1.7.8 2.7 2.5 3 5.1"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  receipt: '<path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21V3Z"/><path d="M9 8h6M9 12h6"/>',
  team: '<path d="M4 6h10M4 12h10M4 18h6"/><path d="m15.5 17 2.2 2.200L22 15"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3 7 9 6.500L21 7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.500L19 7.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  home: '<path d="M3 11.5 12 4l9 7.500V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.500Z"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h1.500M13.5 8H15M9 12h1.500M13.5 12H15M10 21v-4h4v4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.500h2"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3 7.8 7.5 9 4.5-1.2 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2.2 2.200L15.5 10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.500l3.5 2"/>',
};
const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name].replace(/(\d)00\b/g, '$1')}</svg>`;

// Arco de pedra da marca, desenhado em SVG (ornamento; o logótipo é a imagem).
const arch = (cls = '') => `<svg class="arch ${cls}" viewBox="0 0 120 150" fill="none" aria-hidden="true"><path d="M10 150V62a50 50 0 0 1 100 0v88" stroke="currentColor" stroke-width="2"/><path d="M26 150V64a34 34 0 0 1 68 0v86" stroke="currentColor" stroke-width="2" opacity=".5"/></svg>`;

const NAV = [
  ['/funcionalidades/', 'Funcionalidades'],
  ['/para-quem/', 'Para quem'],
  ['/precos/', 'Preços'],
  ['/guias/', 'Guias'],
  ['/sobre/', 'Sobre'],
];

const FEATURES = [
  ['/funcionalidades/reservas-e-calendario/', 'Reservas e calendário'],
  ['/funcionalidades/precos-por-epoca/', 'Preços por época'],
  ['/funcionalidades/hospedes-e-pre-check-in/', 'Hóspedes e pré-check-in'],
  ['/funcionalidades/pagamentos-online/', 'Pagamentos online'],
  ['/funcionalidades/despesas-e-fornecedores/', 'Despesas e fornecedores'],
  ['/funcionalidades/equipa-e-tarefas/', 'Equipa e tarefas'],
  ['/funcionalidades/comunicacoes-e-vouchers/', 'Comunicações e vouchers'],
  ['/funcionalidades/relatorios/', 'Relatórios'],
];

const isCurrent = (href, path) => (href === '/' ? path === '/' : path.startsWith(href));

function header(path) {
  const links = NAV.map(([href, label]) => `<li><a href="${href}"${isCurrent(href, path) ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const login = cfg.appUrl ? `<a class="nav-login" href="${esc(cfg.appUrl)}" rel="nofollow">Entrar</a>` : '';
  return `<a class="skip" href="#conteudo">Saltar para o conteúdo</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="Santa Paciência — início">
      <img src="/assets/img/logo-192.png" width="40" height="40" alt="" decoding="async">
      <span>Santa <em>Paciência</em></span>
    </a>
    <nav class="nav-desktop" aria-label="Principal"><ul>${links}</ul></nav>
    <div class="header-actions">
      ${login}
      <a class="btn btn-primary btn-sm" href="/contacto/">Pedir demonstração</a>
      <details class="nav-mobile">
        <summary aria-label="Menu"><span class="burger" aria-hidden="true"></span></summary>
        <nav aria-label="Principal (telemóvel)"><ul>${links}<li><a href="/perguntas-frequentes/">Perguntas frequentes</a></li><li><a href="/contacto/">Contacto</a></li></ul></nav>
      </details>
    </div>
  </div>
</header>`;
}

function footer() {
  const col = (title, items) => `<div class="foot-col"><h2>${title}</h2><ul>${items.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>`;
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <a class="brand brand-light" href="/"><img src="/assets/img/logo-192.png" width="44" height="44" alt="" loading="lazy" decoding="async"><span>Santa <em>Paciência</em></span></a>
        <p>O alojamento local inteiro num só sítio: reservas, hóspedes, preços, pagamentos, despesas e equipa.</p>
        <a class="foot-mail" href="mailto:${cfg.email}">${cfg.email}</a>
      </div>
      ${col('Funcionalidades', FEATURES)}
      ${col('Para quem', [['/para-quem/proprietarios/', 'Proprietários'], ['/para-quem/gestores-de-varias-unidades/', 'Gestores de várias unidades'], ['/para-quem/empresas-de-gestao/', 'Empresas de gestão'], ['/precos/', 'Preços e pacotes']])}
      ${col('Santa Paciência', [['/sobre/', 'Sobre'], ['/guias/', 'Guias'], ['/perguntas-frequentes/', 'Perguntas frequentes'], ['/contacto/', 'Contacto e demonstração']])}
    </div>
    <div class="foot-bottom">
      <p>© <span data-year>2026</span> Santa Paciência. Feito em Portugal.</p>
      <ul><li><a href="/privacidade/">Privacidade</a></li><li><a href="/termos/">Termos</a></li></ul>
    </div>
  </div>
</footer>`;
}

function breadcrumbs(crumbs) {
  if (!crumbs || !crumbs.length) return '';
  const all = [['/', 'Início'], ...crumbs];
  return `<nav class="crumbs wrap" aria-label="Migalhas de pão"><ol>${all.map(([h, l], i) => i === all.length - 1 ? `<li aria-current="page">${l}</li>` : `<li><a href="${h}">${l}</a></li>`).join('')}</ol></nav>`;
}

function jsonLd(page) {
  const org = { '@type': 'Organization', '@id': abs('/#organizacao'), name: cfg.name, url: abs('/'), logo: abs('/assets/img/logo-192.png'), email: cfg.email };
  const graph = [
    org,
    { '@type': 'WebSite', '@id': abs('/#site'), url: abs('/'), name: cfg.name, inLanguage: cfg.locale, publisher: { '@id': org['@id'] } },
    { '@type': page.article ? 'Article' : 'WebPage', '@id': abs(page.path) + '#pagina', url: abs(page.path), name: page.title, description: page.description, inLanguage: cfg.locale, isPartOf: { '@id': abs('/#site') },
      ...(page.article ? { headline: page.h1 || page.title, datePublished: page.article.published, dateModified: page.updated || cfg.updated, author: { '@id': org['@id'] }, publisher: { '@id': org['@id'] }, image: abs(page.og), mainEntityOfPage: abs(page.path) } : {}) },
  ];
  if (page.crumbs && page.crumbs.length) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [['/', 'Início'], ...page.crumbs].map(([h, l], i) => ({ '@type': 'ListItem', position: i + 1, name: l, item: abs(h) })) });
  }
  if (page.software) {
    graph.push({ '@type': 'SoftwareApplication', name: cfg.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, iOS, Android', url: abs('/'), description: 'Plataforma de gestão de alojamento local: reservas, calendário, preços, hóspedes, pagamentos, despesas e equipa.', inLanguage: cfg.locale,
      offers: cfg.plans.map(p => ({ '@type': 'Offer', name: p.name, price: p.price.toFixed(2), priceCurrency: 'EUR', url: abs('/precos/') })) });
  }
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
}

function render(page, assets) {
  const robots = !cfg.indexar ? 'noindex, nofollow' : page.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large';
  return `<!doctype html>
<html lang="${cfg.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="${robots}">
${page.noindex ? '' : `<link rel="canonical" href="${abs(page.path)}">`}
<meta name="theme-color" content="#843424">
<link rel="preload" href="/assets/fonts/playfair-display-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/dm-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/${assets.css}">
<link rel="icon" type="image/png" href="/assets/img/logo-192.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<meta property="og:type" content="${page.article ? 'article' : 'website'}">
<meta property="og:site_name" content="${cfg.name}">
<meta property="og:locale" content="pt_PT">
<meta property="og:title" content="${esc(page.ogTitle || page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${abs(page.path)}">
<meta property="og:image" content="${abs(page.og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${jsonLd(page)}
<script src="/assets/${assets.js}" defer></script>
</head>
<body class="${page.bodyClass || ''}">
${header(page.path)}
<main id="conteudo">
${breadcrumbs(page.crumbs)}
${page.body}
</main>
${footer()}
</body>
</html>
`;
}

/* ── Componentes reutilizados nas páginas ─────────────────────────────── */

const cta = (title = 'Veja a Santa Paciência com os seus alojamentos', text = 'Marcamos 30 minutos, mostramos a plataforma com exemplos do seu dia a dia e respondemos a tudo. Sem compromisso.') => `
<section class="cta-band">
  <div class="wrap cta-inner">
    ${arch('cta-arch')}
    <div class="reveal">
      <h2>${title}</h2>
      <p>${text}</p>
      <div class="btn-row"><a class="btn btn-light" href="/contacto/">Pedir demonstração ${icon('arrow')}</a><a class="btn btn-ghost-light" href="/precos/">Ver preços</a></div>
    </div>
  </div>
</section>`;

const pageHero = ({ eyebrow, h1, lead, actions = true }) => `
<section class="page-hero">
  <div class="wrap">
    ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
    <h1>${h1}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${actions ? `<div class="btn-row"><a class="btn btn-primary" href="/contacto/">Pedir demonstração ${icon('arrow')}</a><a class="btn btn-ghost" href="/precos/">Ver preços</a></div>` : ''}
  </div>
</section>`;

// Ilustração de um ecrã do produto, feita em HTML (dados de exemplo).
const mock = ({ title, rows, foot }) => `
<figure class="mock reveal" role="img" aria-label="Ilustração do ecrã «${esc(title)}» com dados de exemplo">
  <div class="mock-bar"><i></i><i></i><i></i><span>${title}</span></div>
  <ul class="mock-rows">${rows.map(([a, b, chip, tone]) => `<li><div><strong>${a}</strong><span>${b}</span></div>${chip ? `<em class="chip chip-${tone || 'ok'}">${chip}</em>` : ''}</li>`).join('')}</ul>
  ${foot ? `<figcaption>${foot}</figcaption>` : ''}
</figure>`;

const faq = (items) => `<div class="faq">${items.map(([q, a]) => `<details class="reveal"><summary><h3>${q}</h3><span class="faq-plus" aria-hidden="true"></span></summary><div class="faq-a"><p>${a}</p></div></details>`).join('')}</div>`;

const related = (title, items) => `
<section class="section related">
  <div class="wrap">
    <h2 class="h3">${title}</h2>
    <ul class="related-list">${items.map(([h, l, d]) => `<li class="reveal"><a href="${h}"><strong>${l}</strong><span>${d}</span>${icon('arrow')}</a></li>`).join('')}</ul>
  </div>
</section>`;

// Acrescenta a marca ao título quando cabe nos ~65 caracteres que o Google mostra.
const brandTitle = (t) => (`${t} | ${cfg.name}`.length <= 65 ? `${t} | ${cfg.name}` : t);

module.exports = { render, brandTitle, esc, abs, icon, arch, cta, pageHero, mock, faq, related, FEATURES, cfg };
