import { defineConfig } from 'astro/config';

// O domínio vem de SITE_URL (por omissão, o domínio de testes). Ver src/config/brand.ts.
const site = (process.env.SITE_URL || 'https://santapaciencia.xyz').replace(/\/+$/, '');

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
