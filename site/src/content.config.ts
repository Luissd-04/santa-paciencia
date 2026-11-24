import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Guias em Markdown: os PT em src/content/guias/<slug>.md e os EN em src/content/guias/en/<slug>.md.
// O tempo de leitura calcula-se a partir do texto.
const guias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guias' }),
  schema: z.object({
    /** Língua do guia: `en` para os que estão na pasta `en/`. */
    lang: z.enum(['pt', 'en']).default('pt'),
    /** Slug do guia equivalente na outra língua (para o hreflang e o seletor de língua). */
    par: z.string().optional(),
    /** H1 da página. */
    titulo: z.string(),
    /** Título curto do <title> (sem a marca; acrescenta-se na página). */
    tituloSeo: z.string(),
    descricao: z.string().min(70).max(160),
    tema: z.string(),
    resumo: z.string(),
    publicado: z.coerce.date(),
    atualizado: z.coerce.date().optional(),
    /** Funcionalidades relacionadas (ligações). */
    relacionadas: z.array(z.object({ href: z.string(), rotulo: z.string(), icone: z.string() })).default([]),
  }),
});

export const collections = { guias };
