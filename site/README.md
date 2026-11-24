# Site público da Santa Paciência

Site de apresentação da plataforma, feito em [Astro](https://astro.build) com saída
estática (`site/dist`). Não depende da aplicação e pode ser alojado em qualquer serviço
de ficheiros estáticos. O aspeto segue a direção «H · Calçada Basalto» (maquetas aprovadas).

Fase atual: início, preços, acesso antecipado, «Para quem», perguntas frequentes, sobre, contacto,
guias, privacidade, termos e 404, mais as páginas de funcionalidades, em **português (raiz) e inglês (`/en/`)**:
26 páginas em cada língua (ver «Línguas» abaixo). As do `docs/SITE-MAPA-SEO.md`
que faltem estão listadas em `PENDENTES` no `scripts/check.mjs`.

## Usar

```bash
cd site
npm ci              # instala as dependências (versões fixas)
npm run dev         # servidor de desenvolvimento em http://localhost:4321
npm run build       # constrói em site/dist
npm run preview     # serve o resultado do build
npm run check       # verifica site/dist (corre depois do build)
npm run og          # regenera as imagens de partilha em public/og/ (ver abaixo)
```

Variáveis de ambiente (todas opcionais):

| Variável | Para quê | Por omissão |
|---|---|---|
| `SITE_URL` | Domínio de `canonical`, Open Graph, `sitemap.xml` e `robots.txt` | `https://santapaciencia.xyz` |
| `INDEXAR` | `true` liga a indexação (sem `noindex`, `robots.txt` aberto) | desligada |
| `CONTACT_ENDPOINT` | Endereço que recebe o formulário de acesso antecipado por POST | vazio (abre o email) |
| `CONTACT_EMAIL` | Email de contacto | `ola@santapaciencia.xyz` |
| `APP_URL` | Endereço da aplicação (acrescenta «Entrar» ao menu) | vazio |

```bash
INDEXAR=true SITE_URL=https://dominio-final.pt npm run build && INDEXAR=true SITE_URL=https://dominio-final.pt npm run check
```

O `check` deve correr com as mesmas variáveis do `build`.

## Onde mudar o quê

| O quê | Onde |
|---|---|
| Nome da marca, domínio, email, `INDEXAR`, endpoint, preços dos planos | `src/config/brand.ts` (o texto dos planos está em `src/i18n/*/comum.ts`) |
| Cores, tipografia e espaçamento (tokens em `:root`) | `src/styles/tokens.css` |
| Restante CSS (por secção) | `src/styles/*.css`, reunidos em `global.css` |
| Textos de cada página e dos componentes, por língua | `src/i18n/pt/*.ts` e `src/i18n/en/*.ts` (mesma estrutura; ver «Línguas») |
| Endereços PT/EN de cada página (seletor de língua, `hreflang`, sitemap) | `src/i18n/rotas.ts` |
| `<head>`, canonical, Open Graph, `noindex`, `hreflang`, JSON-LD comum | `src/layouts/Base.astro` |
| Modelo de página de funcionalidade | `src/layouts/Feature.astro` |
| Cabeçalho, rodapé, calçada, ícones, FAQ, planos, formulário… | `src/components/` |
| Páginas (um ficheiro por endereço, só chama a vista com a língua) | `src/pages/` (PT) e `src/pages/en/` (EN) |
| Vistas: a estrutura de cada página, igual nas duas línguas | `src/views/*.astro` e `src/views/funcionalidades/*.astro` |
| «Para quem» (`/para/…`, `/en/for/…`): textos, blocos e planos recomendados | `src/i18n/*/perfis.ts`, vista `src/views/PerfilPagina.astro`, modelo em `src/layouts/Perfil.astro`, cartões de plano em `src/components/PlanoRecomendado.astro` |
| Perguntas frequentes (por temas, com JSON-LD) | `src/i18n/*/paginas.ts` (`perguntas`), vista `src/views/Perguntas.astro` |
| Sobre e contacto | `src/i18n/*/paginas.ts`, vistas `Sobre.astro` e `Contacto.astro` (o formulário é o `AccessForm`, com a prop `assunto`) |
| Guias (Markdown, coleção `guias`) | PT em `src/content/guias/*.md`, EN em `src/content/guias/en/*.md`; esquema em `src/content.config.ts` (campos `lang` e `par`); vistas `GuiaPagina.astro` e `IndiceGuias.astro`. O tempo de leitura calcula-se do texto (`src/config/guias.ts`) |
| Privacidade e termos (textos provisórios) | `src/i18n/*/paginas.ts` (`privacidade`, `termos`), vista `src/views/Legal.astro`, modelo em `src/layouts/Legal.astro` |
| Topo escuro das páginas de texto | `src/components/PageHero.astro` |
| CSS das páginas acima | `src/styles/paginas.css` |
| Menu e rodapé (ligações) | `src/components/Header.astro`, `src/components/Footer.astro` |
| `sitemap.xml` e `robots.txt` | `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts` |
| Imagens e ícones | `public/img/` |
| Verificação pós-build | `scripts/check.mjs` |
| Imagens de partilha (geradas) | `scripts/og.mjs` → `public/og/` |

Uma página nova é uma vista em `src/views/` com o texto em `src/i18n/pt` e `src/i18n/en`, mais um ficheiro em
`src/pages/` e outro em `src/pages/en/` que só chamam a vista (entram sozinhos no sitemap; os guias entram pela
coleção). Acrescentar o par de endereços em `src/i18n/rotas.ts`. Uma página de funcionalidade nova usa o layout
`Feature.astro` e passa o texto como propriedades (ver `src/views/funcionalidades/PagamentosOnline.astro`).
Quando uma página que estava por criar passa a existir, remover o seu prefixo do array `PENDENTES` em `scripts/check.mjs`.

## Línguas (PT e EN)

- Português na raiz e inglês em `/en/`, com endereços traduzidos (`docs/SITE-MAPA-SEO.md`, secção 2): por exemplo
  `/funcionalidades/calendario/` ↔ `/en/features/calendar/`. Os pares estão em `src/i18n/rotas.ts`; os dos guias vêm
  do campo `par` do Markdown PT (o slug do guia equivalente em `en/`).
- O texto está em dicionários por língua (`src/i18n/pt/*.ts`, `src/i18n/en/*.ts`). O português é a fonte do tipo:
  o inglês tem de ter a mesma estrutura e o TypeScript avisa quando falta uma chave. Páginas, layouts e componentes recebem
  a língua (`lang`) e leem com `t(lang)`. Os preços formatam-se com `eur(lang, n)`: «19 €» em PT e «€19» em EN; as datas
  por extenso com `dataLonga(data, lang)`.
- Cada página PT aponta para a EN e vice-versa (`hreflang="pt-PT"`, `"en"` e `x-default` = PT), com o `<html lang>`
  certo, `og:locale` e `inLanguage` do JSON-LD. O seletor de língua (cabeçalho e rodapé) leva à página equivalente; na
  404 leva ao início da outra língua. O `sitemap.xml` traz as páginas EN e as alternativas (`xhtml:link`).
- A 404 EN fica em `/en/404/` (a PT em `/404.html`), com `noindex`: o servidor deve usá-la como página de erro de `/en/`.
- Os visuais (calendário, cartões, telemóvel) levam dados de exemplo nas duas línguas (em EN: datas «9 Nov», moeda «€120.00»).
- Termos que se mantêm em inglês: SIBA, «tourist tax», «Complaints Book (Livro de Reclamações)». O «Alojamento Local (AL)»
  explica-se uma vez, no topo do início EN.
- Não prometer em EN o que não existe (`docs/SITE-MAPA-SEO.md`, secção 6): sem sincronização com o Airbnb e o Booking.com,
  sem comunicação automática ao SIBA, sem faturação certificada.

## Imagens de partilha (`npm run og`)

Cada página tem uma imagem Open Graph / Twitter de 1200×630 (JPEG, qualidade 80) em
`public/og/<caminho-com-hífens>.jpg` (o início é `inicio.jpg`; `/guias/x/` dá `guias-x.jpg`; as EN levam o prefixo `en-`:
`/en/` dá `en.jpg` e `/en/features/calendar/` dá `en-features-calendar.jpg`, com o rótulo e o H1 em inglês). O `Base.astro`
liga-a sozinho (`og:image`, largura, altura, `og:image:alt` = H1, `twitter:card=summary_large_image`) e, se a
imagem da página não existir, usa `inicio.jpg`. O `npm run check` confirma que cada `og:image` existe no `dist`.

`npm run og` faz o build, lê o H1 e o caminho de cada página do `dist`, desenha-os (fundo basalto, calçada,
logótipo, rótulo da secção e H1 em Bricolage Grotesque) e tira a captura com Playwright. Corra-o sempre que mudar
um H1, uma página ou o nome da marca, depois `npm run build` (as imagens são commitadas). O Playwright não é
dependência do projeto: tem de estar instalado (`npm i -g playwright`). Se o import falhar, defina o caminho:
`PLAYWRIGHT_PATH=$(npm root -g)/playwright npm run og`. Com o `dist` já feito: `node scripts/og.mjs --sem-build`.
O rótulo de cada secção está em `ROTULOS` (PT) e `ROTULOS_EN` (EN) no `scripts/og.mjs`.

## Verificação (`npm run check`)

Além do que está descrito no cabeçalho do `scripts/check.mjs` (título e descrição únicos, um só `h1`, ligações internas,
`og:image`, JSON-LD, `noindex`, `robots.txt` e sitemap), confirma em cada página o `<html lang>`, o par `hreflang`
recíproco (a equivalente existe e aponta de volta; as alternativas do sitemap coincidem), o seletor de língua, o
`inLanguage` do JSON-LD, que as duas línguas não se misturam nas ligações e que o texto EN não tem preços «19 €»
nem palavras portuguesas soltas.

## Verificação (`npm run check`)

Por página: `title` único (aviso acima de 65 caracteres), `description` única (70–160),
um só `h1`, `canonical` absoluto, `noindex` coerente com `INDEXAR`, JSON-LD válido, imagens
com `alt`. No conjunto: ligações internas (e âncoras) sem 404, `robots.txt` e `sitemap.xml`
coerentes. Sai com código ≠ 0 se algo falhar.

## Antes de publicar

A indexação está **desligada por omissão** (`noindex` em todas as páginas e `robots.txt`
a bloquear tudo), como decidido em `docs/SITE-MAPA-SEO.md`, enquanto a marca e o domínio
forem provisórios. No domínio definitivo, construir com `INDEXAR=true` e `SITE_URL=…`.

Estão marcados `POR CONFIRMAR` em `src/config/brand.ts`:

- **Domínio** (`siteUrl`) e **email** de contacto;
- **Preços** dos planos (19/49/99 € por mês; 15/39/79 € no plano anual) e o «2 meses grátis»;
  o mapa SEO diz que os preços não são publicados nesta fase: decidir antes de ligar a indexação;
- **Formulário**: sem `CONTACT_ENDPOINT`, abre o programa de email do visitante. Com
  `CONTACT_ENDPOINT=https://…`, envia um POST em JSON (`nome`, `email`, `telefone`,
  `alojamentos`, `canais`, `assunto` (só na página de contacto), `mensagem`), que o servidor deve validar e proteger contra abuso;
- **Promessas no texto** a confirmar: sem comissões, ajuda prioritária no Premium, «Livro de
  Reclamações» na página de reservas (ver a secção 6 do `docs/SITE-MAPA-SEO.md`).

## Alojamento

O resultado é só ficheiros estáticos. O servidor tem de responder com 404 verdadeiro a
partir de `404.html`, usar sempre o endereço com barra final (`trailingSlash: 'always'`) e
comprimir texto (gzip ou brotli). As fontes (Inter e Bricolage Grotesque) vão dentro de
`dist/_astro/`, sem pedidos a terceiros; os ficheiros com hash podem ter cache longa.

Depois de publicar: registar o domínio na Google Search Console, submeter `/sitemap.xml` e
pedir a indexação da página inicial.

## Decisões

- **Astro sem frameworks de UI nem Tailwind**: o CSS é o da maqueta, em ficheiros por secção.
  O JavaScript limita-se a pequenos scripts (menu, alternador de preços, formulário, calçada).
- **Conteúdo visível sem JavaScript**: as animações só acrescentam; a calçada é decorativa.
- **Animações em CSS** com `prefers-reduced-motion` respeitado; transições entre páginas
  com `@view-transition`.
- **Ecrãs do produto ilustrados em HTML**, com dados de exemplo, em vez de capturas.
- **Fontes alojadas localmente** (`@fontsource-variable`, licença SIL OFL).
