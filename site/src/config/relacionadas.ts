import { funcionalidades, urlFuncionalidade } from './brand';
import { t, type Lang } from '../i18n';
import type { NomeIcone } from '../components/Icon.astro';

// Ladrilhos de «Funciona ainda melhor com»: o ícone e o endereço vêm de `brand.ts` (o endereço na língua
// da página), o rótulo é o nome curto da funcionalidade (i18n `comum.rotulosRelacionadas`).
export const relacionadas = (lang: Lang, ...slugs: string[]): { icone: NomeIcone; rotulo: string; href: string }[] =>
  slugs.map((slug) => {
    const f = funcionalidades.find((x) => x.slug === slug);
    if (!f) throw new Error(`Funcionalidade desconhecida: ${slug}`);
    return { icone: f.icone as NomeIcone, rotulo: t(lang).comum.rotulosRelacionadas[slug], href: urlFuncionalidade(slug, lang) };
  });
