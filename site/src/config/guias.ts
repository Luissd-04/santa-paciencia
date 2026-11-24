// Pequenas funções dos guias: tempo de leitura (cerca de 200 palavras por minuto), a lista da língua
// e a ligação entre cada guia PT e o seu equivalente EN.
import { getCollection } from 'astro:content';
import type { Lang } from '../i18n/rotas';
export { dataLonga } from '../i18n';

export const tempoLeitura = (texto: string): number => Math.max(1, Math.ceil(texto.split(/\s+/).filter(Boolean).length / 200));

/** O endereço de um guia sem a pasta da língua: `en/slug` → `slug`. */
export const slugDe = (id: string): string => id.replace(/^en\//, '');

/** Guias de uma língua, do mais recente para o mais antigo. */
export async function guiasDe(lang: Lang) {
  return (await getCollection('guias', (g) => g.data.lang === lang)).sort((a, b) => b.data.publicado.getTime() - a.data.publicado.getTime());
}

/** Pares {pt, en} dos guias, a partir do campo `par` do Markdown (slug do guia na outra língua). */
export async function paresDeGuias(): Promise<Record<Lang, string>[]> {
  const todos = await getCollection('guias');
  return todos
    .filter((g) => g.data.lang === 'pt' && g.data.par)
    .map((g) => ({ pt: `/guias/${slugDe(g.id)}/`, en: `/en/guides/${g.data.par}/` }));
}
