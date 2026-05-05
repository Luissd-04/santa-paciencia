# Santa Paciência — Documentação Técnica Completa

> Gerado em 2026-05-04. Atualizar sempre que houver alterações estruturais significativas.

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
Ícones via **Lucide** (CDN). Bibliotecas opcionais para export: **SheetJS (XLSX)** e **jsPDF** (CDN).

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
    │   ├── emailScheduler.js   Scheduler: corre a cada 30min, envia emails automáticos
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
    ├── emails.js           ~455 linhas — templates, editor, log, envio de teste
    └── team.js             convites, listagem de membros, gestão de papéis
```

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
| GET | `/` |
| GET | `/:slug` |
| PUT | `/:slug` |
| DELETE | `/:slug` |
| POST | `/:slug/test` — envia email de teste para EMAIL_USER |

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
| PATCH | `/members/:id/role` — owner altera papel |
| DELETE | `/members/:id` — owner remove membro |

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
- Campos adicionais: NIF, data nascimento, local nascimento, documento (tipo + número + país emissor), morada, CP, cidade
- Validação estrangeiros (país ≠ Portugal): documento, país emissor, data nascimento e local nascimento obrigatórios
- Seletor de país com +60 países e indicativo telefónico

**Passo 2 — Alojamento & Datas**
- Datas check-in e check-out com badge de noites calculado automaticamente
- Canal: Airbnb, Booking.com, Direto, Expedia, VRBO, Outro
- Número de hóspedes + pequeno-almoço (toggle)
- Cards visuais de suites: cor personalizada, nome, preço/noite
- **Disponibilidade em tempo real**: ao mudar datas, chama `GET /api/reservations/availability` (debounce 300ms); suites ocupadas ficam cinzentas com 🔒 e "Indisponível", não são clicáveis; se alojamento pai ocupado → todos os filhos bloqueados
- Se suite selecionada ficar ocupada ao mudar datas: desseleção automática
- Hóspedes adicionais expansíveis (nome, email, telefone, país, documento, data nasc., NIF)

**Passo 3 — Confirmar & Pagamento**
- Card-resumo com dados do hóspede, alojamento (com cor), datas, total
- Estado da reserva: Confirmada / Pendente / Cancelada
- Estado de pagamento: Pendente / Confirmado / Parcial
- Campo "Valor Pago (€)": ao digitar, calcula automaticamente o payment_status
  - `pago >= total` → Confirmado
  - `0 < pago < total` → Parcial + mostra "Valor em falta: €X.XX" a vermelho
  - `pago = 0` → Pendente
- Data de pagamento
- Método de pagamento (visível apenas quando confirmado ou parcial)
- Notas / observações
- RGPD: checkbox obrigatório (escondido em edições)
- Sidebar esquerda (oculta no móvel): lista de passos com estado (ativo/completo), resumo em tempo real (hóspede, suite, check-in, noites, total)

**Tabela de reservas (desktop)**
- Colunas: ID, Hóspede+email, Suite (chip colorido), Check-in, Check-out, Noites, Total, Canal, Estado, Pagamento+valor pago/em falta, Ações (editar, cancelar/reativar)
- Filtros: pesquisa texto livre, estado, suite, canal, pagamento, intervalo de datas
- Ordenação por qualquer coluna (toggle asc/desc)
- Hero premium + painel de filtros próprio em `css/views/reservas.css`
- Contador visual de resultados para perceber rapidamente o efeito dos filtros

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
  - Pais com unidades filhas podem ser recolhidos/expandidos diretamente na lista
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

### Calendário
- Vista mensal com grid 7 colunas
- Cada reserva: bloco colorido com nome do hóspede, visível nas células dos dias abrangidos
- Blocos clicáveis → abre modal de detalhe
- Filtro por suite
- Navegação mês anterior/seguinte
- Toolbar operacional consistente com navegação, filtro e alternância `Calendário/Timeline`
- Card principal de contexto para o período visível
- Filtros adicionais por estado e canal
- Timeline com janela ajustável `7 / 14 / 30 dias`
- Destaques visuais para `hoje`, `check-ins` e `check-outs`
- Blocos da timeline mais informativos: estado, intervalo e noites
- Coluna fixa de alojamentos com contexto da tipologia e nº de reservas visíveis
- Chips interativos no topo:
  - `Confirmada` / `Pendente` aplicam filtro rápido de estado
  - `Check-in` / `Check-out` ligam ou desligam os marcadores visuais correspondentes
- Em janelas curtas (`7` e `14` dias), a timeline alarga as colunas para ocupar melhor a largura disponível

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
- Corre a cada 30 minutos via `setInterval` em `server.js`
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
- OAuth2: abre popup → consent screen Google → callback guarda token
- Estado: ligado/desligado com badge colorido
- Estatísticas: total reservas, nº em calendário, nº removidos
- Sincronização manual de todas as reservas (`POST /api/calendar/sync-all`)
- Automático: criação ao criar reserva, atualização ao editar, remoção ao cancelar

### RGPD
- Checkbox obrigatório no passo 3 do wizard (só em criações)
- Regista: `rgpd_consent=1`, `rgpd_consent_date=now()`, `rgpd_consent_ip` no hóspede
- Documento HTML gerado com dados da reserva (para impressão/arquivo)

### Backup
- Export: `ZIP` com `backup.json`, dados da organização, equipa (`users`, `memberships`, `invitations`) e uploads referenciados pelos alojamentos
- Import: lê esse `ZIP`, substitui todos os dados da organização atual, restaura imagens e faz reload automático da página
- O import/export usa `/usr/bin/zip` e `/usr/bin/unzip`, e o backend aceita payloads até `200mb`

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

## Pontos de Atenção Técnica

1. **IDs de reservas**: formato `SP-{Date.now()}` — legíveis mas podem colidir em criações simultâneas muito rápidas. Para produção com volume alto considerar UUID.

2. **IDs de alojamentos**: gerados do nome (slug) + 4 dígitos do timestamp. Se o nome for alterado, o ID mantém-se (correto, mas pode causar confusão).

3. **Imagens em base64**: as fotos são enviadas do frontend para o backend em base64 e guardadas como ficheiros. Ficheiros grandes (>5MB) são rejeitados. Em volume alto, considerar S3 ou similar.

4. **Email scheduler**: corre em memória com `setInterval(30min)`. Se o processo reiniciar, o próximo ciclo ocorre 30min depois. Não há fila persistente — se o email falhar, o `email_log` não regista o envio e tentará de novo no ciclo seguinte (desde que a janela de 8 dias ainda cubra a reserva).

5. **CORS**: configurado para `localhost`, `ngrok`, `trycloudflare.com` e `santapaciencia.xyz`. Adicionar novos domínios em `app.js` no array `allowed`.

6. **Autenticação**: já existe login por sessão, signup de `owner`, convites e roles, mas ainda faltam extras como rate limiting de login, recuperação de password e auditoria de acessos.

7. **Multi-tenant**: o isolamento é lógico por `organization_id`, não por base de dados física separada. É muito mais simples de manter, mas exige disciplina para que novas queries filtrem sempre pela organização atual.

8. **Campos herdados**: a proteção é implementada no backend (`inh()` no `update()`), mas depende de `parent_id` estar correto na BD. Se `parent_id` for manualmente removido da BD, os campos voltam a ser editáveis via API sem atualizar os valores herdados.

---

## O que Ainda Não Está Implementado

- **Recuperação de password** — ainda não existe fluxo de reset
- **Rate limiting / brute-force protection** no login
- **Faturação** — geração de PDF de fatura/recibo por reserva
- **Relatórios financeiros** — gráficos de receita mensal, ocupação histórica, receita por canal/suite
- **Envio manual de email** a partir de uma reserva específica
- **Notas internas por hóspede** (separadas das notas de reserva)
- **Integração com canais** (Airbnb/Booking via API iCal ou API oficial)
- **Notificações push** (PWA Service Worker) para chegadas do dia
- **Preços dinâmicos** por época, dia da semana ou período mínimo de estadia
- **Ficha SEF/AIMA** — geração automática do relatório de hóspedes estrangeiros
- **PWA** — o frontend é responsivo mas não é instalável como app
- **Testes automatizados** — sem testes unitários ou de integração
- **Auditoria/histórico** — sem log de quem alterou o quê e quando
