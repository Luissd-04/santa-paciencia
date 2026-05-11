# Melhorias de Código Imediatas (Sem React)

## 🎯 Problemas Frequentes + Soluções

### 1️⃣ **innerHTML em loops causa DOM flickering**

```javascript
// ❌ ATUAL - em alojamentos.js e reservas.js
accommodations.forEach(a => {
  el.innerHTML += `<option value="${a.id}">${a.name}</option>`; // Redraw 10x!
});

// ✅ MELHOR - Usar DocumentFragment
const frag = document.createDocumentFragment();
accommodations.forEach(a => {
  const opt = document.createElement('option');
  opt.value = a.id;
  opt.textContent = a.name;
  frag.appendChild(opt);
});
el.appendChild(frag); // Uma operação!
```

**Ganho:** ~10x mais rápido, sem flickering, mantém event listeners

---

### 2️⃣ **Event listener duplicados sem cleanup**

```javascript
// ❌ PROBLEMA - em app.js
function showView(v) {
  document.querySelectorAll('.nav-item').forEach(x => {
    x.onclick = () => showView(...); // Adiciona listener de novo toda vez!
  });
}

// ✅ SOLUÇÃO - Adicionar uma vez (event delegation)
const nav = document.getElementById('nav');
nav.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item');
  if (!navItem) return;
  const view = navItem.dataset.view;
  showView(view);
}); // Só uma vez no init!
```

**Ganho:** Memory leak eliminado, código mais limpo

---

### 3️⃣ **State inconsistente - sem notificação entre módulos**

```javascript
// ❌ PROBLEMA - state.js e reservas.js usam diferente
// Em reservas.js:
const newReservas = await loadReservas(); // Local
// Em alojamentos.js:
reservas // Global - pode estar stale!

// ✅ SOLUÇÃO - Pub/Sub simples
// pubsub.js (novo ficheiro)
const pubsub = {
  events: {},
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    return () => this.events[event] = this.events[event].filter(cb => cb !== callback);
  },
  emit(event, data) {
    this.events[event]?.forEach(cb => cb(data));
  }
};

// Em state.js
let reservas = [];
async function loadReservas() {
  const data = await apiGet('/api/reservas');
  reservas = data;
  pubsub.emit('reservas:loaded', reservas);
  return reservas;
}

// Em qualquer ficheiro que precisa:
pubsub.on('reservas:loaded', (data) => {
  renderReservasUI(data);
});
```

**Ganho:** Sem race conditions, UI sempre sincronizada

---

### 4️⃣ **Validações espalhadas - sem schema**

```javascript
// ❌ PROBLEMA - validations espalhadas em diferentes ficheiros
// Em public-reservation.js:
if (!form.pb-name.value) errors.push('Nome obrigatório');
if (!form.pb-email.value) errors.push('Email obrigatório');
// Em hospedes.js:
if (!name) return error('Nome inválido');
// Em auth.js:
if (email.indexOf('@') === -1) return error('Email mal formatado');

// ✅ SOLUÇÃO - Schema centralizado
// validators.js (novo)
const SCHEMAS = {
  guest: {
    name: {
      required: true,
      pattern: /^.{2,100}$/,
      message: 'Nome 2-100 caracteres'
    },
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Email inválido'
    },
    phone: {
      required: true,
      pattern: /^9\d{8}$/,
      message: 'Telefone PT inválido (9XXXXXXXX)'
    },
    birthDate: {
      required: true,
      validate: (v) => {
        const d = new Date(v);
        const age = new Date().getFullYear() - d.getFullYear();
        if (age < 18 || age > 120) throw new Error('Idade 18-120');
        return true;
      }
    }
  }
};

function validate(obj, schema) {
  const errors = {};
  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];
    if (rules.required && !value) {
      errors[key] = 'Obrigatório';
      continue;
    }
    if (value && rules.pattern && !rules.pattern.test(value)) {
      errors[key] = rules.message;
      continue;
    }
    if (value && rules.validate) {
      try { rules.validate(value); }
      catch (e) { errors[key] = e.message; }
    }
  }
  return errors;
}

// Usar:
const guestData = { name: '', email: 'test@test.com', ... };
const errors = validate(guestData, SCHEMAS.guest);
if (Object.keys(errors).length > 0) {
  Object.entries(errors).forEach(([field, msg]) => {
    document.getElementById(`error-${field}`).textContent = msg;
  });
}
```

**Ganho:** Validações consistentes, fácil de testar, DRY

---

### 5️⃣ **Modal states duplicados em HTML**

```html
<!-- ❌ PROBLEMA - data-step duplica-se com JS -->
<form id="public-booking-form">
  <section class="form-step active" data-step="1">...</section>
  <section class="form-step" data-step="2">...</section>
  <section class="form-step" data-step="3">...</section>
</form>

<!-- Depois em JS: -->
document.getElementById('step-1-btn').onclick = () => showStep(1);
document.getElementById('step-2-btn').onclick = () => showStep(2);
// ... replicado múltiplas vezes
```

```javascript
// ✅ SOLUÇÃO - Usar data attributes + event delegation
function setupMultiStepForm(formId, options = {}) {
  const form = document.getElementById(formId);
  const currentStep = { value: 1 };
  
  const showStep = (num) => {
    form.querySelectorAll('[data-step]').forEach(s => {
      s.classList.toggle('active', s.dataset.step == num);
    });
    form.querySelectorAll('[data-step-dot]').forEach(d => {
      d.classList.toggle('active', d.dataset.stepDot == num);
    });
    currentStep.value = num;
    options.onStepChange?.(num);
  };
  
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next-step]')) {
      const next = Math.min(currentStep.value + 1, 3);
      showStep(next);
    }
    if (e.target.closest('[data-prev-step]')) {
      const prev = Math.max(currentStep.value - 1, 1);
      showStep(prev);
    }
  });
  
  return { showStep, currentStep };
}

// Usar:
const form = setupMultiStepForm('public-booking-form', {
  onStepChange: (step) => console.log('Step:', step)
});
form.showStep(1);
```

**Ganho:** Menos código repetido, lógica centralizada

---

### 6️⃣ **Funções render gigantes sem break de componentes**

```javascript
// ❌ PROBLEMA - renderMobileCards() tem 40+ linhas
function renderMobileCards() {
  const filtered = reservas.filter(...);
  container.innerHTML = filtered.map(r => {
    return `<div class="m-res-card">
      <div class="mrc-top">
        <div>
          <div class="mrc-name">${r.guest_name}</div>
          ...mais 30 linhas de HTML...
        </div>
        ${badgeEstado(r.status)}
      </div>
      ...40+ mais linhas...
    </div>`;
  }).join('');
}

// ✅ SOLUÇÃO - Extrair em "componentes" reutilizáveis
function renderReservationCard(r) {
  return `<div class="m-res-card">
    ${renderCardHeader(r)}
    ${renderCardMeta(r)}
    ${renderCardActions(r)}
  </div>`;
}

function renderCardHeader(r) {
  return `<div class="mrc-top">
    <div>
      <div class="mrc-name">${r.guest_name}</div>
      <div class="mrc-id">${r.id} · ${r.accommodation_name}</div>
    </div>
    ${badgeEstado(r.status)}
  </div>`;
}

function renderCardMeta(r) {
  return `<div class="mrc-meta">
    <div class="mrc-meta-item"><i data-lucide="calendar"></i> ${formatDate(r.check_in)}</div>
    <div class="mrc-meta-item"><i data-lucide="moon"></i> ${r.nights} noite${r.nights !== 1 ? 's' : ''}</div>
  </div>`;
}

function renderCardActions(r) {
  return `<div class="mrc-actions" onclick="event.stopPropagation()">
    <button class="m-card-btn primary" onclick="showDetail('${r.id}')">Ver</button>
    <button class="m-card-btn" onclick="openEditModal('${r.id}')">Editar</button>
  </div>`;
}

// Usar:
function renderMobileCards() {
  const filtered = reservas.filter(...);
  container.innerHTML = filtered.map(renderReservationCard).join('');
  lucide.createIcons();
}
```

**Ganho:** Legibilidade, reutilização, fácil de testar

---

### 7️⃣ **Sem error boundaries - erros silenciosos**

```javascript
// ❌ PROBLEMA
async function loadReservas() {
  const data = await apiGet('/api/reservas');
  reservas = data; // Se falhar, ninguém sabe!
  renderReservasUI();
}

// ✅ SOLUÇÃO - Wrapper com logging
async function loadReservasWithErrorHandling() {
  try {
    const data = await apiGet('/api/reservas');
    reservas = data;
    pubsub.emit('reservas:loaded', reservas);
    renderReservasUI();
  } catch (error) {
    console.error('❌ Erro ao carregar reservas:', error);
    toast('Erro ao carregar reservas: ' + error.message, 'error');
    // Log para servidor (para monitoramento)
    logError('loadReservas', error);
  }
}

function logError(context, error) {
  // Envia para servidor/Sentry/etc
  apiPost('/api/logs/error', {
    context,
    message: error.message,
    stack: error.stack,
    url: window.location.href,
    timestamp: new Date().toISOString()
  }).catch(() => {}); // Silencioso se log falhar
}
```

**Ganho:** Bugs debugados rapidamente, monitoramento de produção

---

## 🚀 Checklist de Melhorias (Por Ordem de Impacto)

- [ ] **1. Criar `pubsub.js`** - Pub/sub simples para state syncing
- [ ] **2. Criar `validators.js`** - Schema centralizado de validações
- [ ] **3. Refatorar `app.js`** - Event delegation em vez de listeners individuais
- [ ] **4. Refatorar `reservas.js`** - Quebrar renderMobileCards/renderTable em componentes menores
- [ ] **5. Refatorar `alojamentos.js`** - Eliminar innerHTML em loops
- [ ] **6. Adicionar error handling** - Try/catch com logging
- [ ] **7. Extrair componentes render** - public-reservation, calendario, etc

---

## 📝 Exemplo: Aplicar Tudo Junto

```javascript
// ── novo pubsub.js ──
const pubsub = {
  events: {},
  on(e, cb) {
    if (!this.events[e]) this.events[e] = [];
    this.events[e].push(cb);
  },
  emit(e, d) { this.events[e]?.forEach(cb => cb(d)); }
};

// ── state.js (modificado) ──
let reservas = [];

async function loadReservas() {
  try {
    const data = await apiGet('/api/reservas');
    reservas = data;
    pubsub.emit('reservas:updated', reservas);
  } catch (e) {
    logError('loadReservas', e);
    toast('Erro ao carregar reservas', 'error');
  }
}

// ── reservas.js (modificado) ──
function init() {
  // Subscrever a mudanças de reservas
  pubsub.on('reservas:updated', () => renderUI());
  
  // Delegação de eventos
  document.getElementById('reservas-view').addEventListener('click', (e) => {
    if (e.target.closest('.res-edit-btn')) {
      const id = e.target.closest('tr').dataset.reservaId;
      openEditModal(id);
    }
    if (e.target.closest('.res-delete-btn')) {
      const id = e.target.closest('tr').dataset.reservaId;
      deleteReserva(id);
    }
  });
}

// Validar antes de enviar
async function saveReserva(data) {
  const errors = validate(data, SCHEMAS.guest);
  if (Object.keys(errors).length > 0) {
    showValidationErrors(errors);
    return;
  }
  
  try {
    const result = await apiPost('/api/reservas', data);
    toast('Reserva salva!', 'success');
    await loadReservas();
  } catch (e) {
    logError('saveReserva', e);
    toast('Erro ao salvar', 'error');
  }
}
```

---

## 📊 Impacto Esperado

| Melhoria | Performance | Qualidade | Tempo Dev |
|----------|------------|-----------|-----------|
| Pub/Sub state | ⬆️⬆️ | ⬆️⬆️ | 4h |
| Validators schema | ➡️ | ⬆️⬆️ | 3h |
| Event delegation | ⬆️ | ⬆️ | 2h |
| Render components | ➡️ | ⬆️⬆️ | 6h |
| DOM fragments | ⬆️⬆️ | ➡️ | 2h |
| Error handling | ➡️ | ⬆️⬆️ | 3h |

**Total: ~20h de refactoring → visível melhoria de estabilidade e manutenibilidade**

---

## Atualização 2026-05-11 — Prioridades Reais no Código Atual

### 1. Reutilizar UI antes de criar novos botões/animações
- Manter todos os botões novos em cima de `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-success`, `.btn-sm` e, se necessário, criar só `.btn-icon`.
- Centralizar loading/disabled em helper JS, por exemplo `setButtonLoading(button, true, 'A guardar...')`.
- Evitar `style="..."` em botões no `index.html`; criar classes em `components.css`.
- Reduzir animações novas: reaproveitar `viewFadeIn`, `softIn`, `slideUpSmooth`, `spinSmooth`.

### 2. Separar regras de negócio de render
Ficheiros como `reservas.js`, `alojamentos.js` e `public-reservation.js` misturam:
- chamadas API
- cálculo de preço/disponibilidade
- validação
- render HTML
- listeners e estado de modal

Separação recomendada:
- `frontend/js/domain/dates.js`
- `frontend/js/domain/pricing.js`
- `frontend/js/domain/availability.js`
- `frontend/js/ui/modal.js`
- `frontend/js/ui/dropdown.js`
- `frontend/js/ui/date-picker.js`

### 3. Backend: extrair regras que já cresceram
- `reservationController.js` deve perder regras para `services/reservationRules.js`.
- `accommodationController.js` deve delegar imagens para `services/imageService.js`.
- Validações de payload devem ficar num módulo comum para reservas, hóspedes, alojamentos e equipa.

### 4. Atenções de produção
- Decidir se o `emailScheduler` deve arrancar automaticamente; neste momento existe mas não é chamado no `server.js`.
- `backend/src/config/app.js` já foi removido; o entrypoint único é `backend/src/app.js`.
- Rodar credenciais se `.env` tiver sido partilhado.
- Criar testes mínimos antes de refatorar regras de reserva/preço.

### 5. Feito nesta ronda
- Regras puras de reservas no backend ficaram em `backend/src/services/reservationRules.js`.
- `reservationController.js` e `publicBookingController.js` passaram a usar a mesma lógica para datas, noites, totais, ocupação extra e estado de pagamento.
- Foram adicionados testes mínimos em `reservationRules.test.js` e script `npm test`.
- No frontend foram criados `js/domain/dates.js`, `js/domain/pricing.js` e `js/ui.js`.
- O loading de alguns botões já usa `AppUI.setButtonLoading()`.
- `AppUI.enhanceSelect()` já aplica dropdown pesquisável ao backoffice usando o visual da página pública sem mudar a leitura de `.value`.
- `AppUI.openModal()` / `AppUI.closeModal()` já começaram a substituir manipulação manual de classes em modais simples.
- `availabilityRules.js` adiciona regras testáveis para hierarquia pai/filhos e overlap/back-to-back.
