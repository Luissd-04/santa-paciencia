# Emails no Gmail para iPhone

Diagnóstico de 26 de setembro de 2026. Estado: o utilizador enviou novas capturas
do Gmail iPhone nas quais o creme e o terracota se mantêm. Refinamento visual
subsequente preparado localmente, ainda pendente de teste no dispositivo.

## Observação

O utilizador confirmou iPhone, aplicação Gmail e conta Google. A captura de
uma mensagem avulsa com assunto «teste» mostra fundo creme castanho-escuro,
cabeçalho terracota salmão e texto alterado. Não foi inspecionado o HTML MIME
dessa mensagem nem confirmada a versão do servidor que a enviou.

As capturas seguintes mostram melhoria das cores, mas moldura exterior bege
retangular, contornos escuros na tabela, círculo salmão e logótipo pouco nítido.
O utilizador aprovou testar uma composição mais leve.

## O que se confirmou no código

- Envio manual, modelos e pré-visualização usam `emailComposer.js`.
- O CSS juntava PNG remoto e gradiente na mesma declaração `background-image`,
  tanto inline como no único bloco de estilos. Existe um precedente documentado
  de o Gmail remover estilos que contêm `url()`. Isto é uma hipótese relevante
  para a captura, não uma causa comprovada neste dispositivo.
- As regras Gmail para texto substituíam o `background-image` do próprio
  elemento e recortavam o fundo às letras. Só havia uma exceção para terracota;
  elementos com fundo creme e cor de texto podiam perder a superfície.
- A sanitização retirava o atalho `background`, sem restaurar sempre
  `background-color`. Modelos antigos podiam ficar sem cor de recurso.
- O teste chamado «mantém a paleta clara» verificava apenas strings do HTML.
  O nome foi corrigido: a presença de CSS não prova renderização no Gmail.

## Alteração preparada

- CSS de fundo com gradiente sólido, sem `url()` nem múltiplas imagens.
- PNG da paleta no atributo HTML `background` das tabelas/células e moldura;
  gradiente e cor inline continuam disponíveis sem imagens remotas.
- Classe `sp-ink` limita o recorte das letras a elementos sem fundo próprio.
- Cor de recurso preservada também nos modelos antigos, sem migrar a base.
- O atributo `background` recebido do editor é descartado; só são geradas
  URLs das texturas conhecidas pelo compositor.

Não há garantia universal de preservar cores: o Gmail processa HTML/CSS e
aplica a sua própria transformação. Em particular, forçar um fundo claro
obriga a verificar que o texto continua escuro e legível. Não trocar o email
inteiro por uma imagem, pois perderia texto selecionável e acessibilidade.

## Refinamento visual para teste

- Moldura exterior transparente, sem `bgcolor` nem textura; as proteções de
  cor mantêm-se no cartão interior. No telemóvel, margem exterior de 8 px na
  vertical e sem margem horizontal adicional à do cliente de email.
- Cabeçalho com menos espaço vertical e logótipo de 220 px, limitado à largura
  disponível. Visto sem círculo; cartão de reserva sem contornos nem linhas,
  com fundos alternados e faixa terracota do total.
- Rótulos/rodapé `#71665b` e subtítulo social `#865944`: contraste mínimo de
  4,81:1 e 5,12:1, respetivamente, sobre o fundo alternado mais escuro.
- O nome no rodapé continua a vir das definições da organização. A discrepância
  «Monte do Cano» / Santa Paciência observada não foi corrigida alterando dados.

O logótipo público usado atualmente tem 240 × 80 px. Foi conservado: as duas
tentativas com a ferramenta integrada de imagem (restauro em marfim com alpha;
depois remoção do quadriculado para fundo terracota) não preservaram a marca e
o fundo com fidelidade suficiente. Não se integrou uma reconstrução por IA.
O ficheiro original maior ou vetorial continua a ser a melhor origem para
um PNG de alta densidade; reduzir o tamanho de apresentação não cria detalhe.

## Validação antes de fechar

Validação local: 41 testes de composição, análise estática dos 201 ficheiros
JavaScript e restantes testes Node. O teste HTTP de miniaturas teve de ser
repetido fora da sandbox por bloqueio da porta local e passou. Foram geradas
12 capturas dos quatro exemplos em 1440, 390 e 320 px, sem overflow horizontal;
inspecionadas as capturas de boas-vindas a 390 px e confirmação a 320 px.
Estas capturas usam Chromium e não demonstram o resultado no Gmail iOS.

No refinamento: 41 testes de composição passaram e foram geradas 20 capturas
de cinco exemplos (incluindo mensagem manual), em 1440, 390 e 320 px e em
390 px com envolvente escura. Inspecionadas confirmação a 320 px e confirmação
com envolvente escura, além da mensagem manual. Não há overflow horizontal.
O HTML exportado pelo script resolve as texturas locais sem domínio fictício.
As capturas com envolvente escura não simulam a inversão de cores do Gmail.

1. Confirmar que a versão publicada contém esta alteração e que
   `PUBLIC_APP_URL` aponta à origem HTTPS pública. Os PNG em `/img/email/`
   devem abrir sem autenticação.
2. Enviar uma mensagem avulsa nova com «teste» e assunto identificável, e uma
   confirmação com cartão de reserva. Uma mensagem antiga mantém o HTML antigo.
3. Abrir ambas no Gmail do iPhone em modo claro e escuro. Verificar envolvente
   exterior sem moldura bege, corpo/rodapé `#faf5ec`, cabeçalho `#843424`, texto,
   links, total e botões. Guardar capturas e versões de Gmail/iOS.
4. Verificar legibilidade com imagens bloqueadas e os mesmos emails em Gmail
   web, Apple Mail e Outlook. Confirmar larguras de 320 e 390 px.
5. Se persistir, obter o original MIME da mensagem nova para comparar com o
   HTML produzido; distinguir versão antiga, remoção de estilos, imagens
   inacessíveis e transformação de cores antes de acrescentar outro workaround.

## Referências

- [Google: CSS aceite pelo Gmail](https://developers.google.com/workspace/gmail/design/css)
  — as media queries documentadas não incluem `prefers-color-scheme`.
- [Can I email: background-image](https://www.caniemail.com/features/css-background-image/)
  — resultados de testes e limitações, incluindo remoção de estilos com URL.
- [Parcel: Gmail and background images](https://parcel.io/blog/gmail-and-background-images)
  — investigação do problema e uso do atributo HTML `background`.
- [Rémi Parmentier: Gmail dark mode e blend modes](https://www.hteumeuleu.com/2021/fixing-gmail-dark-mode-css-blend-modes/)
  — comportamento do Gmail iOS; a solução demonstrada limita-se a texto branco
  e não resolve por si só a paleta creme com texto escuro.
