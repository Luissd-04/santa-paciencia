# Melhorias de Código — Lista Viva

> Atualizado em 2026-06-01 (sessão 3). Itens marcados ✅ foram resolvidos; ⚠️ parcialmente; 🔴 ainda pendente.

---

## ✅ Resolvido

- **DocumentFragment em loops**: `app.js` e `precos.js` já usam DocumentFragment/map+join em vez de `innerHTML +=`.
- **Regras de negócio no backend**: `reservationRules.js` + `availabilityRules.js` centralizam cálculos, disponibilidade e hierarquia.
- **Domínio no frontend**: `domain/dates.js` e `domain/pricing.js` evitam duplicação entre backoffice e motor público.
- **`AppUI.enhanceSelect`**: dropdowns pesquisáveis uniformes em toda a app.
- **`AppUI.setButtonLoading`**: estados de loading centralizados.
- **Preços dinâmicos implementados**: tabela `pricing_periods`, calendário visual, CRUD e aplicação noite a noite.
- **Vouchers implementados**: tabela `vouchers`, CRUD no backoffice, campo no wizard, verificação inline.
- **Voucher modal inline style**: `#voucher-modal-bg` tinha `style="display:none;"` que bloqueava `AppUI.openModal`. Removido.
- **Bug `initPrecos()` corrigido**: range state resetado ao entrar na vista.
- **`require('uuid')` dentro de função**: movido para o topo de `accommodationController.js`.
- **Shadow de variável `guest`**: renomeada para `guestRecord` em `reservationController.js`.
- **Campos obrigatórios no backoffice**: wizard só exige datas + nome do hóspede; restantes são opcionais.
- **Tarefas operacionais — lista vazia**: filtro padrão era `'upcoming'` (ocultava tarefas passadas); corrigido para `''`.
- **Tarefas operacionais — `google_event_id` resetado**: `syncReservationTx` apagava tarefas já sincronizadas; corrigido com `AND google_event_id IS NULL` no DELETE.
- **Tarefas operacionais — sync live**: `syncReservationTasksToCalendar()` chamado após criar/atualizar reserva em `reservationController.js`.
- **Iniciais no calendário de eventos**: helper `accInitials()` + pills e blocos de timeline mostram iniciais do alojamento.
- **Filtros de tipo por chips**: lista e calendário de eventos têm chips coloridos por tipo; `eventosTypeFilters` (Set) partilhado entre vistas.
- **Favicon**: `<link rel="icon">` adicionado a `index.html` e `public-reservation.html`; aponta para `frontend/favicon.png`.

### ✅ Resolvido (Segurança — 2026-06-01, sessão 1)

- **Helmet**: headers HTTP de segurança (`X-Frame-Options`, `X-Content-Type-Options`, etc.) via `helmet` em `app.js`.
- **CORS restrito por ambiente**: em `NODE_ENV=production` só aceita `santapaciencia.xyz`; em dev aceita localhost e túneis ngrok/cloudflare.
- **Body limit global reduzido para 1mb**: o limite de 200mb foi retirado do middleware global; rotas de upload usam `express.json({ limit: '15mb' })` e o backup usa `express.json({ limit: '100mb' })`.
- **Rate limiting em `/auth/login`**: `express-rate-limit` — 10 tentativas por IP em 15 min. Instalado em `package.json`.
- **Rate limiting em `/auth/forgot-password`**: 5 pedidos por IP por hora.
- **Rate limiting em endpoints públicos**: reserva pública (20/hora), validação de voucher (30/hora).
- **Registo público desativado (invite-only)**: `POST /auth/register` responde 403. Acesso só por convite.
- **Race condition no voucher corrigida**: validação + `UPDATE status='used'` + INSERT da reserva correm numa única `db.transaction()`. Segundo pedido simultâneo recebe HTTP 409.
- **ID de reserva sem colisão**: `SP-${Date.now()}` substituído por `SP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`.
- **XSS em `precos.js`**: `p.name` e `a.name` agora passam por `escapeHtml()` em todos os pontos de `innerHTML`.
- **XSS em `reserva-lista.js`**: `g.name`, `g.email`, `g.phone`, `g.nationality` e `r.notes` agora escapados.
- **XSS em `hospedes.js`**: nome, email, telefone, país, morada, NIF, número de documento agora escapados em lista e modal de detalhe.
- **Validação MIME real nos uploads**: `parseImageDataUri()` usa allowlist estrita (`jpeg/png/gif/webp/avif`); qualquer outro tipo retorna 400.
- **Enumeração de email no login**: resposta genérica "Credenciais inválidas." (HTTP 401) para email não encontrado, conta desativada e password errada.
- **Side effect removido do GET `/notifications`**: `syncOrganizationOperationalTasks()` retirado do handler GET; o sync corre via `POST /api/events/sync`.

### ✅ Resolvido (Qualidade — 2026-06-01, sessão 2)

- **`payment_method` clearing**: `payment_method !== undefined ? (payment_method || null) : existing` corrige a impossibilidade de apagar o método em `reservationController.js`.
- **`completed_at` overwrite**: `existing.completed_at || new Date().toISOString()` preserva a data original em `eventController.js`.
- **JOIN voucher com filtro de org**: `LEFT JOIN accommodations a ON a.id = v.accommodation_id AND a.organization_id = v.organization_id` em ambas as queries de `voucherController.js`.
- **Validação de formato de código de voucher público**: regex `^[A-Z0-9]{3,20}$` em `publicBookingController.js` antes de processar.
- **Session ID rotation**: `createSession(userId, orgId, oldSessionId)` elimina a sessão anterior ao fazer switch-org, emitindo um novo ID.
- **`escapeHtml` movido para `helpers.js`**: removido de `eventos.js`, adicionado a `helpers.js`; chamado em todos os pontos de `innerHTML` com dados do utilizador.
- **Índice em `pricing_periods`**: `CREATE INDEX IF NOT EXISTS idx_pricing_periods_acc ON pricing_periods (accommodation_id, organization_id)` em `database.js`.
- **`getById` com filtro SQL direto**: `getResolvedAccommodationById(orgId, id)` substitui fetch-all + find em `accommodationController.js`.
- **RGPD usa dados da organização**: `rgpdService.generateRgpdDocument(guest, reservation, orgId)` lê nome/email da organização via DB; `emailService.getEmailSettings` também lê `property_name`, `property_address`, `license_number`, `email_contact` de `organization_settings` com fallback para `.env`.
- **`public_token` expira após checkout**: `getPreCheckin` e `submitPreCheckin` retornam HTTP 410 se `check_out` já passou.
- **Password com complexidade mínima**: `validatePassword` em `authService.js` exige ≥ 8 caracteres + 1 maiúscula + 1 número; validação espelhada no frontend (`auth.js`).
- **Cache `pricing_periods` invalidada ao guardar**: `invalidateWizPricingCache(alojId)` em `reserva-wizard.js`; chamada em todos os pontos de sucesso de criar/editar/eliminar período em `precos.js`.
- **Throttle no hover do calendário de preços**: `handlePrecosDayHover` usa `requestAnimationFrame` para batchear renders consecutivos.
- **Event listener `_precosHandleOutsideClick` sem duplicação**: flag de módulo `_precosOutsideListenerAttached` substitui propriedade no elemento DOM (que era falível quando o elemento não existia).

---

## 🔴 Pendente — Segurança (revisão adversarial 2026-06-01)

> Avaliados do ponto de vista de um atacante: reservas falsas, acesso a dados de clientes, e perturbação da operação.

### S1. XSS via HTML de emails no backoffice *(crítico)*
`frontend/js/invoice.js:372` insere `m.body` diretamente no DOM sem sanitização.
`backend/src/routes/auth.js:590` aceita e prefere `text/html` vindo do Gmail.
Um email malicioso enviado para a caixa da quinta pode correr JavaScript no backoffice quando o utilizador abre a conversa.
**Fix**: sanitizar com `DOMPurify.sanitize(m.body)` antes de inserir no DOM; ou renderizar o email em `<iframe sandbox>` sem `allow-scripts`.

### S2. Token de pré-checkin expõe PII sem expiração curta *(crítico)*
`backend/src/controllers/publicBookingController.js:391` devolve nome, email, telefone, data de nascimento e documentos apenas com o `public_token`.
O token é forte mas não tem expiração curta pré-checkout (só expira após checkout), não é revogável individualmente, e não há confirmação extra.
Se o link for partilhado, reencaminhado ou vazar de um email, quem o tiver acede a todos os dados pessoais do hóspede.
**Fix**: token separado para pré-checkin com TTL de 7 dias (ou até check-in), armazenado em coluna própria, invalidado após submissão; pedir confirmação extra (ex: apelido ou data de chegada) antes de mostrar dados.

### S3. Reservas falsas bloqueam disponibilidade *(crítico)*
`backend/src/routes/publicBooking.js:8` cria reservas com estado `pending` sem verificação de email, CAPTCHA, ou depósito.
O rate limit de 20/hora por IP limita, mas IPs rotativos contornam-no.
Reservas `pending` contam como conflito de datas — um atacante pode bloquear um fim-de-semana inteiro sem pagar nada.
**Fix**: (a) expiração automática de reservas `pending` após X horas (cron job ou trigger); (b) bloquear calendário só após confirmação/depósito; (c) adicionar CAPTCHA/Cloudflare Turnstile no formulário público.

### S4. Content Security Policy desligada *(alto)*
`backend/src/app.js:30` tem `contentSecurityPolicy: false` — isto aumenta muito o impacto de qualquer XSS, porque o browser não bloqueia execução de scripts inline ou externos.
A razão são os `onclick` inline no HTML.
**Fix por fases**: (1) migrar `onclick` inline para `addEventListener`; (2) ativar CSP em modo `report-only` para detetar violações sem bloquear; (3) ativar bloqueio total.

### S5. OAuth Google sem parâmetro `state` *(alto)*
`backend/src/routes/auth.js:352` e `:397` iniciam fluxo OAuth sem gerar/validar `state`.
Sem `state`, é possível um ataque CSRF OAuth: induzir um utilizador autenticado a ligar a conta Google de um atacante.
**Fix**: gerar `crypto.randomBytes(16).toString('hex')` por sessão, guardar em `req.session.oauthState`, validar no callback antes de processar.

### S6. `innerHTML` não escapado em zonas públicas e de hóspedes *(médio)*
`frontend/js/public-reservation.js:380` e `frontend/js/hospedes.js:236` têm dados de utilizador inseridos via `innerHTML` sem `escapeHtml()`.
Outras zonas já usam `escapeHtml` — a aplicação não é uniforme.
**Fix**: auditar todos os pontos de `innerHTML` com dados externos; aplicar `escapeHtml()` sistematicamente ou usar `textContent` onde não é necessário HTML.

### S7. Relatórios acessíveis a qualquer utilizador autenticado *(baixo)*
`backend/src/routes/reports.js:5` não tem `requireRole`. Como `/api` já exige login, qualquer membro da organização pode ver dados financeiros e de ocupação.
Para uma equipa pequena pode estar ok, mas é risco se houver colaboradores com acesso limitado.
**Fix**: adicionar `requireRole('manager')` ou `requireRole('owner')` nas rotas de relatórios.

### S8. Import de backup sem validação de ZIP entries *(baixo — só owner)*
`backend/src/routes/backup.js:238` extrai o ZIP sem verificar path traversal nos nomes dos ficheiros.
`backup.js:269` usa colunas vindas do JSON importado diretamente em SQL.
É só acessível ao owner, mas um ZIP malicioso poderia sobrescrever ficheiros ou injetar dados.
**Fix**: rejeitar entries com `../` no nome; validar schema e lista de colunas permitidas por tabela antes de inserir.

---

## 🔴 Pendente — Alta Prioridade

### 1. Email scheduler não ligado *(aguarda trabalho futuro)*
`emailScheduler.js` existe mas `server.js` nunca chama `startScheduler()`.
Emails imediatos funcionam; emails agendados (check-in/check-out/obrigado) nunca são enviados automaticamente.
**Fix**: `const { startScheduler } = require('./services/emailScheduler'); startScheduler();` em `server.js`.

---

## ⚠️ Pendente — Baixa Prioridade / Organização

### 2. `api.js` duplica padrão de `helpers.js`
`frontend/api.js` existe mas a SPA usa `apiGet`/`apiPost`/etc. de `helpers.js`.
**Fix**: unificar num único módulo.

### 3. `onclick` inline no `index.html`
Centenas de `onclick="..."` dificultam testes e linting.
**Fix de longo prazo**: event delegation via `data-action` + listener centralizado.

### 4. Validações espalhadas sem schema central
Cada form valida à sua maneira; inconsistências entre backoffice e wizard.
**Fix**: `frontend/js/domain/validators.js` com `validate(obj, schema)`.

### 5. Funções render grandes não decompostas
`renderMobileCards`, `renderCalView` e similares têm 60-100 linhas.
**Fix**: extrair sub-funções por responsabilidade.

### 6. Credenciais em `.env` local
Se o `.env` foi partilhado ou commitado por engano, as credenciais SMTP e Google OAuth devem ser rodadas.

---

## Checklist Rápido

| Item | Estado | Impacto |
|---|---|---|
| **S1. XSS em emails (invoice.js:372)** | 🔴 | Crítico — XSS no backoffice via email malicioso |
| **S2. Token pré-checkin expõe PII** | 🔴 | Crítico — link vaza todos os dados do hóspede |
| **S3. Reservas falsas bloqueiam datas** | 🔴 | Crítico — sem CAPTCHA/expiração de pending |
| **S4. CSP desligada (app.js:30)** | 🔴 | Alto — amplifica qualquer XSS |
| **S5. OAuth sem state (auth.js:352)** | 🔴 | Alto — CSRF OAuth possível |
| **S6. innerHTML não escapado (zonas públicas)** | 🔴 | Médio — inconsistente com resto da app |
| **S7. Relatórios sem requireRole** | ⚠️ | Baixo — ok para equipa pequena |
| **S8. Backup ZIP sem validação** | ⚠️ | Baixo — só owner, mas risco real |
| Email scheduler ligar | 🔴 *(futuro)* | Alto — emails agendados não funcionam |
| api.js duplicação | ⚠️ | Baixo — cosmético |
| onclick inline HTML | ⚠️ | Baixo — debt longo prazo |
| Validações sem schema | ⚠️ | Médio — consistência |
| Render funções grandes | ⚠️ | Baixo — manutenibilidade |
| Credenciais .env | ⚠️ | Risco se partilhado |
