# Santa Paciência — Plano PWA Mobile

> Criado em 2026-05-19. Documento de referência para quando a interface mobile for trabalhada.

---

## Objetivo

Transformar a versão mobile da Santa Paciência numa **PWA instalável** para iPhone e iPad, mantendo a mesma base web atual.

A instalação será feita pelo navegador:

- iPhone/iPad: Safari -> Partilhar -> Adicionar ao ecrã principal
- Não requer App Store para a primeira versão
- Não requer conta Apple Developer para Web Push

Esta abordagem deve ser priorizada antes de pensar numa app nativa ou numa app empacotada com Capacitor.

---

## Decisão de Produto

A versão mobile não deve tentar copiar a versão desktop inteira em ecrã pequeno.

O foco mobile deve ser operacional:

- Ver o estado do dia rapidamente
- Receber e consultar notificações
- Gerir check-ins e check-outs
- Confirmar pagamentos
- Consultar reservas, hóspedes e tarefas
- Fazer ações rápidas fora do computador

O desktop continua a ser a melhor experiência para gestão pesada:

- Relatórios completos
- Configurações
- Templates de email
- Gestão detalhada de alojamentos
- Galerias/imagens
- Preços dinâmicos avançados
- Backup/importação

Importante: funcionalidades críticas não devem desaparecer no telemóvel. Podem ficar mais simplificadas, reorganizadas ou escondidas em menus secundários, mas a app deve permitir resolver situações urgentes sem obrigar a abrir o computador.

---

## iPhone e iPad

Para esta estratégia, iPhone e iPad entram no mesmo caminho técnico: **PWA instalada no ecrã principal**.

Diferenças esperadas:

- iPhone: experiência compacta, focada em ações rápidas e agenda do dia
- iPad: pode aproveitar layouts intermédios, mais próximos do desktop, com mais colunas e painéis laterais

Ao desenhar responsivo, considerar pelo menos:

- Mobile pequeno: ate 600px
- Tablet/iPad: 768px a 1024px
- Desktop: acima de 1024px

---

## Requisitos Técnicos PWA

Adicionar ao frontend:

- `manifest.webmanifest`
- Ícones em vários tamanhos, incluindo `apple-touch-icon`
- Meta tags iOS em `index.html`
- `service-worker.js`
- Registo do service worker no JavaScript da app
- Tema/cor da app consistente com a marca
- Modo standalone/fullscreen quando instalada

O `manifest` deve incluir:

- `name`: Santa Paciência
- `short_name`: Santa Paciência
- `start_url`
- `scope`
- `display`: `standalone`
- `theme_color`
- `background_color`
- `icons`

---

## Notificações Push

Em iPhone/iPad, notificações push em PWA exigem:

- iOS/iPadOS 16.4 ou superior
- App adicionada ao ecrã principal
- App aberta pelo ícone do ecrã principal
- Permissão pedida após ação explícita do utilizador
- Service worker ativo
- Push API/Web Push com VAPID keys
- Backend capaz de guardar subscriptions e enviar push

Não contar com push se o utilizador abrir apenas no Safari normal.

### Notificações úteis para esta app

Prioridade alta:

- Check-in hoje
- Check-out hoje
- Reserva pendente
- Pagamento em falta
- Tarefa importante hoje

Prioridade média:

- Check-in amanhã
- Check-out amanhã
- Tarefa importante amanhã
- Lembrete de exportação/backup

Evitar excesso de notificações. A app deve permitir configurar o que cada utilizador quer receber.

---

## Backend Necessário para Push

Criar estrutura para:

- Guardar subscriptions por utilizador/organização/dispositivo
- Remover subscriptions inválidas
- Enviar notificações por evento ou por scheduler
- Respeitar permissões e papéis (`owner`, `manager`, `staff`)
- Evitar duplicados

Possíveis tabelas:

```sql
push_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  UNIQUE(user_id, endpoint)
)
```

Endpoints prováveis:

- `POST /api/push/subscribe`
- `DELETE /api/push/subscribe`
- `POST /api/push/test`
- `GET /api/push/status`

Biblioteca provável no backend:

- `web-push`

Variáveis de ambiente:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:...
```

---

## Implicações para a Interface Mobile

Ao trabalhar a interface mobile, prever:

- Ecrã inicial tipo "Hoje"
- Botão claro para ativar notificações
- Estado visível: notificações ativas/inativas
- Navegação inferior ou drawer simples
- Ações rápidas em reservas e tarefas
- Cards compactos para chegadas, partidas e tarefas
- Modais curtos; evitar formulários enormes num único ecrã
- Estados vazios claros
- Boa área de toque nos botões
- Sem dependência de hover
- Evitar tabelas largas; usar cards/listas no mobile

O botão de ativar notificações deve aparecer apenas quando fizer sentido:

- App está instalada/standalone, ou
- Mostrar instrução para adicionar ao ecrã principal antes de pedir push

---

## Ordem Recomendada de Implementação

1. ✅ Melhorar layout mobile principal: dashboard, navegação e calendário/agenda.
2. ✅ Adicionar manifest, ícones e meta tags iOS.
3. ✅ Adicionar service worker básico.
4. Tornar a app instalável e testar em iPhone/iPad real.
5. Criar UI de estado PWA/notificações.
6. Implementar subscriptions Web Push no frontend.
7. Implementar backend de push.
8. Enviar notificação de teste.
9. Ligar notificações reais a reservas, pagamentos e tarefas.
10. Adicionar preferências por utilizador.

---

## O Que Foi Implementado (2026-05-19)

### CSS Mobile — `frontend/css/mobile.css` (novo ficheiro dedicado)

Ficheiro separado do CSS desktop para evitar interferências. Carregado por último em `index.html`.

**Correções críticas:**
- `font-size: 16px` em todos os inputs no mobile — previne auto-zoom do iOS Safari
- `touch-action: manipulation` em todos os elementos interativos — elimina atraso de 300ms
- `min-height: 44px` nos botões de ação e `52px` nos itens da bottom nav (Apple HIG)
- `overscroll-behavior-y: contain` no scroll principal — previne pull-to-refresh acidental
- Sidebar forçada a `transform: translateX(-240px) !important` em `≤767px` — corrige bug em que a sidebar ficava visível em mobile

**Melhorias visuais:**
- Press feedback com `transform: scale()` + `opacity` em cards, chips e FAB (GPU-accelerated, sem layout reflow)
- Bottom nav: pill de fundo no item ativo, icon faz scale(1.08) com spring animation, label ativo em bold
- Transição entre views: `mobileViewEnter` — fade + translateY(8px→0) em 220ms
- Modais: slide-up com spring animation (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
- `prefers-reduced-motion`: desativa todas as animações para utilizadores com sensibilidade ao movimento

**Breakpoint iPad (768–1023px):**
- Sidebar persistente (sempre visível, sem drawer) — hamburger escondido
- KPI em 2 colunas, formulários em 2 colunas, modais centrados
- Layout de email restaurado com 2 colunas

**Contraste de texto:**
- `--cinza` alterado de `#8a8278` para `#6b6460` — passa de 3.5:1 para 5.1:1 (WCAG AA ✓)

### Páginas Mobile Melhoradas

**Vouchers (`frontend/js/vouchers.js`):**
- `renderVouchersList` agora gera dois layouts: tabela (desktop) + cards (mobile)
- `.vouchers-desktop` / `.vouchers-mobile` — CSS mostra o layout correto por breakpoint
- Card mobile: código em monospace, badge de estado, tipo com ícone, valor em Playfair Display, validade, ações com touch targets corretos

**Notificações:**
- `.notifications-page-item` reformulado para layout em flex horizontal com ícone colorido por prioridade (vermelho/laranja/verde)
- Cada item é um card com sombra, border-left colorida, press feedback

**Relatórios:**
- KPI em grid 2×2 no mobile (antes em linha horizontal)
- Gráficos empilhados verticalmente (antes lado a lado)
- Sub-tabs scrolláveis horizontalmente
- Altura de canvas reduzida para 200px no mobile

### PWA

**`frontend/manifest.webmanifest` (novo):**
- `display: standalone`, `theme_color: #843424`
- Shortcuts para Dashboard e Reservas
- Referencia ícones em `/icons/` (a criar — ver secção Ícones)

**`frontend/index.html`:**
- Meta tags iOS: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`
- `theme-color: #843424`
- Link para `manifest.webmanifest`
- Link para `css/mobile.css`

**`frontend/service-worker.js` (novo):**
- Cache-first para assets estáticos e CDN (fontes, Lucide, Chart.js)
- Network-first para `/api/*`
- Fallback offline: resposta JSON com `{ error: 'offline' }` para API
- Handler para Push Notifications (pronto para integração backend)

**Nota de desenvolvimento:** o registo do SW em `app.js` está comentado durante desenvolvimento activo para evitar que o browser sirva CSS cacheado em vez do ficheiro actual. Descomentar antes de testar instalação PWA em dispositivo real.

### Ícones PWA — Por Fazer

O manifest aponta para `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-180.png`. Estes ficheiros têm de ser criados manualmente. Sugestão:
- Gerar a partir do favicon ou de um SVG com as cores da marca (`#843424` + `#c9a84c`)
- Ferramentas: Figma, [favicon.io](https://favicon.io), ou ImageMagick: `convert favicon.png -resize 192x192 icon-192.png`
- O ícone iOS (`icon-180.png`) deve ser PNG sem transparência e pelo menos 180×180px

---

## Critérios de Sucesso

- A app pode ser adicionada ao ecrã principal no iPhone e iPad.
- Ao abrir pelo ícone, parece uma app e não uma página dentro do Safari.
- A navegação mobile permite operar o dia sem depender do desktop.
- O utilizador consegue ativar/desativar notificações.
- Push de teste chega ao iPhone/iPad instalado.
- Notificações reais são úteis, poucas e acionáveis.

