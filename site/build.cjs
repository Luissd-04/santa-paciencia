#!/usr/bin/env node
// Constrói o site estático em site/dist. Sem dependências: `node site/build.cjs`.
// SITE_URL define o domínio usado em canonical, Open Graph, sitemap e robots.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { render, cfg } = require('./src/layout.cjs');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');

const pages = [
  ...require('./src/content/home.cjs'),
  ...require('./src/content/features.cjs'),
  ...require('./src/content/pages.cjs'),
  ...require('./src/content/guides.cjs'),
];

const ogName = (p) => (p.path === '/' ? 'inicio' : p.path.replace(/^\/|\/$/g, '').replace(/\.html$/, '').replace(/\//g, '--'));
for (const p of pages) {
  const file = `/assets/og/${ogName(p)}.jpg`;
  p.og = fs.existsSync(path.join(SRC, file)) ? file : '/assets/og/inicio.jpg';
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });

  // CSS e JS com impressão digital no nome, para poderem ficar em cache um ano.
  const assets = {};
  for (const [key, name] of [['css', 'site.css'], ['js', 'site.js']]) {
    const from = path.join(OUT, 'assets', name);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(from)).digest('hex').slice(0, 10);
    assets[key] = name.replace('.', `.${hash}.`);
    fs.renameSync(from, path.join(OUT, 'assets', assets[key]));
  }

  for (const p of pages) {
    const file = p.path.endsWith('/') ? path.join(OUT, p.path, 'index.html') : path.join(OUT, p.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, render(p, assets));
  }

  const indexable = pages.filter((p) => !p.noindex && !p.noSitemap);
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${cfg.siteUrl}${p.path}</loc><lastmod>${p.updated || cfg.updated}</lastmod></url>`).join('\n')}
</urlset>
`);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), cfg.indexar ? `User-agent: *\nAllow: /\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');

  // Redirecionamentos e cabeçalhos no formato de Netlify / Cloudflare Pages.
  // Noutros alojamentos, as mesmas regras passam para a configuração do servidor (ver README).
  fs.writeFileSync(path.join(OUT, '_redirects'), [
    '/index.html / 301', '/home / 301', '/inicio / 301',
    '/funcionalidade/* /funcionalidades/:splat 301', '/features /funcionalidades/ 301',
    '/pricing /precos/ 301', '/preco /precos/ 301', '/planos /precos/ 301', '/pacotes /precos/ 301',
    '/faq /perguntas-frequentes/ 301', '/contactos /contacto/ 301', '/demo /contacto/ 301', '/demonstracao /contacto/ 301',
    '/blog /guias/ 301', '/blog/* /guias/:splat 301', '/sobre-nos /sobre/ 301',
    '/politica-de-privacidade /privacidade/ 301', '/termos-e-condicoes /termos/ 301',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, '_headers'), `/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
${cfg.indexar ? '' : '  X-Robots-Tag: noindex, nofollow\n'}  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'${cfg.contactEndpoint ? ' ' + new URL(cfg.contactEndpoint).origin : ''}; form-action 'self' mailto:${cfg.contactEndpoint ? ' ' + new URL(cfg.contactEndpoint).origin : ''}; base-uri 'self'; frame-ancestors 'none'
`);
  return { pages, assets };
}

module.exports = { pages, build, OUT, ogName };

if (require.main === module) {
  const r = build();
  console.log(`Site construído em ${path.relative(process.cwd(), OUT) || '.'}: ${r.pages.length} páginas, domínio ${cfg.siteUrl}, indexação ${cfg.indexar ? 'LIGADA' : 'desligada (INDEXAR=true para ligar)'}`);
}
