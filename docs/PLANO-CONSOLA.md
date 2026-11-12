# Plano pendente: consola da plataforma e Suporte

Estado a 11/11/2026, no ramo `claude/adoring-ride-pchzjc`. Os lotes A e B e as
correções F1 a F7 já estão aplicados. O lote C disponível foi entretanto
implementado; veja a atualização abaixo. As restantes decisões continuam em aberto. Junta a revisão feita pelo Fable 5.2 (só por leitura do código), as
decisões que ficaram em aberto e as fases seguintes. Serve de ponto de partida
para continuar.

## Atualização de implementação — 11/11/2026

O lote C disponível foi implementado no ramo `codex/consola-estabelecimentos`:
diagnóstico agregado, adoção/primeiros passos, respostas guardadas, primeira
resposta visível no Suporte, conservação/eliminação e papéis Administração/Marketing.
Também foi acrescentada a criação de estabelecimentos com convite e o login
fixo no Clássico. Email da empresa e LLM ficam adiados por decisão do proprietário.
Detalhes, limites e comandos: [Consola — lote C](CONSOLA-LOTE-C.md).
As secções abaixo preservam o plano de origem; as decisões não relacionadas
continuam em aberto.

## Consola por áreas — 11/11/2026

Implementadas as áreas internas Comercial, Clientes, Suporte, Marketing,
Finanças, Produto, Operações e Administração, com subpáginas e ligações comuns.
Incluídos acessos de demonstração isolados e testes privados por convite.
Apenas a configuração guiada fica adiada, além da IA e email da empresa.
Detalhes e validação: [Áreas internas da consola](CONSOLA-AREAS.md).

## Pedidos do dono da instância (11/11/2026)

- **App instalada ou browser.** Já se distingue. «Desconhecido» são sessões sem
  essa informação: as anteriores à telemetria e as da própria consola, que não
  a envia. Correção (lote A):
  - gravar o modo no login;
  - a consola também o envia;
  - o gráfico chama a «desconhecido» «Sem informação».
- **Consola sem conta de alojamento.** Hoje o login exige pertencer a uma
  organização (`authService.createSession`). Contas só de plataforma passam a
  entrar com uma sessão sem organização, que só serve `/plataforma`. Junta-se
  com a nova página de login (maqueta primeiro) e é feito pelo Opus.
- **Nova página de login.** Remake da entrada (maqueta primeiro). Depois do
  login, uma conta só de plataforma vai para `/plataforma`; quem tem as duas
  escolhe.
- **Email da empresa (para mais tarde).** A consola deve enviar e receber pelo
  email da empresa, que ainda não existe. Hoje os avisos do Suporte saem pelo
  Gmail de cada organização. Quando o email existir: uma caixa da plataforma
  (Gmail OAuth ou SMTP), usada para os avisos do Suporte, os comunicados e as
  respostas aos clientes. A seguir, poder responder ao pedido diretamente por
  email.
- **Tarefas internas da equipa** (página nova; maqueta primeiro). Quadro para o
  dono da instância e a colega de marketing:
  - ideias, sugestões, bugs, melhorias e marketing;
  - responsável, prioridade, prazo e estado (Ideias, A fazer, Em curso, Feito);
  - ligação a um cliente ou a um pedido de suporte, e comentários;
  - um pedido de suporte pode virar tarefa.
- **Papéis na consola.** Duas pessoas com acesso. Mais tarde, distinguir
  «Administração» de «Marketing», por exemplo para o marketing não mudar o
  estado dos clientes.
- **Marketing dos alojamentos.** A colega gere o marketing dos clientes que o
  pedirem: uma marca «serviço de marketing ativo» por cliente, notas e tarefas
  ligadas. O acesso aos dados de um cliente fica sempre dependente do
  consentimento dele.
- **LLM (só informação, não fazer agora).** A app já usa a API da Anthropic
  para ler talões (`ANTHROPIC_API_KEY`). Ideias:
  - rascunhos de resposta a hóspedes e a pedidos de suporte;
  - resumo e triagem dos pedidos na consola;
  - textos de marketing para os alojamentos;
  - sugestões de preço.
  Cuidados: custo por pedido, minimizar os dados enviados (RGPD; a Anthropic já
  consta como subcontratante) e a revisão humana antes de enviar.

## Lotes de execução

- **A (feito):**
  - correções F1 a F7;
  - limite de pedidos no Suporte;
  - modo app ou browser no login e na consola;
  - atividade contada no acesso;
  - problemas da instância só para os admins da plataforma, mais alertas a eles
    (pedido sem resposta há mais de 24 horas, incidente novo).
- **B (feito):**
  - nova página de login (com contas só de plataforma);
  - Tarefas internas;
  - Comunicados;
  - Pacotes;
  - «Precisa de atenção» e saúde dos clientes na visão geral e na lista.
- **C (implementado, exceto email da empresa e LLM):**
  - erros da app e tempos da API;
  - adoção de cada funcionalidade e primeiros passos;
  - respostas guardadas e tempo até à primeira resposta;
  - retenção e eliminação de pedidos;
  - email da empresa;
  - papéis na consola;
  - LLM.

## Decisões em aberto

- **Anexos em PDF.** São servidos com `Content-Security-Policy: sandbox`, e o
  leitor de PDF do Chrome pode recusar-se a mostrá-los dentro da página. É
  preciso confirmar num browser real; se falhar, tira-se o `sandbox` só ao PDF
  ou serve-se como descarga.
- **Cópias de segurança.** Decidido: os pedidos de suporte (pedidos, mensagens
  e anexos) entram nas cópias de cada organização (versão 10 do ZIP). No
  restauro recebem ids e números novos e os anexos são revalidados.
- **«Ajuda e feedback» no aspeto V1.** Hoje fica escondida. Ou se mostra com o
  Clássico como reserva (como na consola), ou se aceita que só existe na V2.
- **Mudar o estado de um pedido sem escrever mensagem não avisa o cliente.**
  Falta decidir se deve avisar, pelo menos ao passar a «Resolvido».
- **Arranque no limite do orçamento.** A app já chega aos 65 pedidos no
  arranque, por isso o orçamento está no limite.
- **Reativar um membro não aplica o limite do pacote.** Só se verificam criar
  alojamento, convidar e aceitar convite.
- **Importar um backup não aplica os limites.** Uma organização pode ficar acima
  do pacote depois de importar.
- **As contas só de plataforma não podem mudar de email.**

## Fases seguintes

1. **Pacotes e estado do cliente.** Feita no lote B. Tabela `plans`, atribuição de pacote a
   cada cliente e limites (alojamentos, membros da equipa). Os clientes
   suspensos ficam realmente bloqueados: a verificação vai para o `requireAuth`
   e é feita pelo Opus. A interface fica com o Sonnet e a documentação com o
   Haiku.
2. **Comunicados e manutenção programada.** Feita no lote B (comunicados). O dono da instância escreve avisos
   na faixa da «Ajuda e feedback», para todos os clientes ou só para alguns,
   com hora de início e de fim.

## Revisão (Fable 5.2): correções pequenas e seguras

Feitas (F1 a F7, lote A).

| # | Ficheiro | O quê | Teste |
|---|---|---|---|
| F1 | `backend/src/services/supportService.js` (310-338) | Em `incidentsFor`, deixar de mostrar aos clientes as chaves que são trabalho do proprietário e não falha da plataforma: `cancellation_review` e `email_decision`. Retirar `Pagamentos` de `INCIDENT_TEXT`. O proprietário já recebe estas duas pelo `opsAlerts` com instruções; o staff nem as devia ver. | `support-service.test.cjs` (270): acrescentar `payments.cancellations_manual_review: 1` e `email.deliveries_needing_decision: 1` ao estado simulado e confirmar que não aparecem. |
| F2 | `frontend/js/plataforma/registo.js` (12-31) | O registo mostra «Support status», «support_ticket <uuid>» e «Estado: resolved». Acrescentar `support.status` a `ACTIONS`, `support_ticket` a `TARGETS` com ligação a `/plataforma/suporte/<id>`, e usar `fmt.TICKET_STATUS` quando o alvo é um pedido. | — |
| F3 | `frontend/js/plataforma/geral.js` (66) | «Pedidos abertos — à espera de resposta» conta também «Em análise» e «Precisa do cliente». Mudar para «por resolver». | — |
| F4 | `frontend/js/features/ajuda/pagina.js` (375) | O email e o push ao cliente apontam para `/ajuda?pedido=<id>` (`supportService.js:398`), mas ninguém lê `?pedido=`: o botão «Abrir pedido» abre a lista (ou o primeiro pedido). Em `openPage`, ler o parâmetro, abrir esse pedido e limpar o endereço com `history.replaceState`. Confirmar primeiro como `app.js:205` trata `?reserva=`. | Verificar com Playwright. |
| F5 | `backend/src/services/platformService.js` (48-50) | «Último acesso» vem só de `auth_sessions`, que são apagadas ao terminar sessão e ao fim de 14 dias (`SESSION_TTL_DAYS` = `INACTIVE_DAYS`). Quem termina sessão passa logo a «Sem atividade» e entra em «Inativos há 14+ dias». Usar como recurso o último dia de `platform_daily_stats` com `active_users > 0`. | `platform-service.test.cjs` (127): organização sem sessões mas com linha de ontem não conta como inativa. |
| F6 | `backend/src/middleware/requirePlatformAdmin.js` (9) | «Confirma a palavra-passe.» (tu) → «Confirme a palavra-passe.»; o resto da app trata por você. Nenhum teste depende do texto. | — |
| F7 | `frontend/js/plataforma/cliente.js` (statusCard) | Nota por baixo do estado: «Suspensa» é só uma etiqueta, ainda não corta o acesso (`platformService.js:143`). | — |

Depois: `npm test` e `npm run check` em `backend/src`; arrancar a app e ver as páginas nos três aspetos e a 360 px com Playwright .

## Revisão (Fable 5.2): problemas e ideias


### Problemas a relatar sem corrigir

Alta
- Sem limite de pedidos na criação de pedidos e mensagens de suporte (`routes/support.js:14-16`, `app.js:148-155`): qualquer membro, incluindo staff, pode enviar 3 × 10 MB por pedido sem teto e encher o disco da instância.
- Utilizadores ativos subcontados: `usageTelemetry.js:49` lê `auth_sessions` de hora a hora; quem entra e sai entre duas passagens não conta. Afeta «Utilizadores ativos» e «Organizações ativas».
- Não há forma de apagar um pedido ou um anexo. Um cliente que anexe uma captura com dados de hóspedes deixa-a para sempre em `data/uploads/support`, sem prazo de retenção.

Média
- O dono da instância não é avisado de incidentes; os problemas da instância (`task_*`, `disk_low`) são enviados aos proprietários e gestores de todas as organizações (`opsAlerts.js:51-58`, `checkOrganization`).
- `cancellation_review` e `email_decision` contam como «incidentes» na consola (`platformService.js:13`), quando são tarefas do cliente.
- Dados em memória até recarregar (`plataforma/api.js:28`, `62`): sem botão «Atualizar» nem hora da última leitura; mudar o estado de um pedido não atualiza os números da visão geral.
- Resposta perdida quando a consola bloqueia aos 30 minutos (`plataforma/suporte.js:326`): o texto e os anexos desaparecem. A janela não é deslizante e não há aviso.
- `setStatus` (`supportService.js:232`) não avisa o cliente: marcar «Resolvido» sem mensagem passa despercebido. Também mexe em `last_message_at`.
- Respostas e leituras de pedidos e anexos não entram no registo (`routes/platform.js:48-61`); só a mudança de estado por PUT.
- `opsStatus` corre uma vez por organização em cada pedido de visão geral, lista e incidentes (`platformService.js:59`), e a visão geral pede os três: 3 × N estados, cada um com `statfsSync` e cerca de dez consultas, uma delas com `json_extract` sobre todas as reservas.
- `/api/support/summary` corre `opsStatus` por cada utilizador, de 5 em 5 minutos (`supportService.js:326`, `menu.js`).
- `<main aria-live="polite">` em toda a área de conteúdo (`plataforma.html:65`): o leitor de ecrã lê a página inteira a cada mudança.
- Listas de pedidos sem limite nem paginação (`supportService.js:251`, `288`); a pesquisa só olha para assunto e número.

Baixa
- Gráfico «Incidentes abertos» com tudo a zero mostra «A recolher dados desde…» (`graficos.js:129`).
- O registo não diz quem fez a ação (`platformAnalytics.js:148`) e guarda o IP sem prazo.
- Numeração global `SP-0001` mostra a cada cliente o volume total de pedidos.
- `organization.update` regista o estado mesmo quando não mudou (`cliente.js` envia sempre `status`).
- «Inativos há 14+ dias» abre a lista sem filtro; a lista não ordena nem filtra por inatividade.
- `/plataforma` é servida a qualquer pessoa, o que contraria o 404 da API.
- Ponto «por ler» sem texto alternativo em `geral.js:35`; alvo de toque de 24 px em `.pl-file-x` (`plataforma.css:224`).
- `white-space: pre-line` nas mensagens apaga a indentação de registos colados.
- «Pacotes — Em breve» ocupa lugar no menu sem função.

### Ideias de maior valor
1. Pontuação de saúde e risco de saída por cliente (P/M, alto): já há `platform_daily_stats`, `usage_daily`, reservas por semana, problemas abertos e pedidos.
2. Alertas ao dono da instância por push e email (P, alto): reaproveitar `opsAlerts` e `notifyPlatform`.
3. Bloco «Precisa de atenção» no topo da visão geral (P, alto): pedidos por ler, incidentes, clientes em queda, tarefas a falhar, disco.
4. Erros de frontend e tempos da API em totais diários (M, alto): mesmo caminho de `/api/telemetry`.
5. Comunicados e manutenção programada (M, alto): a faixa de avisos de «Ajuda e feedback» já existe.
Outras: adoção de funcionalidades por organização (P, médio), funil de primeiros passos (P, médio), notas internas e respostas guardadas no Suporte (M, médio), tempo até à primeira resposta (P, médio), pesquisa global (M, médio), exportação CSV (P, baixo), suspensão com efeito real (M, médio).

## Verificação

- `cd backend/src && npm test && npm run check`.
- Playwright: desbloqueio, visão geral, clientes, ficha, utilização, incidentes, registo, suporte e «Ajuda e feedback», nos três aspetos, a 1280 px e a 360 px.

## Ordem proposta para aplicar

1. As correções F1 a F7, mais o limite de pedidos no Suporte e a contagem de
   atividade feita no momento do acesso, em vez de uma passagem de hora a hora.
   Aplica o Sonnet e revê o Opus.
2. Os problemas da instância passam a ir só para o dono da instância, que
   também recebe alertas próprios (ideia 2). Faz o Opus.
3. O bloco «Precisa de atenção» e o botão «Atualizar» na visão geral, e o
   rascunho da resposta guardado quando a consola bloqueia. Faz o Sonnet.
4. Apagar pedidos e anexos e definir um prazo de conservação (RGPD). Faz o
   Opus.
