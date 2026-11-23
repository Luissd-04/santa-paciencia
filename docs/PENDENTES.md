# Pendentes — melhorias e bugs

Lista viva, iniciada a 23/11/2026 a partir da revisão da app com o dono do produto.
Cada ponto sai daqui quando estiver feito e verificado (o histórico fica no Git).
Os planos anteriores continuam em `ROADMAP.md`, `MELHORIAS.md`, `ESCOPO-V1-V2.md`
e `PLANO-CONSOLA.md`; esta lista será a base do documento único.

## A fazer

1. ✅ **Feito (23/11):** cartão «Portal do hóspede» na reserva (link, envio do email «A sua reserva», WhatsApp, «aberto pelo hóspede»).
2. ✅ **Feito (23/11):** portal do hóspede redesenhado (fases, «concierge» com código e Wi-Fi só da véspera à saída e com a reserva paga).
3. ✅ **Feito (23/11):** política de pagamento em linhas na ficha da reserva.
4. ✅ **Feito (23/11):** «Voltar» da ficha de hóspede regressa à reserva.
5. **Rever a geração dos documentos (Excel e PDF)**: Ficha de reserva, Ficha de hóspede, Conta corrente e Fatura.
   - Hoje: XLS com SheetJS, PDF com jsPDF, CSV à mão (`documentos.js`).
   - Objetivo: melhor aspeto e coerência entre formatos. Ver os ficheiros atuais antes de propor.

6. ✅ **Feito (23/11):** notificações legíveis (botões por baixo do texto).
7. ✅ **Feito (23/11):** «Ver» num grupo do painel abre a lista só com essas reservas (etiqueta removível).
8. ✅ **Feito (23/11):** filtros com várias opções; «Por receber» abre Pendente + Parcial.
9. **Vistas predefinidas por utilizador (Definições → «Vistas predefinidas»)**
   - Hoje: Eventos abre sempre em Semana (`frontend/js/eventos.js:31`). A escolha fica só em `AppModules.core.SS` (sessão do browser) e perde-se. No telemóvel é sempre Semana (`eventos.js:187`).
   - Outras vistas com o mesmo padrão e candidatas à mesma definição: Calendário (`calMode`, `tlDays` em `calendario.js:30`), Hóspedes (cartões/lista, `hospedes.js:14`), Relatórios (separador inicial, `relatorios.js:19`).
   - Proposta: preferência guardada por utilizador no servidor, para valer em todos os dispositivos. A escolha durante a sessão continua a sobrepor-se até sair. Por decidir: quais as vistas que entram.
   - **Duas predefinições por vista: Computador e Telemóvel.** A preferência é `{ ecrã: { desktop, mobile } }` e o tipo de dispositivo é decidido pela largura do ecrã, com o mesmo critério que a app já usa (ex.: `eventosPhone()`). O tablet conta como computador ou telemóvel conforme a largura.
   - Em cada coluna só aparecem as vistas que funcionam nesse tamanho. Hoje o telemóvel força Semana nos Eventos: confirmar se Mês/Lista ficam utilizáveis no telemóvel antes de as oferecer.
   - Nas Definições: uma tabela com uma linha por ecrã e duas colunas (Computador, Telemóvel). No telemóvel, mostrar as duas na mesma, para se poder configurar o outro dispositivo.

10. ✅ **Feito (23/11):** «Serviços e Taxas» sem scroll horizontal.
11. **Ficha do alojamento (configuração)**
    - a) ✅ **Feito (23/11):** «Emails aos hóspedes» já não abre vazio.
    - b) ✅ **Feito (23/11):** logótipo maior.
    - c) ✅ **Feito (23/11):** ligações em blocos.
    - d) ✅ **Feito (23/11):** pesquisa da morada pelo servidor (`/api/geocode`).
    - e) ✅ **Feito (23/11):** pesquisa das comodidades alinhada.
    - f) ✅ **Feito (23/11):** aviso de ficheiros recusados.
    - g) ✅ **Feito (23/11):** capacidade e preço em blocos.
    - h) ✅ **Feito (23/11):** região retirada do formulário.
12. ✅ **Feito (23/11):** logótipo (organização → alojamento principal → nome) no topo da barra lateral; campo da organização fica para o portal do proprietário.
13. ✅ **Feito (23/11):** animação de recolher fluida.
14. ✅ **Feito (23/11):** saiu o campo de pesquisa do menu lateral no telemóvel.
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

## A seguir

Maquetas aprovadas a 23/11: 5 (documentos Excel/PDF), 9 (vistas predefinidas, com «Ecrã inicial»), 15 (recortes de imagem).

## Para mais tarde
- **Portal do proprietário:** campos da marca do cliente nas Definições (nome, logótipo grande e pequeno, cor). Ver o ponto 12.

- Juntar num único documento os planos espalhados por: docs/ROADMAP.md, docs/MELHORIAS.md, docs/ESCOPO-V1-V2.md, docs/FECHO-V1-2026-10-24.md, docs/PERCURSO-HOSPEDE-2026-11-19.md, docs/PLANO-CONSOLA.md.
- Línguas nos emails: esconder o seletor ou escolher a língua pelo país do hóspede.
