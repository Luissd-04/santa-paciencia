# Site público da Santa Paciência

Site de apresentação da plataforma: 24 páginas indexáveis e uma página 404, em HTML,
CSS e JavaScript estáticos. Não depende da aplicação nem de bibliotecas externas e
pode ser alojado em qualquer serviço de ficheiros estáticos.

## Usar

```bash
node site/build.cjs     # constrói em site/dist
node site/serve.cjs     # constrói e serve em http://localhost:4173
node site/check.cjs     # constrói e verifica (SEO, ligações, JSON-LD, sitemap)
node site/og.cjs        # volta a gerar as imagens de partilha (precisa do Playwright)
```

O domínio usado em `canonical`, Open Graph, `sitemap.xml` e `robots.txt` vem de
`SITE_URL`:

```bash
SITE_URL=https://www.exemplo.pt node site/build.cjs
```

## Onde mudar o quê

| O quê | Onde |
|---|---|
| Domínio, email, preços e pacotes | `src/config.cjs` |
| Cabeçalho, rodapé, `<head>`, dados estruturados | `src/layout.cjs` |
| Página inicial | `src/content/home.cjs` |
| Funcionalidades (8 páginas + índice) | `src/content/features.cjs` |
| Para quem, preços, sobre, contacto, perguntas, legais, 404 | `src/content/pages.cjs` |
| Guias | `src/content/guides.cjs` |
| Cores, tipografia, espaçamento e animações (tokens em `:root`) | `src/assets/site.css` |
| Menu e formulário | `src/assets/site.js` |

Uma página nova é um objeto `{ path, title, description, crumbs, body }` num destes
ficheiros; entra sozinha no sitemap e é verificada por `check.cjs`.

## Antes de publicar

A indexação está **desligada por omissão** (`noindex` em todas as páginas e
`robots.txt` a bloquear tudo), como decidido em `docs/SITE-MAPA-SEO.md`, enquanto a
marca e o domínio forem provisórios. No domínio definitivo:

```bash
INDEXAR=true SITE_URL=https://dominio-final.pt node site/build.cjs
```

Estão marcados `POR CONFIRMAR` em `src/config.cjs`:

- **Domínio** (`siteUrl`) e **email** de contacto;
- **Preços** dos pacotes (valores de referência; nomes e limites vêm de
  `backend/src/config/migrations-platform/plans.js`);
- **Formulário**: sem `CONTACT_ENDPOINT`, abre o programa de email do visitante. Com
  `CONTACT_ENDPOINT=https://…`, envia um POST em JSON (`nome`, `email`, `telefone`,
  `alojamentos`, `mensagem`) para esse endereço, que deve validar no servidor e ter
  proteção contra abuso;
- **Privacidade e Termos**: textos provisórios, com um aviso visível; falta a
  identificação da entidade e revisão jurídica;
- **Promessas no texto** a confirmar: resposta em um dia útil, conta de experiência,
  apoio prioritário no Premium.

## Alojamento

`dist/` inclui `_redirects` e `_headers` no formato de Netlify e Cloudflare Pages
(301 das variantes de URL, cache de um ano em `/assets/`, cabeçalhos de segurança e
CSP). Noutro servidor, as mesmas regras passam para a sua configuração. O servidor
tem de responder com 404 verdadeiro a partir de `404.html`, redirecionar para o URL
com barra final e comprimir texto (gzip ou brotli).

Se o site ficar no mesmo domínio da aplicação, as páginas da aplicação, de reserva e
de estado devem ter `noindex`; hoje o site parte do princípio de que fica num domínio
ou subdomínio próprio.

Depois de publicar: registar o domínio na Google Search Console, submeter
`/sitemap.xml` e pedir a indexação da página inicial.

## Decisões

- **Sem FAQPage nos dados estruturados**: a Google deixou de mostrar resultados
  enriquecidos de FAQ em 2026. As perguntas estão visíveis no HTML.
- **Dados estruturados**: `Organization`, `WebSite`, `WebPage`/`Article`,
  `BreadcrumbList` e `SoftwareApplication` (início e preços).
- **Animações só em CSS** (`animation-timeline`, View Transitions), com
  `prefers-reduced-motion` respeitado; sem suporte, o conteúdo está simplesmente visível.
- **Ecrãs do produto ilustrados em HTML**, com dados de exemplo assinalados, em vez de
  capturas: são leves, nítidos e não expõem dados reais.
- **Fontes alojadas localmente** (Playfair Display e DM Sans, licença SIL OFL).
