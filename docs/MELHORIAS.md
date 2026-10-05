# Melhorias técnicas

Backlog técnico revisto em 5 de outubro de 2026, após auditoria completa do
código (backend, frontend, infraestrutura e documentação). Este documento contém
trabalho de engenharia; funcionalidades e integrações pertencem ao
[roadmap de produto](ROADMAP.md).

As correções feitas durante a auditoria já não aparecem aqui (ver Git). As
restantes estão abaixo, por prioridade.

## P0 — antes da próxima publicação

### Cores dos emails no Gmail para iPhone

Regressão reportada em 26 de setembro: fundo creme escurecido e cabeçalho
terracota convertido em salmão, numa conta Google. As novas capturas do
utilizador mostram melhoria das cores. O refinamento visual aprovado para
teste está preparado localmente, pendente de nova validação no dispositivo.
Testes de HTML e capturas de browser não certificam o modo escuro deste cliente.

Critérios e limitações em [Email / Gmail](EMAIL-GMAIL.md).

### Validar a correção de Google Tasks em produção

Critérios de conclusão:

- migração `google_task_cleanup_queue` aplicada;
- eliminação de reserva remove tarefas relacionadas, incluindo concluídas;
- falha temporária deixa a operação pendente e uma execução posterior conclui;
- estado da integração mostra `cleanup_pending` coerente;
- limpeza dos órfãos anteriores é feita com pré-visualização e registo.

### Validar pagamentos Stripe antes de ativar Live

Executar a lista de [pagamentos Stripe](stripe-payments.md#validar) na conta de
teste real e guardar evidência. Só depois seguir «Passar para Live».

### Confirmar recuperação de dados

Critérios de conclusão:

- backup automatizado de base de dados e uploads;
- chave de tokens guardada separadamente e acessível a responsáveis definidos;
- restauro ensaiado num ambiente isolado;
- tempos de recuperação e perda máxima aceitável registados.

## P1 — segurança

### Restringir a CSP aos ficheiros realmente usados

`script-src` autoriza os domínios inteiros `unpkg.com`, `cdn.jsdelivr.net` e
`cdnjs.cloudflare.com`. Qualquer pacote público nesses CDN passa a ser
executável se surgir uma injeção de HTML. Alojar localmente (como já acontece
com SheetJS e flag-icons) ou limitar a CSP aos caminhos exatos com versão.
Em seguida, remover `'unsafe-inline'` de `style-src`.

### Origem CORS de produção vem do código

`ALLOWED_ORIGINS_PROD` em `app.js` fixa `santapaciencia.xyz`. Derivar de
`PUBLIC_APP_URL` (já validado no arranque) para evitar divergências entre
ambientes.

### Convites e propriedade

- Tokens de convite ficam em claro na base de dados; sessões e recuperação de
  palavra-passe já usam hash. Guardar `sha256` e aceitar o formato antigo
  durante a validade (7 dias).
- `POST /api/team/invitations` recusa emails com conta, mas a aceitação suporta
  contas existentes. Decidir se um utilizador pode pertencer a várias
  organizações por convite e alinhar os dois lados.
- Um proprietário pode promover outro membro a `owner`, que depois não pode
  ser despromovido nem removido por ninguém. Definir transferência de
  propriedade explícita.

### Conta do utilizador

- `/auth/change-password` e a mudança de email em `/auth/profile` não têm
  rate limit; com uma sessão roubada permitem testar a palavra-passe atual.
- A mudança de email não confirma o novo endereço nem avisa o antigo.

### Exportações e fórmulas

Nomes, notas e moradas chegam de formulários públicos. Exportações XLSX/CSV
devem neutralizar valores começados por `=`, `+`, `-`, `@`, tabulação ou CR
(prefixo `'`) para evitar injeção de fórmulas na folha de cálculo.

### Vouchers consumidos por reservas públicas não pagas

A expiração automática (TTL) cancela pedidos públicos sem pagamento, mas a
utilização do voucher não é reposta. Um código partilhado pode ser esgotado com
pedidos que nunca pagam. Decidir se a expiração por TTL — não o cancelamento
manual — devolve a utilização.

### Robustez do processo

- Não existe `process.on('unhandledRejection')`. As chamadas assíncronas sem
  `await` atuais apanham erros, mas uma regressão futura termina o processo
  sem registo útil. Acrescentar handler que regista e mantém o processo.
- A fila `organization_email_queue` repete falhas a cada hora sem limite de
  tentativas nem registo do último erro.
- Tentativas Stripe `creating` com mais de 23 horas ficam bloqueadas sem
  ecrã de reconciliação (só via Dashboard).

## P1 — fiabilidade e operação

### Datas «hoje» em UTC no frontend

O backend passou a usar `localDateIso()` (fuso do servidor). O frontend ainda
calcula «hoje» com `new Date().toISOString().slice(0, 10)` em cerca de 20
sítios (calendário, eventos, vouchers, despesas, notificações, assistente de
reserva, nomes de ficheiros). Em Lisboa, no verão, entre as 00h e a 01h,
o dia aparece errado. Usar o `todayIso()` já existente em
`domain/date-picker.js` através de um helper partilhado.

### Identificadores curtos

`uuidv4().slice(0, 8)` (32 bits) gera IDs de despesas, fornecedores, vouchers,
períodos de preço, bloqueios e reservas internas (`SP-XXXXXXXX`). As chaves
primárias são globais: com dezenas de milhares de linhas a colisão deixa de ser
improvável e falha como erro 500. O ID de alojamento junta o nome a 4 dígitos
do relógio. Usar UUID completo ou pelo menos 48 bits, mantendo IDs antigos.

### Observabilidade estruturada

Substituir logs dispersos por eventos estruturados com nível, pedido,
organização, integração e duração, sem dados pessoais desnecessários. Criar
alertas para falhas repetidas, filas antigas, schedulers inativos e falta de
espaço.

Conclusão: uma falha de email, Tasks, Stripe ou reserva pública pode ser
localizada por correlation ID sem expor tokens, documentos ou conteúdo sensível.

### Auditoria de ações sensíveis

Registar alterações de papéis, acessos a documentos, importação/restauro,
alterações de configurações e operações manuais sobre integrações. Definir
retenção, acesso e exportação desses registos.

### Testes de fluxos completos

Acrescentar cenários de integração para CRUD de reservas, pagamentos,
pré-check-in, isolamento entre organizações, reautorização OAuth e repetição dos
schedulers. Manter os testes de regressão de segurança já existentes.

### Cadeia de fornecimento e containers

- Fixar a versão ou digest de `cloudflare/cloudflared` (hoje `latest`).
- O `Dockerfile` instala `zip`/`unzip`, mas os backups usam `archiver` e
  `unzipper` em JavaScript: retirar.
- O Compose monta `./tokens`, usado apenas pelo caminho legado
  `tokens/google_token.json` em `config/google.js`. Confirmar que não há tokens
  legados e remover ambos.
- Dependências backend com versão maior nova: `better-sqlite3` 13,
  `google-auth-library` 11, `archiver` 8, `dotenv` 18. Atualizações menores
  pendentes: `helmet`, `express-rate-limit`, `sharp`, `unzipper`, `uuid`.
- Frontend: aviso de severidade baixa em `dompurify` (via `jspdf` 4.2.1).

### Privacidade e retenção

Inventariar dados pessoais, justificar prazos de retenção e automatizar
eliminação/anonimização onde aplicável. Rever exports, logs, uploads e backups.
Incluir no inventário o envio de fotografias de talões à API da Anthropic
(leitura automática de despesas) e o respetivo enquadramento contratual.

## P2 — manutenção e experiência

### Código duplicado

- Seis implementações de escape HTML no frontend (`helpers.js`,
  `public-reservation.js`, `pre-checkin.js`, `features/emails/editor.js`,
  `features/invoice/auxiliares.js`, `features/alojamentos/configuracao.js`).
  Um módulo de domínio carregado por todas as páginas evita divergências.
- Os callbacks OAuth do Gmail e do Tasks repetem a troca manual do código por
  tokens; extrair um helper.
- `reservationWriteController.update` verifica conflitos dos alojamentos
  adicionais num ciclo e volta a fazê-lo em `validateExtraUnits`.
- O padrão `throw Object.assign(new Error(({ error: '...' }).error), …)` em
  `reservationWriteController.js` deve dar lugar a um `httpError(status, msg)`.
- O parser JSON de 15 MB para alojamentos/despesas é declarado em `app.js` e
  outra vez nas rotas.
- `uuid` pode ser substituído por `crypto.randomUUID()`.
- Grelha mensal com empacotamento em faixas repetida em `renderCal`,
  `renderCalLandscape` e `renderEventosCalendar`; extrair `packWeekLanes`.

### Higiene do repositório

- Pasta `--help/` com capturas geradas por engano e `output/` com imagens
  avulsas estão no Git.
- `backend/src/data/uploads/cover_*.png` continuam versionados apesar de
  `backend/src/data/` estar no `.gitignore`.
- `scripts/qa-temp-seed2.js` refere um `qa-temp-teardown2.js` que não existe.
- `.agents/skills` é uma cópia integral de `.claude/skills`.

### Modularizar ficheiros grandes

Continuar a divisão por funcionalidade. Os principais candidatos atuais são
`frontend/js/eventos.js`, `despesas.js`, `auth.js`, `app.js`, `precos.js`,
`index.html` e as folhas CSS de operações/reservas. Cada extração deve manter
comportamento, reduzir estado global e ganhar testes específicos.

### Páginas de retorno OAuth

As páginas de sucesso dos callbacks Google têm `<script>` inline para fechar
a janela, bloqueado pela CSP. Usar um script externo ou remover a promessa de
fecho automático.

### Acessibilidade e dispositivos reais

Executar auditoria WCAG nos fluxos de reserva, calendário, modais, tabelas e
pré-check-in. Validar teclado, leitor de ecrã, contraste, zoom e telemóveis iOS e
Android reais, incluindo instalação/atualização da PWA.

### Desempenho e carga

Manter o orçamento automatizado do frontend e acrescentar medições de API com
volumes realistas. `lucide` (402 KB) carrega sempre no arranque: gerar um build
só com os ícones usados. Rever índices e paginação quando a base crescer.
Definir o ponto em que SQLite deixa de cumprir concorrência, disponibilidade ou
escala.

### Qualidade de email

Testar renderização em Gmail, Outlook e Apple Mail, versões mobile e dark mode.
Adicionar monitorização de rejeições e falhas permanentes antes de aumentar a
automação. O scheduler só considera estadias com a data de referência do modelo
entre 8 dias atrás e 31 dias à frente.

## Regra de manutenção

Uma melhoria só passa a concluída quando o comportamento estiver validado e a
documentação relevante tiver sido atualizada. Itens concluídos devem sair deste
ficheiro; o histórico pertence ao Git e às notas de versão, não a um backlog
permanente.
