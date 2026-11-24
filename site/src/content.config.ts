import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Guias em Markdown (src/content/guias/<slug>.md). O tempo de leitura calcula-se a partir do texto.
const guias = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guias' }),
  schema: z.object({
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
