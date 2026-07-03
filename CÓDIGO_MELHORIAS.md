# Melhorias de Código — Lista Viva

> Atualizado em 2026-06-11 (sessão 9 — anti-bot + CSP + autocomplete). Itens marcados ✅ foram resolvidos; ⚠️ parcialmente; 🔴 ainda pendente.

> A revisão 2026-06-09 cobriu todo o `backend/src/` e os ficheiros mais expostos do `frontend/`, com foco em XSS, isolamento multi-tenant, race conditions, gestão de tokens OAuth, cadeia de suprimentos (CDN) e bugs funcionais latentes.

---

## ✅ Resolvido (sessão 9 — 2026-06-11)

- **Honeypot anti-bot**: campo `pb-hp` escondido com CSS off-screen no `public-reservation.html`. Backend rejeita se preenchido com mensagem genérica que não revela qual camada falhou.
- **Timing check anti-bot**: frontend grava `state.pageLoadedAt`; payload envia `elapsed_ms`; backend rejeita submits com menos de 8s (`MIN_FORM_FILL_MS = 8000`).
- **S4 — Content Security Policy** (pragmática): `helmet.contentSecurityPolicy` activa com restrições reais — `script-src/style-src` mantêm `'unsafe-inline'` (necessário para os 229 onclick), mas todas as outras camadas estão restringidas: scripts apenas de self + CDNs específicas (unpkg, jsdelivr, cdnjs, challenges.cloudflare.com); frames só Turnstile; `connect-src` apenas self + Turnstile; `form-action: 'self'`; `base-uri: 'self'`; `object-src: 'none'`; `upgrade-insecure-requests` em produção.
- **Autocomplete=off generalizado**: 138 inputs (102 HTML + 36 JS-generated) marcados com `autocomplete="off"`. Resolve sugestões erradas do macOS Keychain em campos de data, pesquisa, filtros, formulários de hóspede.

## ✅ Resolvido (sessão 8 — 2026-06-10)

- **Dependências npm**: `npm audit fix` + upgrade `google-auth-library` de `^9.15.1` → `^10.7.0`. **0 vulnerabilidades** (qs DoS, uuid bounds check, gaxios transitivo resolvidos).
- **XSS — `team.js`** (linhas 25, 26, 56, 80, 84): `escapeHtml` em `member.name`, `member.email`, `invite.email`, `invite.invite_url`, `member.id`/`invite.id` em onclick. Linha 80 passou a `textContent` quando não há HTML.
- **XSS — `despesas.js`** (linhas 87-93): `escapeHtml` em `d.description`, `d.notes`, `d.invoice_ref`, `d.payment_method`, `d.id` em onclick.
- **XSS — `public-reservation.js`** (linhas 315, 363): helper local `escapeHtml(...)` aplicado em `showFatal(message)` e nas URLs do `renderRail`.
- **XSS — `alojamentos.js`** (linha 166): `escapeHtml(a.type)`.
- **`organization_id` em queries SELECT post-INSERT/UPDATE**:
  - `accommodationController.js:632,653,685` — `pricing_periods` 3 queries
  - `voucherController.js:95` — `vouchers` SELECT por ID
  - `reservationController.js:284` — `DELETE FROM reservation_payments`
  - `calendarService.js:143,186` — `accommodations` em task events
- **Rate limit em OAuth callbacks**: `oauthCallbackLimiter` (30/15min) aplicado a `/auth/google/callback`, `/auth/google-email/callback`, `/auth/google-tasks/callback`. Previne abuso/DoS dos endpoints (state HMAC já protegia contra brute-force).
- **`.env.example` atualizado**: inclui Turnstile, scheduler de pendentes, sessão TTL, COOKIE_SECURE. Comentários explicam fail-closed em produção.
- **`SECURITY.md` criado**: política de divulgação responsável, modelo de ameaças, checklist de produção, lista de envs sensíveis, headers HTTP, rate limits.

## ✅ Resolvido (sessão 7 — 2026-06-10)

- **S3 — Cloudflare Turnstile no motor público**: novo `turnstileService.js` valida o token via API CF. `publicBookingController.createReservation` é agora async e bloqueia o pedido se falhar. Em dev (sem `TURNSTILE_SECRET_KEY`) salta a verificação; em produção rejeita. Sitekey exposta em `GET /api/public/booking/:slug` via `data.captcha.site_key`.
- **S3 — Expiração automática de reservas pendentes**: novo `reservationScheduler.js` corre a cada 30 min (configurável via `PENDING_EXPIRY_INTERVAL_MS`) e cancela reservas `pendente` vindas do website há mais de `PUBLIC_PENDING_TTL_HOURS` (default 48h) sem qualquer pagamento. Ligado em `server.js` via `startScheduler()`.
- **S7 — `requireRole('manager')` em `/api/reports`**: aplicado no `routes/reports.js`. `staff` deixa de ver dados financeiros.
- **S2 (resto) — Tokens distintos `public_token` (gestão) vs `precheckin_token` (pre-checkin) + TTL**: adicionadas colunas `precheckin_token` e `precheckin_token_expires_at`. Reservas públicas geram ambos; backoffice (`approve`) garante ambos via `ensurePrecheckinToken`. `getPreCheckin`/`submitPreCheckin` aceitam `precheckin_token` (fallback para `public_token` em reservas antigas) e validam expiração. Frontend (`reservas.js`, `reserva-lista.js`) prefere `precheckin_token` quando disponível. `createReservation` devolve `precheckin_url` separado.
- **Frontend Turnstile**: `public-reservation.html` carrega `challenges.cloudflare.com/turnstile/v0/api.js`; widget renderizado no passo 3; token enviado no payload (`captcha_token`). Reset automático em erro.

## ✅ Resolvido (sessão 6 — 2026-06-10)

- **S2 — Pré-checkin não expõe PII**: `GET /api/public/pre-checkin/:token` deixou de devolver `document_number`, `document_type`, `birth_date`, `nationality`, `country`, `first_name`, `last_name` e `guests_data`. Quem tiver o link só vê o nome/email/telefone que o próprio hóspede já forneceu (e o backoffice já tem).
- **S22 — Service worker stale cache**: `app.js` limpa caches `sp-*` em todo o boot (`caches.keys().delete`), não só desregista o SW. SW versão `sp-v12`. Entrada inexistente `/api.js` removida.
- **S25 — `conversation_archives` restrito a manager+**: `GET/POST/DELETE /auth/email/archives` agora exigem `requireRole('manager')`.
- **S26 — `addPayment` rejeita valores não-finitos**: `Number.isFinite(amount)` + cap `max(total_amount × 10, 1 000 000)`.
- **S27 — Granularidade de roles em `/api/reservations`**: leitura em `staff`; criar/editar/cancelar/aprovar e pagamentos em `manager+`.
- **S29 — `frontend/api.js` removido**: ficheiro não importado por nenhum HTML; removido. SW deixou de o pré-cachear.
- **S30 — `teste1.js` removido**: migração antiga standalone. `tokens/google_token.json` confirmado *não* commitado (gitignore cobre).
- **S31 — Manifest aponta para ícones existentes**: `/icons/icon-*.png` (404) substituídos por `/favicon.png` no `manifest.webmanifest`.
- **S32 — Magic bytes nas imagens**: `parseImageDataUri` valida PNG (89 50 4E 47), JPEG (FF D8 FF), GIF (47 49 46 38), WEBP (RIFF…WEBP) e AVIF (ftyp+brand). Rejeita SVG disfarçado de PNG.
- **S35 — `getClaimableLegacyOrganization` removido**: função órfã eliminada de `orgService.js` e do import em `auth.js`. Migração legacy passa a registar `console.warn` indicando que a org criada precisa de membership manual.
- **S36 — SPA catch-all migrado**: `app.get(/(.*)/)` substituído por `app.use((req, res) => ...)` — idiomático em Express 5.
- **B4 — `findConflict` aceita `excludeId`**: parâmetro opcional para futuras rotas de edit/cancel públicas.
- **B6 — Voucher update normalizado**: helper `keep(key, current)` aplica o mesmo padrão a todas as colunas (envio de `''` apaga, omissão preserva). `COALESCE` removido.
- **B10 — `/api/*` desconhecido devolve 404**: `app.use('/api', 404)` colocado após as rotas — utilizadores autenticados batem em 404 (não 401) em endpoints inexistentes.

## ✅ Resolvido (sessão 5 — 2026-06-10)

- **S21 — SRI em CDN scripts**: `index.html` — todos os scripts/links CDN têm agora `integrity="sha384-..."` e `crossorigin="anonymous"`. Lucide fixado em `@1.17.0` (era `@latest`).
- **S12 — XSS em `reserva-lista.js`**: `guest_name`, `guest_email`, `guest_phone`, `accommodation_name`, `channel`, `notes`, `r.id` e dados dos hóspedes adicionais escapados com `escapeHtml`. Padrão `.replace(/'/g)` substituído por `encodeURIComponent`/`decodeURIComponent` nos handlers `onclick`.
- **S13/S14 — XSS em `hospedes.js`**: card view (nome, telefone, email, país) e footer do modal de detalhe corrigidos. `g.name.replace(/'/g)` substituído por `encodeURIComponent`.
- **S2/S5 — OAuth `state` CSRF**: adicionada função `oauthState(sessionId)` (HMAC-SHA256 do session ID) + `verifyOAuthState()` usada nos 3 fluxos: Google Calendar, Gmail, Google Tasks.
- **S9 — `organization_id` em `calendarService.js`**: todas as queries `guests`/`accommodations` têm `AND organization_id = ?` em `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`.
- **S20 — `organization_id` em `rgpdService.js`**: `recordConsent()` recebe `organizationId` como 3.º parâmetro; UPDATE tem `AND organization_id = ?`.
- **S17 — SQL injection no backup import**: `isSafeIdentifier()`/`sanitizeCols()` validam nomes de colunas com regex; `ALLOWED_TABLES` limita tabelas aceites.
- **S18 — Shell-out `/usr/bin/zip`**: substituído por `archiver` (export) e `unzipper` (import). Instalados em `package.json`.
- **S15/S16 — IDs com colisão `Date.now()`**: `reservationId` usa `SP-${uuidv4().slice(0,8).toUpperCase()}`; `paymentId` usa `rp-${uuidv4()}`.
- **S33 — Validação de password**: rejeita passwords com espaços no início/fim ou caracteres de controlo `\x00–\x7F`.
- **S27 — PII leak no reset-password GET**: email devolvido mascarado (`j***@gmail.com`).
- **B1 — Ocupação distorcida por hierarquia**: `totalRooms` exclui alojamentos pais.
- **B2 — Overlap de reservas entre meses**: query de noites usa `julianday MIN/MAX` para calcular noites efectivas.
- **B3 — `pricing_periods` em falta no motor público**: `calculateTotal()` injecta `pricing_periods` antes de chamar `calculateReservationTotals`.
- **B5 — `updateCalendarEvent` com descrição truncada**: reconstruída descrição completa com notas, canal, pagamento e `colorId`.
- **B9 — Service worker cache desatualizado**: adicionado `/js/invoice.js`; cache `sp-v11`.
- **Backup scope incompleto**: `ORG_TABLES`, `DELETE_ORDER` e `INSERT_ORDER` incluem `reservation_payments`, `vouchers` e `pricing_periods`.

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

## 🔴 Novos Achados — Auditoria 2026-06-09

> Resultados da revisão integral do backend + amostragem do frontend. Cada item indica ficheiro:linha e severidade. Os itens **S9–S30** são novos; os **S1–S8** mantêm-se abaixo.

### ✅ S9. Calendar service consulta `guests`/`accommodations` sem `organization_id` *(médio — defesa em profundidade)*
`backend/src/services/calendarService.js:18,19,63,64,90` faz `SELECT * FROM guests WHERE id = ?` e `SELECT * FROM accommodations WHERE id = ?` **sem** filtro `AND organization_id = ?`. Os IDs são UUIDs e o input vem do controller (que já filtrou), mas viola o padrão *defense-in-depth* — basta um futuro caller passar um ID externo (importação de backup, sync iCal, etc.) para vazar entre organizações.
**Fix**: receber `organization_id` como parâmetro obrigatório e adicionar `AND organization_id = ?` em todas as queries do `calendarService.js`.

### S10. Emails de owner / pré-checkin / pagamento interpolam dados do hóspede sem escape *(alto — phishing + email spoofing)*
`backend/src/services/emailService.js:184,199,240` constroem HTML com `${guest.name}` e `${guest.email}` directamente, sem `escapeHtml`. Para reservas vindas do motor público, esses campos são **input não autenticado**. Um atacante pode:
- Definir `name = "<a href='https://phish.example/'>Click here</a> João"` — o owner vê um link aparentemente legítimo.
- Definir `name = "</td><td colspan='2'>Subject Spoof"` — quebra a estrutura visual do email.
- Os mail clients não executam `<script>`, mas links/formulários e CSS abusivo passam.
**Fix**: escapar `guest.name`, `guest.email`, `accommodation.name`, `reservation.id`, `reservation.notes` antes de injectar no template. Adicionar `escapeHtml()` no próprio `emailService.js` (não pode usar o do frontend).

### S11. XSS confirmado em `frontend/js/invoice.js:379` (Gmail body) *(crítico — confirma S1)*
`<div class="ib-body">${m.body}</div>` insere o HTML do email recebido tal qual no DOM. O backend (`auth.js:610-633`) extrai `text/html` preferencialmente do payload MIME sem qualquer sanitização. Reproduzido: enviar para a caixa Gmail ligada um email com `<img src=x onerror=fetch('/auth/me').then(r=>r.json()).then(console.log)>` executa script no contexto do backoffice.
**Fix**: usar **DOMPurify** (CDN ou bundle local) e renderizar `DOMPurify.sanitize(m.body, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [...] })`; ou meter o email num `<iframe sandbox="" srcdoc="${escape(m.body)}">`.

### ✅ S12. XSS em `frontend/js/reserva-lista.js:240-243` (linha da tabela) *(médio)*
`<b>${r.guest_name}</b>` e `${r.guest_email || ''}` sem `escapeHtml`. Reservas públicas alimentam estes campos. Atacante regista reserva pública com `name = "<img src=x onerror=alert(1)>"` → executa no backoffice quando alguém abre a lista.
**Fix**: `escapeHtml(r.guest_name)` e `escapeHtml(r.guest_email)`.

### ✅ S13. XSS em `frontend/js/hospedes.js:236-249` (vista cards) *(médio)*
`${g.name}`, `${g.phone}`, `${g.email_personal}`, `${g.country || g.nationality}` injectados via `innerHTML` sem escape (na vista cards). A vista lista (linha 298+) já usa `escapeHtml` — falta uniformizar.
**Fix**: aplicar `escapeHtml` em todos os campos da vista cards.

### ✅ S14. `onclick` inline com escape manual frágil *(médio — XSS via aspas)*
`frontend/js/hospedes.js:318,375` faz `onclick="deleteGuest('${g.id}','${g.name.replace(/'/g, "\\'")}')"`. O escape apenas troca `'` por `\'`; um nome com `"`, `\`, `</script>` ou newline ainda quebra o atributo. Padrão repetido em vários `onclick` do `reserva-lista.js`.
**Fix**: migrar para event delegation com `data-id` / `data-name` + listener central que lê via `dataset`.

### ✅ S15. `reservationController.create` continua a usar `SP-${Date.now()}` *(baixo — regressão parcial)*
`backend/src/controllers/reservationController.js:410` ainda usa `SP-${Date.now()}` para IDs de reserva criadas no backoffice. O fix do S38 anterior foi aplicado apenas ao `publicBookingController`. Duas reservas criadas no mesmo ms (improvável em UI manual mas possível via script) colidem.
**Fix**: usar `SP-${crypto.randomBytes(6).toString('hex').toUpperCase()}` também aqui.

### ✅ S16. `paymentId` colidível *(baixo)*
`backend/src/controllers/reservationController.js:235` `const paymentId = \`rp-${Date.now()}\`` — colisão se 2 pagamentos forem registados no mesmo ms (cenário: dois admins em paralelo, ou auto-tools).
**Fix**: `\`rp-${crypto.randomUUID()}\`` ou `\`rp-${crypto.randomBytes(8).toString('hex')}\``.

### ✅ S17. `backup.js` constrói SQL dinâmico com nomes de coluna do JSON importado *(médio — só owner)*
`backend/src/routes/backup.js:269-273` faz `INSERT INTO ${table} (${cols.join(',')}) VALUES (...)`. As colunas vêm de `Object.keys(rows[0])` do JSON importado. Não é SQL injection clássica (são identificadores SQLite), mas:
- Permite ao owner sobrescrever colunas sensíveis se o JSON tiver chaves arbitrárias (mitigado por allowlist de tabelas ORG_TABLES — boa).
- Se as colunas do JSON não existirem na tabela actual, o INSERT rebenta sem rollback claro.
**Fix**: validar cada `cols[i]` contra `db.pragma('table_info(${table})')` antes de incluir. Rejeitar colunas desconhecidas.

### ✅ S18. `backup.js` shell out para `/usr/bin/zip` e `/usr/bin/unzip` *(baixo — operacional)*
`backend/src/routes/backup.js:212,238` usam `execFileSync('/usr/bin/zip'|'/usr/bin/unzip')` com path absoluto. Em Alpine, FreeBSD, ou imagens minimalistas estes paths não existem; deploy quebra silenciosamente em runtime. Além disso, `execFileSync` bloqueia o event loop durante export/import (segundos a minutos com fotos grandes).
**Fix**: trocar por uma lib JS pura como `adm-zip` ou `archiver` + `yauzl`. Resolve também o S17/S8 (path traversal) ao validar cada entry programaticamente.

### S19. `extractBody` em emails recebidos prefere `text/html` sem sanitização *(crítico — alimentador do S11)*
`backend/src/routes/auth.js:610-633` extrai `text/html` recursivamente do MIME e devolve directamente para o frontend. Combinado com `invoice.js:379` (`innerHTML = m.body`) → XSS server-to-client. Mesmo que se sanitize no frontend (S11), filtrar também no backend é defesa em profundidade.
**Fix**: aplicar `DOMPurify` (JSDOM no servidor) ou normalizar para texto + linkify; opcionalmente devolver `text/plain` como fonte primária.

### ✅ S20. `recordConsent` sem filtro de organização *(baixo)*
`backend/src/services/rgpdService.js:73` faz `UPDATE guests SET ... WHERE id = ?` sem `AND organization_id = ?`. Atacante teria de adivinhar UUID de outro tenant para escrever um IP/consent falso — improvável mas é violação direta do isolamento multi-tenant.
**Fix**: aceitar `organizationId` como parâmetro e adicionar à WHERE clause.

### ✅ S21. CDN sem Subresource Integrity (SRI) *(alto — supply chain)*
`frontend/index.html:35-41` carrega scripts críticos (Lucide, Chart.js, jsPDF, AutoTable, XLSX, Leaflet) de `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com` **sem `integrity=`** e sem `crossorigin=anonymous`. Se qualquer destas CDNs for comprometida, o atacante executa código arbitrário em todas as sessões com acesso ao cookie de sessão e à API completa. As CDNs são alvos historicamente atacados (event-stream, ua-parser-js, etc.).
**Fix**: gerar hashes SRI com `openssl dgst -sha384 -binary file | openssl base64 -A` e adicionar `integrity="sha384-..." crossorigin="anonymous"` a todos os `<script>` e `<link>` externos. Idealmente fixar a versão exata (já está) e auto-bumping com Dependabot.

### ✅ S22. Service Worker permanece no repositório *(médio — cache stale)*
`frontend/service-worker.js` existe e pre-cacheia 30+ assets. A `DOCUMENTACAO.md` diz que é "auto-desregistado ao boot", mas o ficheiro continua a ser servido e nada impede um browser de o ter registado de uma sessão anterior. Se o user não fizer hard-reload, o JS antigo (com bugs/XSS já corrigidos) corre offline.
**Fix**: confirmar que `app.js` faz `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` cedo no boot; OU eliminar o ficheiro de uma vez (`frontend/service-worker.js` + entrada no `index.html` se existir).

### S23. CDN do logo no email aponta para `santapaciencia.pt` *(baixo)*
`backend/src/services/emailService.js:95` o template base usa `<img src="https://santapaciencia.pt/wp-content/uploads/.../Logo-...png">`. Esse domínio pode mudar de mãos, pode usar tracking, e está fora do controlo do projecto.
**Fix**: servir o logo a partir de `santapaciencia.xyz/uploads/logo.png` ou inline como data URI (Base64).

### S24. Logo dos botões sociais via `cdn.simpleicons.org` *(baixo — privacidade)*
`backend/src/services/emailService.js:69-71` puxa ícones SVG do `cdn.simpleicons.org`. Cada email aberto pinga essa CDN com a URL/UA do destinatário. Pequena fuga de privacidade + dependência externa.
**Fix**: usar SVGs inline.

### ✅ S25. `conversation_archives` (arquivar conversas) sem `requireRole` *(baixo)*
`backend/src/routes/auth.js:651-671` expõe `GET/POST/DELETE /auth/email/archives` apenas com `requireAuth`. Qualquer staff pode arquivar/desarquivar qualquer thread da organização. Se o uso é colaborativo, OK; se há expectativa de separação por user, falta.
**Fix**: avaliar se faz sentido restringir a `manager+` ou guardar `archived_by_user_id` para rastreio.

### ✅ S26. `addPayment` aceita valores arbitrários *(baixo — integridade financeira)*
`backend/src/controllers/reservationController.js:228` apenas valida `Number(amount) > 0`. `Infinity`, `1e308`, números absurdos passam, distorcendo relatórios e total_paid. Não há cap por relação ao `total_amount` da reserva (pagamentos > total deveriam pelo menos avisar).
**Fix**: rejeitar `!Number.isFinite(amount)` e/ou `amount > total_amount * 10`. Logar avisos quando `total_paid > total_amount`.

### ✅ S27. `route /api/reservations` toda acessível a `staff` *(médio — princípio do menor privilégio)*
`backend/src/routes/reservations.js:5` aplica `requireRole('staff')` a tudo — incluindo `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/approve`. Em organizações com staff (limpeza, recepção) o owner pode querer que só `manager+` aprove ou cancele.
**Fix**: separar a granularidade — leitura para `staff`, escrita para `manager`, aprovação/cancelamento opcional para `owner`. Documentar a matriz.

### S28. Logs estruturados em falta + PII em `console.log` *(baixo — observabilidade)*
Espalhados pelo código: `console.log('✅ Gmail ligado:', email)`, `console.log('📅 Evento criado:', response.data.id)`, `console.log('🚀 Santa Paciência a correr...')`. Em produção (Docker) estes vão para stdout sem níveis nem rotação. Emails e IDs sensíveis acabam em logs persistentes.
**Fix**: introduzir `pino` ou `winston` com níveis (debug/info/warn/error), redactar campos PII conhecidos, e configurar rotação.

### ✅ S29. `frontend/api.js` continua presente e não usa `credentials: 'include'` *(baixo — código morto)*
`frontend/api.js` faz `fetch(...)` sem `credentials: 'include'`. A SPA usa `helpers.js` (que tem credentials). Se algum debug/devtools chamar `api.js`, fica sem cookie e devolve 401. Já marcado como "low" há sessões; vale apagar.
**Fix**: eliminar `frontend/api.js`, remover entrada do service worker, confirmar que nada referencia `loadDashboard` (a função no fim do ficheiro).

### ✅ S30. `backend/src/teste1.js` e `backend/tokens/google_token.json` no repositório *(médio — limpeza + leak risk)*
- `backend/src/teste1.js` é um script de migração antigo (já não usado — migrations correm em `database.js`). Confunde quem entra no projecto.
- `backend/tokens/google_token.json` existe (530 bytes, timestamp May 7). O `.gitignore` cobre `tokens/` e `google_token.json`, mas convém confirmar com `git ls-files | grep token` que **não foi commitado**. Se for, **rodar os tokens Google imediatamente**.
**Fix**: apagar `teste1.js`; confirmar com `git log -- backend/tokens/` que o JSON nunca entrou; se entrou, revogar e rodar credenciais OAuth.

### ✅ S31. `frontend/index.html` referencia `/manifest.webmanifest` que não existe *(baixo)*
`frontend/index.html:9` `<link rel="manifest" href="/manifest.webmanifest">` — devolve 404 (não há ficheiro). Não quebra a app, mas suja a consola e bloqueia o PWA install prompt.
**Fix**: criar o manifest mínimo ou remover a tag.

### ✅ S32. `parseImageDataUri` rejeita extensões mas não verifica magic bytes *(baixo)*
`backend/src/controllers/accommodationController.js:19-26` faz allowlist de MIME declarado, mas não confirma os primeiros bytes da imagem. Atacante pode enviar `data:image/png;base64,<base64 de um SVG com script>` — é guardado como `.png` mas o conteúdo continua a ser SVG; servido como `image/png` é inerte para o browser, **mas** se algum tooling adivinhar pela extensão errado e renderizar SVG, executa.
**Fix**: validar magic bytes (`Buffer[0..3]` para PNG `89 50 4E 47`, JPEG `FF D8 FF`, etc.) ou usar lib `file-type`. Adicionalmente, `Content-Type: image/...` explícito no Express static.

### ✅ S33. `validatePassword` não rejeita whitespace/control chars *(baixo)*
`backend/src/services/authService.js:16-27` aceita `"        Aa1     "` (16 chars, maiúscula, número, mas só whitespace + uma letra). Não bloqueia chars de controlo (`\x00`, `\n`).
**Fix**: `if (/\s/.test(value)) throw new Error(...)` e `if (/[\x00-\x1f\x7f]/.test(value)) ...`. Considerar zxcvbn para força mínima.

### ✅ S34. `getResetToken` devolve o email do user *(baixo — fuga de PII)*
`backend/src/routes/auth.js:304-308` `GET /auth/reset-password/:token` devolve `{ email }`. Quem tiver o token de reset (já recebido por email) já sabe o seu próprio email — então o impacto é zero **excepto** se o token vazar de um log/proxy. Melhor não devolver.
**Fix**: devolver só `{ success: true }`; UI pré-preencher o email a partir do que o user introduziu no `forgot-password`.

### ✅ S35. `migrateLegacyDataToOrganizations` cria org sem owner *(baixo — código órfão)*
`backend/src/config/database.js:375-399` cria uma organização "Santa Paciência" sem nenhum membership. O endpoint `getClaimableLegacyOrganization` existe em `orgService.js` mas nenhuma rota o consome (registo público desativado). Resultado: dados podem ficar "presos" numa org sem owner.
**Fix**: ou remover o código de claim (e a função `getClaimableLegacyOrganization`); ou adicionar uma rota administrativa para o owner reclamar a org legacy via convite.

### ✅ S36. SPA catch-all com regex em vez de wildcard *(cosmético — Express 5)*
`backend/src/app.js:103` usa `app.get(/(.*)/, ...)`. Em Express 5 o `*` agora exige sintaxe `*<name>` nomeada; o regex é workaround válido mas pouco idiomático.
**Fix**: substituir por `app.use((req, res) => res.sendFile(...))` ou `app.get('/*splat', ...)` (Express 5).

---

## 🔴 Pendente — Segurança (revisão adversarial 2026-06-01)

> Avaliados do ponto de vista de um atacante: reservas falsas, acesso a dados de clientes, e perturbação da operação. Reavaliados em 2026-06-09 — status indicado em cada item.

### S1. XSS via HTML de emails no backoffice *(crítico — reconfirmado 2026-06-09 nas linhas 379 / 610)*
`frontend/js/invoice.js:379` insere `m.body` diretamente no DOM sem sanitização.
`backend/src/routes/auth.js:610-633` (`extractBody`) extrai e prefere `text/html` vindo do Gmail.
Um email malicioso enviado para a caixa da quinta pode correr JavaScript no backoffice quando o utilizador abre a conversa. Ver também **S11** e **S19** acima.
**Fix**: sanitizar com `DOMPurify.sanitize(m.body)` antes de inserir no DOM; ou renderizar o email em `<iframe sandbox>` sem `allow-scripts`.

### ✅ S2. Token de pré-checkin expõe PII sem expiração curta *(resolvido 2026-06-10 — tokens distintos + TTL)*
`backend/src/controllers/publicBookingController.js:406-455` devolve nome, email, telefone, data de nascimento e documentos apenas com o `public_token`.
O **mesmo token** é usado para `/reserva/:token` (gestão pública) e `/pre-checkin/:token` (pré-checkin). Tem 64 chars hex (entrópico) mas não há expiração curta pré-checkout (só expira após checkout), não é revogável individualmente, e não há confirmação extra.
Se o link for partilhado, reencaminhado ou vazar de um email, quem o tiver acede a todos os dados pessoais do hóspede.
**Fix**: tokens distintos por finalidade (`management_token` + `precheckin_token`), TTL de 7 dias para pré-checkin, invalidado após submissão; pedir confirmação extra (ex: apelido + data de chegada) antes de mostrar dados sensíveis.

### ✅ S3. Reservas falsas bloqueiam disponibilidade *(crítico — pendente 2026-06-09)*
`backend/src/routes/publicBooking.js:8` cria reservas com estado `pendente` sem verificação de email, CAPTCHA, ou depósito.
O rate limit de 20/hora por IP limita, mas IPs rotativos / botnets contornam-no.
Reservas `pendente` contam como conflito de datas (ver `findConflict` em `publicBookingController.js:115`) — um atacante pode bloquear um fim-de-semana inteiro sem pagar nada.
**Fix**: (a) expiração automática de reservas `pendente` após X horas (cron job ou via `emailScheduler` quando ligado); (b) bloquear calendário só após confirmação/depósito; (c) adicionar CAPTCHA/Cloudflare Turnstile no formulário público; (d) validar email com link de confirmação antes de marcar disponibilidade.

### ✅ S4. Content Security Policy desligada *(alto — pragmática 2026-06-11)*
`backend/src/app.js:30` tem `contentSecurityPolicy: false` — isto aumenta muito o impacto de qualquer XSS, porque o browser não bloqueia execução de scripts inline ou externos.
A razão são os `onclick` inline no HTML.
**Fix por fases**: (1) migrar `onclick` inline para `addEventListener`; (2) ativar CSP em modo `report-only` para detetar violações sem bloquear; (3) ativar bloqueio total.

### ✅ S5. OAuth Google sem parâmetro `state` *(alto)*
`backend/src/routes/auth.js:352` e `:397` iniciam fluxo OAuth sem gerar/validar `state`.
Sem `state`, é possível um ataque CSRF OAuth: induzir um utilizador autenticado a ligar a conta Google de um atacante.
**Fix**: gerar `crypto.randomBytes(16).toString('hex')` por sessão, guardar em `req.session.oauthState`, validar no callback antes de processar.

### S6. `innerHTML` não escapado em zonas públicas e de hóspedes *(médio — desdobrado em S12/S13/S14 acima)*
`frontend/js/public-reservation.js:380+`, `frontend/js/hospedes.js:236+`, `frontend/js/reserva-lista.js:240+`. Ver detalhe em **S12** (reserva-lista), **S13** (hospedes cards) e **S14** (onclick com escape manual).
**Fix**: auditar todos os pontos de `innerHTML` com dados externos; aplicar `escapeHtml()` sistematicamente ou usar `textContent` onde não é necessário HTML.

### ✅ S7. Relatórios acessíveis a qualquer utilizador autenticado *(baixo)*
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

## Checklist Rápido (atualizado 2026-06-09)

### Segurança — Crítico
| Item | Estado | Localização | Impacto |
|---|---|---|---|
| **S1/S11/S19. XSS em emails Gmail** | 🔴 | `invoice.js:379` + `auth.js:610` | XSS no backoffice via email malicioso |
| **S2. Token pré-checkin expõe PII** | 🔴 | `publicBookingController.js:406` | Link vaza dados do hóspede |
| **S3. Reservas falsas bloqueiam datas** | 🔴 | `publicBooking.js:8` | Sem CAPTCHA/expiração de pendente |

### Segurança — Alto
| Item | Estado | Localização | Impacto |
|---|---|---|---|
| **S4. CSP desligada** | 🔴 | `app.js:30` | Amplifica qualquer XSS |
| **S5. OAuth sem state** | 🔴 | `auth.js:348-355,393-403,674-684` | CSRF OAuth possível |
| **S10. Emails interpolam guest.name sem escape** | 🔴 | `emailService.js:184,199,240` | Phishing via reserva pública |
| **S21. CDN sem Subresource Integrity** | 🔴 | `index.html:35-41` | Supply-chain → XSS total |

### Segurança — Médio
| Item | Estado | Localização | Impacto |
|---|---|---|---|
| **S9. calendarService sem filtro org_id** | 🔴 | `calendarService.js:18,19,63,64,90` | Defesa em profundidade quebrada |
| **S12. XSS em renderTabela** | 🔴 | `reserva-lista.js:240-243` | guest_name/email no innerHTML |
| **S13. XSS em hospedes cards** | 🔴 | `hospedes.js:236-249` | nome/phone/email sem escape |
| **S14. onclick com escape manual frágil** | 🔴 | `hospedes.js:318,375` + outros | XSS via aspas/backslash |
| **S17. backup importa colunas SQL dinâmicas** | 🔴 | `backup.js:269-273` | Só owner, mas sem allowlist de colunas |
| **S22. Service Worker stale** | 🔴 | `service-worker.js` | Cache antiga ainda activa em browsers |
| **S27. /api/reservations toda em staff** | 🔴 | `reservations.js:5` | Cancelar/aprovar deveria ser manager+ |

### Segurança — Baixo
| Item | Estado | Localização | Impacto |
|---|---|---|---|
| **S6. innerHTML em zonas públicas** | ⚠️ | múltiplos (ver S12/S13) | Inconsistente com resto da app |
| **S7. Relatórios sem requireRole** | ⚠️ | `reports.js` | OK para equipa pequena |
| **S8. Backup ZIP sem validação path traversal** | ⚠️ | `backup.js:238` | Só owner; mitigado pelo S18 |
| **S15. SP-${Date.now()} no backoffice** | 🔴 | `reservationController.js:410` | Regressão parcial vs publicBooking |
| **S16. paymentId colidível** | 🔴 | `reservationController.js:235` | Baixa probabilidade |
| **S18. shell out /usr/bin/zip** | 🔴 | `backup.js:212,238` | Quebra em Alpine; bloqueia event loop |
| **S20. recordConsent sem org filter** | 🔴 | `rgpdService.js:73` | Defesa em profundidade |
| **S23. Logo email em domínio externo .pt** | 🔴 | `emailService.js:95` | Privacy + ownership do domínio |
| **S24. Ícones sociais via cdn externa** | 🔴 | `emailService.js:69-71` | Tracking de email opens |
| **S25. /email/archives sem requireRole** | 🔴 | `auth.js:651-671` | Qualquer staff arquiva tudo |
| **S26. addPayment sem cap de valor** | 🔴 | `reservationController.js:228` | Distorce relatórios financeiros |
| **S28. console.log com PII** | 🔴 | múltiplos | Logs persistentes em produção |
| **S29. frontend/api.js código morto** | ⚠️ | `frontend/api.js` | Confunde; sem credentials |
| **S30. teste1.js + tokens/ no repo** | 🔴 | `backend/src/teste1.js`, `backend/tokens/` | Limpeza + rodar OAuth se commitado |
| **S31. manifest.webmanifest 404** | ⚠️ | `index.html:9` | Bloqueia PWA install |
| **S32. parseImageDataUri sem magic bytes** | 🔴 | `accommodationController.js:19-26` | SVG disfarçado de PNG |
| **S33. validatePassword aceita whitespace** | 🔴 | `authService.js:16-27` | Política de password fraca |
| **S34. /reset-password devolve email** | 🔴 | `auth.js:304-308` | PII em handler público |
| **S35. Org legacy sem owner** | ⚠️ | `database.js:375-399` | Código órfão |
| **S36. SPA catch-all com regex** | ⚠️ | `app.js:103` | Cosmético Express 5 |

### Trabalho Futuro / Dívida Técnica
| Item | Estado | Impacto |
|---|---|---|
| Email scheduler ligar | 🔴 *(futuro)* | Alto — emails agendados não funcionam |
| api.js duplicação | ⚠️ | Baixo — apagar |
| onclick inline HTML (229 ocorrências em index.html) | ⚠️ | Médio — bloqueia activação de CSP |
| Validações sem schema central | ⚠️ | Médio — consistência |
| Render funções grandes (renderTabela 100+ linhas) | ⚠️ | Baixo — manutenibilidade |
| Credenciais .env não commitadas mas no disco | ⚠️ | Risco se partilhado / backup do disco |
| Sem testes de integração | ⚠️ | Médio — regressões silenciosas |
| Sem auditoria/histórico de quem alterou o quê | ⚠️ | Médio — RGPD/compliance |

---

## 🔧 Bugs funcionais (não-segurança) — 2026-06-09

### ✅ B1. Taxa de ocupação distorcida pela hierarquia
`reservationController.js:712-717` — `getDashboardStats` calcula ocupação dividindo `nights / (daysInMonth × totalRooms)` em que `totalRooms = COUNT(*) FROM accommodations`. Mas a tabela inclui tanto a propriedade-pai (`type='alojamento'`) como as suites-filhas. Resultado: a divisão sobre-estima a capacidade e sub-estima a ocupação.
**Fix**: contar só `type != 'alojamento' OR (type='alojamento' AND id NOT IN (SELECT DISTINCT parent_id FROM accommodations WHERE parent_id IS NOT NULL))`.

### ✅ B2. `getDashboardStats` ignora overlap de reservas que atravessam meses
A query `check_in >= firstOfMonth AND check_in <= lastOfMonth` exclui reservas que começaram no mês anterior e ainda decorrem.
**Fix**: somar noites efectivas dentro do intervalo `[firstOfMonth, lastOfMonth]`, não noites totais cuja data de check-in cai no mês.

### ✅ B3. `calculateReservationTotals` chamado sem `pricing_periods` no public booking
`publicBookingController.js:145` — `calculateTotal` chama `calculateReservationTotals(accommodation, getServices(organizationId), payload)` mas **não passa `pricing_periods`**. Resultado: motor público pode aplicar preço-base quando há períodos especiais. Confirmado: `getPricingPeriods` é usado em `getLanding` para mostrar no UI mas não na criação.
**Fix**: incluir `pricing_periods: getPricingPeriods(parent.organization_id, unit.id)` em `calculateTotal`.

### ✅ B4. `findConflict` no público não exclui reserva em curso
Não é bug porque é só create, mas a função `findConflict` em `publicBookingController.js:115` não aceita `excludeId` — diferente da do backoffice. Se algum dia for chamada para edit/cancel público, está incompleta.

### ✅ B5. `updateCalendarEvent` perde notas, num_guests, etc.
`calendarService.js:67-76` no update apenas envia `summary`, `description`, `start`, `end`. Se o user editou notes/payment/numGuests na reserva, o Google Calendar fica com a descrição truncada ("Reserva atualizada\nHóspede: X\nTotal: Y").
**Fix**: rebuild da descrição completa (igual a `createCalendarEvent`).

### ✅ B6. Vouchers — `update` apaga campos quando `value` undefined mas `type` definido
`voucherController.js:122-135` — o `COALESCE` com `null` apaga em vez de manter quando o cliente não envia o campo. Já marcado em revisões anteriores; ver linha 126: `value !== undefined ? (effectiveType === 'credit_stay' ? parseInt(value) : parseFloat(value)) : null` — passa `null` que substitui via `COALESCE(?, value)` (que aceita NULL como manter, OK), mas `description` (linha 127) usa `null` para apagar e `existing.description` para manter — inconsistente.

### B7. Bulk pricing periods aceita `start_date >= end_date` em modo manual mas não bulk
`accommodationController.js:646` (`bulkCreatePricingPeriods`) valida `start_date >= end_date` correctamente. `updatePricingPeriod:616` também. OK.

### B8. `seedEmailTemplates` corre por defeito sem `organization_id`
`database.js:617` corre `seedEmailTemplates()` na tabela legacy `email_templates`. Os templates aí são depois copiados para cada nova org. Se um owner editar um template original e quiser que os novos defaults reflictam, não há mecanismo para re-seed.

### ✅ B9. `frontend/service-worker.js` cacheia ficheiros que já não existem
Lista inclui `/js/notifications.js` (existe), `/js/pubsub.js` (existe), mas faltam `/js/reserva-lista.js`, `/js/validators.js` etc. (existem). Inconsistente — `Promise.allSettled` engole erros mas a cache fica incompleta.

### ✅ B10. `app.js:103` catch-all serve `index.html` mesmo para paths como `/api/foo` quando `/api` middleware deixar passar
`/api` rota tem `requireAuth` que devolve 401. Mas para um path inexistente como `/api/inexistente`, em vez de 404, devolve 401 (porque `requireAuth` é montado em `/api`) — UX confusa.

---

## 📋 Estado de implementação (atualizado 2026-06-10, sessão 8)

### ✅ Concluído nas sessões 5–8 (2026-06-10)
**Sessão 5**: S5, S9, S12, S13, S14, S15, S16, S17, S18, S20, S21, S33, S34 — bugs B1, B2, B3, B5, B9 + scope de backup.
**Sessão 6**: S22, S25, S26, S27, S29, S30, S31, S32, S35, S36 — bugs B4, B6, B10.
**Sessão 7**: S2 (completo — tokens distintos + TTL), S3 (CAPTCHA + expiração de pendentes), S7.
**Sessão 8**: deps `npm audit fix` (0 vulns), XSS em team/despesas/public-reservation/alojamentos, `organization_id` em 5 queries de defesa em profundidade, rate limit em OAuth callbacks, `SECURITY.md`, `.env.example` actualizado.

### 🔴 Pendente — Emails (bloqueado intencionalmente)
1. **S1/S11** — XSS no viewer de emails Gmail (`invoice.js:379`) — requer DOMPurify ou `<iframe sandbox srcdoc>`
2. **S10** — `guest.name`/`guest.email` sem escape nos templates de email enviados (`emailService.js`)
3. **S19** — `extractBody` extrai `text/html` sem sanitização (alimentador do S11)
4. **S23/S24** — Logos de email via CDN externo (`santapaciencia.pt`, `cdn.simpleicons.org`)
5. **B8** — `seedEmailTemplates` sem mecanismo de re-seed por org
6. **Email scheduler** — `emailScheduler.js` existe mas `startScheduler()` não é chamado

### 🔴 Pendente — Não-email (próxima sprint)
7. **S4** — Content Security Policy (pré-requisito: migrar os 229 `onclick` inline para event delegation) — **único item de segurança restante**

### 🟡 Pendente — Backlog técnico (baixa prioridade)
8. **S28** — Logger estruturado + remover PII de `console.log` (`pino` + redact)
9. **Validações com schema central** (`domain/validators.js`)
10. **Decomposição de render funções** (`renderMobileCards`, `renderCalView`)
11. **Testes de integração** (vitest/jest)
12. **Audit log** para mudanças sensíveis (RGPD)
13. **Empty catch blocks** em `database.js:394,412,443`, `backup.js:78,131,151,161` — silenciam erros de migração/backup

---

## 🔧 Configuração necessária para produção

Adicionar ao `.env` do backend antes do próximo deploy:

```
# Cloudflare Turnstile (CAPTCHA público) — obter em
# https://dash.cloudflare.com/?to=/:account/turnstile
TURNSTILE_SITE_KEY=0xAAAA...
TURNSTILE_SECRET_KEY=0xBBBB...

# (opcional) TTL para reservas pendentes em horas — default 48
PUBLIC_PENDING_TTL_HOURS=48
```

Sem `TURNSTILE_SECRET_KEY` em `NODE_ENV=production`, qualquer pedido de reserva
pública será rejeitado com "CAPTCHA não configurado no servidor."
111