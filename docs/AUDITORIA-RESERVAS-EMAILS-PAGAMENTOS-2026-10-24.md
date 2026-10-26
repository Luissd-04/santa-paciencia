# Auditoria — reservas, emails e pagamentos

Data: 24 de outubro de 2026. Âmbito: como o código processa hoje **reservas**,
**envio de emails** e **pagamentos/gestão de dinheiro**, com o objetivo de
centralizar processos semelhantes que estão espalhados. Esta auditoria não altera
código; descreve o estado atual, os problemas encontrados e uma proposta de
centralização por fases.

Método: leitura integral dos controllers, serviços e agendadores envolvidos
(backend em `backend/src`) e pesquisa das regras repetidas no frontend
(`frontend/js`). As referências `ficheiro:linha` correspondem ao commit
`0096cdb`. Os comportamentos marcados como **confirmado** foram verificados
pela leitura do código (e, quando indicado, executando a função). Os marcados
como **a confirmar** dependem de configuração ou de uso real.

---

## 1. Resumo executivo

O código é cuidadoso nas partes mais difíceis: idempotência, transações SQLite,
reconciliação com a Stripe, cêntimos inteiros e envios de email com estado
"incerto". O problema não é a falta de rigor. São as **regras de negócio
repetidas em vários sítios com pequenas diferenças**, e os **efeitos
colaterais** (email, push, calendário, tarefas, histórico) decididos caso a caso
em cada controller.

Principais conclusões:

1. **Não há uma máquina de estados da reserva.** O campo `status` é escrito em
   pelo menos 12 sítios. A regra "pagamento → estado da reserva" existe em 5
   versões diferentes (§3.2).
2. **Há 4 caminhos de cancelamento** com efeitos diferentes: histórico, email,
   push e notas (§3.3).
3. **Há 2 formas de registar pagamentos manuais**, com consequências
   diferentes. Uma delas cria movimentos de "ajuste" no ledger sem pagamento real
   (§5.3).
4. **O email de pagamento só sai por um dos três caminhos de pagamento.** Um
   pagamento Stripe não envia nada ao hóspede nem avisa a equipa (§4.3).
   **Confirmado.**
5. **Os emails saem por 4 mecanismos com garantias diferentes.** Os avisos da
   política de pagamento usam HTML fixo, fora dos modelos editáveis e sem
   registo de entrega (§4.2).
6. **"Receita" tem definições diferentes** no dashboard e nos relatórios (§5.6).
7. **No frontend, os rótulos e as regras de estado estão copiados em 6 ou mais
   ficheiros.** O seletor "Estado do pagamento" da ficha não tem efeito real
   (§6). **Confirmado.**

A proposta (§8) é concentrar tudo em quatro peças:

- um **ciclo de vida da reserva**: transições e cancelamento únicos;
- um **ledger financeiro**: único ponto que escreve dinheiro e deriva estados;
- um **despachante de eventos**: decide emails, push, calendário, tarefas e
  histórico;
- um **serviço único de emails**.

A ordem foi escolhida para baixar o risco: primeiro testes de caracterização,
depois o dinheiro.

---

## 2. Mapa geral

```text
Backoffice (SPA)                 Hóspede (páginas públicas)        Stripe
   │                                   │                              │
   ▼                                   ▼                              ▼
routes/reservations.js        routes/publicBooking.js        POST /api/stripe/webhook
   │                                   │                              │
   ├─ reservationController            ├─ publicBookingController     └─ stripePaymentsController
   ├─ reservationWriteController       │    (criar pedido, pré-check-in)      │
   ├─ reservationPaymentsController    └─ stripePaymentsController            ▼
   └─ reservationOperationsController       (checkout, cancelar)       services/stripePayments
                    │                                │                         │
                    └──────────────┬─────────────────┴─────────────────────────┘
                                   ▼
        services: reservationQuote · reservationRules · reservationAvailability
                  paymentLedger · paymentPolicy · paymentPolicyAutomation
                  voucherService · emailService · emailDelivery · pushService
                  calendarService · operationalTasksService · reservationHistoryService
                                   ▲
        schedulers: reservationScheduler (30 min) · emailScheduler (1 h)
                    paymentPolicyAutomation.runPolicyMaintenance (dentro do anterior)
```

Cada controller chama diretamente os serviços de efeitos colaterais. Não existe
uma camada intermédia que diga "aconteceu X à reserva, faz Y".

---

## 3. Reservas

### 3.1 Pontos de entrada

| Operação | Onde | Notas |
|---|---|---|
| Criar (backoffice) | `controllers/reservationWriteController.js:53` | Idempotente (`reservation_create_intents`), preço por `reservationQuote.priceCreate` |
| Criar (pedido público) | `controllers/publicBookingController.js:244` | Preço calculado à parte (`calculateTotal`, `:143`), antibot, voucher revalidado na transação |
| Editar | `reservationWriteController.js:240` | Também cancela e reativa por mudança de `status` |
| Pré-visualizar preço | `reservationWriteController.js:447` | Mesmo cálculo da gravação (bom) |
| Aprovar pedido | `controllers/reservationController.js:197` | Passa a `pre_checkin` e envia email |
| Enviar link de pré-check-in | `reservationController.js:235` | Pode mudar o estado para `pre_checkin` |
| Pré-check-in do hóspede | `publicBookingController.js:618` → `services/publicGuestService.js:18` | Pode mudar o estado para `confirmada`/`aguardar_pagamento` |
| Cancelar (gestão) | `reservationController.js:113` | Dois ramos: com e sem política |
| Cancelar (hóspede) | `controllers/stripePaymentsController.js:31` → `paymentPolicyAutomation.cancelByPolicy` | Só com política |
| Expirar pedidos (TTL) | `services/reservationScheduler.js:26` | Scheduler de 30 em 30 min |
| Cancelar por falta de pagamento | `services/paymentPolicyAutomation.js:127` (`runPolicyMaintenance`) | Scheduler |
| Apagar definitivamente | `reservationController.js:171` → `reservationPurge` | Bem centralizado |
| Marcar check-in/out "feito" | `controllers/reservationOperationsController.js:114` | Só altera a tarefa operacional, **não** o `status` |

### 3.2 Estados: não há máquina de estados

Estados aceites (`services/reservationValidation.js:5`): `pre_reserva`,
`pendente`, `pre_checkin`, `aguardar_pagamento`, `confirmada`, `check_in`,
`check_out`, `cancelada`.

O mesmo campo `status` mistura **três dimensões diferentes**:

- **aprovação**: `pendente` → aprovado;
- **pagamento**: `aguardar_pagamento` ↔ `confirmada`;
- **progresso do pré-check-in**: `pre_checkin`.

Por isso uma reserva `confirmada` "volta" a `pre_checkin` quando se envia o link
(`reservationController.js:272`), e depois regressa a `confirmada` quando o
hóspede preenche. Cada ponto que escreve o estado tem a sua própria regra:

| # | Onde | Regra aplicada |
|---|---|---|
| 1 | Criação backoffice `reservationWriteController.js:69` | `req.body.status \|\| 'confirmada'` (qualquer estado válido, incluindo `check_out`) |
| 2 | `paymentPolicy.attachPolicy` `services/paymentPolicy.js:91` | `confirmada` → `aguardar_pagamento` se pago < sinal |
| 3 | Pedido público `publicBookingController.js:385` | `pendente` → `aguardar_pagamento` se a Stripe estiver ativa e o total ≥ 0,50 € |
| 4 | Edição `reservationWriteController.js:336-347` | Ternário encadeado: reativação, política, sinal, "pago > 0" |
| 5 | Pagamento manual `reservationPaymentsController.js:6-10` (`policyStatus`) | Com política: `confirmada` ⇄ `aguardar_pagamento` (**pode descer** ao apagar um pagamento) |
| 6 | Pagamento Stripe `services/stripePayments.js:253` | Só sobe para `confirmada` a partir de `pendente`/`pre_reserva`/`aguardar_pagamento` |
| 7 | Pré-check-in `services/publicGuestService.js:68` | `pre_checkin` → `confirmada` ou `aguardar_pagamento` |
| 8 | Aprovar `reservationController.js:214` | → `pre_checkin` (UPDATE fora de transação, sem condição sobre o estado atual) |
| 9 | Link de pré-check-in `reservationController.js:271-278` | → `pre_checkin` a partir de uma lista fixa de estados |
| 10–13 | Cancelamentos (§3.3) | → `cancelada`, cada um com o seu UPDATE |

Consequências:

- A regra "o sinal foi pago, a reserva fica confirmada" está escrita 5 vezes
  (#2, #4, #5, #6, #7), com diferenças. Por exemplo, #5 desce o estado e #6 nunca
  o desce. Corrigir uma regra exige lembrar-se das outras quatro.
- `check_in`/`check_out` só se atingem escolhendo o estado à mão. O botão
  "check-in feito" (`reservationOperationsController.js:114`) não muda o estado
  da reserva. Há dois conceitos de "check-in feito".
- A lista de estados "ativos" varia de sítio para sítio. Exemplos:
  `payable()` em `stripePayments.js:38`, `describe().canCancel` em
  `paymentPolicy.js:119`, `STAY_STATUSES` em `emailEligibility.js:4` (que ainda
  inclui os valores antigos `checkin`/`checked_in`) e o TTL em
  `reservationScheduler.js:30`.

### 3.3 Cancelamento: 4 caminhos com efeitos diferentes

| Efeito | DELETE sem política (`reservationController.js:125`) | PUT `status=cancelada` sem política (`reservationWriteController.js:267`) | Por política: gestão, hóspede ou falta de pagamento (`paymentPolicyAutomation.js:28`) | TTL (`reservationScheduler.js:26`) |
|---|---|---|---|---|
| Fecha checkout Stripe aberto | sim | sim | sim | não (exclui reservas com tentativa ativa) |
| Guarda estado anterior | sim | sim | sim | sim |
| Liberta voucher não pago | sim | sim | sim | sim |
| Remove evento do Calendar | sim | sim | sim | sim |
| Atualiza tarefas operacionais | sim | sim | sim (com `try/catch`) | sim |
| Ação no histórico | `cancelled` | `updated` + `meta.cancelled` | `policy_cancelled` | `cancelled` + `meta.reason=ttl` |
| Reembolso | não | não | sim (Stripe) | n/a |
| Email ao hóspede | modelo `cancelamento` | modelo `cancelamento` | **HTML fixo** (`sendNotice`) | modelo `cancelamento` |
| Push à equipa | sim | sim | **não** | **não** |
| Nota escrita na reserva | não | não | não | sim (texto em `notes`) |

O cancelamento pelo hóspede (link público) não avisa a equipa por push nem por
email. Também não há aviso quando o scheduler cancela por falta de pagamento ou
por TTL. A equipa só descobre pela lista ou pelo histórico. **Confirmado.**

O próprio código reconhece o problema: o comentário em
`reservationScheduler.js:57-60` diz que o TTL era "o único ponto de cancelamento
que não" limpava tarefas e calendário. Foi corrigido copiando os passos, não
centralizando-os.

### 3.4 Criação: backoffice e público fazem o mesmo de formas diferentes

| Aspeto | Backoffice | Público |
|---|---|---|
| Cálculo do preço | `reservationQuote.priceCreate` | `calculateTotal` próprio (`publicBookingController.js:143`) + cálculo do voucher inline (`:318-329`, repetido em `:359-366`) |
| Serviços da organização | `reservationSupport.getOrganizationServices` (`reservationSupport.js:90`) | `getServices` copiado (`publicBookingController.js:130`) |
| Opções de ocupação extra | `reservationRules.normalizeExtraOccupancyOptions` | Cópia com mais campos (`publicBookingController.js:91`) |
| Hóspede | INSERT/UPDATE inline por email (`reservationWriteController.js:82-128`) | `publicGuestService.createReservationGuest` (ficha sempre nova) |
| Acompanhantes | `reservationSupport.upsertAdditionalGuests` | Guardados só em `guests_data` (sem ficha) |
| Token público | `reservationSupport.ensurePublicToken` (2× UUID) | `crypto.randomBytes(32)` inline |
| Estadia mínima | não verifica | verifica `min_nights` |
| Data no passado | não verifica | recusa |
| Bloqueios | `findConflict` + `findBlockConflict` (redundante, ver A15) | só `findConflict` (que já inclui bloqueios) |
| Email ao hóspede | modelo `confirmacao` | **nenhum** |
| Email à gestão | nenhum | `sendOwnerNewReservationEmail` (HTML fixo) |
| Push | `new_reservation` | `new_reservation` (texto diferente) |

Há 4 sítios que criam ou atualizam fichas de hóspede:

- `reservationWriteController.js:82`;
- `reservationSupport.upsertAdditionalGuests` (`reservationSupport.js:46`);
- `publicGuestService` (`publicGuestService.js:6`, `:18`);
- `guestPatch.updateGuest`.

Também há dois formatos de email "marcador": `sp-interno-…@reserva.local` e
`guest_…@sem-email.local`.

### 3.5 Efeitos colaterais depois da transação

Depois de gravar, cada controller dispara à mão uma lista de efeitos, quase
sempre em modo "dispara e esquece" (`.catch(err => console.warn(...))`):

- histórico (`recordHistory`), por vezes dentro e por vezes fora da transação;
- tarefas operacionais (`syncReservationOperationalTasks`);
- Google Calendar (`queueCalendarUpsert`/`detachReservationEvent` + `kickCalendarQueue`);
- email (`send*Email`);
- push (`notifyOrganization`);
- vouchers (`releaseVoucherIfUnpaid`/`reclaimReleasedVoucher`).

O Calendar e as Google Tasks já usam uma fila durável. Os emails por modelo
também (§4.2). O push, o email à gestão e os avisos da política não. Esquecer um
destes passos num caminho novo é fácil, e foi o que aconteceu no TTL e nos
cancelamentos por política.

---

## 4. Emails

### 4.1 Mecanismos de envio

| Mecanismo | Onde | Conteúdo | Garantias |
|---|---|---|---|
| **A. Modelos da organização** (`sendTemplatedEmail`) | `services/emailService.js:414` | Modelo editável + blocos do servidor | Elegibilidade, janela horária, fila durável (`organization_email_queue`), registo de entrega com estado incerto (`emailDelivery.js`), resolução manual na ficha |
| **B. HTML fixo com o desenho comum** (`baseTemplate`) | `emailService.js:478` (pagamento sem modelo), `:503` (pré-check-in sem modelo), `:532` (nova reserva à gestão) | HTML no código | Sem fila, sem registo de entrega, sem deduplicação |
| **C. HTML fixo mínimo** | `paymentPolicyAutomation.js:100-125` (aviso do restante, cancelamento), `routes/auth.js:27` (`emailWrap`), `controllers/teamController.js:63` (convite) | `<p>` inline ou outro desenho | Avisos da política: dedupe próprio em colunas da reserva (`balance_notice_sent_at`, `policy_cancel_notice_at`); restantes nenhuma |
| **D. Manual (separador Mensagens)** | `routes/emailMessages.js:31` | Composto pela equipa com o renderer A | Registo em `invoice_messages` |
| **E. Diretamente para o Gmail** (`sendViaGmail`, sem passar por `sendMail`) | `controllers/emailTemplateController.js:247` (pré-visualização), `routes/googleAuth.js:163` (teste) | | Não passam pelas verificações de `sendMail` (por exemplo `EMAIL_ENABLED`, que só a pré-visualização verifica por si) |

Observações:

- **Há três desenhos visuais diferentes**: o do `emailComposer`, o `emailWrap`
  do `auth.js` e o `div` inline do convite. Os avisos da política nem têm
  desenho.
- **Os avisos da política não são editáveis.** O aviso "pagamento do
  restante", com prazo e consequência de cancelamento sem devolução, e o email
  de cancelamento com reembolso estão em `paymentPolicyAutomation.js:114-116`.
  São das mensagens mais sensíveis juridicamente e são as únicas que o
  alojamento não pode rever nem traduzir.
- **O URL público é calculado de várias formas:**
  - `publicOrigin(req)` nos controllers;
  - `configuredOrigin()` na Stripe e na política;
  - `process.env.PUBLIC_APP_URL || FRONTEND_PUBLIC_URL || 'http://localhost:3001'`
    em `emailService.js:73`, `:240`, `:444` e em `emailMime.js`.

  Sem `PUBLIC_APP_URL`, os links do pré-check-in nos emails apontam para
  `localhost`. **A confirmar** em produção (depende do `.env`).
- **A deteção de "Gmail expirou"** (texto do erro, `invalid_grant`, 401) está
  copiada em `routes/emailMessages.js:98-105` e `routes/googleAuth.js`.

### 4.2 O pipeline bom (A) e o resto

O mecanismo A está bem desenhado:

- a intenção fica na fila antes do envio;
- um timeout do Gmail fica como `uncertain` e não é repetido às cegas;
- existe resolução manual na ficha (`/email-deliveries/resolve`);
- a elegibilidade é reavaliada à saída da fila;
- há deduplicação por hash do conteúdo.

O problema é que só os emails com modelo passam por ele. Quando o modelo
`pagamento` ou `pre_checkin` não existe, o código cai para B
(`emailService.js:485-500`, `:510-525`), que não tem nenhuma dessas garantias. O
mesmo email tem garantias diferentes consoante exista ou não um modelo.

### 4.3 O que é enviado em cada acontecimento

| Acontecimento | Email ao hóspede | Email à gestão | Push |
|---|---|---|---|
| Reserva criada no backoffice | `confirmacao` (A) | — | sim |
| Pedido público criado | **nenhum** | B (owner + managers) | sim |
| Pedido aprovado | `pre_checkin` (A ou B) | — | — |
| Link de pré-check-in enviado | `pre_checkin` (A ou B) | — | — |
| Pré-check-in submetido | — | — | sim |
| Pagamento registado no separador Pagamentos (`addPayment`) | **nenhum** | — | — |
| Pagamento via edição (valor pago até ao total) | `pagamento` (A ou B) | — | — |
| **Pagamento Stripe confirmado (webhook)** | **nenhum** | **nenhum** | **nenhum** |
| Aviso do restante (política) | C | — | — |
| Cancelamento pela gestão sem política | `cancelamento` (A) | — | sim |
| Cancelamento por política (gestão, hóspede, falta de pagamento) | C | — | **não** |
| Expiração TTL | `cancelamento` (A) | — | **não** |
| Chegada/saída (agendados) | modelos com `timing_event` (A) | — | — |

**Confirmado** por pesquisa: `services/stripePayments.js` não importa nenhum
serviço de email nem de push. `sendPaymentConfirmationEmail` só é chamado em
`reservationWriteController.js:435`.

Na prática, um hóspede que reserva pelo site e paga pela Stripe **não recebe
nenhum email** a confirmar o pedido ou o pagamento. Fica apenas com a página
`/reserva/:token`. A gestão também não é avisada quando o dinheiro entra.
Se isto é intencional ou não é uma decisão de negócio (ver §9). De qualquer
forma, o resultado depende de que botão ou caminho foi usado, e não de uma regra
explícita.

---

## 5. Pagamentos e gestão de dinheiro

### 5.1 Modelo de dados

| Onde | O que guarda | Papel |
|---|---|---|
| `reservations.total_amount` | Total contratado (inclui taxa turística e extras) | Fonte |
| `reservation_payments` | Ledger de movimentos (positivos e negativos) | **Fonte do valor pago** |
| `reservations.amount_paid` | Soma do ledger, desnormalizada | Cache, atualizada à mão em cada caminho |
| `reservations.payment_status` | `pendente`/`parcial`/`confirmado`/`reembolsado` | Derivado (`reservationRules.getPaymentStatus`, `:223`) |
| `reservations.payment_method`, `payment_date`, `paid_at`, `payment_amount`, `payment_currency` | Últimos valores | Desnormalizado, sobrescrito pela Stripe (`stripePayments.js:254-256`) |
| `stripe_payment_attempts` | Tentativas Stripe (estado, cêntimos capturados/reembolsados, pedido persistido) | Fonte do lado Stripe |
| `stripe_webhook_events` | Deduplicação de eventos | |
| `reservations.payment_policy_json` | Cópia da política no momento da reserva | Fonte das regras de sinal/restante/reembolso |
| `reservations.policy_cancellation_json` | Cancelamento financeiro e itens de reembolso | Estado de reembolsos |
| `reservations.online_payment_status`, `balance_*`, `policy_*`, `stripe_*` | Estado da automação | |
| `manual_payment_intents` | Idempotência dos pagamentos manuais | |
| `voucher_redemptions` | Desconto aplicado | Interage com cancelamento e pagamento |

### 5.2 Quem escreve dinheiro

| Caminho | Onde | Ledger | Recalcula `amount_paid`/`payment_status` | Estado da reserva |
|---|---|---|---|---|
| Valor pago na criação | `reservationWriteController.js:162-193` → `ensureLegacyPayment` | "Saldo inicial migrado" | inline | regra #1/#2 |
| Valor pago na edição | `reservationWriteController.js:391` → `setPaidAmount` (`paymentLedger.js:19`) | **"Ajuste do saldo pela gestão da reserva"** (diferença) | inline | regra #4 |
| Separador Pagamentos: adicionar | `reservationPaymentsController.js:11` | movimento normal | inline | regra #5 |
| Separador Pagamentos: apagar | `reservationPaymentsController.js:80` | apaga movimento | inline | regra #5 |
| Stripe: captura/reembolso | `stripePayments.js:225` (`applyPayment`) | `stripe-payment-*`, `stripe-refund-*` | inline | regra #6 |
| Reembolso por política | `paymentPolicyAutomation.js:71` | via reconciliação Stripe | via `applyPayment` | — |

Cada linha volta a implementar "somar o ledger, gravar `amount_paid`, derivar
`payment_status`, derivar o estado". Há 4 implementações desta sequência.

### 5.3 Duas formas de registar um pagamento manual

1. **Separador Pagamentos** (`addPayment`): cria um movimento com valor, método,
   data e notas. É o caminho correto.
2. **Campo "valor pago" do assistente de edição** (`frontend/js/reserva-wizard.js:135-185`):
   - escolher "Completo" preenche `amount_paid = total` no cliente;
   - o servidor (`setPaidAmount`) cria um movimento "Ajuste do saldo pela gestão
     da reserva" pela diferença;
   - esse movimento herda `payment_method` e `payment_date` da reserva.

Consequências:

- O ledger passa a ter movimentos sem pagamento real associado. Isto acontece
  quando se escolhe "Completo" só para "marcar como pago".
- O email `pagamento` só sai pelo caminho 2 (§4.3).
- Com pagamentos Stripe, o caminho 2 fica bloqueado
  (`reservationWriteController.js:252-255`) mas o caminho 1 não. O
  comportamento difere conforme a origem do dinheiro.

### 5.4 Stripe: o que está bem

`services/stripePayments.js` é o módulo mais robusto da aplicação e deve ser
preservado:

- o pedido é persistido antes da chamada remota;
- a chave de idempotência é estável e há o limite das 23 h;
- o estado é sempre relido da Stripe ("canónico"), em vez de se confiar no
  corpo do webhook;
- metadata, montante, moeda e ambiente são validados;
- a deduplicação de eventos acontece na mesma transação que o ledger;
- os eventos atrasados de tentativas antigas são protegidos;
- o scheduler reconcilia as tentativas.

Pontos de atenção:

- **O estado da reserva é decidido dentro do módulo Stripe** (`:249-253`). É a
  regra #6 da §3.2, diferente das outras.
- **`payment_date` usa `date('now')` do SQLite** (`:239`, `:256`), que é UTC. A
  convenção do projeto (`docs/ARQUITETURA.md`) é calcular "hoje" com
  `localDateIso()`. Entre as 00:00 e a 01:00 de Lisboa, no verão, o pagamento
  fica com a data de ontem.
- **`payment_method` é sobrescrito com `'Stripe'`** (`:256`), mesmo que a
  reserva já tenha pagamentos manuais noutro método.
- Os efeitos (tarefas) são sincronizados depois da transação. Email e push não
  existem (§4.3).

### 5.5 Política de pagamentos

`paymentPolicy.js` tem cálculos puros e bem isolados (`calculate`, `planFor`,
`amountDue`). `paymentPolicyAutomation.js` mistura vários papéis:

- reconciliação;
- cancelamento (com os seus próprios efeitos, §3.3);
- reembolsos;
- envio de emails em HTML fixo (§4.1);
- a manutenção agendada.

**A política só é automatizada para a organização da Stripe.**
`runPolicyMaintenance` filtra por `stripeConfig().organizationId`
(`paymentPolicyAutomation.js:130-131`). Já `attachPolicy`
(`paymentPolicy.js:80`) aplica a política a qualquer organização que a tenha
ativado, e pode pôr reservas em `aguardar_pagamento`. Numa organização sem
Stripe, essas reservas nunca recebem aviso nem cancelamento automático. Só saem
desse estado com um pagamento manual. **A confirmar:** depende de outras
organizações ativarem a política.

### 5.6 O que é "receita"

| Ecrã | Definição | Onde |
|---|---|---|
| Relatórios por canal/alojamento | `SUM(total_amount)` das reservas não canceladas, por data de check-in | `controllers/reportController.js:27`, `:38` |
| Dashboard "reservado" | `SUM(total_amount)` não canceladas (todas as datas) | `reservationOperationsController.js:21` |
| Dashboard "recebido" | `SUM(amount_paid)` **incluindo canceladas** (cache, não o ledger) | `reservationOperationsController.js:23` |
| Exportação "Em falta" | `total_amount - amount_paid` | `frontend/js/features/reserva-lista/exportacao.js:32` |

Efeitos:

- **A taxa turística conta como receita.** Faz parte de `total_amount` e é um
  imposto cobrado por conta do município.
- **Um sinal retido numa reserva cancelada** (cancelamento sem reembolso) é
  dinheiro do alojamento, mas não aparece na receita dos relatórios. Aparece no
  "recebido" do dashboard.
- **Os números não batem entre ecrãs** sem que nenhum esteja errado: cada um usa
  a sua definição.

---

## 6. Frontend: regras copiadas

| Regra | Cópias |
|---|---|
| Rótulos dos estados da reserva | `js/helpers.js:211-224`, `js/reserva-detalhe-tabs.js:208`, `js/features/calendario/mes-agenda.js:269`, `js/reservation-status.js:8`, `js/features/reserva-lista/detalhe.js:135-141`, cores em `js/reserva-lista.js:87`, opções em `js/features/emails/editor.js:210` |
| Rótulos do estado do pagamento | `js/helpers.js:231-232` (inclui o valor antigo `pago`), `detalhe.js:144-147`, `js/features/reserva-wizard/editor.js:172` |
| "Pode pagar online?" | `detalhe.js:130-131` e `js/reservation-status.js:48`. São versões simplificadas de `stripePayments.payable()` que não conhecem reembolsos, revisão nem o fim da estadia |
| Estado ↔ valor pago | `js/reserva-wizard.js:135-185`: o cliente muda `aguardar_pagamento` → `confirmada` quando há valor pago, outra cópia da regra #4 |

Os textos divergem entre ecrãs: "Pre Check-in" / "Pré-check-in" /
"Pré-check-in pendente", "Aguardar Pagamento" / "A aguardar pagamento".

**O seletor "Estado do pagamento" na ficha não tem efeito.** **Confirmado.**

- `updateDetailStatus` (`detalhe.js:486`) envia só `payment_status`.
- O servidor recalcula-o a partir do valor pago e ignora a escolha:
  `getPaymentStatus(0, 100, 'confirmado')` devolve `pendente`;
  `getPaymentStatus(40, 100, 'confirmado')` devolve `parcial` (verificado
  executando a função).
- Mesmo assim, a interface mostra "Estado atualizado".
- O seletor de estado da reserva também não tem `check_in`/`check_out`, que o
  servidor aceita.

---

## 7. O que está bem e deve ser preservado

- Idempotência na criação de reservas, nos pagamentos manuais, no Checkout e
  nos reembolsos.
- Transações `immediate` à volta das verificações de disponibilidade e dos
  vouchers (sem double-booking por concorrência).
- Cêntimos inteiros nos cálculos da política e da Stripe.
- `reservationQuote`: o mesmo cálculo serve a pré-visualização e a gravação no
  backoffice.
- `emailDelivery`: estado "incerto" e resolução manual, em vez de repetir
  envios.
- Reconciliação canónica com a Stripe e proteção contra eventos fora de ordem.
- `purgeReservations()` como ponto único de eliminação, e leases nos schedulers.
- Testes de regressão para a Stripe, a política, os vouchers e os emails
  (`backend/src/test/*.test.cjs`).

A centralização deve **reutilizar** estas peças. Não é para as reescrever.

---

## 8. Proposta de centralização

### 8.1 Arquitetura alvo

```text
controllers (HTTP)  ──►  casos de uso  ──►  domínio  ──►  efeitos
                          │                  │             │
 reservationLifecycle ────┘                  │             │
   create / update / approve / cancel        │             │
   / precheckin / expire                     │             │
                                             │             │
 financialLedger ────────────────────────────┤             │
   recordPayment / removePayment             │             │
   / applyStripe / recompute                 │             │
                                             ▼             │
 reservationState (puro)                                    │
   transições permitidas + derivação de payment_status/status
                                                           │
 reservationEvents (outbox na mesma transação) ────────────┘
   reservation.created / approved / paid / payment_removed /
   cancelled{reason} / expired / precheckin_submitted
          │
          ▼  despachante (após commit e no scheduler)
   histórico · email · push · calendário · tarefas · vouchers
```

1. **`services/reservationState.js`** (puro, testável sem base de dados):
   - a tabela de transições permitidas;
   - uma única função `deriveFinancialState({ total, paid, policy, status })`
     que devolve `payment_status` e o estado resultante.

   Substitui as regras #2, #4, #5, #6 e #7 da §3.2.
2. **`services/financialLedger.js`** (evolução de `paymentLedger.js`): o único
   código que insere ou apaga em `reservation_payments`. Depois de cada
   movimento chama `recompute(reservationId)`, que soma o ledger, grava a cache
   e aplica `deriveFinancialState`.
   - `addPayment` e `setPaidAmount` passam a usá-lo.
   - `applyPayment` da Stripe também. A Stripe continua a decidir *quanto*
     entrou, mas deixa de decidir o estado da reserva.
3. **`services/reservationLifecycle.js`:** um `cancelReservation(id, { reason,
   actor })` único para os 4 caminhos da §3.3. Quando há política, delega a parte
   financeira (reembolsos) em `paymentPolicyAutomation`. O mesmo vale para
   `approve`, `startPrecheckin` e `expire`.
4. **`reservationEvents` + despachante:** cada caso de uso grava um evento na
   mesma transação, numa tabela de outbox, no mesmo padrão das filas já usadas
   pelo Calendar e pelos emails. Um único ficheiro declara que efeitos cada
   evento produz:

   ```js
   'reservation.cancelled': [history, releaseVoucher, calendarDetach, tasks,
                             guestEmail('cancelamento'), push('cancellation')],
   'reservation.paid':      [history, guestEmail('pagamento'), push('payment')],
   ```

   As decisões da §4.3 ficam explícitas e iguais para todos os caminhos. O
   push e o email à gestão ganham durabilidade.
5. **Um só serviço de emails:**
   - todos os emails ao hóspede passam pelo mecanismo A (modelo + fila +
     registo de entrega);
   - os avisos da política passam a modelos editáveis (`aviso_restante`,
     `cancelamento_politica`), com os textos atuais como padrão;
   - o email à gestão também passa a modelo;
   - os emails de conta (convite, recuperação, alteração de email) usam o mesmo
     `emailComposer`;
   - um `publicLinks.js` único (`reservationPageUrl`, `precheckinUrl`) substitui
     os vários cálculos de URL.
6. **Criação unificada:** o pedido público passa a usar
   `reservationQuote.priceCreate` e um `guestService` único (criar, atualizar,
   acompanhantes). Ficam só as diferenças intencionais: antibot, estadia mínima,
   ficha isolada.
7. **Frontend:**
   - um módulo `js/domain/reservation-status.js` com rótulos, cores e opções;
   - o "pode pagar" vem do servidor (`payment_policy`/`online_payment.available`),
     em vez de ser recalculado;
   - o seletor de estado do pagamento é removido ou passa a abrir o formulário
     de pagamento.
8. **Definição única de receita** num serviço de relatórios: bruto, taxa
   turística, receita líquida de taxas e retido em cancelamentos. Dashboard,
   relatórios e exportação passam a usá-la.

### 8.2 Plano por fases (do menor para o maior risco)

| Fase | Conteúdo | Risco | Porquê nesta ordem |
|---|---|---|---|
| 0 | **Testes de caracterização.** Para cada caminho das §3.3, §4.3 e §5.2, um teste que fixe os efeitos atuais (estado, ledger, histórico, emails e push pedidos) | Nulo | Protege as fases seguintes; mostra exatamente o que muda |
| 1 | `reservationState.deriveFinancialState` + `financialLedger.recompute`, usados por todos os caminhos de dinheiro | Médio | Maior valor: dinheiro e estado deixam de divergir |
| 2 | `cancelReservation` único | Médio | Elimina 4 implementações |
| 3 | Outbox de eventos + despachante; corrigir as falhas da §4.3 conforme as decisões da §9 | Médio | Centraliza os efeitos; resolve os "esquecimentos" |
| 4 | Emails: avisos da política e email à gestão como modelos; `publicLinks`; desenho único | Baixo | Sobretudo conteúdo e configuração |
| 5 | Criação unificada (preço público via `reservationQuote`, `guestService`) | Médio | Mexe no motor público; exige testes da fase 0 |
| 6 | Frontend (módulo de estados, remover regras copiadas) e definição de receita | Baixo | Depende das decisões de produto |

Cada fase pode ser um PR independente, com os testes da fase 0 a provar que nada
mudou sem querer.

---

## 9. Decisões de negócio necessárias antes da fase 3

1. Quando um pagamento Stripe é confirmado, o hóspede deve receber o email
   `pagamento`? E a equipa deve ser avisada (push/email)?
2. Um pedido feito no site deve enviar ao hóspede um email de "pedido
   recebido"? Já existe a apresentação "Pedido de reserva recebido" para o
   estado `pendente`.
3. Um pagamento registado no separador Pagamentos deve enviar o email
   `pagamento` quando liquida a reserva, tal como hoje acontece pela edição?
4. Os cancelamentos pelo hóspede, por TTL e por falta de pagamento devem avisar
   a equipa?
5. O campo "valor pago" do assistente deve continuar a existir, ou os pagamentos
   passam a ser registados só no separador Pagamentos?
6. A taxa turística deve contar como receita nos relatórios? O sinal retido em
   cancelamentos deve contar?
7. `pre_checkin` deve continuar a ser um estado da reserva, ou passa a ser uma
   marca à parte? Isso evita que uma reserva confirmada "recue".

### Decisões tomadas (24 de outubro de 2026)

| # | Decisão |
|---|---|
| 1 | Um pagamento Stripe confirmado envia o email `pagamento` ao hóspede e avisa a equipa por push. Acontece **em cada pagamento** (sinal e restante). |
| 2 | Um pedido feito no site continua a avisar só a equipa. O hóspede não recebe email de "pedido recebido" (por agora). |
| 3 | Um pagamento manual registado no separador Pagamentos envia o email `pagamento` ao hóspede **em cada pagamento**, incluindo o sinal. Manual e Stripe seguem a mesma regra. |
| 4 | Cancelamento pelo hóspede, expiração por TTL e cancelamento por falta de pagamento avisam a equipa **por push e por email**. |
| 5 | Os pagamentos passam a ser registados **apenas no separador Pagamentos**. O campo "valor pago" do assistente deixa de criar movimentos. |
| 6 | Nos relatórios, a taxa turística e o sinal retido em cancelamentos contam como receita. |
| 7 | Decidido a 25 de outubro (ver abaixo): o pré-check-in deixa de ser um estado da reserva. |

### Decisões tomadas (25 de outubro de 2026): três estados

Uma reserva tem três estados independentes:

| Estado | Valores | Quem o muda |
|---|---|---|
| Reserva | Pré-reserva / Pendente → Aguarda sinal → Confirmada → Check-in → Check-out; Cancelada antes do check-out | A equipa (passos validados) e o sinal recebido (Aguarda sinal ⇄ Confirmada) |
| Pagamento | Não pago · Parcial · Pago · Reembolsado | Só os pagamentos (ledger) |
| Pré-check-in | Não enviado · Enviado · Preenchido | O envio do link (email entregue ou link partilhado) e o formulário |

| # | Decisão |
|---|---|
| 7.1 | Uma reserva só fica **Confirmada** com o sinal recebido. «Aguarda sinal» é um estado da reserva. |
| 7.2 | As regras do sinal das definições aplicam-se sempre às reservas diretas, do site e de contactos (WhatsApp, Instagram, outro), com ou sem política ativa e com ou sem Stripe. Os pagamentos manuais contam da mesma forma. |
| 7.3 | Airbnb, Booking.com, Expedia e VRBO cobram e garantem a reserva: ficam **Confirmada** logo ao serem criadas. Uma reserva sem nada a pagar também. |
| 7.4 | O ciclo só avança. A única descida é Confirmada → Aguarda sinal, quando a equipa apaga um pagamento e o pago fica abaixo do sinal; a Stripe nunca faz recuar. |
| 7.5 | O **check-in** só se faz com a reserva Confirmada e o pré-check-in Preenchido. Caso contrário é recusado com a explicação. |
| 7.6 | A equipa pode preencher o pré-check-in pelo mesmo formulário do hóspede («Preencher agora» na ficha). «Preenchido» chega; não há passo de revisão. |
| 7.7 | A pré-reserva é o bloqueio temporário de datas do proprietário e continua a expirar. |

O email ao hóspede só é enviado quando o modelo `pagamento` está ativo e a
reserva tem um email real. Com estas decisões, A1, A2 (parte do pagamento), A4
e A6 passam a ter um comportamento alvo definido. Em A10, o sinal retido passa a
contar como receita.

---

## 10. Lista de achados

Severidade: **Alta** = resultado errado ou inconsistente para hóspede ou
dinheiro; **Média** = inconsistência com risco ou custo de manutenção relevante;
**Baixa** = limpeza.

| ID | Sev. | Achado | Onde |
|---|---|---|---|
| A1 | Alta | O email `pagamento` só sai pela edição da reserva; os pagamentos do separador Pagamentos e da Stripe não o enviam | `reservationWriteController.js:433-437`; ausente em `reservationPaymentsController.js:11` e `stripePayments.js:225` |
| A2 | Alta | Pedido público pago pela Stripe: nenhum email ao hóspede (pedido ou pagamento); equipa sem push/email quando o dinheiro entra | `publicBookingController.js:405-420`, `stripePayments.js` |
| A3 | Alta | Regra pagamento → estado da reserva em 5 versões diferentes (uma desce o estado, outra nunca) | §3.2 |
| A4 | Alta | O campo "valor pago" do assistente cria movimentos de ajuste no ledger sem pagamento real; há duas formas de registar pagamentos | `paymentLedger.js:19`, `frontend/js/reserva-wizard.js:148-150` |
| A5 | Média | 4 caminhos de cancelamento com efeitos diferentes (histórico, email, push, nota) | §3.3 |
| A6 | Média | Cancelamento pelo hóspede, por TTL e por falta de pagamento sem aviso à equipa | `paymentPolicyAutomation.js:28-70`, `reservationScheduler.js:26` |
| A7 | Média | O seletor "Estado do pagamento" da ficha não tem efeito, mas mostra sucesso | `frontend/js/features/reserva-lista/detalhe.js:486`, `reservationRules.js:223` |
| A8 | Média | 4 mecanismos de envio de email com garantias diferentes; o fallback sem modelo perde a fila e o registo de entrega | `emailService.js:478-525`, §4.1 |
| A9 | Média | Avisos da política (prazo, cancelamento sem devolução, reembolso) em HTML fixo, não editáveis | `paymentPolicyAutomation.js:114-117` |
| A10 | Média | "Receita" com definições diferentes (taxa turística incluída; sinal retido ignorado; "recebido" inclui canceladas) | `reportController.js:27`, `reservationOperationsController.js:19-25` |
| A11 | Média | Preço e voucher do pedido público calculados à parte do `reservationQuote` | `publicBookingController.js:91`, `:130`, `:143`, `:318-366` |
| A12 | Média | Fichas de hóspede criadas ou atualizadas em 4 sítios | §3.4 |
| A13 | Média | URL público calculado de 3 formas; o fallback para `localhost` nos emails | `emailService.js:73`, `:240`, `:444`, `emailMime.js` |
| A14 | Média | Política aplicada a qualquer organização, mas automatizada só para a organização da Stripe (a confirmar) | `paymentPolicy.js:80`, `paymentPolicyAutomation.js:127-131` |
| A15 | Baixa | `findBlockConflict` redundante no backoffice: `findConflict` já devolve o bloqueio, por isso a mensagem "datas bloqueadas" nunca aparece e o utilizador vê "ocupado (reserva <id do bloqueio>)" | `reservationWriteController.js:140-153`, `:272-300`; `reservationAvailability.js:12` |
| A16 | Baixa | `payment_date` dos pagamentos Stripe em UTC (`date('now')`), contra a convenção `localDateIso()` | `stripePayments.js:239`, `:256` |
| A17 | Baixa | `payment_method` da reserva sobrescrito com `Stripe` | `stripePayments.js:256` |
| A18 | Baixa | Aprovar: UPDATE fora de transação, sem condição sobre o estado atual nem verificação de pagamento em curso | `reservationController.js:212-215` |
| A19 | Baixa | Estados antigos (`checkin`, `checked_in`, `pago`) ainda tratados em vários sítios | `emailEligibility.js:4`, `emailService.js:166-168`, `frontend/js/helpers.js:231` |
| A20 | Baixa | Rótulos de estado copiados em 6 ou mais ficheiros do frontend, com textos diferentes | §6 |
| A21 | Baixa | Deteção de "Gmail expirou" copiada 3 vezes; o teste e a pré-visualização chamam `sendViaGmail` diretamente | `routes/emailMessages.js:100`, `:186`, `routes/googleAuth.js:173`, `emailTemplateController.js:247` |
| A22 | Baixa | `check_in`/`check_out` como estado da reserva separados do "check-in feito" das tarefas | `reservationOperationsController.js:114` |

---

## 11. Implementação (PRs #1 a #8)

Cada passo é um PR que depende do anterior (#1 → #2 → … → #7).

| Passo | PR | Serviços criados |
|---|---|---|
| 1. Dinheiro | #1 | `money`, `httpError`, `reservationState`, `financialLedger` |
| 2. Acontecimentos e avisos | #2 | `reservation_events`, `reservationEvents`, `reservationEffects`, `staffNotifier` |
| 3. Ciclo de vida | #3 | `reservationLifecycle` |
| 4. Emails | #4 | modelos `pagamento`, `aviso_restante`, `cancelamento_politica`; `publicLinks`, `googleConnection` |
| 5. Hóspedes e preços | #5 | `guestService`, `reservationQuote.pricePublic`, `reservationAvailability.assertAvailable` |
| 6. Definições | #6 | `settingsService`, `dates`, `accommodationInheritance`, `json` |
| 7. Relatórios e frontend | #7 | `reportingService`; no frontend `js/domain/money.js` e `js/domain/reservation-status.js` |
| 8. Acabamentos | #8 | `reservationCreation`, `accountEmails`; `staffNotifier` para todos os push; `settingsService.seedDefaults`; `money.dueCents`/`isUnderpaid`/`MIN_ONLINE_CENTS`; `dates.addDays`/`daysBetween` |

| Achado | Estado |
|---|---|
| A1, A2 (pagamento) | Resolvido (#1, #2): email ao hóspede em cada pagamento, manual ou Stripe; push à equipa nos pagamentos online |
| A3 | Resolvido (#1): uma regra em `reservationState` |
| A4 | Resolvido (#1): pagamentos só no separador Pagamentos |
| A5, A6 | Resolvido (#2, #3): um caminho de cancelamento; equipa avisada por push e email |
| A7 | Resolvido (#1): o seletor sem efeito foi retirado |
| A8, A9, A13, A21 | Resolvido (#4) |
| A10 | Resolvido (#7): receita com taxa turística e sinais retidos (decisão 6) |
| A11, A12, A15 | Resolvido (#5) |
| A14 | Por decidir: a política só é automatizada na organização da Stripe |
| A16, A17 | Resolvido (#1) |
| A18 | Resolvido (#3) |
| A19 | Parcial (#7): o frontend lê os valores antigos como os atuais; o servidor continua a aceitá-los |
| A20 | Resolvido (#7): rótulos e cores num só módulo; montantes no formato «1 234,56 €» |
| A22 | Resolvido (#10): o seletor mostra só os passos possíveis, enviados pelo servidor (`status_options`) |

### Passo 8: o que ficou fora dos serviços e porquê

- A edição de uma reserva pela equipa grava o estado escolhido junto com os restantes campos, com o histórico das diferenças; o cancelamento passa sempre por `reservationLifecycle` e o estado derivado do dinheiro por `financialLedger.recompute`.
- O pré-check-in do hóspede grava só os dados do hóspede; não muda o estado da reserva (decisão 7).
- As mensagens escritas à mão (Mensagens) e a pré-visualização de modelos usam diretamente `emailService.sendMail`, que é o envio comum.

## 12. Três estados da reserva (PR #10)

As regras estão num só sítio e todos os caminhos as chamam:

| O quê | Onde | Quem chama |
|---|---|---|
| Estados, passos permitidos, opções do seletor, pré-check-in (também em SQL) | `services/reservationState.js` (puro) | `reservationLifecycle`, `financialLedger`, `listQueries` |
| Sinal que confirma | `paymentPolicy.requiredDepositCents` | `financialLedger.recompute`, `reservationLifecycle.context` |
| Aplicar um passo, opções de uma reserva, aprovar, marcar o pré-check-in enviado | `services/reservationLifecycle.js` | Criação, edição, cancelamento, aprovação, ficha, cotação, envio do link, circuito dos emails |
| Aguarda sinal ⇄ Confirmada pelo dinheiro | `financialLedger.recompute` | Pagamentos manuais, Stripe, edição, aprovação, criação |
| Email entregue (envio ou confirmação manual) | `emailDelivery.afterSent` | `emailService.sendTemplatedEmail`, `emailDelivery.resolveDelivery` |
| Rótulos e distintivos dos três estados; preencher um seletor | `frontend/js/domain/reservation-status.js` | Lista, cartões, ficha, formulário, histórico |

O frontend não decide passos: mostra as opções que o servidor envia na ficha
(`status_options`) e na cotação do formulário.

Migração (`20261025_reservation_states`): as reservas em `pre_checkin` passam
a Confirmada (plataformas, sem valor ou já pagas) ou Aguarda sinal, com o
pré-check-in «Enviado» (ou «Preenchido»). No arranque, as reservas a aguardar
o sinal acertam-se uma vez pelo ledger. As reservas já confirmadas sem sinal
registado ficam como estão até mudar o dinheiro, o total, as datas ou o canal.


## 13. Todos os envios ao hóspede pela fila de acontecimentos

Os emails agendados pela estadia e os avisos da política deixaram de ser
enviados diretamente pelos agendadores:

| Quem decide | Acontecimento | Efeito |
|---|---|---|
| `emailScheduler` (de hora a hora: modelos antes/depois do check-in/check-out) | `email.due` { slug }, uma vez por modelo e estadia (`reservationEvents.emitOnce`) | `guest_template_email` |
| `paymentPolicyAutomation` (manutenção e cancelamento pela política) | `policy.notice_due` { kind: `balance` \| `cancelled` }, uma vez por aviso | `guest_policy_notice` |

- Todos os efeitos de email ao hóspede passam por `reservationEffects.guestEmail`.
  Um envio que tem de esperar (fora da janela do modelo, Gmail indisponível,
  envio anterior por confirmar) lança `DeferEffect` e volta à fila para essa
  hora sem gastar tentativas; um erro repete-se com espera crescente e, ao fim
  das tentativas, aparece no sino («Aviso não entregue»).
- O aviso do restante só conta como enviado depois de entregue (o prazo
  adicional começa aí); por enviar é uma falha, não um êxito.
- A fila `organization_email_queue` deixou de ser usada: o arranque converte
  as entradas pendentes em `email.due` (`20261026_email_queue_to_events`).
  «Estado do sistema» conta os envios pendentes e falhados na fila de
  acontecimentos.
- O envio manual do link de pré-check-in, pedido pela equipa, não espera pela
  janela de envio do modelo.

## 14. Desfazer o check-in ou o check-out

A gestão (gestor ou dono) pode desfazer o último passo marcado por engano, no
seletor de estado da ficha («↩ Desfazer check-in/check-out»): o check-out volta
à estadia e o check-in volta à reserva ativa (confirmada ou a aguardar o sinal,
decidido pelo dinheiro). A regra está em `reservationState.undoStatus`/`isUndo`;
quem pede entra em `reservationLifecycle.context(r, actor)`. A equipa recebe a
explicação «Só a gestão pode desfazer…». Cada desfazer fica no histórico como
«Passo desfeito» (`status_undone`, com o estado de origem e o de destino).

## 15. Importar reservas de um ficheiro (XLS)

A importação (Reservas → Importar) cria as reservas com `import: true`:
origem `import` em `reservationCreation` (histórico «importada de um ficheiro»),
sem acontecimento — nem confirmação ao hóspede nem aviso à equipa, porque são
reservas de outro sistema. Uma linha cancelada no ficheiro é gravada como
reserva e logo cancelada por `reservationLifecycle.markCancelled` (`quiet`,
`meta.imported`), por isso o cancelamento fica como passo no histórico; não
ocupa as datas e não tem evento no calendário. Fora da importação, uma
reserva nova continua a não poder começar cancelada.

## 16. Correções do telemóvel (auditoria de 26/10/2026)

- Dashboard, definições e relatórios deixavam conteúdo fora do ecrã: as
  grelhas de uma coluna das vistas ficam presas à largura disponível.
- Sino visível no cabeçalho do telemóvel; abre a lista e pede os avisos de
  novo ao abrir. O «Atualizar» deu lugar a «Ver todas as notificações».
- Definições por assunto (Reservas, Ligações, Gestão): coluna à esquerda no
  computador; no telemóvel, lista inicial e cada secção no ecrã inteiro com
  «Definições» para voltar.
- O separador Equipa e o «Estado do sistema» aparecem ao proprietário.
- Nove janelas feitas à mão passam a `AppUI.openDialog`.
- Página do hóspede: o selo do pagamento tem cor pelo estado e não aparece
  numa reserva cancelada sem pagamentos.
- Mensagens no telemóvel: paginação no fim, lista sem caixa de scroll, sem
  painel vazio.
- Somar dias e escrever datas AAAA-MM-DD (cópias no calendário, eventos,
  bloqueios, preços, seletor de datas e assistente) passam a
  `ReservationDates.addDays`/`localIso`; mostrar data e hora (6 cópias) passa a
  `ReservationDates.formatDateTime`.
- Fica para a V2: botão + flutuante, letras de 9–10 px, tabela do estado do
  sistema no telemóvel e o «Seguinte» no topo da página pública.
