# Sincronização com Google Tasks

A integração sincroniza os eventos operacionais da aplicação com a lista dedicada
«Santa Paciência». A reserva em si continua a ser gerida na aplicação: mudar uma
tarefa no Google não muda as datas, pagamentos ou alojamento da reserva.

## Funcionamento

- Criar/editar/mover reservas gera ou atualiza as tarefas operacionais e desencadeia
  a sincronização. Inclui o motor público, aprovação e alterações às definições de
  geração automática. Tarefas de datas passadas e futuras também são reconciliadas.
- Concluir ou reabrir um evento funciona tanto na página de eventos como nos
  atalhos de check-in/check-out da ficha da reserva.
- Alterações no Google ao estado, título, notas e data de uma tarefa **já ligada**
  são recebidas pela aplicação. Tarefas novas criadas diretamente no Google não são
  importadas. O identificador nas notas permite recuperar uma criação da aplicação
  cuja resposta se tenha perdido por falha de rede.
- A consulta automática ocorre a cada 60 segundos, com o servidor em funcionamento
  e a opção de sincronização ativa. `GOOGLE_TASKS_SYNC_INTERVAL_MS` permite mudar
  o intervalo (mínimo 10 segundos). «Sincronizar agora» consulta os dois sentidos,
  mesmo com a opção automática desativada.
- Apagar um evento na aplicação ou a tarefa ligada no Google apaga a outra cópia.
  Apagar uma tarefa automática explicitamente impede a sua regeneração para a mesma
  reserva/tipo/data/alojamento. Mover a reserva gera tarefas para as novas datas.
- Cancelar uma reserva remove as tarefas automáticas pendentes e conserva as
  concluídas para histórico, como anteriormente. A eliminação definitiva remove
  também as tarefas concluídas e os eventos manuais associados.
- Personalizações dos eventos automáticos (incluindo as recebidas do Google)
  sobrevivem a guardar novamente a reserva. Alterar as datas/alojamento da reserva
  continua a substituir as tarefas pendentes que já não correspondem à estadia.

## Conflitos e recuperação

A aplicação guarda o último conteúdo sincronizado de cada lado e compara os campos.
Alterações a campos diferentes são combinadas; se ambos alterarem o mesmo campo,
a alteração local ainda não enviada prevalece. Eliminações prevalecem sobre edições.
Os pedidos de atualização usam o ETag recebido para evitar substituir uma mudança
feita no Google durante o próprio pedido. Falhas são repetidas na próxima consulta.

As eliminações ficam numa fila persistente, gravada na mesma transação que apaga
o evento. Incluem eliminações indiretas de reservas e restauros de dados. Um erro
404/410 ao eliminar é tratado como eliminação já concluída. As operações de
sincronização da mesma organização são sequenciais no processo do servidor.

Uma lista Google apagada é recriada sem eliminar os eventos locais. Erros de quota,
autenticação ou ligação não são tratados como uma lista apagada. Desligar desativa
a sincronização automática, elimina as tarefas ligadas e só depois revoga a ligação;
se a limpeza falhar, conserva a autenticação e os IDs necessários para repetir.

## Campos e limites

Os horários, responsável e indicação de importância são enviados num bloco de
informação nas notas; o bloco identifica também o evento da aplicação. O Google
Tasks só permite ler/escrever a **data**, sem hora, através desta API. Remover a data
no Google não remove a data obrigatória do evento: a aplicação volta a enviá-la.
A informação de alojamento continua no prefixo do título. Os campos específicos da
reserva e o bloco informativo continuam a ser geridos na aplicação.

Referência oficial: [recurso Task](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks),
[listagem, incluindo tarefas concluídas, ocultas e apagadas](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list).

## Validação

`npm test` e `npm run check` em `backend/src`. Os testes específicos em
`test/google-tasks-sync.test.cjs` usam SQLite real em memória e uma API Google
simulada: cobrem ambos os sentidos, conflitos, concorrência, paginação, migração,
repetições, cancelamento, eliminação e regeneração. Não alteram tarefas reais.
