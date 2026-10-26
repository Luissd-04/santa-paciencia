# Arquitetura

Estado confirmado em 5 de outubro de 2026.

## Visão geral

Santa Paciência é uma aplicação monolítica modular:

```text
Browser / PWA
    │ HTTPS
Cloudflare Tunnel
    │ 127.0.0.1:3001
Express 5 ── páginas públicas e SPA
    ├── API autenticada
    ├── SQLite + uploads privados
    ├── tarefas automáticas (executor único)
    └── Google Calendar, Gmail, Tasks, Stripe, Anthropic e Web Push
```

O backend vive em `backend/src`; o frontend em `frontend`. Em produção, o
Express serve ambos. Não existe um passo de compilação do frontend.

## Backend

Pontos principais:

- `server.js`: arranque HTTP, tarefas automáticas e encerramento controlado;
- `app.js`: middleware, ficheiros estáticos, rotas, health check e erros;
- `routes/`: contrato HTTP e autorização por recurso;
- `controllers/`: validação e orquestração dos casos de uso;
- `services/`: autenticação, emails, tarefas, notificações e regras partilhadas;
- `config/database.js` e `config/migrations.js`: ligação SQLite e migrações;
- `test/` e `test-support/`: regressões, segurança e suporte de testes;
- `scripts/`: validação de código, HTTP, browser, desempenho e administração.

As migrações são aplicadas durante `initDatabase()`. A base de dados e os
uploads persistentes ficam no volume `data`; tokens OAuth encriptados dependem
também de uma chave externa à cópia de segurança da organização.

## Frontend

A SPA usa módulos JavaScript carregados por funcionalidade. `index.html` contém
o shell autenticado; as vistas em `frontend/views` são fragmentos carregados em
runtime. O registo em `frontend/js/features/manifest.json` agrupa módulos como:

- lista, detalhe e assistente de reservas;
- alojamentos e calendário;
- hóspedes e comunicações por email;
- documentos e histórico de faturas.

Peças partilhadas que cada ecrã usa em vez de ter a sua cópia:

- `AppUI.openDialog` / `closeDialog` (`js/ui.js`): janelas criadas na hora
  (formulários curtos, confirmações) com a moldura comum — Escape, foco preso,
  página parada por trás e fecho ao mudar de vista;
- `ReservationDates` (`js/domain/dates.js`): `localIso`, `addDays` e
  `formatDateTime` (instantes na hora do alojamento; lê o formato UTC do
  SQLite);
- `ReservationStatus` (`js/domain/reservation-status.js`): rótulos, cores e
  distintivos dos estados da reserva, do pagamento e do pré-check-in;
- `[data-owner-only]`: visível só com a classe `role-owner` no `<body>`
  (`js/auth.js`), por isso vale também para vistas carregadas depois;
- grelhas de uma coluna das vistas presas à largura do ecrã numa só regra
  (`css/layout.css`); `scripts/check-mobile-ux.cjs` falha se alguma vista
  passar da margem direita a 320 ou 390 px.

Existem páginas independentes para reserva pública, estado da reserva,
pré-check-in e teste de reserva. O service worker dá suporte à instalação como
PWA e à cache controlada de recursos estáticos.

## Superfície HTTP

Rotas públicas principais:

- `GET /health` — saúde da aplicação e acesso à base de dados;
- `/reservar/:slug` — pedido público de reserva;
- `/reserva/:token` — acompanhamento público por token;
- `/pre-checkin/:token` — recolha de dados antes da chegada;
- `/auth/*` e `/api/public/*` — autenticação, callbacks OAuth e operações
  públicas com limites próprios, incluindo
  `POST /api/public/reservation/:token/checkout` (abre o Checkout Stripe);
- `POST /api/stripe/webhook` — recebido antes do parser JSON e autenticado
  apenas pela assinatura Stripe.

Depois de `/api`, a sessão é obrigatória. As famílias autenticadas são:

```text
reservations  accommodations  calendar  guests  email-templates
expenses      suppliers       backup    team      reports
events        vouchers        tasks     push
```

Os detalhes de cada endpoint devem ser obtidos nas respetivas rotas. Esta lista
serve para orientar a arquitetura e evita duplicar contratos sujeitos a mudança.

## Processos em segundo plano

As tarefas automáticas estão listadas num só sítio (`services/scheduledTasks.js`)
e correm pelo executor único (`services/taskRunner.js`):

| Tarefa | Intervalo | O quê |
|---|---|---|
| `maintenance` | 30 min | Stripe em aberto, política de pagamento, pedidos expirados, efeitos de acontecimentos por repetir, eliminações no Google Tasks |
| `google_tasks` | 1 min | Alterações do Google Tasks desde a última pergunta; completa de hora a hora |
| `google_calendar` | 1 min | Repetições pendentes do Google Calendar |
| `email` | 1 h | Emails pela estadia na hora: emite `email.due` |
| `daily_summary` | 15 min | Resumo diário por push, uma vez por dia |

Cada execução usa reserva de execução (`scheduler_leases`, `task:<nome>`): com
mais do que uma instância sobre a mesma base, só uma corre a tarefa e as outras
saltam a passagem. O resultado (início, fim, êxito, erro, salto, duração) fica
em `scheduled_task_runs` e aparece em Definições → Base de dados → «Estado do
sistema» (proprietário; `GET /api/ops/status`, campo `tasks`). Em `SIGTERM` e
`SIGINT` o executor para os temporizadores e espera até 10 s pelas tarefas a meio.

## Avisos em direto

`GET /api/live` (Server-Sent Events, `services/liveUpdates.js`) mantém uma
ligação aberta por separador. O servidor não envia dados, só «isto mudou» com o
tópico (`notifications` para o sino, `events` para a vista de Eventos); a página
volta a pedir o que precisa pela API de sempre (`frontend/js/live.js`). Avisa:

- depois de qualquer pedido de alteração da equipa que correu bem (middleware
  `afterWrite`), com o separador de origem (`X-Client-Id`) para esse separador
  não recarregar o ecrã onde está;
- em cada acontecimento de reserva (`reservationEvents.emit`: pedidos do site,
  pagamentos online, expirações), em envios de email por confirmar ou recusados
  e em efeitos que falharam de vez;
- quando o Google Tasks traz alterações;
- à meia-noite e de hora a hora (alertas que dependem só do tempo).

O sino pergunta ainda a cada 15 minutos, como rede de segurança. Os avisos vivem
num só processo, como o resto da instância.

## Modelo de segurança

- sessões em cookie, permissões por organização e por papel;
- validação da origem em pedidos mutáveis de `/auth` e `/api`;
- CORS restrito em produção e políticas Helmet/CSP;
- `script-src-attr 'none'`, sem manipuladores JavaScript inline;
- limites de pedidos específicos para login e fluxos públicos;
- documentos de despesas autenticados e isolados por organização;
- tokens Google encriptados com AES-256-GCM;
- `Cache-Control: no-store` em autenticação e API;
- uploads validados por magic bytes (alojamentos, talões e importação de
  backups), servidos com `nosniff`;
- subscrições push aceites apenas para serviços de push dos browsers.

Papéis: `staff` consulta e opera o dia a dia (reservas, hóspedes, eventos,
check-in/out); `manager` gere reservas, pagamentos, alojamentos, despesas,
modelos de email e definições da organização, e apaga hóspedes/reservas;
`owner` gere equipa e backups.

Consultar [Segurança](../SECURITY.md) para operação e reporte.

## Dependências externas

Google Calendar, Gmail e Tasks dependem de credenciais OAuth e de autorização
por organização. Stripe liga uma conta a uma única organização
(`STRIPE_ORGANIZATION_ID`). A leitura automática de talões envia a fotografia
à API da Anthropic (`ANTHROPIC_API_KEY`); sem chave a funcionalidade fica
indisponível. Turnstile depende das chaves e hostnames configurados. As
bibliotecas visuais do frontend são carregadas por versões declaradas e
auditadas, algumas a partir de CDN; a CSP e o service worker têm de ser revistos
sempre que um novo domínio externo for introduzido.

## Decisões a preservar

- SQLite é adequado enquanto existir uma única instância e carga moderada;
- datas de calendário («hoje») calculam-se no fuso do servidor (`TZ`) com
  `localDateIso()`, nunca com `toISOString()`;
- eliminar reservas definitivamente passa sempre por `purgeReservations()`,
  que remove pagamentos/histórico e conserva tentativas Stripe;
- a aplicação é multi-organização e todas as consultas de dados privados devem
  filtrar por `organization_id`;
- tarefas externas e mensagens devem ser idempotentes e recuperáveis após falha;
- documentação não deve repetir esquemas ou contratos completos que já estão no
  código e nos testes;
- alterações de integração precisam de fila durável, estado observável e
  reconciliação, não apenas chamadas remotas síncronas.
