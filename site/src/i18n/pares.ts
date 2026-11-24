// Equivalência entre páginas PT e EN (para o seletor de língua, os `hreflang` e o sitemap).
// Junta os pares fixos de `rotas.ts` com os dos guias (que vêm da coleção).
import { paresFixos, type Lang } from './rotas';
import { paresDeGuias } from '../config/guias';

export const todosOsPares = async (): Promise<Record<Lang, string>[]> => [...paresFixos(), ...(await paresDeGuias())];

/** O par {pt, en} a que um endereço pertence, ou `null` se a página não tem equivalente (ex.: 404). */
export async function parDe(caminho: string): Promise<Record<Lang, string> | null> {
  return (await todosOsPares()).find((p) => p.pt === caminho || p.en === caminho) ?? null;
}
