# Arquitetura

Estado confirmado em 20 de setembro de 2026.

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
    ├── schedulers de reservas, email e push
    └── Google Calendar, Gmail, Tasks e Web Push
```

O backend vive em `backend/src`; o frontend em `frontend`. Em produção, o
Express serve ambos. Não existe um passo de compilação do frontend.

## Backend

Pontos principais:

- `server.js`: arranque HTTP, schedulers e encerramento controlado;
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
  públicas com limites próprios.

Depois de `/api`, a sessão é obrigatória. As famílias autenticadas são:

```text
reservations  accommodations  calendar  guests  email-templates
expenses      suppliers       backup    team      reports
events        vouchers        tasks     push
```

Os detalhes de cada endpoint devem ser obtidos nas respetivas rotas. Esta lista
serve para orientar a arquitetura e evita duplicar contratos sujeitos a mudança.

## Processos em segundo plano

O servidor inicia três schedulers:

- reservas: expiração de pedidos públicos pendentes e limpeza/repetição de
  operações associadas, incluindo a fila de remoção de Google Tasks;
- email: envio das mensagens automáticas elegíveis;
- push: resumos e notificações operacionais.

Os schedulers são parados em `SIGTERM` e `SIGINT`. A solução atual assume uma
instância principal; qualquer evolução para várias réplicas deve preservar os
leases e a idempotência de cada tarefa.

## Modelo de segurança

- sessões em cookie, permissões por organização e por papel;
- validação da origem em pedidos mutáveis de `/auth` e `/api`;
- CORS restrito em produção e políticas Helmet/CSP;
- `script-src-attr 'none'`, sem manipuladores JavaScript inline;
- limites de pedidos específicos para login e fluxos públicos;
- documentos de despesas autenticados e isolados por organização;
- tokens Google encriptados com AES-256-GCM;
- `Cache-Control: no-store` em autenticação e API.

Consultar [Segurança](../SECURITY.md) para operação e reporte.

## Dependências externas

Google Calendar, Gmail e Tasks dependem de credenciais OAuth e de autorização
por organização. Turnstile depende das chaves e hostnames configurados. As
bibliotecas visuais do frontend são carregadas por versões declaradas e
auditadas, algumas a partir de CDN; a CSP e o service worker têm de ser revistos
sempre que um novo domínio externo for introduzido.

## Decisões a preservar

- SQLite é adequado enquanto existir uma única instância e carga moderada;
- a aplicação é multi-organização e todas as consultas de dados privados devem
  filtrar por `organization_id`;
- tarefas externas e mensagens devem ser idempotentes e recuperáveis após falha;
- documentação não deve repetir esquemas ou contratos completos que já estão no
  código e nos testes;
- alterações de integração precisam de fila durável, estado observável e
  reconciliação, não apenas chamadas remotas síncronas.
