# Melhorias de Código — Lista Viva

> Atualizado em 2026-05-19. Itens marcados ✅ foram resolvidos; ⚠️ parcialmente; 🔴 ainda pendente.

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

---

## 🔴 Pendente — Alta Prioridade / Segurança

### 1. Email scheduler não ligado *(aguarda trabalho futuro)*
`emailScheduler.js` existe mas `server.js` nunca chama `startScheduler()`.
Emails imediatos funcionam; emails agendados (check-in/check-out/obrigado) nunca são enviados automaticamente.
**Fix**: `const { startScheduler } = require('./services/emailScheduler'); startScheduler();` em `server.js`.

### 2. XSS em innerHTML com dados do utilizador
Vários ficheiros inserem dados da API directamente em `innerHTML` sem escapar (nomes de períodos em `precos.js`, etc.). O helper `escapeHtml` existe mas não é usado em todos os pontos.
**Fix**: verificar e aplicar `escapeHtml` em todos os `innerHTML` com dados externos.

### 3. Race condition no voucher (novo)
`publicBookingController.js`: a validação do voucher e a actualização de `status = 'used'` correm em queries separadas. Dois pedidos simultâneos podem ambos passar a validação antes de qualquer um marcar o voucher como usado.
**Fix**: envolver validação + update numa transação `db.transaction(...)`.

### 4. Rate limiting em `/auth/login` e endpoints públicos
Sem limite de tentativas de login — vulnerável a brute-force.
`/api/public/booking/:slug/reservations` também sem rate limiting — vulnerável a spam.
`express-rate-limit` **não está instalado** (não está em `package.json`).
**Fix**: `npm install express-rate-limit` + aplicar nas rotas `/auth/login` e `/api/public/*`.

### 5. Tokens de sessão sem rotação
Após login, o `id` da sessão é fixo até expirar. Se o cookie for comprometido, é válido até ao fim do TTL.
**Fix**: rodar o session ID em cada request ou após operações sensíveis.

---

## 🔴 Pendente — Qualidade / Fiabilidade

### 6. Side effect em GET `/notifications`
`reservationController.js:559` chama `syncOrganizationOperationalTasks(orgId)` num handler GET.
**Fix**: remover do handler GET; o sync corre via `POST /api/events/sync` ou scheduler.

### 7. `payment_method` e campos opcionais não se limpam
`payment_method || existing.payment_method` (linha 440) impede apagar o método explicitamente.
**Fix**: `payment_method !== undefined ? (payment_method || null) : existing.payment_method`.

### 8. JOIN de voucher sem filtro de organização (novo)
Em `voucherController.js`, o LEFT JOIN de accommodation não inclui `a.organization_id = v.organization_id`.
**Fix**: adicionar a condição ao JOIN.

### 9. `completed_at` pode ser sobreescrito (novo)
Em `eventController.js`, actualizar um evento concluído pode sobreescrever `completed_at`.
**Fix**: só definir `completed_at` na transição para `'concluido'`, nunca sobreescrever.

---

## ⚠️ Pendente — Média Prioridade

### 10. `pricing_periods` sem índice em `accommodation_id`
A query mais frequente `WHERE accommodation_id = ? AND organization_id = ?` não tem índice.
**Fix**: `CREATE INDEX IF NOT EXISTS idx_pricing_periods_acc ON pricing_periods (accommodation_id, organization_id)` em `database.js`.

### 11. Validação do código de voucher público
Em `publicBookingController.js` o código só é normalizado (`toUpperCase().trim()`). Sem limite de comprimento nem validação de formato.
**Fix**: `if (!/^[A-Z0-9]{3,20}$/.test(code)) return res.status(400)...`

### 12. `getResolvedAccommodationsForOrg` para lookups individuais
`accommodationController.getById` busca TODOS os alojamentos e filtra em JS.
**Fix**: criar `getResolvedAccommodationById(orgId, id)` com filtro no SQL.

### 13. Hover re-render completo no calendário de preços
`handlePrecosDayHover` dispara `renderPrecosCalendar()` em cada movimento do rato, reconstruindo todo o DOM.
**Fix**: `classList.toggle` em vez de reconstruir; ou throttle.

### 14. `api.js` duplica padrão de `helpers.js`
`frontend/api.js` existe mas a SPA usa `apiGet`/`apiPost`/etc. de `helpers.js`.
**Fix**: unificar num único módulo.

### 15. Event listeners acumulam sem cleanup
`_precosHandleOutsideClick` pode duplicar-se se o elemento for destruído e recriado.
**Fix**: `AbortController` ou `removeEventListener` antes de adicionar.

### 16. Estado global de módulos pode ficar stale
`_cachedPricingPeriods` no wizard não é invalidado ao editar períodos na vista Preços.
**Fix**: callback ou evento ao guardar um período.

---

## ⚠️ Pendente — Baixa Prioridade / Organização

### 17. `onclick` inline no `index.html`
Centenas de `onclick="..."` dificultam testes e linting.
**Fix de longo prazo**: event delegation via `data-action` + listener centralizado.

### 18. Validações espalhadas sem schema central
Cada form valida à sua maneira; inconsistências entre backoffice e wizard.
**Fix**: `frontend/js/domain/validators.js` com `validate(obj, schema)`.

### 19. Funções render grandes não decompostas
`renderMobileCards`, `renderCalView` e similares têm 60-100 linhas.
**Fix**: extrair sub-funções por responsabilidade.

### 20. IDs de reserva com timestamp podem colidir
`SP-${Date.now()}` pode colidir em criações simultâneas rápidas.
**Fix de longo prazo**: UUID com prefixo SP como display-only.

### 21. Credenciais em `.env` local
Se o `.env` foi partilhado ou commitado por engano, as credenciais SMTP e Google OAuth devem ser rodadas.

---

## Checklist Rápido

| Item | Estado | Impacto |
|---|---|---|
| Email scheduler ligar | 🔴 *(futuro)* | Alto — emails agendados não funcionam |
| Race condition voucher | 🔴 | Alto — exploitável com pedidos concorrentes |
| Rate limiting login + público | 🔴 | Alto — segurança |
| XSS em innerHTML | 🔴 | Médio |
| Side effect GET notifications | 🔴 | Médio — fiabilidade |
| payment_method clearing | 🔴 | Médio — UX bug |
| JOIN voucher sem org filter | 🔴 | Médio — segurança |
| completed_at overwrite | ⚠️ | Baixo |
| Índice pricing_periods | ⚠️ | Baixo — OK para escala atual |
| Validação código voucher público | ⚠️ | Baixo |
| getResolvedAccommodationsForOrg | ⚠️ | Baixo — OK para escala atual |
| Hover re-render calendário | ⚠️ | Baixo |
| api.js duplicação | ⚠️ | Baixo — cosmético |
| Event listener cleanup | ⚠️ | Baixo |
| Cache pricing wizard | ⚠️ | Baixo — edge case |
| onclick inline HTML | ⚠️ | Baixo — debt longo prazo |
| Validações sem schema | ⚠️ | Médio — consistência |
| Render funções grandes | ⚠️ | Baixo — manutenibilidade |
| IDs com timestamp | ⚠️ | Muito baixo — só com volume alto |
| Tokens sessão sem rotação | 🔴 | Médio — segurança |
