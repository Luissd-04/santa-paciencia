# Reservas no seu site (WordPress e outros)

A página de reservas do alojamento (`/reservar/<slug>`) pode aparecer dentro do
site do proprietário, sem o topo nem o rodapé da aplicação, com a altura
ajustada ao conteúdo. Está incluída no plano **Premium** (funcionalidade
`booking_embed` do pacote; organizações sem pacote também a têm).

## 1. Autorizar o site

O browser só mostra a página dentro de sites que o proprietário autorizou
(cabeçalho `Content-Security-Policy: frame-ancestors`). Na Área do
proprietário: **No teu site → Domínios autorizados**. Pela API (só o
proprietário):

```http
GET /api/embed/settings
PUT /api/embed/settings
Content-Type: application/json

{ "origins": ["https://www.quintadovale.pt", "https://quintadovale.pt"] }
```

O `GET` devolve as origens gravadas, se o plano inclui a funcionalidade
(`available`) e o código pronto a colar para cada alojamento
(`accommodations[].snippet.script` e `.iframe`).

Regras dos **Domínios autorizados**:

- Endereço completo do site, com `https://`: `https://www.quintadovale.pt`.
  Escrever `www.quintadovale.pt` também serve (passa a `https://`).
- Sem páginas nem parâmetros (`https://site.pt/reservas` é recusado: autoriza-se
  o site inteiro).
- Acrescente as duas formas se o site abrir com e sem `www`.
- Sem curingas (`https://*.site.pt`): autorizariam também subdomínios que o
  cliente não controla. Até 10 sites.
- `http://` só para testes em `localhost` / `127.0.0.1`.
- Lista vazia: a página deixa de poder ser mostrada noutros sites.

## 2. Colar o código

```html
<div data-sp-reservas="quinta-do-vale"></div>
<script src="https://santapaciencia.xyz/embed.js" async></script>
```

(`quinta-do-vale` é o fim do link de reservas do alojamento; o domínio é o da
aplicação.)

- **WordPress (Gutenberg):** editar a página → «+» → bloco **HTML
  personalizado** → colar → Atualizar. Pré-visualize a página publicada (o
  editor pode não executar scripts).
- **Elementor:** arrastar o widget **HTML** para a secção → colar o código.
- Outros construtores: qualquer bloco que aceite HTML com `<script>`.

Opções no `<div>`:

- `data-titulo="Reservar na Quinta do Vale"` — título do iframe (leitores de ecrã).
- `data-offset="80"` — altura, em píxeis, de um cabeçalho fixo do tema, para o
  formulário não ficar por baixo dele ao mudar de passo (e para o resumo à
  direita ficar abaixo do cabeçalho).
- `data-estilo="nao"` — não copiar o estilo do site (fica só o escolhido em
  «Aspeto»).

### Dicas para o WordPress

- Use um **modelo de página sem barra lateral** («Largura total», «Full width»,
  «Elementor — tela inteira» ou «Elementor Canvas» com o cabeçalho do tema). Com
  barra lateral, o formulário fica estreito e, no telemóvel, os widgets da
  barra aparecem depois dele.
- **Apague os blocos de exemplo do tema** (pesquisa, «Recent posts», «Recent
  comments», arquivo, categorias): em Aparência → Widgets ou no Elementor. No
  telemóvel aparecem por baixo do formulário e parecem um espaço vazio.
- Não ponha o bloco dentro de uma caixa com fundo branco num site escuro (ou o
  contrário): o «Automático» lê a cor por trás do bloco.

## 2.1 Aspeto (só a página dentro do site)

Na Área do proprietário: **No teu site → Aspeto**, com pré-visualização. Muda só
a página incorporada; a página normal `/reservar/<slug>` fica igual.

| Opção | Valores | «Automático (do site)» |
| --- | --- | --- |
| Tema | `auto`, `light`, `dark` | cor de fundo por trás do bloco: escura → tema escuro |
| Letra | `auto`, `platform`, `Jost`, `Montserrat`, `Lato`, `Playfair Display`, `Cormorant Garamond`, `Raleway` | letra do texto e dos títulos do site, se for uma do Google Fonts da lista; senão uma genérica com ou sem serifa |
| Cantos | `auto`, `rounded`, `square` | cantos do botão principal do site (0 → retos) |
| Cor de destaque | `auto` ou `#RRGGBB` | cor do botão principal do site; sem ela, a cor principal da conta (Marca), senão a do alojamento |
| Etiquetas em maiúsculas | `auto`, `true`, `false` | o botão principal está em maiúsculas ou espaçado |
| Começar logo nas datas | `true` / `false` | — (esconde a fotografia de topo e a descrição) |

Por omissão está tudo em «Automático» (a página copia o estilo do site sem
configurar nada). Uma opção escolhida ganha sempre ao que for detetado.

```http
PUT /api/embed/settings
Content-Type: application/json

{ "style": { "theme": "dark", "font": "Jost", "corners": "square", "accent": "#85391F",
             "uppercaseLabels": true, "startAtDates": true } }
```

- Pode mandar só `style`, só `origins`, ou os dois; os campos de `style` que não
  vierem ficam como estavam. Valores fora das listas ou cores que não sejam
  `#RRGGBB` dão 400 (e nada é gravado). Fica no registo de atividade
  (`settings.embed_style_changed`).
- O `GET` devolve também `style`, `style_options`, `default_accent` e `detected`
  (o último estilo lido num site autorizado: `origin`, `at`, `values`).
- Guardado em `organization_settings` (`embed_style`; o detetado em
  `embed_detected`).

**Como é aplicado:** o carregador (`/embed.js`) lê, na página do cliente, a cor
de fundo do primeiro antepassado opaco do bloco, a letra do bloco e do primeiro
título visível, e o botão mais «de marca» do site (`.elementor-button`,
`.wp-block-button__link`, `button`, `a[class*=button]`…, de preferência com fundo
colorido e texto «Reservar»). Vai no endereço do iframe:
`?embed=1&sp_theme=dark&sp_bg=151719&sp_font=Jost,sans-serif&sp_hfont=…&sp_accent=85391f&sp_radius=0&sp_upper=1`.
O servidor valida cada parâmetro (listas fechadas, `#rrggbb`, inteiros), junta-o
ao que foi escolhido e escreve o resultado como atributos e variáveis CSS no
`<html data-embed="1" data-sp-theme=… style="--sp-accent:…">`, com a folha
`/css/public-embed.css` e a da letra (Google Fonts). Não há um instante com o
tema errado e nenhum texto vindo do site chega ao HTML. O tom da cor usado como
texto (ligações) é ajustado para ter contraste de 4,5:1 sobre o fundo.

No site real (santapaciencia.pt) a deteção dá: fundo `#151719` (escuro), letra
Jost, cor `#85391F`, cantos retos, maiúsculas.

### Sem script (alternativa)

Se o site não permitir `<script>`:

```html
<iframe src="https://santapaciencia.xyz/reservar/quinta-do-vale?embed=1"
  title="Reservar estadia" loading="lazy" allow="payment"
  style="width:100%;min-height:1400px;border:0;"></iframe>
```

Aqui a altura é fixa: o iframe terá barra de deslocamento própria quando o
conteúdo for maior.

## 3. Como funciona

- `/embed.js` cria o iframe com `/reservar/<slug>?embed=1` (mais o estilo
  detetado), `loading="lazy"`, `allow="payment"`, sem barra de deslocamento, e
  ouve **só** as mensagens vindas do domínio da aplicação: a altura
  (`sp-embed-height`), a mudança de passo (`sp-embed-step`), que leva o topo do
  formulário à vista, e o estado da barra do telemóvel (`sp-embed-bar`).
- **Telemóvel:** dentro do iframe (tão alto como o conteúdo) uma barra fixa
  ficaria no fim, longe do ecrã. A barra com o total e «Continuar» fica no fim
  do formulário e, enquanto o formulário está à vista e essa barra não, o
  carregador desenha uma barra fixa no fundo do ecrã **na página do cliente**
  (com a margem do iPhone, `safe-area-inset-bottom`). Os botões mandam
  `sp-embed-action` (`next`/`prev`) ao iframe; os erros do passo aparecem
  também nela.
- **Computador:** o resumo «A sua reserva» fica à direita. Como o iframe não tem
  deslocamento próprio, `position: sticky` não funciona: o carregador envia a
  zona do iframe que está à vista (`sp-embed-viewport`) e o resumo desloca-se
  para continuar à vista.
- Em `?embed=1` a página não tem o nosso topo, o fundo é transparente (fica o do
  site), as fotografias carregam logo (sem carregamento diferido, que dentro
  de um iframe de outra origem ficava por fazer no telemóvel). Um eventual
  `?accent=` é ignorado.
- Só `/reservar/<slug>?embed=1` recebe os sites autorizados no
  `frame-ancestors` (e perde o `X-Frame-Options`). Todas as outras páginas e a
  página normal de reservas continuam `frame-ancestors 'self'`.
- Plano sem a funcionalidade: `?embed=1` mostra «Disponível no plano Premium» e
  o `frame-ancestors` fica `'self'` (num site de fora o browser recusa o iframe).

## 4. Limitações

- **Pagamento:** o pedido de reserva não cobra nada; depois de o alojamento
  aceitar, o hóspede paga o sinal na página do pedido (`/reserva/<token>`). No
  iframe, a confirmação mostra **«Ver o meu pedido»**, que abre essa página num
  separador novo (fora do site). O Stripe Checkout não funciona dentro de um
  iframe, por isso o pagamento é sempre nessa página, ao nível de cima, e o
  regresso da Stripe (sucesso/cancelamento) volta também a ela, não ao site do
  cliente.
- **Janelas** (fotografias, ficha do quarto) abrem no topo do iframe e a página
  de fora desloca-se até lá.
- **Cookies:** a página de reservas não usa cookies próprios; o iframe funciona
  com cookies de terceiros bloqueados (Safari, Firefox, Chrome).
- **CAPTCHA (Cloudflare Turnstile):** funciona dentro de iframes. A
  verificação usa o domínio da aplicação (o do iframe), não o do site do
  cliente: não é preciso acrescentar o domínio do cliente no painel da
  Cloudflare.
- **SEO:** o conteúdo do iframe conta para o nosso domínio, não para o site do
  cliente, e a versão `?embed=1` tem `noindex`. Para o Google, o site do cliente
  deve ter o seu próprio texto (descrição, quartos, localização) à volta do
  bloco.
- **Análise de tráfego:** o Google Analytics/Pixel do site não vê o que se passa
  dentro do iframe.
