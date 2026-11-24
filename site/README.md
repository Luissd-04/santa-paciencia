# Site público da Santa Paciência

Site de apresentação da plataforma, feito em [Astro](https://astro.build) com saída
estática (`site/dist`). Não depende da aplicação e pode ser alojado em qualquer serviço
de ficheiros estáticos. O aspeto segue a direção «H · Calçada Basalto» (maquetas aprovadas).

Fase atual: início, funcionalidade «Pagamentos online» (modelo das restantes), preços,
acesso antecipado e 404. As outras páginas do `docs/SITE-MAPA-SEO.md` estão por criar.

## Usar

```bash
cd site
npm ci              # instala as dependências (versões fixas)
npm run dev         # servidor de desenvolvimento em http://localhost:4321
npm run build       # constrói em site/dist
npm run preview     # serve o resultado do build
npm run check       # verifica site/dist (corre depois do build)
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
| Nome da marca, domínio, email, `INDEXAR`, endpoint, planos e preços | `src/config/brand.ts` |
| Cores, tipografia e espaçamento (tokens em `:root`) | `src/styles/tokens.css` |
| Restante CSS (por secção) | `src/styles/*.css`, reunidos em `global.css` |
| `<head>`, canonical, Open Graph, `noindex`, `hreflang`, JSON-LD comum | `src/layouts/Base.astro` |
| Modelo de página de funcionalidade | `src/layouts/Feature.astro` |
| Cabeçalho, rodapé, calçada, ícones, FAQ, planos, formulário… | `src/components/` |
| Páginas | `src/pages/` (uma por endereço) |
| `sitemap.xml` e `robots.txt` | `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts` |
| Imagens e ícones | `public/img/` |
| Verificação pós-build | `scripts/check.mjs` |

Uma página nova é um ficheiro em `src/pages/` (entra sozinha no sitemap). Uma página de
funcionalidade nova usa o layout `Feature.astro` e passa o texto como propriedades (ver
`src/pages/funcionalidades/pagamentos-online.astro`). Quando uma página que estava por criar
passa a existir, remover o seu prefixo do array `PENDENTES` em `scripts/check.mjs`.

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
  `alojamentos`, `canais`, `mensagem`), que o servidor deve validar e proteger contra abuso;
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
