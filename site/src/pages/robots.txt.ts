import type { APIRoute } from 'astro';
import { marca } from '../config/brand';

// Com INDEXAR=false (por omissão) bloqueia tudo; com INDEXAR=true permite e aponta para o sitemap.
export const GET: APIRoute = () => {
  const corpo = marca.indexar
    ? `User-agent: *\nAllow: /\n\nSitemap: ${marca.siteUrl}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
