# Melhorias técnicas

> Âmbito de versões (24/10/2026): consultar a [classificação consolidada V1/V2](ESCOPO-V1-V2.md). Distingue requisitos de fiabilidade, correções mobile já concluídas e melhorias que podem acompanhar a 2.0.

> Atualização de 23/10/2026: concluída a [revisão funcional para fechar a 1.0](REVISAO-FUNCIONAL-2026-10-23.md), com reproduções atuais e critérios de conclusão. A suite geral de browser já passa e as 13 falhas mobile foram corrigidas; continuam pendentes os bloqueadores funcionais e operacionais identificados nessa revisão.

Backlog técnico atualizado em 8 de outubro de 2026, após revisão do
código (backend, frontend, infraestrutura e documentação). Este documento contém
trabalho de engenharia; funcionalidades e integrações pertencem ao
[roadmap de produto](ROADMAP.md).

As correções anteriores já não aparecem aqui (ver Git). Os achados novos ainda
não foram corrigidos. Evidência, âmbito, limitações e critérios de conclusão
estão no [relatório de 8 de outubro](REVISAO-2026-10-08.md).

## Ordem de execução após a revisão de 8 de outubro

Os códigos referem-se ao relatório. Esta lista prevalece sobre a ordenação
histórica das secções abaixo; P1 no relatório significa antes da publicação.

- [ ] **Segurança:** impedir exposição de tokens de reserva a staff (S01),
  rejeitar injeção de cabeçalhos MIME em todos os envios (S02), atualizar
  dependências vulneráveis (S03), reforçar alterações de conta/convites (S04)
  e neutralizar fórmulas em CSV (S06).
- [ ] **Emails:** eliminar sucesso falso e envios duplicados (M01–M02), usar
  contexto completo e regras coerentes no scheduler e no envio manual
  (M03–M05), alinhar idioma, composição e histórico (M06–M08).
- [ ] **Pagamentos:** tratar os casos de consentimento/reconciliação e manter
  os montantes aprovados pelo operador durante o cancelamento (P01–P03).
- [ ] **Dados:** preservar campos em atualizações parciais, validar datas e
  valores, corrigir disponibilidade de unidades e comparações monetárias
  (D01–D04); uniformizar datas locais e rever identificadores (D05).
- [ ] **Publicação:** recuperar a suite geral de browser, acrescentar
  regressões para os problemas reproduzidos e integrar os novos checks na CI
  (O01); concluir as validações operacionais abaixo.
- [ ] **Organização e operação:** centralizar eventos e consultas partilhadas,
  melhorar filas, restauro e observabilidade, e reduzir módulos grandes e
  artefactos versionados (O02–O06).

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
Migrar os estilos inline antes de remover `'unsafe-inline'` de `style-src`.

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

Nomes, notas e moradas chegam de formulários públicos. Exportações CSV devem
neutralizar campos textuais não fiáveis começados por `=`, `+`, `-`, `@`,
tabulação ou CR; colocar aspas não impede a interpretação como fórmula.
Em XLSX, verificar que estes campos têm tipo texto e nenhuma propriedade `f`.
Não assumir que uma string tipada no SheetJS é executada como fórmula.

### Vouchers consumidos por reservas públicas não pagas

A expiração automática (TTL) cancela pedidos públicos sem pagamento, mas a
utilização do voucher não é reposta. Um código partilhado pode ser esgotado com
pedidos que nunca pagam. Decidir se a expiração por TTL — não o cancelamento
manual — devolve a utilização.

### Robustez do processo

- Definir tratamento de falhas assíncronas fatais com registo útil, encerramento
  controlado e reinício pelo supervisor. Não manter indefinidamente um processo
  com estado possivelmente inconsistente. No encerramento normal, esperar pelas
  operações em curso dos schedulers, com prazo máximo.
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
- Auditoria de 8 de outubro: backend com avisos em `proxy-addr`, `sharp` e
  `source-map-js`; frontend com avisos baixos em `dompurify`, via jsPDF.
  Ver S03 no relatório para versões e condições de exposição. Atualizar de
  forma dirigida; confirmar também os recursos CDN efetivamente servidos.

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

Uniformizar os percursos descritos em M01–M08 no relatório: transporte comum
não garante composição, regras, fila ou histórico comuns. Corrigir primeiro
os problemas funcionais reproduzidos.

Testar renderização em Gmail, Outlook e Apple Mail, versões mobile e dark mode.
Adicionar monitorização de rejeições e falhas permanentes antes de aumentar a
automação. O scheduler só considera estadias com a data de referência do modelo
entre 8 dias atrás e 31 dias à frente.

## Regra de manutenção

Uma melhoria só passa a concluída quando o comportamento estiver validado e a
documentação relevante tiver sido atualizada. Itens concluídos devem sair deste
ficheiro; o histórico pertence ao Git e às notas de versão, não a um backlog
permanente.
