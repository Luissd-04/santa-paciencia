# Reservas no seu site (WordPress e outros)

A página de reservas do alojamento (`/reservar/<slug>`) pode aparecer dentro do
site do proprietário, sem o topo nem o rodapé da aplicação, com a altura
ajustada ao conteúdo. Está incluída no plano **Premium** (funcionalidade
`booking_embed` do pacote; organizações sem pacote também a têm).

## 1. Autorizar o site

O browser só mostra a página dentro de sites que o proprietário autorizou
(cabeçalho `Content-Security-Policy: frame-ancestors`). Até haver a secção na
Área do proprietário, usa-se a API (só o proprietário):

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
  formulário não ficar por baixo dele ao mudar de passo.

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

- `/embed.js` cria o iframe com `/reservar/<slug>?embed=1`, `loading="lazy"`,
  `allow="payment"`, sem barra de deslocamento, e ouve **só** as mensagens
  vindas do domínio da aplicação: a altura (`sp-embed-height`) e a mudança de
  passo (`sp-embed-step`), que leva o topo do formulário à vista.
- Em `?embed=1` a página não tem o nosso topo, o fundo é transparente (fica o do
  site) e mantém as cores e as fotografias do alojamento. Um eventual
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
