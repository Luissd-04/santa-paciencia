# Santa Paciência — Documentação Técnica Completa

> Atualizado em 2026-05-11. Atualizar sempre que houver alterações estruturais significativas.

---

## Stack Tecnológica

### Backend
| Tecnologia | Versão | Papel |
|---|---|---|
| **Node.js** | v22 | Runtime |
| **Express** | v5 | Framework HTTP |
| **better-sqlite3** | v12 | Base de dados (síncrona, sem ORM) |
| **Nodemailer** | v8 | Envio de emails |
| **googleapis** | v171 | Integração Google Calendar (OAuth2) |
| **uuid** | v14 | Geração de IDs de hóspedes |
| **dotenv** | v17 | Variáveis de ambiente |

### Frontend
Vanilla HTML + CSS + JavaScript puro. Sem frameworks (sem React, Vue, Angular, etc.).
Ícones via **Lucide** (CDN). Bibliotecas auxiliares: **Chart.js** para relatórios, **Leaflet** para mapa/geocoding visual, **SheetJS (XLSX)** e **jsPDF + AutoTable** para exportação.

Em 2026-05-04 o frontend passou a usar uma estrutura de CSS segmentada:
- `css/styles.css` — legado / base histórica ainda usada pelas views não migradas
- `css/base.css` — tokens visuais, heróis de página, utilitários base
- `css/layout.css` — shell global: sidebar, topbar, content
- `css/components.css` — botões, cards, forms, toggle de tema
- `css/themes.css` — light/dark mode via `data-theme`
- `css/views/*.css` — estilos específicos por separador (`dashboard`, `reservas`, `despesas`)

Na ronda seguinte de UX do mesmo dia:
- `css/views/operations.css` passou a concentrar a consistência visual de `Calendário`, `Hóspedes` e `Alojamentos`
- foram adicionados contadores de contexto e action bars em tabs operacionais para reduzir fricção

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
├── data/                       Volume Docker persistente
│   ├── santapaciencia.db       Base de dados SQLite
│   └── uploads/                Imagens dos alojamentos
├── tokens/
│   └── google_token.json       Token OAuth2 Google Calendar
└── backend/src/
    ├── app.js                  Express app: CORS, auth por sessão, registo de rotas
    ├── server.js               HTTP server
    ├── package.json            Dependências Node.js
    ├── .env                    Variáveis de ambiente (não em git)
    ├── config/
    │   ├── database.js         Init SQLite + migrations automáticas + auth/org/team
    │   ├── google.js           Cliente OAuth2 Google
    │   └── email.js            Nodemailer transporter (SMTP)
    ├── controllers/
    │   ├── reservationController.js   ~448 linhas — lógica central de reservas
    │   ├── accommodationController.js ~274 linhas — CRUD alojamentos + herança
    │   ├── guestController.js         ~184 linhas — CRUD hóspedes + pesquisa
    │   ├── emailTemplateController.js ~113 linhas — CRUD templates
    │   ├── expenseController.js        ~61 linhas — CRUD despesas
    │   ├── calendarController.js       ~68 linhas — estado e sync Google Calendar
    │   └── teamController.js           Convites, membros e gestão de papéis
    ├── routes/
    │   ├── reservations.js     7 rotas
    │   ├── accommodations.js   11 rotas
    │   ├── guests.js           5 rotas
    │   ├── emailTemplates.js   5 rotas
    │   ├── expenses.js         5 rotas
    │   ├── calendar.js         2 rotas
    │   ├── auth.js             login, registo, sessão, convites, OAuth2 Google
    │   └── backup.js           2 rotas
    ├── services/
    │   ├── authService.js      hash de password, sessões, utilizadores
    │   ├── calendarService.js  Criação/update/delete de eventos no Google Calendar
    │   ├── emailService.js     Envio de emails HTML com placeholders + branding
    │   ├── emailScheduler.js   Scheduler disponível: corre de hora em hora quando invocado
    │   ├── orgService.js       organizações, memberships e convites
    │   └── rgpdService.js      Geração de doc RGPD + registo de consentimento
    └── middleware/
        ├── errorHandler.js     Tratamento global de erros Express
        ├── requireAuth.js      Bloqueia `/api/*` sem sessão válida
        └── requireRole.js      Restringe operações por `owner|manager|staff`
```

```
frontend/
├── index.html              SPA — shell global + auth screen premium + views
├── api.js                  Wrapper fetch (referência; a app usa funções inline)
├── css/
│   ├── styles.css          legado / views ainda não migradas
│   ├── base.css            tokens, heróis, utilitários base
│   ├── layout.css          sidebar, topbar, content
│   ├── components.css      cards, botões, forms, toggle
│   ├── themes.css          light/dark mode
│   └── views/
│       ├── dashboard.css
│       ├── operations.css
│       ├── reservas.css
│       └── despesas.css
└── js/
    ├── domain/
    │   ├── dates.js        Regras reutilizáveis de datas, noites e idade
    │   └── pricing.js      Regras reutilizáveis de totais, taxas e ocupação extra
    ├── ui.js               Helpers UI reutilizáveis: loading de botões, dropdowns e modais simples
    ├── state.js            Variáveis globais: reservas[], accommodations[],
    │                       editingId, calYear/Month, servicosData[]
    ├── helpers.js          badgeEstado(), badgePagamento(), toast(),
    │                       formatDate(), lcIcon(), apiGet/Post/Put/Delete()
    ├── auth.js             login/signup/invite, sessão e feedback de autenticação
    ├── app.js              navegação, boot global, dark mode, Google Calendar UI
    ├── dashboard.js        KPIs, tabela próximas chegadas, barras de ocupação,
    │                       versão móvel do dashboard
    ├── reservas.js         ~1155 linhas — wizard 3 passos, tabela, detalhe,
    │                       disponibilidade, cálculo de total, hóspedes extra
    ├── hospedes.js         ~624 linhas — lista, detalhe, fichas, flags
    ├── alojamentos.js      ~966 linhas — CRUD, imagens, galeria, herança
    │                       pai→filho, comodidades, mapa, serviços/taxas
    ├── calendario.js       ~308 linhas — vista mensal, blocos por suite
    ├── despesas.js         ~163 linhas — CRUD despesas + resumo
    ├── emails.js           ~455 linhas — templates, editor, preview e settings
    ├── relatorios.js       ~585 linhas — relatórios financeiros, despesas e lucro
    └── team.js             convites, listagem de membros, gestão de papéis
```

---

## Estado Implementado — Resumo Atual

### Backoffice
- Autenticação por email/password, sessões em cookie `HttpOnly`, organizações, memberships e convites.
- Dashboard operacional com KPIs, chegadas próximas, ocupação e atalhos de backup.
- Reservas completas: criação/edição/cancelamento/reativação, disponibilidade, anti-overbooking, hóspedes adicionais, RGPD, pagamentos parciais e integração Google Calendar.
- Alojamentos com hierarquia pai→filhos, campos herdados, comodidades próprias/herdadas, imagens por secção, capa, áreas comuns herdadas, serviços/taxas e preços especiais por idade.
- Hóspedes com pesquisa, ficha, histórico, flags e importação/exportação.
- Calendário mensal e timeline anual com filtros, drag & drop e validação de conflitos.
- Despesas com CRUD, resumo e integração nos relatórios.
- Relatórios financeiros: receita mensal, receita por canal/alojamento, despesas por mês/categoria e lucro.
- Emails/templates por organização, settings de horários/redes sociais e preview por email.
- Google Calendar OAuth por utilizador/organização, status e sync manual.
- Backup ZIP de dados + imagens e import substitutivo por organização.

### Público
- Página pública de reservas por `public_slug`: `/reservar/:slug`.
- Endpoints públicos para landing, disponibilidade e criação de reserva pendente.
- Cálculo de preço com datas, hóspedes, ocupação extra, bebé/criança, pequeno-almoço e taxa turística.
- Criação de reserva pública com `public_token` para futura gestão segura.

### Ainda Parcial / Atenção
- O ficheiro `emailScheduler.js` existe, mas o `server.js` atual não chama `startScheduler()`. Emails imediatos podem ser enviados pelas ações de reserva, mas emails agendados de check-in/check-out só correm se o scheduler for ligado explicitamente.

---

## Base de Dados (SQLite)

As migrations são **automáticas e não-destrutivas**: ao iniciar, o servidor verifica
quais colunas existem com `PRAGMA table_info()` e adiciona as que faltam via `ALTER TABLE`.

### Tabela `accommodations`
```sql
id              TEXT PRIMARY KEY          -- slug gerado do nome + timestamp
name            TEXT NOT NULL
type            TEXT DEFAULT 'suite'      -- 'alojamento'|'suite'|'apartamento'|
                                          --  'quarto'|'moradia'|'villa'
parent_id       TEXT                      -- FK para accommodations(id); define
                                          --  hierarquia alojamento principal→suites
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
amenities       TEXT DEFAULT '[]'         -- JSON array de strings
cover_image     TEXT                      -- path /uploads/cover_id.ext
images          TEXT DEFAULT '{}'         -- JSON: {secção: [urls...], _sections: [...]}
wifi_name       TEXT
wifi_password   TEXT
checkin_time    TEXT                      -- HH:MM
checkout_time   TEXT
color           TEXT DEFAULT '#843424'    -- cor no calendário e chips
google_calendar_id TEXT
social_facebook / social_instagram / social_website  TEXT
created_at      TEXT DEFAULT datetime('now')
```

**Nota sobre herança**: quando `parent_id` está definido, os campos
`address, postal_code, city, region, country, wifi_name, wifi_password,
checkin_time, checkout_time, social_*` são herdados do pai. O backend
recusa escrever nesses campos se `parent_id` estiver definido; o frontend
mostra-os como read-only com badge "↑ herdado".

### Tabela `reservations`
```sql
id              TEXT PRIMARY KEY          -- formato 'SP-{timestamp}'
guest_id        TEXT NOT NULL             -- FK guests(id)
accommodation_id TEXT NOT NULL            -- FK accommodations(id)
check_in        TEXT NOT NULL             -- YYYY-MM-DD
check_out       TEXT NOT NULL             -- YYYY-MM-DD
nights          INTEGER NOT NULL
num_guests      INTEGER NOT NULL
total_amount    REAL NOT NULL             -- calculado: alojamento + taxas + pequeno-almoço
tourist_tax     REAL DEFAULT 0            -- calculado: €/hóspede/noite × num_guests × nights
breakfast_included INTEGER DEFAULT 0
channel         TEXT DEFAULT 'direto'     -- 'airbnb'|'booking'|'direto'|'expedia'|'vrbo'|'outro'
status          TEXT DEFAULT 'confirmada' -- 'confirmada'|'pendente'|'cancelada'
payment_status  TEXT DEFAULT 'pendente'   -- 'confirmado'|'parcial'|'pendente'
amount_paid     REAL DEFAULT 0            -- valor efetivamente pago
payment_date    TEXT                      -- data do pagamento (YYYY-MM-DD)
payment_method  TEXT                      -- 'transferencia'|'mbway'|'numerario'|'cartao'
notes           TEXT
guests_data     TEXT DEFAULT '[]'         -- JSON array de hóspedes adicionais
license_number  TEXT                      -- copiado do alojamento no momento da reserva
google_event_id TEXT                      -- ID do evento no Google Calendar
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
- Hierarquia: reservar uma suite bloqueia o seu `parent_id` (alojamento);
  reservar um alojamento bloqueia todos os filhos com `parent_id = alojamento.id`

### Tabela `guests`
```sql
id              TEXT PRIMARY KEY          -- UUID v4
name            TEXT NOT NULL             -- nome completo (first + last)
first_name      TEXT
last_name       TEXT
email           TEXT NOT NULL             -- único; se não fornecido: guest_{ts}@sem-email.local
email_personal  TEXT
phone           TEXT
birth_date      TEXT                      -- YYYY-MM-DD
birth_city      TEXT
nif             TEXT
nationality     TEXT
country         TEXT
document_type   TEXT                      -- 'passaporte'|'bi'|'cc'|...
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

### Tabela `settings` (key-value)
```
key             TEXT PRIMARY KEY
value           TEXT NOT NULL             -- JSON ou string simples
updated_at      TEXT
```
Chaves usadas:
- `'services'` → JSON array: `[{id, name, type, value, unit, active}]`
  - `id: 'breakfast'` — pequeno-almoço (€/pessoa/noite)
  - `id: 'tourist_tax'` — taxa turística (€/hóspede/noite)
  - IDs custom começam por `'sv-{timestamp}'`
- `'checkin_time'`, `'checkout_time'` — horários globais (HH:MM)
- `'social_facebook'`, `'social_instagram'`, `'social_website'`

### Tabela `users`
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
email           TEXT NOT NULL UNIQUE
password_hash   TEXT NOT NULL
role            TEXT DEFAULT 'owner'     -- papel global de arranque; a permissão real
                                         -- vem da membership na organização
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
invited_by_user_id TEXT
created_at      TEXT DEFAULT datetime('now')
updated_at      TEXT DEFAULT datetime('now')
```

### Tabela `auth_sessions`
```sql
id              TEXT PRIMARY KEY
user_id         TEXT NOT NULL
organization_id TEXT NOT NULL
expires_at      TEXT NOT NULL
created_at      TEXT DEFAULT datetime('now')
```

### Tabela `invitations`
```sql
id              TEXT PRIMARY KEY
organization_id TEXT NOT NULL
email           TEXT NOT NULL
role            TEXT NOT NULL            -- definido pelo owner
token           TEXT NOT NULL UNIQUE
invited_by_user_id TEXT NOT NULL
expires_at      TEXT NOT NULL
accepted_at     TEXT
accepted_by_user_id TEXT
created_at      TEXT DEFAULT datetime('now')
```

### Tabela `email_templates`
```sql
slug            TEXT PRIMARY KEY          -- 'confirmacao'|'cancelamento'|'apos_checkin'|
                                          --  'antes_checkout'|'obrigado'|'coordenadas'
name            TEXT
subject         TEXT                      -- Português
body            TEXT                      -- HTML Português
subject_en/fr/es/de/it/nl  TEXT
body_en/fr/es/de/it/nl     TEXT
timing_offset   INTEGER DEFAULT 0
timing_unit     TEXT DEFAULT 'hours'      -- 'hours'|'days'
timing_direction TEXT DEFAULT 'after'     -- 'before'|'after'
timing_event    TEXT DEFAULT 'booking'    -- 'booking'|'checkin'|'checkout'|'cancellation'
active          INTEGER DEFAULT 1
updated_at      TEXT
```

### Tabela `email_log`
```sql
id              TEXT PRIMARY KEY
template_slug   TEXT
reservation_id  TEXT
sent_at         TEXT DEFAULT datetime('now')
UNIQUE(template_slug, reservation_id)     -- garante envio único por reserva
```

### Tabela `expenses`
```sql
id              TEXT PRIMARY KEY
date            TEXT NOT NULL
description     TEXT NOT NULL
category        TEXT DEFAULT 'outro'
amount          REAL NOT NULL
payment_method  TEXT DEFAULT 'numerário'
notes           TEXT
created_at      TEXT
```

---

## API REST — Todos os Endpoints

### `/api/reservations`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista. Filtros: `?status=&accommodation_id=&from=&to=` |
| GET | `/:id` | Detalhe com guest_name, guest_email, accommodation_name |
| POST | `/` | Criar reserva. Cria/atualiza hóspede, recalcula total, valida double-booking, cria evento GCal, envia email confirmação |
| PUT | `/:id` | Atualizar. Recalcula total, re-valida disponibilidade (excluindo a própria reserva), atualiza GCal, envia email pagamento se confirmado |
| DELETE | `/:id` | Cancelar (status → 'cancelada'). Remove de GCal, envia email cancelamento |
| GET | `/stats/dashboard` | KPIs: totalBilled, confirmedReservations, nightsThisMonth, occupancyRate |
| GET | `/availability` | `?check_in=&check_out=&exclude_id=` → `{unavailable: [ids...]}` com propagação hierárquica |

### `/api/accommodations`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista com herança já resolvida: campos efetivos do pai, `_parent`, `_parent_name`, `own_amenities`, `inherited_amenities`, `effective_amenities`, `common_area_images` |
| GET | `/:id` | Detalhe resolvido com `_parent`, `own_images`, `image_sections` e `common_area_images` se for filho |
| POST | `/` | Criar. Aceita `parent_id`, valida que pai existe e é do tipo 'alojamento' |
| PUT | `/:id` | Atualizar. Campos herdados ignorados se `parent_id` definido; grava apenas `own_amenities` |
| DELETE | `/:id` | Apagar. Bloqueado se tiver reservas ativas |
| POST | `/:id/cover` | Upload capa (base64 → ficheiro em /uploads/) |
| POST | `/:id/images` | Upload imagem galeria (base64, por secção). Filhos não podem enviar para `Áreas Comuns` |
| PATCH | `/:id/images` | Atualizar estrutura de imagens/secções. `Áreas Comuns` é gerida apenas no principal |
| DELETE | `/:id/images` | Remover imagem (apaga ficheiro em disco). Filhos não podem apagar `Áreas Comuns` herdadas |
| GET | `/settings` | Serviços e taxas (da tabela settings) |
| POST | `/settings` | Guardar serviços e taxas |

### `/api/guests`
| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Lista. `?search=` faz LIKE em name/email/phone. Inclui reservation_count, last_check_in |
| GET | `/:id` | Detalhe com array de reservas (JOIN accommodations) |
| POST | `/` | Criar. Verifica duplicado por email |
| PUT | `/:id` | Atualizar. Aceita is_favorite/is_vip/is_unwanted |
| DELETE | `/:id` | Apagar. Bloqueado se tem reservas ativas |

### `/api/email-templates`
| Método | Path |
|---|---|
| GET | `/` — lista templates da organização e devolve settings |
| GET | `/email-settings` — horários e links sociais da organização |
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

### `/auth`
| Método | Path |
|---|---|
| GET | `/register-status` — informa que o signup público cria sempre um novo `owner` + `organization` |
| POST | `/login` — email + password, cria sessão em cookie `HttpOnly` |
| POST | `/register` — cria utilizador `owner`, organização e membership |
| POST | `/logout` — termina sessão atual |
| GET | `/me` — devolve utilizador, organização e papel atual |
| GET | `/invitations/:token` — detalhe de convite pendente |
| POST | `/invitations/accept` — cria conta a partir de convite e inicia sessão |
| GET | `/google` — redirect para OAuth2 consent screen |
| GET | `/google/callback` — recebe code, guarda token em /tokens/google_token.json |
| DELETE | `/google` — apaga token |

### `/api/team`
| Método | Path |
|---|---|
| GET | `/` — resumo de membros e convites da organização atual |
| POST | `/invitations` — owner convida gestor/funcionário |
| DELETE | `/invitations/:id` — remove convite pendente |
| PATCH | `/members/:id` — owner altera papel |
| DELETE | `/members/:id` — owner remove membro |

### `/api/reports`
| Método | Path |
|---|---|
| GET | `/financial` — relatório anual: meses, canais, alojamentos, totais, ocupação média e RevPAR |
| GET | `/expenses` — relatório anual de despesas por mês e categoria |

### `/api/backup`
| Método | Path |
|---|---|
| GET | `/export` — ZIP completo com `backup.json` + imagens referenciadas em `/uploads/` |
| POST | `/import` — importa ZIP completo e substitui todos os dados/imagens da organização atual |

---

## Módulos Funcionais (Frontend)

### Dashboard
- 4 KPIs com animação: total faturado (todas reservas não canceladas), reservas confirmadas, noites no mês, taxa de ocupação (noites ocupadas / dias×4 suites)
- Tabela das próximas 5 chegadas (ordenadas por check_in, excluindo canceladas e check-out)
- Barras de ocupação por suite no mês corrente
- Versão móvel: card de chegadas de hoje (com próximo hóspede), links rápidos para check-ins/check-outs/pagamentos pendentes
- Hero premium com ações rápidas de export/import
- Layout migrado para `css/views/dashboard.css`

### Reservas — Wizard 3 Passos

**Passo 1 — Identificação do Hóspede**
- Campo de pesquisa com autocomplete: debounce 280ms, chama `GET /api/guests?search=`, exibe dropdown com nome/email/telefone/nº reservas
- Seleção de resultado preenche todos os campos do hóspede automaticamente
- Campos: primeiro nome\*, apelido, email\*, telefone (prefixo por país)\*, país\*
- Campos adicionais: NIF, data nascimento obrigatória, local nascimento, documento (tipo + número + país emissor), morada, CP, cidade
- Datas visíveis em formato português `dd-mm-aaaa`; campos de nascimento aceitam escrita corrida (`16022015` → `16-02-2015`) e têm calendário custom minimalista/arredondado
- Validação estrangeiros (país ≠ Portugal): documento, país emissor e local nascimento obrigatórios
- Seletor de país com +60 países e indicativo telefónico

**Passo 2 — Alojamento & Datas**
- Datas check-in e check-out com calendário custom, formato visual `dd-mm-aaaa` e badge de noites calculado automaticamente
- Canal: Airbnb, Booking.com, Direto, Expedia, VRBO, Outro
- Número de hóspedes + pequeno-almoço (toggle)
- Cards visuais de suites: cor personalizada, nome, preço/noite
- **Disponibilidade em tempo real**: ao mudar datas, chama `GET /api/reservations/availability` (debounce 300ms); suites ocupadas ficam cinzentas com 🔒 e "Indisponível", não são clicáveis; se alojamento pai ocupado → todos os filhos bloqueados
- **Validação de capacidade no passo 1**: se o nº de hóspedes exceder `max_guests`, o alojamento fica bloqueado e mostra `Capacidade máxima: X hóspedes`
- Se suite selecionada ficar ocupada ao mudar datas: desseleção automática
- Hóspedes adicionais expansíveis (nome, email, telefone, país, documento, data nasc. obrigatória, NIF)
- Preços especiais por idade: se a idade calculada pela data de nascimento entrar nos limites configurados para bebé/criança, aparece aviso no formulário e o preço especial é aplicado quando esse hóspede está acima da ocupação base incluída

**Passo 3 — Confirmar & Pagamento**
- Card-resumo com dados do hóspede, alojamento (com cor), datas, total
- Estado da reserva: Confirmada / Pendente / Cancelada
- Estado de pagamento: Pendente / Confirmado / Parcial
- Campo "Valor Pago (€)": ao digitar, calcula automaticamente o payment_status
  - `pago >= total` → Confirmado
  - `0 < pago < total` → Parcial + mostra "Valor em falta: €X.XX" a vermelho
  - `pago = 0` → Pendente
- Data de pagamento
- Campo de data de pagamento usa o calendário custom e formato visual `dd-mm-aaaa`
- Método de pagamento (visível apenas quando confirmado ou parcial)
- Notas / observações
- RGPD: checkbox obrigatório (escondido em edições)
- Sidebar esquerda (oculta no móvel): lista de passos com estado (ativo/completo), resumo em tempo real (hóspede, suite, check-in, noites, total)

**Tabela de reservas (desktop)**
- Colunas: ID, Hóspede+email, Suite (chip colorido), Check-in, Check-out, Noites, Total, Canal, Estado, Pagamento+valor pago/em falta, Ações (editar, cancelar/reativar)
- Filtros: pesquisa texto livre, estado, suite, canal, pagamento, intervalo de datas com calendário custom e formato visual `dd-mm-aaaa`
- Ordenação por qualquer coluna (toggle asc/desc)
- Hero premium + painel de filtros próprio em `css/views/reservas.css`
- Contador visual de resultados para perceber rapidamente o efeito dos filtros
- Exportação XLS/PDF com botões maiores e com texto, alinhados com os botões usados em Alojamentos/Hóspedes

**Cards de reservas (móvel)**
- Filtros por chips: Todas, Confirmadas, Pendentes, Canceladas
- Card com nome, ID, suite, datas, noites, canal, badge de pagamento, valor em falta
- Ações: Ver detalhe, Editar

**Modal de detalhe**
- Todos os dados da reserva e do hóspede
- Data de pagamento (se preenchida)
- Grelha financeira: Alojamento, Taxa Turística, Pequeno-almoço, Total
- Cards adicionais: Valor Pago (verde) e Em Falta (vermelho) quando aplicável
- Hóspedes adicionais expandidos
- Estado de sincronização Google Calendar
- Botões: Fechar, Editar, Cancelar Reserva (ou Reativar se já cancelada)

### Hóspedes
- Lista com foto, nome, email, telefone, flags (⭐/👑/🚫), nº reservas, última estadia
- Pesquisa por nome, email ou telefone
- Ficha completa: dados pessoais, documento de identidade, morada, NIF, estado RGPD
- Histórico de reservas com badge de estado
- Toggle de flags favorito/VIP/indesejado diretamente na lista
- Contadores no topo: total filtrado, VIP/favoritos e hóspedes repetentes
- Shell unificado para alternar entre `Cartões` e `Lista` com melhor contexto visual

### Alojamentos
- Lista tabular com hierarquia visual:
  - Alojamento principal: fundo subtil `rgba(139,58,36,.03)`, ícone `building-2`
  - Suites filhas: recuadas com seta "↳ Nome do pai"
  - Pais com unidades filhas mostram apenas um contador estático (`X alojamentos`), sem seta/click falso
- **Tipologias**: `alojamento` (principal), `suite`, `apartamento`, `quarto`, `moradia`, `villa`
- Pesquisa e filtros na lista por nome/cidade/licença, tipologia e relação (`principal`, `associada`, `independente`)
- **Seletor de alojamento pai**: visível para todos os tipos exceto `alojamento`; lista só entidades com `type='alojamento'`
- **Campos herdados do pai** (quando `parent_id` definido):
  - Morada, código postal, localidade, região, país
  - Wi-Fi (nome e password)
  - Horários check-in/out
  - Redes sociais (Facebook, Instagram, Website)
  - No detalhe e na lista, os valores são sempre resolvidos a partir do pai no backend
  - Aparecem com `disabled`, opacidade reduzida e badge "↑ herdado"
  - Banner amarelo explica a fonte e que só se edita no alojamento principal
  - Backend recusa atualização destes campos via API se `parent_id` existir
- **Campos próprios da suite** (sempre editáveis): nome, cor, licença, preço, capacidade, quartos, casas de banho, área, descrição, Google Calendar, imagens próprias e comodidades próprias
- **Layout de detalhe**: Informação do alojamento e Layout do alojamento aparecem empilhados verticalmente
- **Ocupação extra configurável**: múltiplos extras por alojamento através de botão `+`, com tipo (`cama extra`, `sofá-cama`, `berço`, `outro`), capacidade, preço, forma de cobrança e notas; em `Outro`, o proprietário escreve o nome do extra
- Berço pode ter nota padrão como `Mediante verificação de disponibilidade prévia`
- **Preços especiais por idade**: campos para idade limite de bebé, preço bebé/noite, idade limite de criança e preço criança/noite
- Tabs: Informação | Comodidades | Imagens
- **Comodidades**: grid por categorias (Casa de banho, Quarto, Cozinha, Segurança, Outros)
  - pesquisa local dentro da lista de comodidades
  - payload distingue `own_amenities`, `inherited_amenities` e `effective_amenities`
  - comodidades herdadas do pai aparecem bloqueadas com badge `herdado`
  - a suite só grava as suas comodidades próprias; o backend faz a união lógica com as herdadas
- **Galeria**: secções personalizáveis (renomear, adicionar, remover), drag-and-drop de imagens entre secções, foto de capa separada
  - alojamentos principais têm secção especial `Áreas Comuns`
  - `Áreas Comuns` aparece em todas as suites/filhos associados em modo apenas leitura
  - imagens herdadas de `Áreas Comuns` não podem ser carregadas, apagadas, movidas ou reordenadas a partir da suite
- **Foto de capa**:
  - upload dedicado
  - pode ser definida ao arrastar uma imagem da galeria para a área da capa
  - pode ser removida individualmente
  - pode ser aberta em preview grande (lightbox)
  - a própria capa pode ser arrastada para uma secção da galeria
- **Mapa**: geocoding via OpenStreetMap Nominatim, marcador interativo Leaflet
- **Descrição** multilingue: PT, EN, FR, ES, DE, IT, NL — tabs separados
- Import/Export XLS (SheetJS) e PDF (jsPDF) da lista
- Drag-and-drop para reordenar a lista
- Calendário Google Calendar por alojamento (abre no Google Calendar ou filtro interno)
- **Serviços e Taxas** (tab separada na vista de alojamentos):
  - Tabela editável de serviços/taxas
  - Serviços built-in (pequeno-almoço, taxa turística) — tipo e nome bloqueados, valor editável
  - Serviços custom: CRUD completo
  - Auto-save com debounce 800ms
- Contadores rápidos na lista: total de unidades, principais e associadas
- Cabeçalho de detalhe mais claro para navegação, guardar e apagar sem perda de contexto
- Ao fazer refresh (`F5`) na vista de alojamentos, a app fica na lista e já não reabre automaticamente o último alojamento editado

### Calendário

**Vista mensal**
- Grid 7 colunas; cada reserva aparece como bloco colorido nos dias abrangidos
- Blocos clicáveis → abre modal de detalhe; clicar num dia vazio abre o wizard com a data pré-preenchida
- Filtros: suite, estado e canal; chips `Confirmada`/`Pendente` aplicam filtro rápido de estado
- Navegação mês anterior/seguinte + botão "Hoje"
- Vista agenda móvel por baixo do calendário (agrupa reservas por dia do mês)
- O filtro de estado **não é persistido** entre sessões — sempre começa a mostrar todas as reservas

**Vista Timeline (ano completo)**
- Renderiza os 365/366 dias do ano corrente numa única faixa scrollável horizontalmente
- Cabeçalho duplo: linha de meses + linha de dias (nome do dia oculto no zoom "Pequeno")
- Mês corrente destacado no cabeçalho com cor de marca
- Separador vertical mais espesso no dia 1 de cada mês para identificar mudança de mês
- Coluna de alojamentos fixa à esquerda (`position: sticky; left: 0`), fundo opaco para não deixar transparecer a grelha de dias
- Contador no label de cada alojamento mostra reservas **do mês corrente** (não do ano)
- Ao abrir a timeline, faz scroll automático para o dia de hoje com **2 dias do passado visíveis** à esquerda (foco no futuro)
- Zoom via toggle `Grande / Médio / Pequeno` (80 / 48 / 24 px por dia); ao fazer zoom, mantém o dia central da vista
- Botões `←` / `→` fazem scroll de 70% da largura visível; "Hoje" centra novamente no dia de hoje

**Drag & Drop na Timeline**
- Arrastar um bloco move a reserva (datas e/ou alojamento)
- Redimensionar pelas pegas laterais altera o check-in (pega esquerda) ou check-out (pega direita)
- Ghost visual segue o cursor; fica vermelho se houver conflito antes de largar
- Ao largar, abre diálogo de confirmação com resumo das alterações
- **Verificação de overbooking**: detecta outras reservas no mesmo alojamento nas novas datas → mostra aviso e bloqueia confirmação
- **Verificação de alojamento completo**: se o destino for um alojamento principal (`type = 'alojamento'`), verifica se algum dos quartos filhos (`parent_id = destino`) já tem reserva nas datas pretendidas → mostra aviso "Alojamento completo não disponível — [Quarto X] já tem reserva nestas datas" e bloqueia confirmação (só disponível o botão Cancelar)
- Sem alterações reais → clique simples abre o detalhe da reserva

### Emails Automáticos

**Templates pré-definidos:**
| Slug | Nome | Timing |
|---|---|---|
| `confirmacao` | Agradecimento pela reserva | Imediato após booking |
| `cancelamento` | Cancelamento da reserva | Imediato após cancellation |
| `apos_checkin` | Após check-in | 2h após checkin |
| `antes_checkout` | Antes do check-out | 1 dia antes do checkout |
| `obrigado` | Obrigado pela estadia | 2h após checkout |
| `coordenadas` | Envio das coordenadas | 1 dia antes do checkin |

**Scheduler** (`emailScheduler.js`):
- Quando invocado por `startScheduler()`, corre de hora em hora via `setInterval`
- Atenção: no estado atual do `server.js`, o scheduler ainda não está ligado no arranque
- Só processa templates com `timing_event` = `checkin` ou `checkout`
- Janela de envio: eventos entre agora e 8 dias no passado (para recuperar atrasos)
- `email_log` com UNIQUE(slug, reservation_id) garante que cada email é enviado no máximo uma vez

**Placeholders disponíveis nos templates:**
`{{primeiro_nome}}`, `{{nome_completo}}`, `{{alojamento}}`, `{{referencia}}`,
`{{data_checkin}}`, `{{hora_checkin}}`, `{{data_checkout}}`, `{{hora_checkout}}`,
`{{noites}}`, `{{num_hospedes}}`, `{{total}}`, `{{canal}}`,
`{{wifi_nome}}`, `{{wifi_password}}`, `{{facebook}}`, `{{instagram}}`, `{{website}}`

**Editor de templates:**
- Campos: nome, assunto, corpo HTML, timing (offset + unit + direction + event)
- Suporte a 6 línguas adicionais por template (tabs EN/FR/ES/DE/IT/NL)
- Toggle ativo/inativo
- Botão "Enviar email de teste" (envia para `EMAIL_USER`)
- Log de envios por template (últimos 20)

### Despesas
- Registo com: data, descrição, categoria, valor, método de pagamento, notas
- Categorias: alimentação, limpeza, manutenção, utilities, marketing, equipamento, outro
- Tabela editável inline
- Resumo mensal por categoria
- Hero premium + KPIs e tabela com estilo dedicado em `css/views/despesas.css`

### Autenticação, Organizações e Equipa
- Ecrã premium de autenticação com modos `Entrar`, `Criar Espaço` e `Aceitar convite`
- Signup público cria sempre uma conta `owner` e uma nova `organization`
- Login por email/password com password hashed e sessão por cookie `HttpOnly`
- Todas as rotas `/api/*` exigem sessão válida (`requireAuth`)
- Utilizadores secundários entram por convite; não escolhem o papel
- Papéis suportados: `owner`, `manager`, `staff`
- `owner` vê a área `Equipa`, convida por email, altera papéis e remove acessos
- Feedback visível no frontend para: senhas não coincidem, email não registado, senha incorreta, conta desativada, email já em uso, convite expirado

### Tema e UI
- Toggle de dark mode na topbar, persistido em `localStorage`
- Tema aplicado via `data-theme="light|dark"` em `document.documentElement`
- Light/dark mode suportado pelas novas camadas `base.css`, `layout.css`, `components.css`, `themes.css`
- Menu lateral e drawer móvel alinhados com a cor de marca no light mode (`#843424`) e com variante própria em dark mode
- Contraste reforçado em dark mode para títulos, KPIs, tabelas, inputs e ações rápidas

### Google Calendar
- OAuth2 por utilizador: abre popup → consent screen Google → callback guarda token ligado ao membro atual e à organização
- Estado: ligado/desligado com badge colorido
- Estatísticas: total reservas, nº em calendário, nº removidos; a contagem é por utilizador ligado
- Sincronização manual de reservas (`POST /api/calendar/sync-all`) cria/atualiza eventos no calendário do utilizador ligado e salta reservas já associadas a outro membro
- Automático: criação ao criar reserva, atualização ao editar, remoção ao cancelar, usando a ligação Google Calendar do utilizador que criou/ficou associado à reserva
- Tokens antigos globais em `tokens/google_token.json` não são migrados automaticamente; cada utilizador deve ligar a sua conta Google

### RGPD
- Checkbox obrigatório no passo 3 do wizard (só em criações)
- Regista: `rgpd_consent=1`, `rgpd_consent_date=now()`, `rgpd_consent_ip` no hóspede
- Documento HTML gerado com dados da reserva (para impressão/arquivo)

### Backup
- Export: `ZIP` com `backup.json`, dados da organização, equipa (`users`, `memberships`, `invitations`) e uploads referenciados pelos alojamentos
- Import: lê esse `ZIP`, substitui todos os dados da organização atual, restaura imagens e faz reload automático da página
- O import/export usa `/usr/bin/zip` e `/usr/bin/unzip`, e o backend aceita payloads até `200mb`
- Futuro pretendido: backups automáticos para o computador dos proprietários, de X em X tempo configurável, sem depender apenas do export manual

### Datas e Calendário de Inputs
- Todos os campos HTML `type="date"` são enriquecidos no frontend com um calendário custom minimalista/arredondado
- O formato mostrado ao utilizador é `dd-mm-aaaa`, adequado a Portugal
- Internamente, antes de cálculos, filtros e envio para API, as datas são normalizadas para `aaaa-mm-dd`
- Campos de nascimento aceitam escrita corrida (`ddmmaaaa`) e convertem para `dd-mm-aaaa`

### Motor Público de Reservas
- Existe uma página pública separada do backoffice onde o cliente faz a própria reserva
- Cada alojamento principal (`type = alojamento`) recebe um `public_slug` automático e um link público no formato `/reservar/:slug`
- No detalhe do alojamento principal existe o campo "Link público de reserva", com opção para copiar e pré-visualizar a página vista pelo cliente
- A página pública usa imagens do alojamento principal e das unidades/quartos associados, com galeria animada e formulário centrado
- Fluxo implementado:
  - cliente escolhe check-in, check-out e nº de hóspedes
  - sistema mostra alojamentos disponíveis e com capacidade suficiente
  - cliente escolhe a unidade/quarto disponível
  - cálculo automático de preço base, ocupação extra, bebé/criança, pequeno-almoço e taxa turística
  - cliente preenche dados próprios e dos restantes hóspedes
  - cliente aceita RGPD/regras
  - reserva entra no backoffice como `pendente`
- Como ainda não há pagamento online/sinal obrigatório, as reservas públicas entram sempre como `pendente`, para validação manual antes de confirmar
- Após criação é gerado um `public_token` aleatório e seguro para o cliente poder voltar mais tarde à reserva
- Link posterior possível: `/reserva/:token`
- Endpoints públicos implementados:
  - `GET /api/public/booking/:slug`
  - `GET /api/public/booking/:slug/availability`
  - `POST /api/public/booking/:slug/reservations`
- Ainda por implementar numa fase seguinte: página do token para editar dados permitidos após a reserva pública estar criada
- Campos editáveis pelo cliente no link posterior devem ser limitados:
  - dados pessoais
  - dados dos hóspedes
  - hora prevista de chegada
  - notas/pedidos especiais
- Alterações sensíveis como datas, alojamento ou nº de hóspedes devem voltar a colocar a reserva em `pendente` ou exigir aprovação no backoffice
- Nunca expor o ID legível da reserva como credencial de acesso; usar token longo, aleatório, revogável e, se fizer sentido, com expiração

### Futuro — Integração com Website Externo
- O website público atual tem botão `Reservar já`; há três opções para ligar ao motor de reservas:
- **Redirect**: botão aponta para a página pública da plataforma, por exemplo `https://app.santapaciencia.xyz/reservar`
  - Opção mais simples, segura e fácil de manter
  - A lógica de disponibilidade, preços e RGPD fica toda num só sítio
- **Iframe/embed**: website mostra uma versão embebida do formulário, por exemplo `<iframe src="https://app.santapaciencia.xyz/reservar/embed">`
  - Mantém a sensação de que o cliente continua no website
  - Exige cuidado com responsividade, altura do iframe, headers de segurança e eventual pagamento/cookies no futuro
- **Formulário nativo no website externo + API pública**:
  - Website externo implementa o formulário e comunica com endpoints públicos da plataforma
  - Mais flexível visualmente, mas mais complexo
  - Exige CORS, rate limiting, validação forte, proteção anti-spam e manutenção duplicada sempre que campos/regras mudarem
- Recomendação inicial: começar por redirect ou iframe/embed; deixar formulário nativo via API para uma fase posterior
- Para redirect a partir do website externo, cada botão "Reservar já" pode apontar para o link público do alojamento principal correspondente, por exemplo `https://app.santapaciencia.xyz/reservar/santa-paciencia`

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
- `.sidebar`: navegação vertical premium com hover states e item ativo destacado
- `.sb-collapsed`: sidebar reduz para 56px (só ícones)
- `@media (max-width: 600px)`: sidebar esconde; aparece navegação móvel / drawer

### Componentes Principais
- **Cards** (`.card`): superfícies translúcidas, sombras suaves, radius maior
- **Badges** (`.badge`): cores por estado — `badge-confirmada`, `badge-pendente`, `badge-cancelada`, `badge-pago`/`badge-confirmado`, `badge-parcial`, `badge-pendpag`
- **Botões** (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-sm`)
- **Formulários** (`.form-control`, `.form-grid`, `.form-group`, `.form-label`, `.req-star`)
- **Theme Toggle** (`.theme-toggle`): troca light/dark mode com persistência
- **Toast** (`.toast`): notificações temporárias (3.5s) no canto inferior direito
- **Modais**: `.modal-bg` overlay + `.modal` centralizado; `.modal-wizard` é flex-row (sidebar esquerda + conteúdo direito)

### Modal Wizard
```
.modal-wizard {
  display: flex; flex-direction: row;
  max-width: 980px; width: 96vw; max-height: 88vh;
  overflow: hidden;
}
.wizard-side { width: 230px; /* lista de passos + resumo */ }
.wizard-main { flex: 1; display: flex; flex-direction: column; }
```
No móvel (`max-width: 600px`): `.wizard-side` é escondida; layout em coluna.

### Suite Cards (wizard passo 2)
```
.suite-card-opt          — card normal (clicável)
.suite-card-opt.selected — borda e fundo da cor da marca
.suite-card-opt.unavailable — opacidade .5, cursor not-allowed, grayscale, não clicável
.suite-card-unavail-lbl  — "Indisponível" em vermelho
```

---

## Variáveis de Ambiente (`.env`)

```env
PORT=3001
NODE_ENV=production
DB_PATH=/app/data/santapaciencia.db
FRONTEND_PATH=/app/frontend

# Email (SMTP)
EMAIL_ENABLED=true
EMAIL_HOST=smtp.exemplo.com
EMAIL_PORT=587
EMAIL_USER=reservas@santapaciencia.xyz
EMAIL_PASS=password
EMAIL_FROM="Santa Paciência <reservas@santapaciencia.xyz>"

# Google Calendar OAuth2
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://santapaciencia.xyz/auth/google/callback

# Propriedade
PROPERTY_NAME=Santa Paciência
LICENSE_NUMBER=12345/AL
```

---

## Revisão de Código — Estado e Melhorias

### O que Está Bom
- O domínio funcional está bem separado no backend: rotas finas, controllers por área e services para autenticação, organizações, calendário, email e RGPD.
- Regras de datas/preços/pagamento de reservas começaram a ser centralizadas em `backend/src/services/reservationRules.js`, usado pelo backoffice e pelo motor público.
- Regras puras de disponibilidade/hierarquia começaram a ser centralizadas em `backend/src/services/availabilityRules.js`, com testes de parent/child e back-to-back.
- No frontend, `frontend/js/domain/dates.js` e `frontend/js/domain/pricing.js` começaram a substituir lógica duplicada entre reservas e página pública.
- O frontend já tem `AppUI.enhanceSelect()` para transformar selects normais em dropdowns pesquisáveis com o visual da página pública, mantendo o `<select>` como fonte de verdade.
- O SQLite com migrations não-destrutivas torna a app simples de instalar e manter, especialmente para uma operação pequena/média.
- A regra de disponibilidade está no backend, não só no frontend. Isto é correto: o frontend ajuda, mas quem decide conflitos é a API.
- A autenticação por organização já prepara o produto para multi-tenant, convites e papéis de equipa.
- O frontend, apesar de vanilla, está organizado por áreas (`reservas`, `alojamentos`, `calendario`, etc.), o que facilita migração gradual.
- O CSS começou a sair do ficheiro monolítico para camadas (`base`, `layout`, `components`, `themes`, `views`), que é o caminho certo.

### Bugs / Riscos Encontrados
- `emailScheduler.js` não está ligado no `server.js`; emails agendados podem nunca ser enviados automaticamente.
- `frontend/api.js` existe como wrapper, mas a SPA usa sobretudo helpers em `frontend/js/helpers.js`; isto cria duas fontes possíveis para o mesmo padrão de fetch.
- Há muitos `onclick` inline no `index.html`. Funciona, mas dificulta reutilização, testes e cleanup de listeners.
- Existem credenciais reais no `.env` local. Não devem ser commitadas nem partilhadas; se já foram expostas, devem ser rodadas.

### Segmentação Recomendada no Frontend
- Criar `frontend/js/ui/` para componentes reutilizáveis em vanilla:
  - `buttons.js`: helpers para botões com ícone, estados `loading/disabled`, classes base.
  - `modal.js`: abrir/fechar modal, backdrop, escape key, foco inicial.
  - `form.js`: leitura/normalização de campos, erros por campo, validações comuns.
  - `date-picker.js`: calendário custom usado em reservas e página pública.
  - `dropdown.js`: dropdown pesquisável usado em países, indicativos e documentos.
  - `table.js`: ordenação, empty state, ações e render de linhas.
  - `cards.js`: badges, chips de alojamento, estados de reserva/pagamento.
- Criar `frontend/js/domain/` para regras puras:
  - `pricing.js`: noites, taxas, pequeno-almoço, bebé/criança, ocupação extra.
  - `availability.js`: overlap de datas, hierarquia pai/filhos, bloqueios.
  - `dates.js`: `dd-mm-aaaa` ↔ `yyyy-mm-dd`, idade, formatação PT.
  - `guests.js`: nome completo, documento obrigatório para estrangeiros, telefone.
- Deixar os ficheiros de views (`reservas.js`, `alojamentos.js`, `public-reservation.js`) como orquestradores: carregam dados, chamam helpers e renderizam blocos, mas não devem concentrar todas as regras.

### Reutilização de UI / CSS
- Consolidar botões em `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-sm`, `.btn-icon`; evitar novos estilos ad hoc por view.
- Consolidar animações em 4 tokens: `viewFadeIn`, `softIn`, `slideUpSmooth`, `spinSmooth`. Hoje há animações repetidas em `styles.css`, `components.css`, `operations.css` e `public-reservation.css`.
- Usar tokens para raios e sombras: `--radius-sm`, `--radius-md`, `--radius-lg`, `--shadow-soft`, `--shadow-card`; reduzir `border-radius` solto em dezenas de valores.
- Mover padrões comuns de cards/listas para `components.css`; deixar `views/*.css` só com layout específico daquela vista.
- Evitar estilos inline no HTML para botões, ícones e displays; preferir classes reutilizáveis e atributos `hidden`.

### Segmentação Recomendada no Backend
- Extrair regras de reserva para `services/reservationRules.js`: conflitos, hierarquia, cálculo de total, status de pagamento.
- Extrair upload/imagens para `services/imageService.js`: base64, limite de tamanho, extensão, apagar ficheiro, mover entre secções.
- Extrair validação para `services/validators.js` ou middleware por rota: email, datas, roles, IDs, payloads de alojamento/reserva.
- Separar queries longas para pequenos repositórios (`repositories/reservationsRepo.js`, `accommodationsRepo.js`) se os controllers continuarem a crescer.
- Uniformizar resposta da API: todos os endpoints devem devolver `{ success, data, error }` de forma consistente.

### Prioridades Práticas
1. Decidir se emails agendados devem correr; se sim, ligar `startScheduler()` no `server.js`.
2. Continuar a trocar chamadas locais para `ReservationDates` e `ReservationPricing` até remover as funções duplicadas antigas.
3. Continuar a trocar modais simples para `AppUI.openModal()` / `AppUI.closeModal()`.
4. Consolidar `.btn` e animações em `components.css`, reduzindo duplicação em `styles.css`.
5. Alargar testes para disponibilidade/hierarquia pai-filhos antes de refatorar ficheiros grandes.

---

## Pontos de Atenção Técnica

1. **IDs de reservas**: formato `SP-{Date.now()}` — legíveis mas podem colidir em criações simultâneas muito rápidas. Para produção com volume alto considerar UUID.

2. **IDs de alojamentos**: gerados do nome (slug) + 4 dígitos do timestamp. Se o nome for alterado, o ID mantém-se (correto, mas pode causar confusão).

3. **Imagens em base64**: as fotos são enviadas do frontend para o backend em base64 e guardadas como ficheiros. Ficheiros grandes (>5MB) são rejeitados. Em volume alto, considerar S3 ou similar.

4. **Email scheduler**: o módulo existe e usa `setInterval(60min)`, mas no estado atual não está ligado no `server.js`. Se for ativado, continuará a não ter fila persistente: se o email falhar, o `email_log` não regista o envio e tentará de novo no ciclo seguinte (desde que a janela de envio ainda cubra a reserva).

5. **CORS**: configurado para `localhost`, `ngrok`, `trycloudflare.com` e `santapaciencia.xyz`. Adicionar novos domínios em `app.js` no array `allowed`.

6. **Autenticação**: já existe login por sessão, signup de `owner`, convites e roles, mas ainda faltam extras como rate limiting de login, recuperação de password e auditoria de acessos.

7. **Multi-tenant**: o isolamento é lógico por `organization_id`, não por base de dados física separada. É muito mais simples de manter, mas exige disciplina para que novas queries filtrem sempre pela organização atual.

8. **Campos herdados**: a proteção é implementada no backend (`inh()` no `update()`), mas depende de `parent_id` estar correto na BD. Se `parent_id` for manualmente removido da BD, os campos voltam a ser editáveis via API sem atualizar os valores herdados.

---

## O que Ainda Não Está Implementado

- **Recuperação de password** — ainda não existe fluxo de reset
- **Rate limiting / brute-force protection** no login
- **Faturação** — geração de PDF de fatura/recibo por reserva
- **Envio manual de email** a partir de uma reserva específica
- **Notas internas por hóspede** (separadas das notas de reserva)
- **Integração com canais** (Airbnb/Booking via API iCal ou API oficial)
- **Notificações push** (PWA Service Worker) para chegadas do dia
- **Preços dinâmicos** por época, dia da semana ou período mínimo de estadia
- **Ficha SEF/AIMA** — geração automática do relatório de hóspedes estrangeiros
- **Backups automáticos locais** — export periódico para o PC dos proprietários, com intervalo configurável
- **Portal/link público da reserva** — token seguro para o cliente editar dados permitidos após criar a reserva
- **Integração com website externo** — decidir entre redirect, iframe/embed ou formulário nativo via API pública
- **PWA** — o frontend é responsivo mas não é instalável como app
- **Testes automatizados** — sem testes unitários ou de integração
- **Auditoria/histórico** — sem log de quem alterou o quê e quando
