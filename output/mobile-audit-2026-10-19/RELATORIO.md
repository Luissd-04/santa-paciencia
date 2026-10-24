> Atualização de 23/10/2026: as ocorrências M01–M13 foram corrigidas no código local. Ver [correções e validação](CORRECOES.md). Este relatório preserva o diagnóstico anterior às correções.

# Auditoria do frontend mobile — Santa Paciência

Iniciada em 19 de outubro de 2026; concluída em 21 de outubro de 2026.

**Resultado:** os principais fluxos funcionais passaram, mas a experiência mobile ainda apresenta falhas relevantes de navegação, formulários, sobreposições e carregamento. Esta auditoria não altera o código da aplicação. Foram criados apenas recursos de teste e este relatório; as alterações preexistentes no repositório foram preservadas.

## Método e âmbito

- Instância local da aplicação real, com SQLite em memória, conta e dados fictícios, sem carregar `.env` e com envios de email desativados. Nenhum dado de produção foi alterado.
- Inspeção interativa no navegador integrado: 320×740, 375×812, 390×844, 430×932 e 844×390. As dimensões foram usadas em diferentes vistas, não numa matriz completa de todas as combinações.
- Testes existentes em Chromium; reserva pública também em WebKit com perfil iPhone 13. WebKit descarregado para `/private/tmp/sp-mobile-audit-browsers`.
- Segunda instância com atraso artificial de **1800 ms por pedido de API/fragmento HTML**, para observar carregamentos. Isto simula latência, não largura de banda, perda de pacotes ou CPU lenta.
- Revisão de CSS e JavaScript para explicar os problemas observados, incluindo animações, gestão de foco e carregamento de módulos.
- Vistas percorridas: login, painel, reservas/lista/detalhe/edição/filtros/tarefas/timeline, calendário vertical/horizontal, eventos/criação/validação, despesas/filtros, hóspedes, alojamentos/detalhe/preços, relatórios, templates de email, definições/políticas e notificações.
- Os testes automáticos complementaram a revisão com paginação, exportações, falhas HTTP, recuperação de módulos, mensagens, reserva pública e pré-check-in.

**Limites:** o navegador integrado redimensionado usa rato/teclado; não equivale a um telefone físico. Não foram validados teclado virtual, VoiceOver/TalkBack real, instalação PWA, gestos do sistema, notificações push reais, câmara/OCR, OAuth real, pagamentos reais ou funcionamento offline completo. Não houve medição de FPS nem certificação integral de acessibilidade. Tema escuro não se aplica: o código indica que foi removido. A preferência de movimento reduzido foi inspecionada no código; o teste de calendário ativa-a, mas não verifica exaustivamente todas as animações.

## Problemas confirmados e prioridades

### M01 — Alta: filtros ficam atrás da navegação e do botão flutuante

**Reprodução:** 390×844 → Reservas → Filtros. A barra inferior cobre a zona baixa da folha e o botão `+` sobrepõe-se ao campo de data. Em Despesas, a folha também fica atrás da navegação.

**Impacto:** ações e campos parcialmente ocultos; a navegação permanece disponível sobre um painel que aparenta ser modal.

**Evidência:** [filtros de reservas](06-filtros-sobrepostos.png), [filtros de despesas](10-filtros-despesas.png).

**Causa:** a folha usa `z-index:260`, mas está dentro de `.layout`, que estabelece um contexto de empilhamento com `z-index:1` (`frontend/css/base.css:42`). A barra e o FAB estão fora desse contexto, com índices 150/149. Aumentar apenas o índice da folha não resolve a hierarquia.

**Correção sugerida:** colocar as folhas num contentor global de overlays e unificar empilhamento, bloqueio do fundo, foco e margens de segurança.

### M02 — Alta: pesquisa nos filtros de despesas ocupa quase metade do ecrã

**Reprodução:** 390×844 → Despesas → Filtros. A caixa que envolve a pesquisa mede **230×439 px**; o input mede cerca de 171×39 px. Os seletores ficam estreitos e centrados, e as ações são empurradas para baixo.

**Evidência:** [captura](10-filtros-despesas.png).

**Código relevante:** `frontend/css/mobile/hospedes-despesas.css:148`, `frontend/css/views/despesas.css:20`, `.search-box`. A mudança para flex vertical conserva regras de dimensionamento/alinhamento pensadas para a linha desktop.

**Correção sugerida:** retirar o crescimento vertical da pesquisa, esticar os campos à largura útil e garantir espaço visível para Aplicar/Limpar.

### M03 — Alta: Preços no alojamento não carrega o calendário na primeira visita

**Reprodução:** recarregar a aplicação → Alojamentos → abrir Unidade de teste → Preços, sem visitar previamente a vista global Preços.

**Resultado:** surge apenas o parágrafo explicativo. O DOM não contém `#precos-calendar-widget`, apesar de `js/precos.js` já estar carregado. O problema foi reproduzido após recarregamento.

**Causa confirmada:** `frontend/js/alojamentos.js:545` chama `ensureFeature('precos')`, mas não `ensureViewMarkup('precos')`. `mountPrecosWidgetInAloj()` em `frontend/js/precos.js:80` termina silenciosamente se o widget não existir.

**Correção sugerida:** carregar código e HTML antes de montar; mostrar loading e recuperação de erro no separador. O teste existente verifica apenas que a função foi carregada e não que o calendário existe e está visível.

### M04 — Alta: os separadores do alojamento podem deslocar toda a página horizontalmente

**Reprodução:** em 375/390 px, abrir detalhe do alojamento e selecionar por foco/automação o separador Preços, que começa fora do ecrã.

**Resultado:** o contentor `#main-content` passa a `scrollLeft:420.5`, `clientWidth:375`, `scrollWidth:796`; a topbar e o conteúdo ficam com coordenadas X negativas. A captura mostra sobretudo o fundo terracota e os últimos separadores.

**Evidência:** [estado deslocado](21-precos-vazio.png). Esta imagem combina M03 e M04; não deve ser interpretada como um overlay vermelho.

**Causa:** a linha de separadores em `frontend/views/alojamento-detalhe.html:17` é um flex sem a classe `.aloj-tabs` nem um contentor próprio com scroll horizontal. O overflow é absorvido pela página. Reproduzido com foco/automação; o gesto tátil físico não foi validado.

**Correção sugerida:** dar scroll à linha de tabs, manter a página sem overflow horizontal e testar foco no último tab.

### M05 — Alta: alterações numa reserva existente são descartadas sem aviso

**Reprodução:** editar reserva → escrever em Notas → Cancelar → reabrir. A edição fecha diretamente, sem confirmação de alterações não guardadas.

**Causa confirmada:** `frontend/js/features/reserva-wizard/rascunhos.js:45` fecha imediatamente quando existe `editingId`; a proteção de rascunho aplica-se apenas a novas reservas.

**Correção sugerida:** comparar o estado inicial com o atual e pedir confirmação apenas quando houver alterações. A regra deve cobrir Cancelar, Escape e outras saídas.

### M06 — Média: primeira abertura de secção fica em branco com rede lenta

**Reprodução:** instância com 1800 ms de atraso → primeira abertura de Reservas ou Eventos.

**Resultado:** a navegação muda de estado, mas a área de conteúdo fica vazia enquanto o HTML é descarregado. Depois de o fragmento chegar, aparece o loading dos dados. A pesquisa de reservas, por contraste, mostra `A carregar reservas…` e desativa a paginação.

**Evidência:** [primeira navegação](22-loading-vista.png), [Eventos](23-loading-eventos.png), [pesquisa com feedback](24-loading-pesquisa.png).

**Causa:** `showView()` ativa o contentor ainda vazio; `ensureViewMarkup()` só injeta conteúdo depois do fetch (`frontend/js/app.js:62`, `frontend/js/domain/features.js:289`).

**Correção sugerida:** estado de carregamento imediato no shell da vista, idealmente com estrutura estável e `aria-busy`, seguido do estado de dados. A recuperação de falhas de módulos já existe e passou o teste.

### M07 — Média: menu mobile não oferece os mesmos destinos do desktop

O desktop contém **Mensagens** e **Vouchers**. O drawer mobile não tem Vouchers; o item **Emails**, embora tenha `data-view="invoice"`, abre Definições → templates de email.

**Evidência:** DOM do menu e `frontend/index.html:148`, `:167`, `:1118`; handler em `frontend/js/index-actions.js:235`.

**Impacto:** o histórico de mensagens e os vouchers não dispõem de entrada equivalente no menu mobile. Isto não demonstra que sejam inacessíveis por todos os atalhos ou URLs.

**Correção sugerida:** oferecer destinos explícitos para Mensagens, Templates e Vouchers, com seleção ativa correspondente ao destino real.

### M08 — Média: calendário horizontal perde a navegação da aplicação

**Reprodução:** abrir Calendário e usar 844×390. A topbar, menu e barra inferior desaparecem; não existe saída visível para outro módulo. É necessário rodar novamente ou recorrer ao histórico do navegador.

**Evidência:** [calendário horizontal](20-calendario-paisagem.png), `frontend/css/mobile/paisagem.css:18`.

**Correção sugerida:** manter uma ação compacta de menu/voltar ou uma saída explícita do modo de ecrã inteiro. A mesma regra CSS aplica-se a Eventos, embora esta observação visual tenha sido feita no Calendário.

### M09 — Média: navegação autenticada aparece no login mobile

**Reprodução:** abrir a aplicação sem sessão a 390×844. Aparecem Início/Reservas/Calendário/Eventos/Despesas e o botão `+` abaixo do formulário.

**Evidência:** [login](01-login.png), `frontend/css/styles/formularios.css:842`.

**Impacto:** ações sem contexto antes de entrar. Não foi demonstrada qualquer falha de autorização da API.

**Correção sugerida:** condicionar a apresentação dos controlos à sessão pronta, além do breakpoint.

### M10 — Média: botões pequenos e sem nome acessível

- Editar/apagar despesas: **32×32 px**, próximos entre si e sem `aria-label`/texto (`frontend/js/despesas.js:409`).
- Preços: Anterior/Seguinte com **31 px de altura**.
- Alojamento: Voltar 39 px, Apagar 36 px, Guardar 42 px; inputs observados com fonte **14 px** e altura 40,5 px.
- FAB genérico: sem nome acessível no snapshot.

**Evidência:** [despesas](09-despesas.png), [medições DOM](metricas.json). As medições são uma triagem: inputs dentro de wrappers/labels maiores não devem ser automaticamente classificados como falha sem verificar a área de toque efetiva.

**Correção sugerida:** unificar áreas interativas, separar a ação destrutiva da edição, atribuir nomes aos ícones e harmonizar tamanho dos campos. O zoom automático do Safari em inputs pequenos não foi testado num iPhone físico.

### M11 — Média: validação de eventos não conduz ao campo com erro

**Reprodução:** Novo evento → Guardar com o título vazio. Surge apenas o toast `Indica o título do evento.`; o foco fica em Guardar e o título pode estar acima da área visível.

**Evidência:** [validação](08-evento-validacao.png), `frontend/js/eventos.js:892`.

Há também vários campos no editor de reservas e alojamentos cujos rótulos visuais não fornecem um nome acessível útil ao controlo; alguns dependem apenas do placeholder.

**Correção sugerida:** erro junto ao campo, `aria-invalid`, ligação ao texto de erro e foco no primeiro campo inválido; ligar `label` e `input`.

### M12 — Média: preferência de movimento reduzido é incompleta

**Inspeção de código, não medição dinâmica integral.** A base é coerente: pressão 120 ms, entradas 220 ms, drawer 260 ms e modais/folhas 280 ms. Vistas, modais e stagger têm regras de redução de movimento.

No entanto, `.m-sheet`/`.m-sheet-backdrop` mantêm transições de 280 ms em `frontend/css/components/sheet.css:20` e `:34`, sem cobertura nas regras de redução encontradas. Na reserva pública, a animação contínua `railMove` de 180 s também não está incluída na regra de redução da página de reserva (`frontend/css/public-reservation.css:109`, `:905`); a regra abrangente aplica-se apenas a `.precheckin-page`.

**Correção sugerida:** centralizar durações e cobrir folhas, scrims e animações decorativas contínuas. Validar no navegador com a preferência ativa e, depois, em dispositivo físico.

### M13 — Baixa/condicional: calendário customizado cortado em viewport estreito com rato

**Reprodução:** 390×844, editar reserva. O foco inicial abre o calendário; o popover foi medido em `y:677.5`, altura 302, terminando em `979.5`, abaixo do ecrã de 844 px. Escape também fechou o editor, além do calendário.

**Evidência:** [calendário cortado](05-editar-calendario-cortado.png), `frontend/js/domain/date-picker.js:376` e `:324`.

**Limite importante:** a aplicação usa seletor nativo quando `(pointer: coarse)` é verdadeiro. Este problema foi observado com rato/teclado em ecrã estreito; não é uma falha confirmada do seletor nativo iOS/Android.

**Correção sugerida:** posicionar após a animação do modal, limitar o popover ao viewport e impedir que Escape se propague para o diálogo de fundo.

## Uniformidade visual

A paleta terracota/creme, cartões arredondados e navegação inferior mantêm uma identidade reconhecível. Persistem diferenças entre módulos:

- Valores monetários alternam entre `€200.00`, `€2400,00` e `240,00 €`.
- Botões de edição textuais nas reservas versus ícones pequenos nas despesas.
- Vários estilos de tabs, cartões aninhados e títulos que desaparecem em mobile reduzem a consistência de orientação.
- O `+` genérico permanece em módulos de configuração, onde a sua finalidade não é evidente.
- Texto como “1 hóspedes” e mistura de “Password”, “palavra-passe”, “preview” e “pré-visualização” merecem revisão editorial.

Estas observações são oportunidades de uniformização, não falhas funcionais equivalentes às prioridades altas.

## Testes executados e resultados

| Teste | Resultado | Âmbito real |
|---|---|---|
| `check-calendar-mobile.cjs` | Passou | Seleção de dia, contagens, detalhe/voltar, vazio, meses/hoje, 320/375/600 px, horizontal, preferência timeline |
| `check-public-mobile.cjs` — Chromium | Passou | Perfil iPhone 13, datas, passos, dados preservados e submissão com 2 hóspedes; comparação desktop |
| `check-public-mobile.cjs` — WebKit | Passou | Mesmo fluxo no motor WebKit, sem afirmar equivalência integral a um iPhone real |
| `check-precheckin.cjs` | Passou | Etapas, países, erros/foco, submissão/reabertura, documentos no backoffice e layout mobile |
| `check-payment-policy-browser.cjs` | Passou | Intervalos, validação, simulador, guardar em DB temporária, 375 px/horizontal, consentimento e sinal simulado |
| `check-browser.cjs` original | Interrompido | Seletor `getByText('Abrir pagamento online')` encontra 2 elementos e falha por ambiguidade |
| Cópia `check-browser-adapted.cjs` | Passou integralmente | Única adaptação funcional: filtrar o elemento visível naquele seletor; caminhos ajustados por a cópia residir noutra pasta |
| Revisão interativa | Problemas acima | Sem erros JavaScript não tratados nos logs consultados; falhas visuais podem ocorrer sem erro de consola |

A bateria adaptada cobriu carregamento único de módulos, falha/repetição, atalhos, ligação direta a reserva, erro HTTP/contrato antigo, histórico/pesquisa/paginação, exportações Excel/PDF, gráficos/mapas por pedido, pesquisa mobile, preview de emails e respostas atrasadas, eventos/despesas, composição de mensagens e limpeza no logout. Muitos desses passos são desktop: não devem ser apresentados como cobertura mobile integral.

O teste de políticas emitiu um HTTP 400 esperado durante a validação de intervalos inválidos e terminou com sucesso.

## Ordem de intervenção sugerida

1. Corrigir folhas/filtros e scroll dos separadores (M01, M02, M04).
2. Corrigir carregamento do calendário de preços e proteção de edição (M03, M05).
3. Completar navegação mobile e estado inicial de carregamento (M06–M09).
4. Uniformizar controlos, validação, acessibilidade e movimento (M10–M13).
5. Repetir os fluxos em iPhone e Android físicos, com teclado aberto, zoom de texto, movimento reduzido e rede móvel.

## Artefactos

As capturas citadas estão nesta pasta. `server.cjs` reproduz a instância sintética; `AUDIT_DELAY_MS=1800` ativa a latência. `check-browser-adapted.cjs` mantém a cópia da bateria usada para ultrapassar o seletor ambíguo. Ambos usam caminhos locais deste workspace.

Algumas capturas exploratórias mostram estados transitórios de resize, especialmente `18-politica-430.png`; não foram usadas como evidência de defeito. As falhas listadas referem capturas estáveis ou medições DOM explícitas.
