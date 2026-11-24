import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { marca } from '../config/brand';
import { htmlLang } from '../i18n/rotas';
import { slugDe } from '../config/guias';
import { todosOsPares } from '../i18n/pares';

// Sitemap gerado a partir das páginas em src/pages (sem as 404 nem os endpoints), PT e EN (/en/).
// Páginas dinâmicas ([slug].astro) não são apanhadas aqui: os guias vêm da coleção `guias`; outras, acrescentar a `extra`.
// Cada endereço leva as alternativas de língua (xhtml:link) tiradas dos pares de src/i18n/rotas.ts e dos guias.
const paginas = import.meta.glob('./**/*.astro');
const extra: string[] = [];

export const GET: APIRoute = async () => {
  const guias = (await getCollection('guias')).map((g) => (g.data.lang === 'en' ? `/en/guides/${slugDe(g.id)}/` : `/guias/${g.id}/`));
  const caminhos = Object.keys(paginas)
    .map((f) => f.replace(/^\.\//, '').replace(/\.astro$/, '').replace(/(^|\/)index$/, ''))
    .filter((p) => !p.includes('[') && p !== '404' && p !== 'en/404')
    .map((p) => (p ? `/${p}/` : '/'))
    .concat(guias, extra)
    .sort();
  const pares = await todosOsPares();
  const alternativas = (caminho: string): string => {
    const par = pares.find((p) => p.pt === caminho || p.en === caminho);
    if (!par) return '';
    const link = (hreflang: string, href: string) => `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${marca.siteUrl}${href}"/>`;
    return [link(htmlLang.pt, par.pt), link(htmlLang.en, par.en), link('x-default', par.pt)].join('');
  };
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${caminhos.map((p) => `  <url><loc>${marca.siteUrl}${p}</loc>${alternativas(p)}</url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
