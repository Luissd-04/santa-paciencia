// Endereços de cada página nas duas línguas (docs/SITE-MAPA-SEO.md, secção 2).
// É daqui que saem o seletor de língua, os `hreflang` e as alternativas do sitemap: cada página PT
// tem a sua equivalente EN e vice-versa. Uma página nova precisa de entrada aqui.
export type Lang = 'pt' | 'en';
export const LINGUAS: Lang[] = ['pt', 'en'];

/** Valor do atributo `lang` do <html> e do `hreflang`. */
export const htmlLang: Record<Lang, string> = { pt: 'pt-PT', en: 'en' };

/** Páginas simples (um endereço por língua). */
export const paginas = {
  inicio: { pt: '/', en: '/en/' },
  funcionalidades: { pt: '/funcionalidades/', en: '/en/features/' },
  para: { pt: '/para/', en: '/en/for/' },
  precos: { pt: '/precos/', en: '/en/pricing/' },
  acesso: { pt: '/acesso-antecipado/', en: '/en/early-access/' },
  perguntas: { pt: '/perguntas-frequentes/', en: '/en/faq/' },
  sobre: { pt: '/sobre/', en: '/en/about/' },
  contacto: { pt: '/contacto/', en: '/en/contact/' },
  guias: { pt: '/guias/', en: '/en/guides/' },
  privacidade: { pt: '/privacidade/', en: '/en/privacy/' },
  termos: { pt: '/termos/', en: '/en/terms/' },
} as const satisfies Record<string, Record<Lang, string>>;
export type ChavePagina = keyof typeof paginas;

/** Slugs das funcionalidades (PT → EN). */
export const slugsFuncionalidade = {
  'calendario': 'calendar',
  'reservas-diretas': 'direct-bookings',
  'pagamentos-online': 'online-payments',
  'mensagens-automaticas': 'guest-messaging',
  'pre-check-in': 'online-check-in',
  'despesas': 'expenses',
  'equipa-e-tarefas': 'team-and-tasks',
  'relatorios': 'reports',
} as const;
export type SlugFuncionalidade = keyof typeof slugsFuncionalidade;

/** Slugs dos perfis «Para quem» (PT → EN). */
export const slugsPerfil = {
  'proprietarios': 'owners',
  'gestores': 'property-managers',
  'empresas-de-gestao': 'management-companies',
} as const;
export type SlugPerfil = keyof typeof slugsPerfil;

export const url = (lang: Lang, chave: ChavePagina): string => paginas[chave][lang];
export const urlFuncionalidade = (slug: string, lang: Lang = 'pt'): string =>
  lang === 'pt' ? `/funcionalidades/${slug}/` : `/en/features/${slugsFuncionalidade[slug as SlugFuncionalidade]}/`;
export const urlPerfil = (slug: string, lang: Lang = 'pt'): string =>
  lang === 'pt' ? `/para/${slug}/` : `/en/for/${slugsPerfil[slug as SlugPerfil]}/`;
/** Guia pelo slug da própria língua. */
export const urlGuia = (slug: string, lang: Lang = 'pt'): string => (lang === 'pt' ? `/guias/${slug}/` : `/en/guides/${slug}/`);

/** Língua de um endereço: tudo o que começa por /en/ é inglês. */
export const linguaDe = (caminho: string): Lang => (caminho === '/en' || caminho.startsWith('/en/') ? 'en' : 'pt');

/** Pares fixos {pt, en}, sem os guias (esses vêm da coleção, ver `paresDeGuias` em `guias.ts`). */
export const paresFixos = (): Record<Lang, string>[] => [
  ...Object.values(paginas).map((p) => ({ ...p })),
  ...Object.keys(slugsFuncionalidade).map((s) => ({ pt: urlFuncionalidade(s, 'pt'), en: urlFuncionalidade(s, 'en') })),
  ...Object.keys(slugsPerfil).map((s) => ({ pt: urlPerfil(s, 'pt'), en: urlPerfil(s, 'en') })),
];
