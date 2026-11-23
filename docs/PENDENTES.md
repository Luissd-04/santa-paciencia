# Pendentes — melhorias e bugs

Lista viva, iniciada a 23/11/2026 a partir da revisão da app com o dono do produto.
Cada ponto sai daqui quando estiver feito e verificado (o histórico fica no Git).
Os planos anteriores continuam em `ROADMAP.md`, `MELHORIAS.md`, `ESCOPO-V1-V2.md`
e `PLANO-CONSOLA.md`; esta lista será a base do documento único.

## A fazer

1. **Cartão «Pré-check-in» passa a «Portal do hóspede»** (ficha da reserva, `frontend/js/features/reserva-lista/detalhe.js` ~l.349-369)
   - Link principal: o portal `/reserva/:token`, com Enviar/Reenviar e Copiar.
   - O pré-check-in fica como linha de estado + «Preencher agora» (secundário).
   - Aparece também em `pendente`; só escondido em canceladas.
   - Reenviar manda um email com o link do portal (adaptar o modelo `pre_checkin` ou criar um novo).
2. **Portal do hóspede (`/reserva/:token`, `frontend/reservation-status.html`, `frontend/js/reservation-status-novo.js`)**: é a próxima coisa a trabalhar.
   - Problemas atuais:
     - uma coluna estreita (~490 px), mesmo no computador;
     - genérico: sem fotografia, só um «S» como logótipo, sem o nome do hóspede, sem contacto do anfitrião;
     - o pagamento aparece quatro vezes (cartão do sinal, passo 1, «Pagamentos», «Pagamentos e cancelamentos»);
     - etiquetas redundantes («Falta o sinal», «A aguardar o sinal», «Pagamento pendente»);
     - o nome da suite aparece duas vezes.
   - Proposta:
     - **Topo:** fotografia de capa do alojamento, com o logótipo, «Olá, <nome>», as datas, a unidade e o código da reserva. Cor do alojamento como cor de destaque.
     - **Computador, duas colunas.** Principal: um único cartão «Próximo passo», que muda com a fase (pagar o sinal → pré-check-in → pagar o restante → informações de chegada → durante a estadia → avaliar), e os passos por baixo. Lateral fixa: resumo da estadia (datas, noites, hóspedes, adicionar ao calendário), pagamentos (pago/falta/total, com a política recolhível) e o contacto do alojamento (telefone, email, WhatsApp).
     - **Telemóvel:** uma coluna pela mesma ordem, com o botão da ação principal fixo em baixo.
     - **Conteúdo por fase («concierge»):** com a reserva paga, mostrar no portal como chegar (mapa), como entrar, o Wi-Fi perto da data, as regras da casa e a saída. Depois da estadia: obrigado, avaliação e voltar a reservar. Os dados já existem no alojamento (`arrival_instructions`, `entry_instructions`, `checkout_instructions`, `review_url`, Wi-Fi). O código da porta e o Wi-Fi só aparecem perto da chegada e com a reserva paga, como no email `coordenadas`.
     - Uma só etiqueta de estado.
   - Antes de implementar: maqueta para aprovação.
3. **Linha da política de pagamento na ficha** (`detalhe.js` ~l.323-329)
   - Tornar mais fácil de ler: linhas ou etiquetas em vez de uma frase corrida.
   - Retirar «Copiar link da reserva e pagamento», que passa a estar no portal (depende do 1).

4. **Bug: «Ficha de hóspede» → «Voltar» não regressa à reserva.**
   - Causa: `openGuestCard(guestId, reservationId)` (`frontend/js/features/reserva-lista/documentos.js:454`) ignora `reservationId`; muda para a vista Hóspedes e o «Voltar» dessa ficha leva à lista de hóspedes.
   - Correção: guardar a origem (reserva) e o «Voltar» reabre a reserva. Acontece também no botão «Ficha» do cartão do hóspede (`detalhe.js:282`).
5. **Rever a geração dos documentos (Excel e PDF)**: Ficha de reserva, Ficha de hóspede, Conta corrente e Fatura.
   - Hoje: XLS com SheetJS, PDF com jsPDF, CSV à mão (`documentos.js`).
   - Objetivo: melhor aspeto e coerência entre formatos. Ver os ficheiros atuais antes de propor.

6. **Bug: notificação ilegível no painel do sino.** O texto aparece uma letra por linha.
   - Causa: os botões («Completar o alojamento», «Ver a reserva») ficam na mesma linha do texto e ocupam quase toda a largura (`notifActionsHtml`, `frontend/js/notifications.js:355`; CSS `.notifications-page-actions` em `css/views/operations.css:885`).
   - Correção: no painel, os botões passam para baixo do texto, que fica com a largura toda.
7. **Bug: «Falta o sinal em 3 reservas» → «Ver» só abre a primeira.**
   - Causa: `painelAttention` (`frontend/js/dashboard.js:336`) abre `list[0].id`. O mesmo acontece em «N pedidos por aprovar» e «Pré-check-in em falta».
   - Correção: com 1 reserva abre-a; com várias, abre a lista de reservas filtrada por essas.
8. **«Por receber» + filtros com escolha múltipla na lista de reservas**
   - Causa: `goToPendingPayments` (`dashboard.js:237`) põe `filter-pagamento = 'pendente'`, que só apanha as reservas sem nenhum pagamento. O valor do cartão (1980 €, 4 reservas) inclui também as parciais.
   - Proposta do utilizador: os filtros da lista passam a permitir várias opções ao mesmo tempo (ex.: Pagamento = Pendente + Parcial). «Por receber» abre com Pendente + Parcial.
   - Confirmar que a contagem do cartão bate certo com a lista filtrada.

9. **Vistas predefinidas por utilizador (Definições → «Vistas predefinidas»)**
   - Hoje: Eventos abre sempre em Semana (`frontend/js/eventos.js:31`). A escolha fica só em `AppModules.core.SS` (sessão do browser) e perde-se. No telemóvel é sempre Semana (`eventos.js:187`).
   - Outras vistas com o mesmo padrão e candidatas à mesma definição: Calendário (`calMode`, `tlDays` em `calendario.js:30`), Hóspedes (cartões/lista, `hospedes.js:14`), Relatórios (separador inicial, `relatorios.js:19`).
   - Proposta: preferência guardada por utilizador no servidor, para valer em todos os dispositivos. A escolha durante a sessão continua a sobrepor-se até sair. Por decidir: quais as vistas que entram.
   - **Duas predefinições por vista: Computador e Telemóvel.** A preferência é `{ ecrã: { desktop, mobile } }` e o tipo de dispositivo é decidido pela largura do ecrã, com o mesmo critério que a app já usa (ex.: `eventosPhone()`). O tablet conta como computador ou telemóvel conforme a largura.
   - Em cada coluna só aparecem as vistas que funcionam nesse tamanho. Hoje o telemóvel força Semana nos Eventos: confirmar se Mês/Lista ficam utilizáveis no telemóvel antes de as oferecer.
   - Nas Definições: uma tabela com uma linha por ecrã e duas colunas (Computador, Telemóvel). No telemóvel, mostrar as duas na mesma, para se poder configurar o outro dispositivo.

10. **Bug: scroll horizontal na tabela «Serviços e Taxas»** (Alojamentos)
    - Causa provável: a tabela usa `table-layout:fixed` com larguras fixas em px (`frontend/views/alojamentos.html:78-86`). O conteúdo das células não cabe nelas, porque a margem interior da célula (14 px de cada lado) se soma ao conteúdo:
      - na última coluna (40 px), o espaço de 32 px ou o botão de apagar mais a margem dão uns 60 px e passam além da borda direita da tabela. O `.table-wrap` (`overflow-x:auto`) mostra então a barra;
      - o Valor (110 px, com um campo de 90 px) e o Ativo (60 px, com o interruptor) também transbordam.
    - Correção: dar às colunas larguras que cabem no conteúdo (ou retirar a margem dessas células) e confirmar no browser que a barra desaparece em computador e telemóvel. Ver também a regra `min-width: 640px` em `css/views/operations.css:1179` (até 900 px de largura).

11. **Ficha do alojamento (configuração)**
    - a) **Bug: «Emails aos hóspedes» abre vazio.** O cartão existe (`data-acfg="emails"`), mas a regra que mostra a secção escolhida em `frontend/css/v2/fichas.css:73-78` não inclui `emails`. Acrescentar o seletor. Deve conter os contactos, a chegada, a saída, o link de avaliação e o cartão do estado de cada email.
    - b) **Logótipo maior** na secção «Logótipo e redes», para se ver bem.
    - c) **Ligações muito carregadas:** os rótulos, os campos e as ajudas estão colados uns aos outros, sobretudo o texto de ajuda do Airbnb encostado ao rótulo do Booking, e o texto da caixa de cor do Google Calendar é muito longo. Dar espaço entre os campos, encurtar os textos e pôr cada ligação num bloco.
    - d) **Bug: a pesquisa da morada na Localização dá erro.** Causa provável: o `fetch` a `https://nominatim.openstreetmap.org` (`js/features/alojamentos/configuracao.js:383`) é bloqueado pela CSP, porque `connectSrc` em `backend/src/app.js:87` não inclui esse host. Opções: acrescentar o host à CSP, ou (melhor) fazer a pesquisa através do backend, o que evita expor o IP de quem a faz e respeita a política de uso do Nominatim (User-Agent, limite de pedidos). Confirmar no browser.
    - e) **Comodidades:** a barra de pesquisa está deslocada e sobrepõe-se ao título «Casa de banho». Corrigir o espaçamento e o alinhamento com a grelha.
    - f) **Fotos: avisar quando um ficheiro é recusado** ao arrastar ou escolher (tipo não aceite → «Ficheiro não compatível: só JPG ou PNG»; acima de 5 MB → «Tamanho superior a 5 MB»), com o nome do ficheiro. Hoje é ignorado sem aviso. Aplicar o mesmo no logótipo e noutros carregamentos.

    - g) **«Capacidade e preço» (cartão «Layout do alojamento») reorganizado em blocos:**
      - Espaço: Área, Quartos, Casas de banho, Capacidade máx.
      - Preço e estadia: Preço/noite, Hóspedes incluídos no preço base, Estadia mínima.
      - Crianças e bebés: cada idade na mesma linha que o seu preço («Bebé até __ anos · __ €/noite», «Criança abaixo de __ anos · __ €/noite»). Hoje estão trocados entre colunas.
      - Ocupação adicional, como está.
      - A Tipologia e o Link público de reserva saem deste cartão: o link vai para a Visão geral ou para o cabeçalho, e a Tipologia para a secção Geral. Rever também o select da Tipologia, que tem um estilo diferente dos outros campos.
    - h) **Região (Continente/Açores/Madeira) com pouco valor.** Só aparece no cabeçalho da ficha e na API pública, onde já tinha sido substituída por cidade · país. O valor por omissão «Continente» faz parecer preenchida. Proposta: tirar o campo do formulário e, se for preciso, deduzir a região do código postal (9xxx). O cabeçalho passa a mostrar cidade · país.
12. **Barra lateral: espaço vazio no topo e logótipo**
    - O espaço vazio é a linha do botão de recolher, por cima do nome (`frontend/index.html:167-173`).
    - Proposta: o botão de recolher passa para a mesma linha da marca e o logótipo ocupa o topo. Como a barra lateral é da organização (e não de um alojamento), usar o logótipo da organização. Se não houver, usar o do alojamento principal e, em último caso, o nome em texto. Com a barra recolhida, mostrar uma versão pequena (ícone ou iniciais).
    - **Decisão: implementar já a ordem de escolha do logótipo (organização → alojamento principal → nome), sem criar ainda o campo nas Definições.** Enquanto não houver logótipo da organização, a barra usa o do alojamento principal. O campo da organização fica para o portal do proprietário.
    - **Hoje não existe logótipo da organização.** Só há `logo_url` por alojamento (herdado pelas unidades), usado nos emails e PDFs. Proposta: criar o logótipo da organização em Definições, num separador «Organização» ou «Marca» com nome, logótipo (versão grande e versão pequena/ícone) e, se fizer sentido, a cor. Cada alojamento sem logótipo próprio herda este nos emails e PDFs. A barra lateral usa sempre o da organização. Reutilizar o upload que já existe para o logótipo do alojamento (`accommodationMediaController.js`).
    - «Organização» = a conta do cliente (o proprietário que gere os alojamentos), não a empresa dona da plataforma.
    - Confirmar que o nome no topo vem da organização do cliente e não fica fixo em «Santa Paciência» (`index.html:171`).
    - O rodapé («v1.0 · Santa Paciência») é a marca da plataforma, a empresa do utilizador. Não mexer agora: vai ter o nome dessa empresa quando estiver decidido. Fica para depois.

13. **Barra lateral: abrir e fechar mais fluido**
    - Causa: a animação muda a `width` da barra (`.25s`) e, ao mesmo tempo, a `margin-left` do `.main` muda de uma vez, sem transição (`css/styles/shell.css:25,109-117`; no tema vidro, `css/v2/aparencia.css:86-87`). Os textos (`.sb-label`, `.nav-label`) desaparecem logo com `display:none`, e os ícones mudam de posição sem transição (padding e justify). O conteúdo da página é redesenhado a cada passo.
    - Correção: animar a barra e o conteúdo com a mesma duração e curva (de preferência com `transform` ou `grid-template-columns`), esbater os textos com `opacity` antes de os esconder e manter os ícones numa coluna fixa, para não saltarem. Respeitar `prefers-reduced-motion`.
14. **Telemóvel: retirar o campo «Pesquisar hóspede, reserva…» do menu lateral**
    - Criado em `frontend/js/features/v2/barra.js:84-86` (`.v2d-search`, ação `v2-menu-pesquisar`) e estilizado em `css/v2/telemovel.css:100-102`. Retirar o botão, o CSS e a ação, se não for usada noutro sítio.

15. **Edição simples de imagens ao carregar (âmbito limitado)**
    - Hoje o servidor já redimensiona e comprime as fotografias (`backend/src/services/imageOptimizer.js`, sharp) e gera miniaturas WebP. Os logótipos não são recomprimidos.
    - Fazer:
      - **Logótipo:** recortar para tirar margens, com pré-visualização de como fica nos emails, nos PDFs e na barra lateral. Gerar a versão pequena (ícone) a partir de um recorte quadrado.
      - **Fotografia de capa:** escolher o **ponto focal** (um toque na fotografia), em vez de um recorte destrutivo. A mesma fotografia serve para formatos diferentes (lista, topo do portal, página pública) e o enquadramento segue esse ponto (`object-position`). Guardar `focal_x`/`focal_y`.
      - **Capa com um recorte por formato (ideia do utilizador), combinada com o ponto focal:**
        - por omissão, cada formato é calculado automaticamente a partir do ponto focal, sem trabalho para o cliente;
        - em «Ajustar recortes», o cliente vê a mesma fotografia em cada formato e pode mexer cada um à mão;
        - formatos (no máximo 3 ou 4, a confirmar pelo levantamento dos sítios onde a capa aparece): **Quadrado 1:1** (miniaturas, lista, cartões, barra), **Faixa ~3:1** (topo do portal, cabeçalho da ficha), **Paisagem 16:9 ou 4:3** (página pública), e talvez **Partilha 1.91:1** (pré-visualização em WhatsApp/Facebook, Open Graph);
        - guardar só o retângulo de cada formato (`crops: { square:{x,y,w,h}, banner:…, landscape:… }`), sem destruir o original. O servidor gera cada versão com sharp, por pedido, com cache em disco (como o `?w=` atual: ex. `/uploads/<f>?crop=square&w=400`);
        - cada sítio da app pede o formato certo. Fazer primeiro o levantamento de onde a capa aparece e com que proporção.
      - **Galeria:** sem edição; só rodar 90° e garantir a orientação EXIF no servidor (`sharp().rotate()`).
    - Não fazer: filtros, brilho/contraste, editor completo.
    - Biblioteca de recorte (ex.: Cropper.js) alojada localmente, por causa da CSP (ver MELHORIAS P1). O original é guardado e o recorte é feito no servidor com sharp, para se poder refazer.

## Forma de trabalhar (pedida pelo utilizador)

- Trabalhar diretamente na **main**: commit e push para `origin main`, um commit por ponto, com mensagem em PT-PT e as linhas de atribuição.
- **Qualquer mudança de UI/UX tem maqueta antes de implementar.** Juntar as maquetas numa página (Artifact HTML), com o antes e o depois de cada ponto, para o utilizador rever tudo de uma vez. A do portal do hóspede é uma maqueta própria e maior, mais tarde.
- Correções sem mudança visual (repor comportamento) avançam sem maqueta.
- **Delegar em agentes:**
  - Haiku: tarefas mecânicas com causa conhecida (11a: um seletor CSS; 14: retirar o botão de pesquisa do menu);
  - Sonnet: correções com causa identificada e âmbito fechado (4, 7, 11d, e as de UI depois de aprovadas);
  - eu (modelo principal): maquetas, portal, revisão de cada diff e verificação no browser (Playwright, capturas no computador e no telemóvel).
- Cada agente recebe: o ponto da lista, a causa, os ficheiros, o critério de conclusão e «não fazer commit». Eu reviso, testo e faço o commit.

## Passos imediatos

1. Escrever `docs/PENDENTES.md` com esta lista (pontos 1–15, ordem e «para mais tarde»), commit e push na main.
2. Em paralelo:
   - **(a)** agentes corrigem os bugs sem mudança visual: 11a, 4, 7, 11d, 14 (a retirada já foi decidida pelo utilizador);
   - **(b)** eu faço a página de maquetas dos pontos visuais dos grupos 1 e 2: 6, 10, 11e, 3, 8, 11b/c/f/g/h, 12, 13.
3. Rever, testar no browser e fazer um commit por ponto. Publicar as maquetas e esperar pela aprovação antes de implementar os pontos visuais.

## Ordem sugerida

0. Guardar esta lista no repositório (`docs/PENDENTES.md`), porque o contentor é temporário. Serve de base ao documento único de planeamento.
1. **Bugs rápidos** (um commit cada, verificados no browser): 11a, 6, 10, 4, 7, 11d, 11e, 14.
2. **Interface, esforço médio:** 3, 8, 11b/c/f/g/h, 12, 13.
3. **Portal do hóspede + cartão na ficha (2 + 1 juntos)**, com maqueta primeiro.
4. **Maior:** 9 (vistas predefinidas), 5 (documentos Excel/PDF), 15 (recortes).

## Para mais tarde
- **Portal do proprietário:** campos da marca do cliente nas Definições (nome, logótipo grande e pequeno, cor). Ver o ponto 12.

- Juntar num único documento os planos espalhados por: docs/ROADMAP.md, docs/MELHORIAS.md, docs/ESCOPO-V1-V2.md, docs/FECHO-V1-2026-10-24.md, docs/PERCURSO-HOSPEDE-2026-11-19.md, docs/PLANO-CONSOLA.md.
- Línguas nos emails: esconder o seletor ou escolher a língua pelo país do hóspede.
