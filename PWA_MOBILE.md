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

1. Melhorar layout mobile principal: dashboard, navegação e calendário/agenda.
2. Adicionar manifest, ícones e meta tags iOS.
3. Adicionar service worker básico.
4. Tornar a app instalável e testar em iPhone/iPad.
5. Criar UI de estado PWA/notificações.
6. Implementar subscriptions Web Push no frontend.
7. Implementar backend de push.
8. Enviar notificação de teste.
9. Ligar notificações reais a reservas, pagamentos e tarefas.
10. Adicionar preferências por utilizador.

---

## Critérios de Sucesso

- A app pode ser adicionada ao ecrã principal no iPhone e iPad.
- Ao abrir pelo ícone, parece uma app e não uma página dentro do Safari.
- A navegação mobile permite operar o dia sem depender do desktop.
- O utilizador consegue ativar/desativar notificações.
- Push de teste chega ao iPhone/iPad instalado.
- Notificações reais são úteis, poucas e acionáveis.

