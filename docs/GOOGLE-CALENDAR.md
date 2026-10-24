# Sincronização com Google Calendar

Cada utilizador pode ligar o seu Google Calendar. As reservas criadas por ele
passam a ter um evento no calendário do alojamento (criado automaticamente) e,
com «Sincronizar tarefas no Calendar» ativo, os eventos operacionais (check-in,
check-out, limpezas, tarefas) também. A reserva continua a ser gerida na
aplicação: alterar o evento no Google não muda a reserva.

## Fiabilidade (desde 24/10/2026)

Antes, cada pedido ao Google era feito uma vez, sem registo: uma falha de rede
deixava o evento por criar, desatualizado ou órfão, e uma criação com a resposta
perdida podia duplicar o evento. Agora:

- **Fila durável.** Criar, alterar, cancelar ou apagar uma reserva (ou um evento
  operacional) grava a intenção em `google_calendar_queue` na mesma transação da
  alteração local. O pedido ao Google corre logo a seguir; se falhar, fica com
  `attempts`, `last_error` (só o código HTTP ou de rede) e nova tentativa com
  espera crescente (1, 2, 4… até 360 minutos). O scheduler repete a fila a cada
  minuto, também depois de um reinício.
- **Sem duplicados.** O ID do evento é derivado da reserva/evento. Se uma criação
  chegou ao Google mas a resposta se perdeu, a repetição recebe 409 e atualiza o
  evento existente. Reativar uma reserva cancelada repõe o mesmo evento.
- **Remoções com dados guardados.** Cancelar, eliminar ou regenerar tarefas
  guarda o ID do evento e o calendário onde foi criado antes de a referência
  local desaparecer. 404/410 contam como removido.
- **Estado atual, não o do pedido.** Uma alteração repetida usa a reserva como
  está no momento da repetição; uma alteração feita durante um pedido não se
  perde (revisão).
- **Mudar de alojamento** remove o evento do calendário anterior e cria-o no novo.
- **Desligar** remove primeiro os eventos (incluindo remoções pendentes). Se
  algum falhar, a ligação é mantida e o pedido devolve erro, para poder repetir.
- **Limpar duplicados** (eventos antigos) mostra primeiro a lista e o número; só
  apaga se o número confirmado for o mesmo nesse momento. Nunca toca em eventos
  sem o ícone da aplicação nem nos ligados a uma reserva. O mesmo vale para
  «Limpar duplicados» do Google Tasks.

`GET /api/calendar/status` e `GET /api/ops/status` mostram pendentes, com falhas
e o mais antigo. Definições → Google Calendar mostra «Alterações pendentes».

## Limites conhecidos

- Remoções de eventos de um utilizador que desligou o Calendar ou foi removido
  da equipa ficam bloqueadas (sem tokens): o evento fica no Google desse
  utilizador. A fila mostra-as com o erro.
- Recolorir calendários continua a ser «melhor esforço».
- Eventos criados antes desta versão não têm o calendário registado; usa-se o
  do alojamento atual.

## Validação

`test/google-calendar-queue.test.cjs` usa SQLite real e uma API Calendar
simulada em memória: falha na criação e repetição após reinício, resposta perdida
(409 → adoção), alteração falhada repetida com o estado atual, cancelamento e
eliminação com remoção durável, reativação, mudança de alojamento, cancelamento
durante a criação, alteração concorrente (revisão), eventos operacionais,
desligar com falhas, utilizador sem ligação e limpeza com pré-visualização. Não
contacta o Google.

Falta validar com uma conta Google real (de teste): o 409 ao criar com um ID já
usado e a reativação de um evento apagado por `PUT status=confirmed` são o
comportamento documentado da API, mas não foram exercidos contra o serviço real.
