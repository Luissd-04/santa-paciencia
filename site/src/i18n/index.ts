// Textos do site por língua. `pt` é a fonte do tipo: o inglês (`en`) tem de ter a mesma estrutura,
// e o TypeScript avisa quando falta uma chave. Os componentes e as páginas recebem a língua (`lang`)
// e leem daqui com `t(lang)`; os endereços de cada língua estão em `rotas.ts`.
import { pt } from './pt';
import { en } from './en';
import { marca, planos, type PlanoTexto } from '../config/brand';
import type { Lang } from './rotas';

export type { Lang } from './rotas';
export { htmlLang, LINGUAS, linguaDe } from './rotas';
export type Dict = typeof pt;

export const t = (lang: Lang): Dict => (lang === 'en' ? en : pt);

/** Substitui `{chave}` pelos valores dados. */
export const fmt = (texto: string, valores: Record<string, string | number>): string =>
  texto.replace(/\{(\w+)\}/g, (_, k: string) => String(valores[k] ?? `{${k}}`));

/** Preço em euros: «19 €» em português, «€19» em inglês. */
export const eur = (lang: Lang, n: number | string): string => (lang === 'en' ? `€${n}` : `${n} €`);

/** Título do <title>: a página e a marca. */
export const comMarca = (titulo: string): string => `${titulo} | ${marca.nome}`;

/** Data por extenso: «16 de novembro de 2026» / «16 November 2026». */
export const dataLonga = (d: Date, lang: Lang): string =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

/** Planos com o texto da língua pedida e os valores de `brand.ts`. */
export const planosDe = (lang: Lang): PlanoTexto[] => planos.map((p) => ({ ...p, ...t(lang).comum.planos[p.id] }));
