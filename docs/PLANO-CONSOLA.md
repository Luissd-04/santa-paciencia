# Plano pendente: consola da plataforma e Suporte

Estado a 11/11/2026, no ramo `claude/adoring-ride-pchzjc`. Nada deste plano está
aplicado. Junta a revisão feita pelo Fable 5.2 (só por leitura do código), as
decisões que ficaram em aberto e as fases seguintes. Serve de ponto de partida
para continuar.

## Decisões em aberto

- **Anexos em PDF.** São servidos com `Content-Security-Policy: sandbox`, e o
  leitor de PDF do Chrome pode recusar-se a mostrá-los dentro da página. É
  preciso confirmar num browser real; se falhar, tira-se o `sandbox` só ao PDF
  ou serve-se como descarga.
- **Cópias de segurança.** Os pedidos de suporte e os anexos não entram nas
  cópias de cada organização. Falta decidir se devem entrar.
- **«Ajuda e feedback» no aspeto V1.** Hoje fica escondida. Ou se mostra com o
  Clássico como reserva (como na consola), ou se aceita que só existe na V2.
- **Mudar o estado de um pedido sem escrever mensagem não avisa o cliente.**
  Falta decidir se deve avisar, pelo menos ao passar a «Resolvido».

## Fases seguintes

1. **Pacotes e estado do cliente.** Tabela `plans`, atribuição de pacote a
   cada cliente e limites (alojamentos, membros da equipa). Os clientes
   suspensos ficam realmente bloqueados: a verificação vai para o `requireAuth`
   e é feita pelo Opus. A interface fica com o Sonnet e a documentação com o
   Haiku.
2. **Comunicados e manutenção programada.** O dono da instância escreve avisos
   na faixa da «Ajuda e feedback», para todos os clientes ou só para alguns,
   com hora de início e de fim.

## Revisão (Fable 5.2): correções pequenas e seguras

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
