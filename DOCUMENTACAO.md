# Santa Paciência — Documentação Técnica Completa

> Atualizado em 2026-05-20 (sessão 3). Atualizar sempre que houver alterações estruturais significativas.

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Papel |
|---|---|---|
| **Node.js** | v22 | Runtime |
| **Express** | v5 | Framework HTTP |
| **better-sqlite3** | v12 | Base de dados (síncrona, sem ORM) |
| **Nodemailer** | v8 | Envio de emails |
| **googleapis** | v171 | Integração Google Calendar, Gmail e Google Tasks (OAuth2) |
| **uuid** | v14 | Geração de IDs |
| **dotenv** | v17 | Variáveis de ambiente |

### Frontend
Vanilla HTML + CSS + JavaScript puro. Sem frameworks (sem React, Vue, Angular, etc.).
Ícones via **Lucide** (CDN). Bibliotecas auxiliares: **Chart.js** para relatórios, **Leaflet** para mapa/geocoding visual, **SheetJS (XLSX)** e **jsPDF + AutoTable** para exportação.

Em 2026-05-04 o frontend passou a usar uma estrutura de CSS segmentada:
- `css/styles.css` — legado / base histórica ainda usada pelas views não migradas
- `css/base.css` — tokens visuais, heróis de página, utilitários base
- `css/layout.css` — shell global: sidebar, topbar, content
- `css/components.css` — botões, cards, forms, toggle de tema (inclui estilos do `AppDatePicker`)
- `css/themes.css` — apenas light mode (dark mode removido em 2026-05-19)
- `css/views/*.css` — estilos específicos por separador (`dashboard`, `reservas`, `despesas`, `invoice`)

### Infraestrutura
| Componente | Tecnologia |
|---|---|
| Containerização | **Docker + Docker Compose** |
| Tunnel HTTPS | **Cloudflare Tunnel** (sem porta exposta publicamente) |
| BD persistida em | volume Docker `./data/santapaciencia.db` |
| Domínio | `santapaciencia.xyz` |
| Imagens upload | `/data/uploads/` (servidas como estático por Express) |

---

## Arquitetura de Ficheiros

```
santa_paciencia/
├── docker-compose.yml          Serviços: backend + cloudflared
├── DOCUMENTACAO.md             Este ficheiro
├── CÓDIGO_MELHORIAS.md         Lista viva de melhorias e dívida técnica
├── data/                       Volume Docker persistente
│   ├── santapaciencia.db       Base de dados SQLite
│   └── uploads/                Imagens dos alojamentos
└── backend/src/
    ├── app.js                  Express app: CORS, auth por sessão, registo de rotas
    ├── server.js               HTTP server
    ├── package.json            Dependências Node.js
    ├── .env                    Variáveis de ambiente (não em git)
    ├── config/
    │   ├── database.js         Init SQLite + migrations automáticas + seed + legacy migration
    │   ├── google.js           Cliente OAuth2 Google Calendar (por utilizador)
    │   ├── googleEmail.js      Cliente OAuth2 Gmail (por organização) + sendViaGmail
    │   ├── googleTasks.js      Cliente OAuth2 Google Tasks (por organização) + getOrCreateTaskList
    │   └── email.js            Nodemailer transporter (SMTP, fallback)
    ├── controllers/            (~11 ficheiros)
    │   ├── reservationController.js   ~580 linhas — reservas, disponibilidade, stats, notificações
    │   ├── accommodationController.js ~590 linhas — CRUD alojamentos + herança + pricing periods
    │   ├── guestController.js         ~184 linhas — CRUD hóspedes + pesquisa
    │   ├── emailTemplateController.js ~113 linhas — CRUD templates
    │   ├── expenseController.js        ~61 linhas — CRUD despesas
    │   ├── calendarController.js       ~90 linhas — estado, sync e settings Google Calendar
    │   ├── eventController.js          eventos operacionais (limpeza, manutenção, etc.)
    │   ├── voucherController.js        ~143 linhas — CRUD vouchers + validação + aplicação
    │   ├── teamController.js           convites, membros e gestão de papéis
    │   ├── reportController.js         relatórios financeiros
    │   └── publicBookingController.js  motor público de reservas
    ├── routes/                 (~14 ficheiros)
    │   ├── reservations.js     8 rotas
    │   ├── accommodations.js   15 rotas (inclui 4 de pricing periods)
    │   ├── guests.js           5 rotas
    │   ├── emailTemplates.js   5 rotas
    │   ├── expenses.js         5 rotas
    │   ├── calendar.js         4 rotas (status, sync-all, settings GET/POST)
    │   ├── events.js           rotas de eventos operacionais
    │   ├── vouchers.js         6 rotas
    │   ├── auth.js             login, registo, sessão, convites, OAuth2 GCal/Gmail/Tasks, email send/inbox
    │   ├── googleTasks.js      3 rotas (status, sync, clear) montadas em /api/tasks
    │   ├── backup.js           2 rotas
    │   ├── team.js             5 rotas
    │   └── reports.js          2 rotas
    ├── services/
    │   ├── authService.js              hash de password, sessões, utilizadores
    │   ├── calendarService.js          Criação/update/delete de eventos no Google Calendar
    │   ├── emailService.js             Envio de emails HTML: Gmail OAuth (prioritário) ou SMTP (fallback)
    │   ├── emailScheduler.js           Scheduler disponível: corre de hora em hora quando invocado
    │   ├── orgService.js               organizações, memberships e convites
    │   ├── rgpdService.js              Geração de doc RGPD + registo de consentimento
    │   ├── reservationRules.js         Regras puras: datas, noites, totais, taxas, preços dinâmicos
    │   ├── availabilityRules.js        Regras puras: overlap, hierarquia pai/filhos
    │   └── operationalTasksService.js  Sync automático de tarefas operacionais por reserva
    └── middleware/
        ├── errorHandler.js     Tratamento global de erros Express
        ├── requireAuth.js      Bloqueia `/api/*` sem sessão válida
        └── requireRole.js      Restringe operações por `owner|manager|staff`
```

```
frontend/
├── index.html                  SPA — shell global + auth screen + todas as views
├── css/
│   ├── styles.css              legado / views ainda não migradas
│   ├── base.css                tokens, heróis, utilitários base
│   ├── layout.css              sidebar, topbar, content
│   ├── components.css          cards, botões, forms, toggle, AppDatePicker
│   ├── themes.css              apenas light mode (dark mode removido)
│   └── views/
│       ├── dashboard.css
│       ├── operations.css
│       ├── reservas.css
│       ├── despesas.css
│       └── invoice.css         layout inbox 2 colunas, chat bubbles, badge sidebar, template picker
└── js/
    ├── domain/
    │   ├── dates.js            Regras reutilizáveis de datas, noites e idade
    │   ├── pricing.js          Regras reutilizáveis de totais, taxas, ocupação extra e preços dinâmicos
    │   └── date-picker.js      AppDatePicker — calendário custom (substituiu input[type=date])
    ├── ui.js                   Helpers UI: AppUI.setButtonLoading, AppUI.enhanceSelect,
    │                           AppUI.openModal, AppUI.closeModal, AppUI.refreshDropdowns
    ├── state.js                Variáveis globais: reservas[], accommodations[], editingId,
    │                           calYear/Month, servicosData[], currentUser
    ├── helpers.js              badgeEstado(), badgePagamento(), toast(), formatDate(),
    │                           lcIcon(), apiGet/Post/Put/Delete(), SS (sessionStorage wrapper)
    ├── auth.js                 login/signup/invite, sessão e feedback de autenticação
    ├── app.js                  navegação, boot global (dark mode removido), Google Tasks UI, Gmail UI
    ├── dashboard.js            KPIs, tabela próximas chegadas, barras de ocupação, móvel
    ├── reservas.js             lista (default), filtros (datas lado a lado), detalhe, botão "Enviar email"
    ├── reserva-wizard.js       wizard 3 passos, disponibilidade, cálculo com preços dinâmicos
    ├── hospedes.js             ~624 linhas — lista, detalhe, fichas, flags
    ├── alojamentos.js          ~1000 linhas — CRUD, imagens, galeria, herança, serviços
    ├── calendario.js           ~350 linhas — vista mensal + timeline anual + drag & drop
    ├── despesas.js             ~163 linhas — CRUD despesas + resumo
    ├── emails.js               ~455 linhas — templates, editor, preview, settings
    ├── relatorios.js           ~585 linhas — relatórios financeiros e despesas
    ├── eventos.js              eventos operacionais — calendário, timeline, lista, chips de filtro por tipo
    ├── notificacoes.js         painel de notificações e alertas do dia
    ├── vouchers.js             CRUD de vouchers no backoffice
    ├── precos.js               ~474 linhas — calendário de preços dinâmicos, CRUD de períodos
    ├── invoice.js              view Mensagens — inbox 2 colunas, chat bubbles, templates, polling Gmail
    └── team.js                 convites, listagem de membros, gestão de papéis
```

---

## Estado Implementado — Resumo Atual

### Backoffice
- Autenticação por email/password, sessões em cookie `HttpOnly`, organizações, memberships e convites.
- Dashboard operacional com KPIs, chegadas próximas, ocupação e atalhos de backup.
- Reservas completas: criação/edição/cancelamento/reativação, disponibilidade, anti-overbooking, hóspedes adicionais, RGPD, pagamentos parciais e integração Google Calendar. Vista lista como padrão; filtro de datas lado a lado com auto-abertura da data de fim; toggle Cartão/Lista no canto direito da toolbar.
- Alojamentos com hierarquia pai→filhos, campos herdados, comodidades próprias/herdadas, imagens por secção, capa, áreas comuns herdadas, serviços/taxas e preços especiais por idade.
- **Preços Dinâmicos**: separador dedicado com calendário mensal colorido (verde=mais barato, vermelho=mais caro), seleção de intervalo por dois cliques, CRUD de períodos de preço. Aplicados noite a noite em reservas (backoffice e wizard).
- **Vouchers**: CRUD completo (backoffice), tipos `discount_pct`, `discount_fixed`, `credit_stay`, validade, min. noites, alojamento específico.
- Hóspedes com pesquisa, ficha, histórico, flags e importação/exportação.
- Calendário mensal e timeline anual com filtros, drag & drop e validação de conflitos.
- Despesas com CRUD, resumo e integração nos relatórios.
- Relatórios financeiros: receita mensal, receita por canal/alojamento, despesas por mês/categoria e lucro.
- **Emails/templates** por organização, settings de horários/redes sociais e preview por email. Separador integrado em Definições (não na sidebar).
- **Mensagens** (separador "invoice" na sidebar, secção Principal): inbox de 2 colunas com lista de conversas e área de chat. Enviados à direita (balão vermelho); recebidos via Gmail à esquerda (balão cinza). Polling 30s. Botão "Template" no compose preenche assunto/corpo a partir dos templates. Badge de não lido no sidebar. Iniciais do alojamento junto ao nome quando a reserva está ativa (`confirmed`/`checked_in`). Conversas ordenadas por data do último email. Acessível a partir do detalhe de reserva via "Enviar email".
- **Gmail OAuth** por organização: scopes `gmail.send` + `gmail.readonly` + `userinfo.email`. Emails enviados via Gmail API; inbox lido via `GET /auth/email/inbox`. Fallback SMTP quando desligado. Subjects RFC 2047. Necessário re-autorizar após adição do scope `gmail.readonly`.
- **Google Tasks OAuth** por organização: scope `tasks`. Em Definições → Ligações. Sync cria/atualiza tarefas na lista "Santa Paciência" com eventos operacionais dos próximos 90 dias. `google_task_id` guardado para upsert idempotente.
- Google Calendar OAuth por utilizador/organização, status e sync manual. Settings por organização (syncTasks).
- **Eventos Operacionais**: limpeza, manutenção e outras tarefas com datas, responsável, notas e estado. Sync automático com reservas (tarefas de check-in/check-out geradas automaticamente).
- **Notificações**: painel com check-ins/check-outs do dia e amanhã, pagamentos em falta, reservas pendentes e tarefas importantes. Sino fica vermelho e animado quando há notificações de prioridade alta.
- Backup ZIP de dados + imagens e import substitutivo por organização.
- **Dark mode removido**: `data-theme` fixo em `light`; `css/themes.css` só contém tema claro. Service worker auto-desregistado ao boot para evitar cache stale.

### Público
- Página pública de reservas por `public_slug`: `/reservar/:slug`.
- Endpoints públicos para landing, disponibilidade e criação de reserva pendente.
- Cálculo de preço com datas, hóspedes, ocupação extra, bebé/criança, pequeno-almoço e taxa turística.
- Criação de reserva pública com `public_token` para futura gestão segura.

### Ainda Parcial / Atenção
- O ficheiro `emailScheduler.js` existe, mas o `server.js` atual não chama `startScheduler()`. Emails imediatos funcionam; emails agendados de check-in/check-out só correm se o scheduler for ligado explicitamente.
- Vouchers têm CRUD no backoffice e campo de verificação no wizard do backoffice, mas o desconto **não é deduzido automaticamente** no total da reserva — a aplicação continua manual (campo informativo).

---

## Base de Dados (SQLite)

As migrations são **automáticas e não-destrutivas**: ao iniciar, o servidor verifica
quais colunas existem com `PRAGMA table_info()` e adiciona as que faltam via `ALTER TABLE`.

### Tabela `accommodations`
```sql
id              TEXT PRIMARY KEY          -- slug gerado do nome + timestamp
name            TEXT NOT NULL
type            TEXT DEFAULT 'suite'      -- 'alojamento'|'suite'|'apartamento'|'quarto'|'moradia'|'villa'
parent_id       TEXT                      -- FK para accommodations(id)
price_per_night REAL DEFAULT 100
max_guests      INTEGER DEFAULT 2
license_number  TEXT DEFAULT '12345/AL'
description     TEXT                      -- Português
description_en/fr/es/de/it/nl  TEXT      -- Traduções
address         TEXT
postal_code     TEXT
city            TEXT
region          TEXT DEFAULT 'Continente'
country         TEXT DEFAULT 'Portugal'
area            INTEGER                   -- m²
num_rooms       INTEGER DEFAULT 1
num_bathrooms   INTEGER DEFAULT 1
amenities       TEXT DEFAULT '[]'         -- JSON array de strings (own_amenities)
cover_image     TEXT                      -- path /uploads/cover_id.ext
images          TEXT DEFAULT '{}'         -- JSON: {secção: [urls...], _sections: [...]}
wifi_name       TEXT
wifi_password   TEXT
checkin_time    TEXT                      -- HH:MM
checkout_time   TEXT
color           TEXT DEFAULT '#843424'
google_calendar_id TEXT
social_facebook / social_instagram / social_website  TEXT
base_guests_included INTEGER DEFAULT 2
extra_bed_enabled    INTEGER DEFAULT 0
extra_bed_type       TEXT DEFAULT 'sofa_cama'
extra_bed_capacity   INTEGER DEFAULT 0
extra_bed_price      REAL DEFAULT 0
extra_bed_charge_type TEXT DEFAULT 'per_guest_night'
extra_occupancy_options TEXT DEFAULT '[]' -- JSON array de opções de ocupação extra
baby_age_limit       INTEGER DEFAULT 2
baby_price           REAL DEFAULT 0
child_age_limit      INTEGER DEFAULT 12
child_price          REAL DEFAULT 0
public_slug          TEXT                 -- slug único para reserva pública (só type='alojamento')
created_at      TEXT DEFAULT datetime('now')
```

**Nota sobre herança**: quando `parent_id` está definido, os campos
`address, postal_code, city, region, country, wifi_name, wifi_password,
checkin_time, checkout_time, social_*` são herdados do pai. O backend
recusa escrever nesses campos se `parent_id` estiver definido.

### Tabela `reservations`
```sql
id              TEXT PRIMARY KEY          -- formato 'SP-{timestamp}'
organization_id TEXT NOT NULL
guest_id        TEXT NOT NULL
accommodation_id TEXT NOT NULL
check_in        TEXT NOT NULL             -- YYYY-MM-DD
check_out       TEXT NOT NULL
nights          INTEGER NOT NULL
num_guests      INTEGER NOT NULL
num_adults      INTEGER                   -- desdobramento explícito
num_children    INTEGER DEFAULT 0
total_amount    REAL NOT NULL
tourist_tax     REAL DEFAULT 0
breakfast_included INTEGER DEFAULT 0
channel         TEXT DEFAULT 'direto'
status          TEXT DEFAULT 'confirmada' -- 'confirmada'|'pendente'|'cancelada'
payment_status  TEXT DEFAULT 'pendente'   -- 'confirmado'|'parcial'|'pendente'
amount_paid     REAL DEFAULT 0
payment_date    TEXT
payment_method  TEXT
notes           TEXT
guests_data     TEXT DEFAULT '[]'         -- JSON array de hóspedes adicionais
license_number  TEXT
google_event_id TEXT
google_calendar_user_id TEXT              -- user que criou o evento GCal
public_token    TEXT                      -- token para acesso público à reserva
arrival_time    TEXT                      -- hora prevista de chegada
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```

**Cálculo automático do `payment_status`** (backend, create e update):
- `amount_paid >= total_amount && amount_paid > 0` → `'confirmado'`
- `amount_paid > 0 && amount_paid < total_amount` → `'parcial'`
- caso contrário → valor enviado pelo frontend ou `'pendente'`

**Anti-double-booking** (função `findConflict` no reservationController):
- Overlap: `check_in < outro.check_out AND check_out > outro.check_in`
- Back-to-back **permitido** (checkout dia X + checkin dia X não conflitua)
- Hierarquia: reservar uma suite bloqueia o seu `parent_id`; reservar um alojamento bloqueia todos os filhos

### Tabela `guests`
```sql
id              TEXT PRIMARY KEY          -- UUID v4
organization_id TEXT
name            TEXT NOT NULL
first_name      TEXT
last_name       TEXT
email           TEXT NOT NULL
email_personal  TEXT
phone           TEXT
birth_date      TEXT                      -- YYYY-MM-DD
birth_city      TEXT
nif             TEXT
nationality     TEXT
country         TEXT
document_type   TEXT
document_number TEXT
document_issuer_country TEXT
address         TEXT
postal_code     TEXT
city            TEXT
is_favorite     INTEGER DEFAULT 0
is_vip          INTEGER DEFAULT 0
is_unwanted     INTEGER DEFAULT 0
rgpd_consent    INTEGER DEFAULT 0
rgpd_consent_date TEXT
rgpd_consent_ip TEXT
created_at      TEXT DEFAULT datetime('now')
```

### Tabela `pricing_periods`
```sql
id              TEXT PRIMARY KEY          -- UUID v4 (8 chars)
organization_id TEXT NOT NULL
accommodation_id TEXT NOT NULL
name            TEXT NOT NULL             -- ex: "Verão", "Alta Temporada"
start_date      TEXT NOT NULL             -- YYYY-MM-DD (inclusive)
end_date        TEXT NOT NULL             -- YYYY-MM-DD (inclusive)
price_per_night REAL NOT NULL
min_nights      INTEGER DEFAULT 1
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```

**Aplicação**: o backend itera noite a noite (`calcBaseAmountWithPeriods` em `reservationRules.js`), procura o período que cobre cada noite, e aplica o preço correspondente. Se nenhum período cobrir uma noite, aplica `price_per_night` do alojamento.

### Tabela `vouchers`
```sql
id              TEXT PRIMARY KEY          -- UUID v4 (8 chars)
organization_id TEXT NOT NULL
code            TEXT NOT NULL             -- código alfanumérico maiúsculo (UNIQUE por org)
type            TEXT DEFAULT 'discount_pct' -- 'discount_pct'|'discount_fixed'|'credit_stay'
value           REAL NOT NULL
description     TEXT
valid_from      TEXT                      -- YYYY-MM-DD
valid_until     TEXT
min_nights      INTEGER DEFAULT 1
accommodation_id TEXT                     -- se preenchido, só válido para este alojamento
status          TEXT DEFAULT 'active'     -- 'active'|'used'|'expired'|'inactive'
used_at         TEXT
used_in_reservation_id TEXT
notes           TEXT
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
UNIQUE (organization_id, code)
```

### Coluna `google_task_id` em `operational_events`
Adicionada via `ALTER TABLE` pela migration `migrateGoogleTasksConnections`. Guarda o ID da tarefa no Google Tasks para upsert idempotente durante o sync.

### Tabela `operational_events`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT
title           TEXT NOT NULL
type            TEXT DEFAULT 'outro'      -- 'limpeza'|'manutencao'|'checkin'|'checkout'|'outro'
date            TEXT NOT NULL             -- YYYY-MM-DD
start_time      TEXT                      -- HH:MM
end_time        TEXT
accommodation_id TEXT
status          TEXT DEFAULT 'planeado'   -- 'planeado'|'em_curso'|'concluido'|'cancelado'
responsible     TEXT
notes           TEXT
reservation_id  TEXT                      -- FK opcional para reserva associada
created_by_user_id TEXT
completed_at    TEXT
auto_generated  INTEGER DEFAULT 0         -- 1 se gerado automaticamente por reserva
auto_kind       TEXT                      -- 'checkin'|'checkout'|'limpeza_apos_checkout'
auto_key        TEXT                      -- chave única para upsert idempotente
important       INTEGER DEFAULT 0
google_event_id TEXT
google_calendar_user_id TEXT
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
UNIQUE INDEX on (organization_id, auto_key) WHERE auto_key IS NOT NULL
```

### Tabela `settings` (key-value global — legacy)
Substituída progressivamente por `organization_settings`.
Chaves: `services`, `checkin_time`, `checkout_time`, `social_*`.

### Tabela `organization_settings` (key-value por organização)
```sql
organization_id TEXT NOT NULL
key             TEXT NOT NULL
value           TEXT NOT NULL             -- JSON ou string simples
updated_at      TEXT
PRIMARY KEY (organization_id, key)
```
Chaves usadas:
- `'services'` → JSON array: `[{id, name, type, value, unit, active}]`
  - `id: 'breakfast'` — pequeno-almoço (€/pessoa/noite)
  - `id: 'tourist_tax'` — taxa turística (€/hóspede/noite)
- `'gcal_settings'` → `{ syncTasks: bool }` — settings do Google Calendar

### Tabela `users`
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
email           TEXT NOT NULL UNIQUE
password_hash   TEXT NOT NULL
role            TEXT DEFAULT 'owner'
active          INTEGER DEFAULT 1
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```

### Tabela `organizations`
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
slug            TEXT NOT NULL UNIQUE
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```

### Tabela `memberships`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT NOT NULL
user_id         TEXT NOT NULL
role            TEXT NOT NULL            -- 'owner'|'manager'|'staff'
active          INTEGER DEFAULT 1
invited_by_user_id TEXT
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
UNIQUE (organization_id, user_id)
```

### Tabela `auth_sessions`
```sql
id              TEXT PRIMARY KEY
user_id         TEXT NOT NULL
organization_id TEXT NOT NULL
expires_at      TEXT NOT NULL
last_seen_at    TEXT DEFAULT datetime('now')
created_at      TEXT DEFAULT datetime('now')
```

### Tabela `invitations`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT NOT NULL
email           TEXT NOT NULL
role            TEXT NOT NULL
token           TEXT NOT NULL UNIQUE
invited_by_user_id TEXT NOT NULL
expires_at      TEXT NOT NULL
accepted_at     TEXT
created_at      TEXT DEFAULT datetime('now')
```

### Tabela `google_calendar_connections`
```sql
organization_id TEXT NOT NULL
user_id         TEXT NOT NULL
tokens          TEXT NOT NULL             -- JSON com access_token, refresh_token, etc.
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
PRIMARY KEY (organization_id, user_id)
```

### Tabela `google_email_connections`
```sql
organization_id TEXT NOT NULL PRIMARY KEY  -- uma ligação Gmail por organização
email           TEXT                        -- endereço Gmail ligado
tokens          TEXT NOT NULL               -- JSON com access_token, refresh_token, etc.
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```
Scopes: `gmail.send`, `gmail.readonly`, `userinfo.email`. Tokens renovados automaticamente via evento `'tokens'`.

### Tabela `invoice_messages`
```sql
id              TEXT PRIMARY KEY          -- UUID v4
organization_id TEXT NOT NULL
to_email        TEXT NOT NULL
to_name         TEXT
subject         TEXT NOT NULL
body_html       TEXT NOT NULL
reservation_id  TEXT                      -- FK opcional para reservas(id) ON DELETE SET NULL
sent_by_user_id TEXT
sent_at         TEXT DEFAULT datetime('now')
```
Guarda todos os emails enviados pelo backoffice. Consultado por `GET /auth/email/messages?to_email=&reservation_id=`.

### Tabela `google_tasks_connections`
```sql
organization_id TEXT NOT NULL PRIMARY KEY
email           TEXT                        -- conta Google ligada
tokens          TEXT NOT NULL               -- JSON OAuth2
tasks_list_id   TEXT                        -- ID da task list "Santa Paciência"
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```
Scope: `tasks`. Gerida via `backend/src/config/googleTasks.js`.

### Tabela `organization_email_templates`
```sql
organization_id TEXT NOT NULL
slug            TEXT NOT NULL             -- 'confirmacao'|'cancelamento'|'apos_checkin'|...
name            TEXT NOT NULL
subject         TEXT NOT NULL
body            TEXT NOT NULL             -- HTML Português
timing_offset   INTEGER DEFAULT 0
timing_unit     TEXT DEFAULT 'hours'
timing_direction TEXT DEFAULT 'after'
timing_event    TEXT DEFAULT 'booking'    -- 'booking'|'checkin'|'checkout'|'cancellation'
active          INTEGER DEFAULT 1
updated_at      TEXT
subject_en/fr/es/de/it/nl  TEXT
body_en/fr/es/de/it/nl     TEXT
PRIMARY KEY (organization_id, slug)
```

### Tabela `organization_email_log`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT NOT NULL
template_slug   TEXT NOT NULL
reservation_id  TEXT NOT NULL
sent_at         TEXT DEFAULT datetime('now')
UNIQUE (organization_id, template_slug, reservation_id)
```

### Tabela `expenses`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT
date            TEXT NOT NULL
description     TEXT NOT NULL
category        TEXT DEFAULT 'outro'
amount          REAL NOT NULL
payment_method  TEXT DEFAULT 'numerário'
notes           TEXT
created_at      TEXT
```

### Tabela `password_reset_tokens` (existente mas feature não implementada)
```sql
id              TEXT PRIMARY KEY
user_id         TEXT NOT NULL
token           TEXT NOT NULL UNIQUE
expires_at      TEXT NOT NULL
used_at         TEXT
created_at      TEXT DEFAULT datetime('now')
```

---

## API REST — Todos os Endpoints

### `/api/reservations`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista. Filtros: `?status=&accommodation_id=&from=&to=` |
| GET | `/:id` | Detalhe com guest_name, guest_email, accommodation_name |
| POST | `/` | Criar reserva. Cria/atualiza hóspede, recalcula total (com pricing periods), valida double-booking, cria evento GCal, envia email |
| PUT | `/:id` | Atualizar. Recalcula total, re-valida disponibilidade, atualiza GCal, envia email pagamento se confirmado |
| DELETE | `/:id` | Cancelar (status → 'cancelada'). Remove de GCal, envia email cancelamento |
| GET | `/stats/dashboard` | KPIs: totalBilled, confirmedReservations, nightsThisMonth, occupancyRate |
| GET | `/availability` | `?check_in=&check_out=&exclude_id=` → `{unavailable: [ids...]}` com propagação hierárquica |
| GET | `/notifications` | Notificações do dia: check-ins/outs, pagamentos em falta, pendentes, tarefas importantes |

### `/api/accommodations`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista com herança já resolvida |
| GET | `/settings` | Serviços e taxas da organização |
| POST | `/settings` | Guardar serviços e taxas |
| GET | `/:id` | Detalhe resolvido |
| POST | `/` | Criar. Aceita `parent_id` |
| PUT | `/:id` | Atualizar. Campos herdados ignorados se `parent_id` definido |
| DELETE | `/:id` | Apagar. Bloqueado se tiver reservas ativas |
| POST | `/:id/cover` | Upload capa (base64 → ficheiro em /uploads/) |
| DELETE | `/:id/cover` | Remover capa |
| POST | `/:id/images` | Upload imagem galeria |
| PATCH | `/:id/images` | Atualizar estrutura de imagens/secções |
| DELETE | `/:id/images` | Remover imagem |
| GET | `/:id/pricing-periods` | Lista períodos de preço do alojamento |
| POST | `/:id/pricing-periods` | Criar período de preço |
| PUT | `/:id/pricing-periods/:periodId` | Atualizar período |
| DELETE | `/:id/pricing-periods/:periodId` | Eliminar período |

### `/api/guests`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista. `?search=` faz LIKE em name/email/phone |
| GET | `/:id` | Detalhe com array de reservas |
| POST | `/` | Criar. Verifica duplicado por email |
| PUT | `/:id` | Atualizar. Aceita is_favorite/is_vip/is_unwanted |
| DELETE | `/:id` | Apagar. Bloqueado se tem reservas ativas |

### `/api/email-templates`
| Método | Path |
|---|---|
| GET | `/` — lista templates da organização |
| GET | `/email-settings` — horários e links sociais |
| PUT | `/email-settings` — guarda horários e links sociais |
| PUT | `/:slug` — atualiza assunto/corpo/timing/traduções/ativo |
| POST | `/:slug/preview` — envia preview para `body.to` ou `EMAIL_USER` |

### `/api/expenses`
| Método | Path |
|---|---|
| GET | `/` — lista com filtro `?from=&to=&category=` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |
| GET | `/summary` — agregado por categoria |

### `/api/calendar`
| Método | Path |
|---|---|
| GET | `/status` — connected, total, inCalendar, removed |
| POST | `/sync-all` — cria/atualiza eventos para todas reservas não canceladas |
| GET | `/settings` — devolve settings da organização (ex: syncTasks) |
| POST | `/settings` — guarda settings (ex: syncTasks) |

### `/api/events` (eventos operacionais)
| Método | Path |
|---|---|
| GET | `/` — lista eventos da organização com filtros |
| POST | `/` — criar evento manual |
| PUT | `/:id` — atualizar evento |
| DELETE | `/:id` — eliminar evento |
| POST | `/sync` — sync de tarefas automáticas por reserva |

### `/api/vouchers`
| Método | Path |
|---|---|
| GET | `/` — lista vouchers da organização |
| GET | `/validate?code=` — valida um código (verifica estado, validade, datas) |
| POST | `/` — criar voucher |
| PUT | `/:id` — atualizar voucher |
| POST | `/:id/apply` — marcar como utilizado (associa a reservation_id) |
| DELETE | `/:id` — eliminar (bloqueado se já utilizado) |

### `/api/team`
| Método | Path |
|---|---|
| GET | `/` — resumo de membros e convites |
| POST | `/invitations` — owner convida gestor/funcionário |
| DELETE | `/invitations/:id` — remove convite pendente |
| PATCH | `/members/:id` — owner altera papel |
| DELETE | `/members/:id` — owner remove membro |

### `/api/reports`
| Método | Path |
|---|---|
| GET | `/financial` — relatório anual: meses, canais, alojamentos, totais, ocupação e RevPAR |
| GET | `/expenses` — relatório anual de despesas por mês e categoria |

### `/api/backup`
| Método | Path |
|---|---|
| GET | `/export` — ZIP completo com `backup.json` + imagens |
| POST | `/import` — importa ZIP e substitui todos os dados da organização |

### `/api/tasks` (Google Tasks sync)
| Método | Path | Descrição |
|---|---|---|
| GET | `/status` | `{ connected, synced, pending }` — estado do sync |
| POST | `/sync` | Cria/atualiza tarefas nos próximos 90 dias no Google Tasks |
| DELETE | `/clear` | Limpa `google_task_id` de todos os eventos |

### `/auth`
| Método | Path |
|---|---|
| GET | `/register-status` |
| POST | `/login` |
| POST | `/register` |
| POST | `/logout` |
| GET | `/me` |
| GET | `/invitations/:token` |
| POST | `/invitations/accept` |
| GET | `/google` — redirect OAuth2 Google Calendar |
| GET | `/google/callback` |
| DELETE | `/google` |
| GET | `/google-email` — redirect OAuth2 Gmail (`gmail.send` + `gmail.readonly`) |
| GET | `/google-email/callback` |
| GET | `/google-email/status` — `{ connected, email }` |
| DELETE | `/google-email` — desligar Gmail |
| POST | `/google-email/test` — envia email de teste para o próprio |
| POST | `/email/send` — envia email via Gmail/SMTP e guarda em `invoice_messages` |
| GET | `/email/messages` — lista mensagens enviadas (`?to_email=&reservation_id=&limit=`) |
| GET | `/email/inbox` — lê inbox Gmail e devolve mensagens recebidas/enviadas (`?to_email=`) |
| GET | `/google-tasks` — redirect OAuth2 Google Tasks |
| GET | `/google-tasks/callback` |
| GET | `/google-tasks/status` — `{ connected, email, tasksListId }` |
| DELETE | `/google-tasks` — desligar Google Tasks |

### `/api/public`
| Método | Path |
|---|---|
| GET | `/booking/:slug` — dados públicos do alojamento |
| GET | `/booking/:slug/availability` |
| POST | `/booking/:slug/reservations` — criar reserva pública (pendente) |

### `/health`
| Método | Path |
|---|---|
| GET | `/health` — devolve `{ status: 'ok', timestamp }` |

---

## Módulos Funcionais (Frontend)

### Dashboard
- 4 KPIs com animação: total faturado, reservas confirmadas, noites no mês, taxa de ocupação
- Tabela das próximas 5 chegadas
- Barras de ocupação por suite no mês corrente
- Versão móvel: card de chegadas de hoje, links rápidos

### Reservas — Wizard 3 Passos

**Passo 1 — Identificação do Hóspede**
- Autocomplete por pesquisa (`GET /api/guests?search=`, debounce 280ms)
- Campos: primeiro nome, apelido, email, telefone, país, NIF, data nascimento, documento, morada
- Validação estrangeiros: documento + país emissor + local nascimento obrigatórios

**Passo 2 — Alojamento & Datas**
- Calendário custom, formato `dd-mm-aaaa`, badge de noites
- Disponibilidade em tempo real (debounce 300ms)
- Hóspedes adicionais com dados completos
- **Preços dinâmicos**: o wizard carrega os períodos de preço (`GET /api/accommodations/:id/pricing-periods`) e aplica noite a noite; no resumo mostra "Preço dinâmico × N noites" quando há períodos ativos

**Passo 3 — Confirmar & Pagamento**
- Estado da reserva, pagamento, valor pago, data, método, notas, RGPD
- Cálculo automático do `payment_status` ao digitar

### Preços Dinâmicos (`precos.js`)
- Separador principal "Preços" com sub-tabs **Calendário** e **Lista**
- Selector de alojamento (AppUI dropdown pesquisável)
- **Calendário mensal**: verde = mais barato que base, vermelho = mais caro, neutro = igual
- **Seleção por dois cliques**: clicar dia 1 inicia seleção; clicar dia 2 (mesmo mês ou mês diferente após navegar) completa o intervalo e abre o modal
- Navegação entre meses não cancela a seleção em curso; clicar fora do painel cancela
- Modal de criar/editar período: nome, data início, data fim (formato PT), preço/noite
- **Lista**: tabela de períodos com ponto colorido, datas e preço; editar/eliminar inline
- Badge com o preço base do alojamento selecionado

### Vouchers
- CRUD completo no backoffice
- Tipos: desconto percentual, desconto fixo, crédito de estadia
- Campos: código (ou gerado automaticamente), valor, validade, mínimo de noites, alojamento específico
- Validação de código no momento da leitura (`GET /api/vouchers/validate?code=`)
- Campo de verificação inline no wizard de reserva do backoffice (não aplica desconto automaticamente)
- Vouchers utilizados não podem ser eliminados

### Eventos Operacionais
- Tarefas de limpeza, manutenção, check-in, check-out e outros
- Geração automática de tarefas ao criar/atualizar/cancelar reservas (`operationalTasksService.js`)
- Filtros por data, alojamento, tipo (chips coloridos) e estado — chips partilhados entre vista Calendário e Lista
- Iniciais do alojamento nas pills e blocos de timeline (ex: "Suite Mezzanine Deluxe" → "SMD")
- Sync em tempo real para Google Calendar quando uma reserva é criada ou alterada
- Tarefas com `google_event_id` preservadas nos ciclos de sync (não são eliminadas e recriadas)
- Tarefas marcadas como importantes aparecem nas Notificações

### Notificações
- Painel centralizado: check-ins/outs do dia e amanhã, pagamentos em falta, reservas pendentes
- Tarefas importantes (eventos operacionais com `important=1`) do dia e amanhã
- Badge com contador no nav item; sino fica vermelho com animação CSS quando há notificações `priority: 'high'`
- Lembretes de exportação configuráveis por tipo (XLS/PDF/ZIP) com intervalo em dias; geridos em `localStorage`

### Hóspedes
- Lista com flags (⭐/👑/🚫), pesquisa, detalhe, histórico de reservas, RGPD

### Alojamentos
- Lista tabular com hierarquia visual
- Tabs: Informação | Comodidades | Imagens
- Campos herdados (com badge "↑ herdado"), comodidades próprias/herdadas, galeria por secções
- Serviços e Taxas editáveis inline com auto-save

### Calendário
**Vista mensal**: grid 7 colunas, blocos clicáveis, filtros, agenda móvel
**Vista Timeline**: 365 dias scrolláveis, zoom, drag & drop com validação de overbooking

### Emails Automáticos
**Templates pré-definidos**: confirmação, cancelamento, após check-in, antes do check-out, obrigado, coordenadas.
**Separador**: integrado em Definições → aba "Emails" (não é view independente na sidebar).
**Envio**: se Gmail OAuth estiver ligado para a organização, usa Gmail API (`sendViaGmail`); caso contrário usa SMTP (`nodemailer`). A função `sendMail(organizationId, {to, subject, html})` em `emailService.js` encapsula esta lógica.
**Scheduler** (`emailScheduler.js`): disponível mas **não ligado no `server.js`** — `startScheduler()` não é chamado.
**Placeholders**: `{{primeiro_nome}}`, `{{nome_completo}}`, `{{alojamento}}`, `{{referencia}}`, `{{data_checkin}}`, `{{hora_checkin}}`, `{{data_checkout}}`, `{{hora_checkout}}`, `{{noites}}`, `{{num_hospedes}}`, `{{total}}`, `{{canal}}`, `{{wifi_nome}}`, `{{wifi_password}}`, `{{facebook}}`, `{{instagram}}`, `{{website}}`

### Mensagens (`invoice.js` + `invoice.css`)
- Sidebar: secção Principal, a seguir a Notificações; badge vermelho quando há emails novos desde a última visita
- Layout 2 colunas: lista de conversas à esquerda, detalhe + compose à direita
- Conversas agrupadas por reserva (nome do hóspede da BD + iniciais do alojamento se reserva ativa) ou avulsas (emails sem reserva_id)
- Lista ordenada pela data do último email; snippet da última mensagem visível na linha
- Chat: enviados à direita (balão vermelho), recebidos via Gmail à esquerda (balão cinza); polling de 30s
- Deduplicação por `direction|subject|date[:16]` para evitar duplicados entre BD e Gmail
- Botão "Template" no compose: carrega `/api/email-templates`, picker escolhe e preenche assunto + corpo; cache em memória
- Modal "Nova mensagem" para email avulso (sem reserva associada)
- `openInvoiceForReservation(reservationId, email, name)` chamado do detalhe de reserva
- Banner de re-autorização quando Gmail não tem scope `gmail.readonly`

### Gmail OAuth (por organização)
- Fluxo independente do Google Calendar: scopes `gmail.send` + `gmail.readonly` + `userinfo.email`
- Configuração em Definições → aba "Ligações" (junto ao Google Calendar)
- Após ligar: endereço Gmail guardado em `google_email_connections`; emails saem com `From: <PropertyName> <email@gmail.com>`
- `GET /auth/email/inbox`: pesquisa Gmail por `from:X OR to:X`, extrai corpo MIME recursivamente (prefere `text/html`, fallback `text/plain`), devolve `direction: 'sent'|'received'`
- Subjects não-ASCII codificados em RFC 2047; tokens auto-renovados via evento `'tokens'`
- Botão "Testar envio" envia confirmação para o próprio endereço ligado
- **Atenção**: ao adicionar o scope `gmail.readonly`, o utilizador tem de re-autorizar (desligar e ligar de novo o Gmail nas Definições)

### Google Tasks OAuth (por organização)
- Scope: `https://www.googleapis.com/auth/tasks`
- Redirect URI: `GOOGLE_TASKS_REDIRECT_URI` — produção: `https://santapaciencia.xyz/auth/google-tasks/callback`
- Cria/garante lista "Santa Paciência" no Google Tasks (`getOrCreateTaskList`)
- Sync: cria/atualiza tarefas a partir dos eventos operacionais dos próximos 90 dias (excluindo cancelados); `google_task_id` guardado para upsert
- **Necessário**: activar "Tasks API" no Google Cloud Console e registar o URI de redirect

### Google Calendar
- OAuth2 por utilizador, badge de estado, estatísticas, sync manual
- `google_calendar_user_id` em reservas e eventos operacionais: cada entidade fica ligada ao utilizador que a criou no GCal
- Settings por organização: `syncTasks` (sincronizar tarefas operacionais)

### RGPD
- Checkbox obrigatório no passo 3 do wizard (só em criações)
- Regista: `rgpd_consent=1`, `rgpd_consent_date`, `rgpd_consent_ip`

### Backup
- Export: ZIP com `backup.json` + uploads
- Import: substitui todos os dados da organização + restaura imagens
- Payloads até 200 MB aceites pelo backend

### Datas e Calendário de Inputs
- Formato visual `dd-mm-aaaa` em todos os campos de data
- Calendário custom minimalista aplicado via `AppDatePicker`
- Campos de nascimento aceitam escrita corrida (`ddmmaaaa` → `dd-mm-aaaa`)

### Motor Público de Reservas
- Página pública `/reservar/:slug` por alojamento
- Cálculo completo de preços (com preços dinâmicos, ocupação extra, etc.)
- Reservas entram como `pendente` para validação manual
- `public_token` gerado para futura gestão pelo cliente

---

## Design System (CSS)

### Variáveis de Cor
```css
--marca:       #843424  (castanho/bordeaux — cor principal)
--azul:        #2c3e50  (texto principal)
--azul-claro:  #4a6fa5
--dourado:     #c9a84c
--verde:       #2e7d52
--vermelho:    #b03030
--laranja:     #d4691e
--cinza:       #8a8278
--cinza-claro: #f5f3f0
--branco:      #ffffff
--borda:       rgba(0,0,0,.08)
```

### Layout
- `.layout`: shell principal com sidebar fixa, topbar translúcida e content area
- `.sidebar`: navegação vertical com hover states e item ativo destacado
- `.sb-collapsed`: sidebar reduz para 56px (só ícones)
- `@media (max-width: 600px)`: sidebar esconde; aparece navegação móvel / drawer

### Componentes Principais
- **Cards** (`.card`): superfícies translúcidas, sombras suaves
- **Badges** (`.badge`): `badge-confirmada`, `badge-pendente`, `badge-cancelada`, `badge-pago`, `badge-parcial`, `badge-pendpag`
- **Botões** (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-sm`)
- **Sub-tabs** (`.report-tabs` + `.report-tab`): padrão reutilizado em Eventos, Preços, Relatórios
- **Toast** (`.toast`): notificações temporárias (3.5s) no canto inferior direito
- **Modais**: `.modal-bg` overlay + `.modal` centralizado; `.modal-wizard` é flex-row

---

## Variáveis de Ambiente (`.env`)

```env
PORT=3001
NODE_ENV=production
DB_PATH=/app/data/santapaciencia.db
FRONTEND_PATH=/app/frontend

EMAIL_ENABLED=true
EMAIL_HOST=smtp.exemplo.com
EMAIL_PORT=587
EMAIL_USER=reservas@santapaciencia.xyz
EMAIL_PASS=password
EMAIL_FROM="Santa Paciência <reservas@santapaciencia.xyz>"

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://santapaciencia.xyz/auth/google/callback
GOOGLE_EMAIL_REDIRECT_URI=https://santapaciencia.xyz/auth/google-email/callback
GOOGLE_TASKS_REDIRECT_URI=https://santapaciencia.xyz/auth/google-tasks/callback

PROPERTY_NAME=Santa Paciência
LICENSE_NUMBER=12345/AL
```

---

## Revisão de Código — Estado e Melhorias

### O que Está Bom
- Domínio funcional bem separado no backend: rotas finas, controllers por área, services para autenticação, organizações, calendário, email, RGPD, regras de reserva e disponibilidade.
- `reservationRules.js` centraliza cálculos de noites, totais, taxas, preços dinâmicos, ocupação extra e pagamento — usado pelo backoffice e pelo motor público.
- `availabilityRules.js` centraliza regras de overlap, hierarquia pai/filhos e back-to-back.
- No frontend, `domain/dates.js` e `domain/pricing.js` evitam duplicação entre backoffice e página pública.
- `AppUI.enhanceSelect`, `AppUI.setButtonLoading`, `AppUI.openModal`/`closeModal` como helpers reutilizáveis.
- SQLite com migrations não-destrutivas: simples de instalar e manter.
- Regra de disponibilidade no backend (não só no frontend): correto.
- Autenticação por organização prepara o produto para multi-tenant, convites e papéis.
- CSS começou a sair do ficheiro monolítico para camadas (`base`, `layout`, `components`, `themes`, `views`).
- Preços dinâmicos aplicados noite a noite (não taxa plana), suportando mudanças de período a meio de uma estadia.

### Bugs / Riscos Actuais
- `emailScheduler.js` não está ligado no `server.js`; emails agendados nunca correm automaticamente.
- `getNotifications` chama `syncOrganizationOperationalTasks` (operação de escrita) num handler GET — anti-padrão REST.
- Race condition no voucher: validação e marcação como `'used'` correm em queries separadas; dois pedidos simultâneos podem usar o mesmo voucher.
- XSS potencial: alguns pontos ainda inserem dados em `innerHTML` sem `escapeHtml`.
- `payment_method || existing.payment_method` impede apagar o método de pagamento explicitamente.
- Sem rate limiting no `/auth/login` nem nos endpoints públicos (`express-rate-limit` não instalado).
- `frontend/api.js` existe mas a SPA usa helpers em `helpers.js`; duas fontes para o mesmo padrão.
- JOIN de voucher em `voucherController` não filtra `accommodation` por `organization_id`.
- Muitos `onclick` inline no `index.html` dificultam testes e cleanup.
- Credenciais reais no `.env` local — não devem ser commitadas nem partilhadas.

### Segmentação Recomendada
Ver `CÓDIGO_MELHORIAS.md` para lista detalhada com prioridades.

---

## Pontos de Atenção Técnica

1. **IDs de reservas**: `SP-{Date.now()}` — legíveis mas podem colidir em criações simultâneas rápidas.

2. **IDs de alojamentos**: slug do nome + 4 dígitos do timestamp. Se o nome for alterado, o ID mantém-se.

3. **Imagens em base64**: enviadas do frontend, guardadas como ficheiros. Limite de 5 MB por imagem; 200 MB total por request de backup/import.

4. **Email scheduler**: módulo existe com `setInterval(60min)`, mas não está ligado no `server.js`. Se for ativado, não tem fila persistente — falhas tentam de novo no ciclo seguinte desde que a janela de 8 dias ainda cubra a reserva.

5. **CORS**: configurado para `localhost`, `ngrok`, `trycloudflare.com` e `santapaciencia.xyz`. Adicionar novos domínios em `app.js` no array `allowed`.

6. **Autenticação**: login por sessão, signup de `owner`, convites e roles. Ainda faltam: rate limiting de login (`express-rate-limit` não instalado), recuperação de password, rotação de session ID, auditoria de acessos.

7. **Multi-tenant**: isolamento lógico por `organization_id`. Exige disciplina para que novas queries filtrem sempre pela organização atual.

8. **Preços dinâmicos — cache no wizard**: `_cachedPricingPeriods` no wizard não é invalidado se o utilizador editar períodos na vista Preços enquanto o wizard está aberto. Os preços reflectem-se apenas ao mudar de alojamento no wizard.

9. **Vouchers**: campo de verificação no wizard do backoffice. O desconto não é deduzido automaticamente no total — a aplicação é manual.

---

## O que Ainda Não Está Implementado

- **Recuperação de password** — tabela `password_reset_tokens` existe mas sem endpoints nem UI
- **Rate limiting / brute-force protection** no login
- **Faturação** — geração de PDF de fatura/recibo por reserva
- **Faturação por reserva** — geração de PDF de fatura/recibo (o separador "Faturas" em Mensagens está reservado para isso)
- **Notas internas por hóspede** (separadas das notas de reserva)
- **Integração com canais** (Airbnb/Booking via iCal ou API oficial)
- **Notificações push** (PWA Service Worker)
- **Ficha SEF/AIMA** — relatório de hóspedes estrangeiros
- **Backups automáticos locais** — export periódico para o PC dos proprietários
- **Portal/link público da reserva** — token seguro para o cliente editar dados permitidos
- **Integração com website externo** — redirect, iframe/embed ou formulário nativo via API
- **PWA** — frontend responsivo mas não instalável como app
- **Testes automatizados** — sem testes de integração (existem testes unitários mínimos de reservationRules)
- **Auditoria/histórico** — sem log de quem alterou o quê e quando
- **Vouchers com desconto automático** — o voucher é verificável no wizard mas o desconto não é deduzido no total da reserva
- **Email scheduler ligado** — módulo existe mas `startScheduler()` não é chamado no `server.js` *(aguarda trabalho futuro)*
- **Inbox Gmail — polling passivo** — a leitura de inbox funciona por polling de 30s; replies chegam com atraso até 30s. Alternativa mais robusta seria Gmail Pub/Sub (push), mas requer configuração de webhook externo.
