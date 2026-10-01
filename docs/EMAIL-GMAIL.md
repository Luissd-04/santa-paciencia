# Emails no Gmail para iPhone

Atualização de 27 de setembro de 2026. O utilizador confirmou que os fundos
estão corretos, mas a captura de pré-check-in mostra texto claro sobre creme
e letras escuras no botão terracota. Correção de legibilidade preparada
localmente; ainda falta validar uma mensagem nova no Gmail do iPhone.

## Mensagens simples versus modelos

O utilizador esclareceu que os previews de teste já estão legíveis no modo
escuro; a falha permanece no email escrito diretamente no separador Mensagens.
Foi comparado o email específico «teste» de 27/09 às 18:22 com o preview:
o MIME conserva o doctype e o mesmo CSS, incluindo as camadas de mistura.
O corpo da mensagem simples, porém, é texto solto diretamente na célula;
os modelos usam parágrafos com a cor explícita.

A composição agora envolve corpos constituídos apenas por texto e elementos
inline num parágrafo com a mesma tipografia e cor dos modelos. Parágrafos,
listas e tabelas existentes não são envolvidos nem reestruturados. Esta é
uma correção direcionada à diferença observada no HTML, não uma confirmação
da causa no motor do Gmail. A proteção global dos previews foi conservada.

Validação local: 169 testes e análise estática passaram. As amostras incluem
o texto solto real do editor e uma mensagem com negrito/quebra de linha.
Continua a faltar validar uma mensagem nova no Gmail do iPhone em modo escuro;
uma simulação no browser não substitui esse teste. Alteração ainda por publicar.

## Logótipo carregado e preview

### Imagem ausente no email recebido

Depois de corrigida a seleção, o preview mostrava o upload mas o email recebido
mostrava uma imagem partida. A instalação local não tem `PUBLIC_APP_URL` nem
`FRONTEND_PUBLIC_URL`: o HTML referenciava `http://localhost:3001/uploads/...`,
acessível ao browser local mas não ao destinatário.

O transporte Gmail agora incorpora os logótipos carregados da própria
organização em MIME `multipart/related`, com `Content-ID` e `src="cid:..."`.
O preview mantém o URL normal. Os bytes da imagem seguem em base64 sem nova
compressão, independentemente de a aplicação estar publicamente acessível.
Só se leem ficheiros referenciados como logótipo pela organização remetente;
imagens externas e caminhos arbitrários não são descarregados/incorporados.

Validação: 167 testes passaram, incluindo o pedido Gmail simulado com o MIME
completo, isolamento entre organizações e preservação dos bytes. Uma mensagem
local com o upload real foi analisada por um parser MIME independente. Nenhum
email de teste foi enviado por esta validação; falta confirmar o próximo
preview recebido no cliente do utilizador.

Em 27 de setembro, após upload de um PNG maior, o utilizador confirmou que a
pré-visualização e um novo email de teste continuavam desfocados. O contexto
«Definições da organização» usava sempre o PNG antigo de 240 × 80 px do site;
o logótipo carregado só era escolhido com um alojamento explícito.

- Sem alojamento selecionado, usa-se agora o logótipo do único alojamento
  principal da própria organização. Se houver vários, continua a ser preciso
  selecionar o alojamento; não se escolhe uma marca arbitrária.
- O scheduler e os reenvios da fila passam também o logótipo do alojamento.
- Uploads de logótipos PNG, JPEG e GIF conservam os bytes e a resolução;
  WebP/AVIF são convertidos para PNG. Fotografias mantêm o otimizador anterior.
- O upload existente estava em JPEG de 2000 × 674 px. Continua disponível;
  a preservação sem recompressão aplica-se aos próximos uploads.

Validação: 163 testes passaram e análise estática concluída. A regressão
compara o HTML do preview com um envio simulado, antes e depois da mudança
do upload, tanto sem seleção como com uma suite. O servidor local foi
reiniciado e respondeu HTTP 200 em `/health`. Confirmado, com os dados locais,
que o preview da organização agora resolve para o upload em vez do PNG antigo.

## Correção de legibilidade

- Retirado o recorte de gradiente nas letras, que não resolveu a captura.
- O HTML final recebe dois spans por nó de texto, sem envolver imagens ou
  superfícies. A composição abrange também modelos guardados, texto solto,
  negritos, links, cabeçalho e rodapé.
- Só no Gmail, `difference` e `screen` mantêm letras claras sobre terracota;
  `difference` e `exclusion` produzem letras escuras sobre creme. Neste cliente
  privilegia-se contraste: os tons de texto secundários ficam próximos de
  preto e os rótulos sobre terracota ficam brancos. Fundos mantêm a paleta.
- Nos outros clientes os spans herdam as cores existentes. O texto continua
  selecionável e as ligações, sanitização e marcadores do corpo mantêm-se.
- O script de amostras inclui pré-check-in e simulações das camadas antes e
  depois de inverter preto/branco. Estas simulações verificam a mistura de
  cores; não reproduzem o processamento real do Gmail.

Validação: 43 testes de composição e análise estática; 36 capturas de seis
casos, sem overflow a 320, 390 e 1440 px. Inspecionados pré-check-in a 320 px
e simulação escura a 390 px. Nenhum email foi enviado nem a versão publicada.

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
- Na versão anterior, `sp-ink` limitava o recorte das letras a elementos sem
  fundo próprio; a correção atual substitui esse CSS pelas camadas de mistura.
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
- [Variante para texto escuro, Colton Eakins](https://github.com/matthieuSolente/email-darkmode#force-black-text-on-dark-mode-in-gmail-colton-eakins)
  — `exclusion` sobre uma superfície clara, combinado com `difference`.
