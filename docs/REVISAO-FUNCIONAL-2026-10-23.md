# Revisão funcional para fechar a versão 1.0 — 23 de outubro de 2026

> **Atualização de 24/10/2026:** os 17 achados estão corrigidos no código local (não publicado) e validados pelos scripts de aceitação, que a CI executa juntamente com os checks mobile, pré-check-in, voucher e política. A revisão de código de 24/10 acrescentou e corrigiu outros defeitos; ver a [classificação V1/V2](ESCOPO-V1-V2.md#1b-revisão-de-código-de-2410-novos-defeitos-todos-v1-e-corrigidos-localmente). O texto abaixo mantém o estado de 23/10.

**Conclusão: ainda não fechar a 1.0 como pronta para operação.** A aplicação executa os percursos principais, mas persistem problemas de autorização, alteração involuntária de valores, repetição de pagamentos e fiabilidade dos emails.

A revisão produziu 17 achados priorizados: 16 comportamentos reproduzidos em ambiente isolado e um grupo de avisos de dependências. Os 11 comportamentos do diagnóstico de 8 de outubro continuam reproduzíveis. O diagnóstico adicional cobre cinco problemas, incluindo uma reprodução financeira mais explícita do antigo P01.

Esta revisão não implementou as correções de produto. Acrescentou o diagnóstico, evidência e critérios de conclusão. A única alteração a código existente foi adaptar o objeto `window` simulado de um teste ao listener `beforeunload` introduzido na revisão mobile. As alterações pré-existentes do projeto foram preservadas.

## Âmbito e limites

- Código local atual, incluindo alterações ainda não commitadas; não representa uma certificação do que está publicado.
- Bases SQLite em memória, organizações e hóspedes inventados, diretórios temporários e HTTP local. Gmail e Stripe simulados nos testes que os usam; nenhum email, cobrança ou reembolso real.
- Consultado o registo npm para atualizar os avisos das dependências; não foram atualizados pacotes.
- Testados percursos de reservas, permissões, conflitos, pagamentos manuais, pré-check-in, reserva pública com voucher, política de pagamentos, emails simulados, mobile e dados de backup.
- Sem ensaio de carga em produção, pentest integral, teste de dispositivos físicos, envio em Gmail real ou Stripe Test/Live real.

P1 = corrigir antes de fechar/publicar a 1.0 para a operação afetada. P2 = resolver no ciclo de estabilização, com comportamento ou limitação explicitamente aceite. A prioridade funcional não é a classificação dos avisos npm.

## Achados e critérios de conclusão

### V1-01 · P1 · Staff consegue cancelar pela ligação pública

O DELETE privado devolve 403 a `staff`, mas a consulta da reserva devolve o token público. O mesmo token permite cancelar pelo endpoint público sem sessão. Reproduzido por HTTP; a reserva terminou cancelada. Não foi efetuado reembolso real.

Origem: `backend/src/controllers/reservationController.js:65`; leituras de detalhe/listas/hóspedes também devem ser revistas. Referência anterior S01.

**Fechar quando:** respostas a staff não expõem capacidades de cancelamento/pagamento; testes cobrem detalhe, listas, hóspedes e as rotas públicas, preservando as ligações legítimas dos hóspedes.

### V1-02 · P1 · Alterar a hora de chegada ou notas modifica o total da reserva

Uma reserva com total manual de **150 €** passou a **200 €** após um PUT contendo apenas `arrival_time: "18:00"`. Este pedido é usado pela edição da hora na ficha. Noutro caso, uma reserva de **180 €**, com voucher de 10%, passou a **200 €** ao alterar apenas notas, mantendo o voucher consumido.

Origem: `backend/src/controllers/reservationWriteController.js:385` recalcula o total quando o pedido não inclui `total_amount`; `frontend/js/features/reserva-lista/acoes.js:69` é um chamador real. Diagnóstico F01.

**Fechar quando:** alterações não financeiras preservam total, desconto, voucher e consentimentos; alterações de datas/alojamento/ocupação têm regra de recálculo explícita e testada.

### V1-03 · P1 · Repetir um pagamento após perder a resposta duplica o recebido

Um intermediário HTTP local deixou o servidor gravar **50 €** e fechou a ligação antes de entregar a resposta. A repetição do pedido gravou outro movimento: **100 €** recebidos. O formulário volta a permitir Guardar após um erro de ligação; a API não identifica a mesma intenção de pagamento entre tentativas. O teste não trata dois pagamentos deliberadamente distintos como erro.

Origem: `backend/src/controllers/reservationPaymentsController.js:36`; `frontend/js/features/reserva-lista/detalhe-formularios.js:57`. Diagnóstico F04.

**Fechar quando:** a mesma intenção usa uma chave estável entre tentativas e produz um movimento; duas intenções legítimas de igual valor continuam possíveis. Cobrir resposta perdida e concorrência.

### V1-04 · P1 · Reduzir o recebido a zero pode conservar pagamento «confirmado»

Reserva inicialmente paga com 200 €; atualização de `amount_paid` para zero devolveu sucesso e guardou **0 € / confirmado**. A função de estado reutiliza o estado anterior quando o recebido é zero.

Origem: `backend/src/services/reservationRules.js:223` e `backend/src/controllers/reservationWriteController.js:416`. Diagnóstico F02.

**Fechar quando:** estado financeiro é coerente com os movimentos e o total, incluindo remoção do último pagamento, ajustes e reembolsos; nenhuma edição deixa uma reserva não paga marcada como paga.

### V1-05 · P1 · Cancelamento do backoffice ignora a cotação anteriormente aprovada

Foi obtida uma cotação de reembolso de **200 €**. Após um pagamento adicional, o DELETE com a chave e os 200 € anteriores devolveu sucesso e registou **250 €** a reembolsar em `manual_review`. O controller calcula uma nova cotação e passa-a à função que deveria verificar o valor aprovado. Zero reembolsos reais.

Origem: `backend/src/controllers/reservationController.js:114`. Diagnóstico F05; reforça o antigo P01.

**Fechar quando:** uma cotação desatualizada é rejeitada com 409, a interface mostra a nova cotação e o operador confirma esse montante; mesma proteção no cancelamento público e privado.

### V1-06 · P1 · Cabeçalhos de email aceitam injeção de nova linha

Um destinatário contendo CRLF criou um cabeçalho Bcc adicional no MIME entregue ao transporte Gmail simulado. Não foi demonstrada entrega num Gmail real.

Origem: `backend/src/config/googleEmail.js:85`. Referência S02.

**Fechar quando:** todos os caminhos rejeitam caracteres de controlo e endereços inválidos antes do transporte; preservar nomes legítimos com acentos e encadeamento de respostas.

### V1-07 · P1 · Mensagens anunciam envio sem Gmail ligado

Sem ligação Gmail, a API respondeu `success: true`, gravou uma mensagem com ID Gmail nulo e não enviou nada.

Origem: `backend/src/routes/emailMessages.js:66` e `backend/src/services/emailService.js:7`. Referência M01.

**Fechar quando:** enviado, pendente, desligado, falhado e resultado incerto são distinguíveis; a interface e o histórico refletem o resultado real do fornecedor.

### V1-08 · P1 · Chamadas simultâneas enviam o mesmo template duas vezes

Duas chamadas concorrentes para o mesmo template/reserva produziram duas mensagens no transporte simulado. O `INSERT OR IGNORE` na fila não reclama exclusivamente o envio.

Origem: `backend/src/services/emailService.js:441`. Referência M02.

**Fechar quando:** existe reclamação atómica da intenção de envio, com recuperação e tratamento explícito de respostas incertas. Testar concorrência entre pedidos e scheduler.

### V1-09 · P1 · Emails automáticos perdem contexto do alojamento

O envio direto respeitou a hora 18:30, a localidade e a desativação de redes sociais. O agendado perdeu a hora/localidade e mostrou Facebook. O scheduler reconstrói um alojamento incompleto.

Origem: `backend/src/services/emailScheduler.js`; referência M03.

**Fechar quando:** todos os caminhos usam o mesmo contexto efetivo de alojamento/herança e regras temporais; comparar o conteúdo direto e agendado com os mesmos dados.

### V1-10 · P1 · Fila envia cancelamento de reserva já confirmada

Uma tarefa pendente de cancelamento enviou a mensagem mesmo com a reserva confirmada. O estado atual não invalida a intenção obsoleta.

Origem: `backend/src/services/emailEligibility.js` e `backend/src/services/emailScheduler.js`; referência M04.

**Fechar quando:** cancelamento seguido de reativação não envia cancelamentos antigos; alterações de datas e repetição da fila revalidam estado e momento.

### V1-11 · P2 · Código de porta tem regras diferentes no envio manual

A elegibilidade automática recusou código de acesso numa reserva por pagar, mas a composição manual interpolou o mesmo código. O teste demonstra divergência entre caminhos internos; não demonstra acesso externo à caixa de gestão.

Origem: `backend/src/services/emailService.js:220`; referência M05.

**Fechar quando:** a regra é comum, ou existe uma exceção manual deliberada, autorizada e visível ao operador, com registo da decisão.

### V1-12 · P2 · Editar telefone apaga classificações do hóspede

Um PUT só com telefone repôs VIP, favorito e indesejado a zero.

Origem: `backend/src/controllers/guestController.js:132`; referência D01.

**Fechar quando:** campos omitidos são preservados; `false` explícito continua a remover uma classificação. Cobrir cada atualização parcial.

### V1-13 · P2 · Despesas aceitam datas e valores malformados

Uma despesa com `date: "data-invalida"` e `amount: "12euros"` foi criada; guardou a data inválida e o valor 12. Isto afeta filtros, totais e exportações.

Origem: `backend/src/controllers/expenseController.js:116`; referência D02.

**Fechar quando:** criação, edição e importação recusam datas inexistentes, números parcialmente interpretáveis e valores fora dos limites com erros claros.

### V1-14 · P1 · Disponibilidade pública pode rejeitar a capacidade da casa

Casa de quatro pessoas com dois quartos de duas pessoas devolveu indisponível para quatro, com capacidade máxima reportada de dois, apesar de não haver ocupação.

Origem: `backend/src/controllers/publicBookingController.js:209`; referência D03.

**Fechar quando:** a oferta pública identifica claramente a unidade vendida e calcula a capacidade correspondente; testar casa inteira, quartos independentes, ocupação parcial e pedido simultâneo.

### V1-15 · P2 · Arredondamento monetário pode marcar pagamento completo como parcial

`getPaymentStatus(0.3, 0.1 + 0.2)` devolveu parcial. Não foi simulada uma cobrança real de 0,30 €; a reprodução isola a comparação monetária usada pela aplicação.

Origem: `backend/src/services/reservationRules.js:226`; referência D04.

**Fechar quando:** comparações e somas de dinheiro usam cêntimos e uma regra única de arredondamento; incluir valores compostos, descontos e várias prestações.

### V1-16 · P2 · Limpar um campo do hóspede na reserva não o limpa

O editor enviou `guest.phone: ""` e recebeu sucesso, mas o telefone antigo continuou guardado. A combinação de `|| null` e `COALESCE` confunde campo vazio com campo omitido.

Origem: `backend/src/controllers/reservationWriteController.js:353`. Diagnóstico F03.

**Fechar quando:** omitir preserva, esvaziar remove e fornecer substitui, segundo o contrato de cada campo; testar também os restantes campos editáveis do hóspede.

### V1-17 · P1 · Dependências com avisos atuais

O `npm audit --omit=dev` devolveu:

| Inventário | Resultado |
|---|---|
| Backend | 5 pacotes: 1 crítico (`proxy-addr`), 2 altos (`sharp`, `source-map-js`), 2 moderados (`ip-address`, `sanitize-html`) |
| Frontend | 1 pacote crítico (`dompurify`, transitivo de jsPDF no lockfile) |

As respostas completas do registo, com URLs dos avisos e versões afetadas, estão em `audit/results-2026-10-23/npm-*.json`. A gravidade do registo não demonstra exploração nesta aplicação. No frontend, o inventário npm não prova que o bundle servido pelo CDN execute o caminho vulnerável.

**Fechar quando:** atualizar de forma dirigida, verificar os artefactos efetivamente servidos, reconstruir e repetir testes/audit; documentar qualquer exceção com exposição concretamente avaliada.

## O que passou nesta revisão

| Área | Evidência atual |
|---|---|
| Testes Node | 252/252 após adaptar o mock de `window` no teste de isolamento de rascunhos. A execução inicial foi 251/252; a falha era ausência de `addEventListener` no mock, não uma falha observada em navegador. |
| HTTP | Autenticação, recusa de escritas de staff, recibos privados, caminhos codificados, isolamento, origem e revogação de sessões. |
| Reservas adicionais | Criação a 200 €, duas criações concorrentes → 201/409; estadias adjacentes aceites; conflitos em quartos adicionais e casa/quartos recusados; quarto irmão livre aceite; datas/capacidade inválidas recusadas sem hóspede órfão. |
| Operação da reserva | Adicionar/remover pagamento pelo histórico; tarefas de check-in/check-out por staff; cancelar e reativar reserva sem política financeira. Marcar tarefas não certifica todos os estados e datas possíveis de uma estadia. |
| Browser geral | Passou, incluindo módulos, erros e repetição, atalhos, paginação, exportações, composição de mensagens e logout. |
| Pré-check-in | Etapas, países, validação, submissão, reabertura, documentos no backoffice e layouts. |
| Política de pagamentos | Editor, intervalos, simulador, persistência, mobile/paisagem, consentimento e sinal com Stripe simulada. A suite Node também cobre webhooks repetidos/fora de ordem, falhas e reembolsos simulados. |
| Voucher público | Aplicação, desconto, invalidação ao editar e criação da reserva. |
| Mobile | Regressão Chromium passou: login, preços na primeira visita, overflow, carregamento, folhas a 320/375/600 px, foco, rotação, menu, eventos, edição e movimento reduzido. O ensaio WebKit da revisão mobile anterior continua documentado; não foi repetido nesta revisão funcional. |
| Dados de backup | Exportar → preparar → restaurar → exportar conservou exatamente as tabelas de uma organização sintética com 13 reservas, pagamentos e vouchers. Não cobre uploads nem chave de tokens. |
| Desempenho local | 57 pedidos JS/CSS, 1004 KB, 23 scripts e 1153 ms até à vista inicial; 112 pedidos / 1873,3 KB após todas as vistas. Não é ensaio de carga nem medição numa rede móvel. |

Testes de percursos esperados passarem não invalida os defeitos reproduzidos: os cenários negativos acima ainda precisam de se tornar testes de aceitação após a correção.

## Revisões ainda necessárias para aceitar a 1.0

1. **Pagamentos reais em teste e reconciliação:** validar Stripe Test com a conta correta e estados incertos; disponibilizar resolução operacional para `manual_review` e tentativas antigas. Uma operação Live requer etapa própria e autorização financeira.
2. **Emails e Google reais:** entrega, duplicados, ligação expirada, Calendar/Tasks, eliminação de tarefas e Gmail/iPhone. Os testes atuais usam fornecedores simulados ou desligados.
3. **Recuperação completa:** ensaiar backup/restauro de base, uploads e chave dos tokens num ambiente isolado; verificar arranque, acesso e reconciliação após o restauro.
4. **Contas, exportações e privacidade:** fechar os pontos S04/S06/S07 da revisão de 8 de outubro: alterações de conta/convites, fórmulas CSV, retenção e controlo de operações caras. Não são dados como corrigidos por esta revisão.
5. **Dispositivos e acessibilidade:** iPhone e Android físicos, teclado virtual, zoom, leitor de ecrã, perda de rede, sessão expirada e atualização da PWA.
6. **CI e publicação:** incorporar os checks mobile, pré-check-in, voucher e política na CI. Atualmente `.github/workflows/checks.yml` executa a suite Node/HTTP, browser geral e medição, mas não chama estes checks específicos. Rever o conjunto de alterações locais, criar versão identificada e confirmar publicação/rollback.

## Ordem de correção proposta

1. Autorização e cabeçalhos de email: V1-01/V1-06; atualizar dependências V1-17 em paralelo com esta fase técnica.
2. Integridade financeira: V1-02/V1-03/V1-04/V1-05/V1-15, com testes de resposta perdida e alterações concorrentes.
3. Entrega e consistência de emails: V1-07 a V1-11.
4. Disponibilidade pública e preservação de dados: V1-12/V1-13/V1-14/V1-16.
5. Regressões na CI, restauro completo e validações externas/dispositivos; só depois fechar a 1.0 e iniciar a reformulação visual da 2.0.

## Como repetir e onde está a evidência

- `node docs/audit/reproduce-2026-10-08.cjs`: confirma 11 comportamentos defeituosos anteriores; terminar com sucesso significa que foram reproduzidos, não que estão corrigidos.
- `node docs/audit/review-functional-2026-10-23.cjs`: 12 cenários adicionais, incluindo controlos positivos, cinco problemas e restauro sintético. Mesma distinção entre diagnóstico e aceitação.
- [Resultados compactos dos testes](audit/results-2026-10-23/testes.txt).
- [Reproduções anteriores](audit/results-2026-10-23/reproducoes-anteriores.log).
- [Diagnóstico funcional adicional](audit/results-2026-10-23/fluxos-funcionais.log).
- [Audit backend](audit/results-2026-10-23/npm-backend.json) e [audit frontend](audit/results-2026-10-23/npm-frontend.json).

Não publicar os diagnósticos de segurança antes de corrigir os problemas.
