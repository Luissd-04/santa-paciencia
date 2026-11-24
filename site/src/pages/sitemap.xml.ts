import type { APIRoute } from 'astro';
import { marca } from '../config/brand';

// Sitemap gerado a partir das páginas em src/pages (sem a 404 nem os endpoints).
// Páginas dinâmicas ([slug].astro) não são apanhadas aqui: acrescentar à lista `extra` se existirem.
const paginas = import.meta.glob('./**/*.astro');
const extra: string[] = [];

export const GET: APIRoute = () => {
  const caminhos = Object.keys(paginas)
    .map((f) => f.replace(/^\.\//, '').replace(/\.astro$/, '').replace(/(^|\/)index$/, ''))
    .filter((p) => !p.includes('[') && p !== '404')
    .map((p) => (p ? `/${p}/` : '/'))
    .concat(extra)
    .sort();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${caminhos.map((p) => `  <url><loc>${marca.siteUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
