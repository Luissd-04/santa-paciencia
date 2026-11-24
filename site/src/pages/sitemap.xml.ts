import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { marca } from '../config/brand';

// Sitemap gerado a partir das páginas em src/pages (sem a 404 nem os endpoints).
// Páginas dinâmicas ([slug].astro) não são apanhadas aqui: os guias vêm da coleção `guias`; outras, acrescentar a `extra`.
const paginas = import.meta.glob('./**/*.astro');
const extra: string[] = [];

export const GET: APIRoute = async () => {
  const guias = (await getCollection('guias')).map((g) => `/guias/${g.id}/`);
  const caminhos = Object.keys(paginas)
    .map((f) => f.replace(/^\.\//, '').replace(/\.astro$/, '').replace(/(^|\/)index$/, ''))
    .filter((p) => !p.includes('[') && p !== '404')
    .map((p) => (p ? `/${p}/` : '/'))
    .concat(guias, extra)
    .sort();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${caminhos.map((p) => `  <url><loc>${marca.siteUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
