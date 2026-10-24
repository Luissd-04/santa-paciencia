# Operações

Procedimentos de desenvolvimento, publicação e recuperação. Confirmado em 5 de
outubro de 2026.

## Configuração

O ficheiro de referência é `backend/src/.env.example`. As variáveis essenciais
em produção são:

- `NODE_ENV=production`, `PORT`, `TZ`;
- `APP_BIND_IP`, no ficheiro `.env` da raiz, quando o Cloudflare Tunnel aponta
  para um IP do servidor em vez de `127.0.0.1`;
- `PUBLIC_APP_URL` com origem HTTPS canónica;
- `TRUST_PROXY` limitado aos proxies realmente controlados;
- `DB_PATH` e `FRONTEND_PATH`;
- credenciais Google e os três redirect URIs, quando a integração está ativa;
- chaves Turnstile para aceitar reservas públicas;
- `TOKEN_ENCRYPTION_KEY` ou `TOKEN_ENCRYPTION_KEY_FILE`, se a chave não for
  gerada junto à base de dados;
- `EMAIL_ENABLED`, que funciona como interruptor global de envio;
- `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e
  `STRIPE_ORGANIZATION_ID` para pagamentos online
  ([pagamentos Stripe](stripe-payments.md));
- `ANTHROPIC_API_KEY`, opcional, para a leitura automática de talões.

`TZ` define o dia «hoje» usado em dashboards, notificações, vouchers e
schedulers; manter `Europe/Lisbon` salvo instalação noutro fuso.

O `GOOGLE_CLIENT_SECRET` também protege o estado OAuth. Não reutilizar
credenciais entre ambientes nem guardar segredos no Git.

## Desenvolvimento local

```bash
cd backend/src
cp .env.example .env
npm ci
npm run create-admin -- "Nome" "email@dominio.pt" "palavra-passe"
npm run dev
```

Definir no `.env` um `DB_PATH` local e o caminho absoluto de `FRONTEND_PATH`.
Desativar email com `EMAIL_ENABLED=false` quando não se pretende enviar mensagens
reais. As chaves de teste oficiais do Turnstile estão comentadas no template.

## Publicação com Docker

O Compose monta `./data` em `/app/data` (base, uploads, chave dos tokens) e
`./tokens` em `/tokens` (token Google legado), executa o container com
filesystem read-only e, por omissão, expõe a aplicação apenas no loopback. Se o
serviço de origem do Cloudflare Tunnel usar o IP LAN do servidor, definir esse
IP em `APP_BIND_IP` no `.env` da raiz. O Cloudflare Tunnel é o ponto de entrada
público.

### Antes de publicar

1. Versão identificada: commit/tag com o working tree limpo e a CI verde nesse
   commit (os checks locais não substituem a execução remota).
2. Identificar o commit **atualmente publicado** e correr
   `node scripts/check-upgrade-rollback.cjs --previous <backend/src desse commit>`
   (extrair com `git archive <commit> backend/src frontend | tar -x -C <pasta>`
   e ligar `node_modules`). Confirma a migração (2×) e a reversão do código.
3. Rever a lista de migrações novas (abaixo) e o espaço livre no volume `data`
   (a migração não duplica a base, mas o backup sim).
4. Backup da instância (secção seguinte), copiado para fora do servidor, com a
   chave à parte; `verify` com a chave antes de continuar.
5. Configuração: comparar o `.env` com `backend/src/.env.example`;
   `PUBLIC_APP_URL` com a origem HTTPS canónica, `TZ=Europe/Lisbon`,
   `TRUST_PROXY` correto, `STRIPE_MODE`/chaves do modo pretendido,
   `EMAIL_ENABLED` com o valor decidido.
6. Avisar a equipa: quem tiver a aplicação aberta recebe «versão nova
   disponível» e recarrega ao abrir a secção seguinte (ver «Atualizações da PWA»).
7. Fixar as imagens externas: `cloudflare/cloudflared:latest` e `node:22-alpine`
   não estão fixadas por versão/digest — publicar com a mesma imagem testada.

### Publicar

```bash
docker compose build backend && docker compose up -d backend
docker compose logs --since 5m backend   # migrações e schedulers arrancados
```

### Depois de publicar

1. `GET /health` → `{"status":"ok"}`; login; abrir Reservas, uma ficha,
   Calendário e Preços no telemóvel.
2. `SELECT id FROM schema_migrations ORDER BY id` inclui as migrações novas.
3. `GET /api/ops/status`: filas a zero ou a descer, sem tentativas Stripe
   paradas, schedulers com `last_ok` recente.
4. Estados das integrações (Calendar/Gmail/Tasks ligados como antes); um email
   de teste só se `EMAIL_ENABLED` o permitir e com autorização.
5. Criar e cancelar uma reserva sintética numa unidade de teste (se existir) e
   confirmar o evento Google criado e removido; apagar a reserva.
6. Durante 24 h: logs de erro, `GET /api/ops/status` e o Dashboard Stripe
   (webhooks entregues).

### Reverter

As migrações deste bloco são aditivas (tabelas e colunas novas). O código
anterior arranca e lê/escreve sobre a base migrada — verificado por
`check-upgrade-rollback.cjs` contra o último commit. Para reverter:

1. Voltar à imagem anterior (`docker compose up -d` com a tag anterior), sem
   restaurar a base, se o problema for de código.
2. Efeitos conhecidos ao voltar atrás: convites pendentes deixam de abrir (os
   tokens passaram a hash — reenviar); a fila do Google Calendar fica parada até
   voltar a esta versão; reservas canceladas nesta versão já não têm o ID do
   evento Google (foi movido para a fila).
3. Restaurar a base só se os dados estiverem errados — com o procedimento de
   restauro (pasta nova, email e Stripe desligados até reconciliar).

## Migrações

As migrações correm automaticamente no arranque. Por isso:

- nunca publicar sem backup prévio;
- não iniciar simultaneamente uma versão nova em várias réplicas sem validar a
  segurança concorrente da migração;
- não reverter apenas o binário se uma migração deixou o esquema incompatível;
- registar qualquer migração que exija uma tarefa manual no roadmap ou na nota
  da versão.

As migrações versionadas ficam em `schema_migrations`. Novas face ao último
commit (`032339b`), por ordem:

- `20261006_payment_policy` — política de pagamentos (colunas em reservas);
- `20261024_invitation_hashes` — tokens de convite guardados em hash;
- `20261024_voucher_release` — libertação de vouchers em cancelamentos;
- `20261024_policy_channels` — política só para site/direto (altera dados de
  reservas de outros canais sem pagamentos online);
- `20261024_google_calendar_queue` — fila durável do Google Calendar e calendário
  de cada evento;
- sem registo em `schema_migrations` (idempotentes): `audit_events`,
  `reservation_create_intents`, `guests.anonymized_at`, `manual_payment_intents`,
  `email_deliveries`, `oauth_states`, `email_changes`.

Anteriores: `20260920_google_task_cleanup_queue`, `20261001_google_task_bidirectional`,
`20261001_voucher_redemptions`, `20261005_stripe_payments` e seguintes.

## Atualizações da PWA

O servidor envia em cada resposta da API uma impressão digital dos ficheiros do
frontend (`X-App-Build`, calculada no arranque). Se mudar durante a sessão
(nova publicação), a aplicação mostra «Está disponível uma versão nova» e, ao
abrir uma secção ainda não carregada, recarrega no URL dessa secção em vez de
juntar módulos novos ao código antigo em memória. Com alterações por guardar
numa reserva, o browser pede confirmação; se o utilizador ficar, a secção explica
que é preciso recarregar. Não é preciso mudar números de versão à mão.

## Ensaio em dispositivos reais

Os testes automáticos usam emulação (Chromium/WebKit a 375 px, sem ecrã tátil
real). Antes de dar a V1 por fechada, em **um iPhone (Safari + PWA instalada) e
um Android (Chrome + PWA)**, com uma organização de teste:

1. Login; instalar a PWA; abrir pela PWA.
2. Nova reserva com voucher; mudar as datas: o total e a linha do voucher
   acompanham; guardar e confirmar o valor na ficha.
3. Alojamento → Preços: deslizar os separadores, abrir Preços, tocar duas vezes
   no mesmo dia (editor abre), fechar.
4. Teclado virtual: preencher nome/notas no wizard; o campo ativo não fica
   tapado e o botão Guardar continua acessível.
5. Rodar o telemóvel no Calendário e voltar a retrato.
6. Modo de avião ao guardar uma reserva: mensagem de erro, dados mantidos;
   voltar a ligar e guardar: uma só reserva.
7. Terminar a sessão noutro dispositivo (Sessões → terminar) e guardar no
   primeiro: aviso de sessão expirada; entrar e reabrir Nova reserva: rascunho
   reposto.
8. Publicar uma versão de teste com a PWA aberta (ou reiniciar o servidor com
   outro frontend): aparece o aviso; abrir outra secção recarrega.
9. Leitor de ecrã (VoiceOver/TalkBack) no wizard: nome dos campos, total e aviso
   do voucher lidos; zoom do sistema a 200 %.

Registar modelo, versão do sistema/browser e o resultado de cada passo.

## Cópias de segurança

Há dois mecanismos com âmbitos diferentes:

| Mecanismo | Âmbito | Serve para |
|---|---|---|
| «Exportar dados» na aplicação (ZIP) | Uma organização: alojamentos, reservas, hóspedes, pagamentos, vouchers, emails, uploads referenciados | Levar ou repor os dados de um cliente. **Não** inclui contas, sessões, ligações Google, chaves VAPID nem a chave dos tokens. |
| `scripts/instance-backup.cjs` | A instância inteira: base SQLite (todas as organizações, contas, sessões, ligações Google, VAPID, filas), todos os uploads, tokens Google legados e a chave que os desencripta | Recuperação de desastre. |

### Backup da instância

Corre com a aplicação a funcionar (usa a API de backup do SQLite; a cópia é
consistente mesmo com escritas em curso) e verifica a integridade da cópia.

```bash
STAMP=$(date +%Y%m%d-%H%M)
docker compose exec backend node scripts/instance-backup.cjs backup \
  --data /app/data --tokens /tokens \
  --out /app/data/instance-backups/$STAMP \
  --key-out /app/data/instance-backups/$STAMP-chave/token-encryption.key
```

- `--key-out` é obrigatório e tem de ficar **fora** de `--out`. Copiar o
  diretório do backup e o da chave para **locais diferentes fora do servidor**
  (ex.: armazenamento cifrado e cofre de segredos) e apagar a cópia local.
  Quem tiver os dois consegue usar as ligações Google da instância.
- Se a chave vier de `TOKEN_ENCRYPTION_KEY` (variável), não é copiada: confirmar
  que está no cofre. O manifesto regista só a impressão digital.
- `.env`/segredos (Google, Stripe, Turnstile, Cloudflare) não fazem parte do
  backup: guardá-los no cofre.
- O terminal e o `manifest.json` só mostram contagens, impressões digitais e
  SHA-256 dos ficheiros — nunca dados pessoais, tokens ou a chave.

### Verificar e restaurar

```bash
node scripts/instance-backup.cjs verify --backup <dir> --key <chave>
node scripts/instance-backup.cjs restore --backup <dir> --key <chave> \
  --target <diretório novo>/data --tokens-target <diretório novo>/tokens
```

`verify` confirma SHA-256 da base e de cada upload, `integrity_check`,
referências de uploads sem ficheiro, que a chave é a deste backup e que todas
as credenciais Google desencriptam. `restore` só escreve num diretório **novo e
vazio** e recusa um backup adulterado ou sem chave: nunca substitui a base ou
os uploads em uso. A troca para a cópia restaurada é um passo manual:

1. Parar o serviço e preservar `./data` e `./tokens` atuais (não apagar).
2. Arrancar com `EMAIL_ENABLED=false` e **sem** `STRIPE_SECRET_KEY`, apontando
   os volumes para a cópia restaurada.
3. Confirmar `GET /health`, login, uma reserva, uma imagem e o estado Google.
4. Reconciliar o que aconteceu depois da hora do backup: pagamentos no
   Dashboard Stripe, emails já enviados (as filas restauradas podem estar
   atrasadas), eventos/tarefas Google criados depois. Só então repor email e
   Stripe.
5. As sessões são restauradas com a base. Se o motivo do restauro for um
   incidente de segurança, terminar todas as sessões (`DELETE FROM auth_sessions`)
   e rodar as credenciais afetadas.

Limitações: um backup restaura o estado dessa hora (o que entrou depois perde-se
e tem de ser reconciliado); a chave e os segredos dependem de estarem no cofre;
ficheiros Stripe/Google fora da aplicação não são cobertos.

**Evidência (24/10/2026):** `scripts/check-instance-restore.cjs` cria uma
instância sintética numa pasta temporária (2 contas, 6 reservas, 3 pagamentos,
vouchers, capa e talão reais, 3 ligações Google + ficheiro legado com tokens
falsos encriptados, chaves VAPID), faz o backup, confirma que deteta chave
errada, upload adulterado, restauro sem chave e restauro por cima de dados,
restaura para uma pasta nova e arranca a aplicação sobre a cópia: login, os
mesmos totais, imagens idênticas, talão privado (401 anónimo), as 4 credenciais
Google desencriptam, VAPID igual. Procura ainda nos registos e no manifesto os
nomes, emails, tokens e a chave sintéticos: nenhum aparece. Não toca na base,
nos uploads nem nos tokens reais (verificado por SHA-256 antes e depois).
Faz parte da CI.

## Monitorização mínima

- disponibilidade e latência de `/health`;
- reinícios e consumo de disco do container/volume;
- falhas dos schedulers e mensagens pendentes;
- estado OAuth de Calendar, Gmail e Tasks;
- tentativas Stripe em `creating`/`processing` há mais de uma hora e entregas
  de webhook falhadas no Dashboard Stripe;
- tamanho e antiguidade das filas duráveis;
- taxas anormais de login, reserva pública e pré-check-in;
- validade do certificado, domínio público e túnel.

`GET /api/ops/status` (proprietário) reúne o que precisa de atenção, só com
contagens e datas: emails por decidir/a repetir e fila de envio, filas do Google
Calendar (pendentes, com falhas, mais antiga) e de limpeza do Google Tasks,
tentativas Stripe paradas há mais de 1 hora, cancelamentos em revisão manual,
último ciclo de cada scheduler neste processo, tamanho da base e espaço livre;
`?uploads=1` acrescenta os uploads órfãos. Não há ainda alertas automáticos:
consultar após publicar e periodicamente (decisão pendente sobre o canal de
alertas).

Os logs atuais são de processo e ainda não constituem uma solução completa de
observabilidade. A adoção de logs estruturados e alertas está priorizada em
[Melhorias técnicas](MELHORIAS.md).

## Auditoria de ações sensíveis

Ficam em `audit_events` (fora do histórico das reservas, que desaparece com uma
eliminação definitiva) e são consultáveis em `GET /api/ops/audit` (proprietário):
convites e revogações, mudanças de papel, remoção de membros, exportação e
restauro do ZIP (incluindo restauros recusados), eliminação definitiva de
reservas, hóspedes e alojamentos, anonimização, alteração da política de
pagamentos e desligar Calendar/Gmail/Tasks. Cancelamentos, reembolsos e
pagamentos continuam no histórico de cada reserva. O registo leva utilizador,
data, alvo e contagens — nunca dados pessoais. O prazo de conservação destes
registos é uma decisão pendente.

## Dados pessoais: anonimização

Um hóspede cujas reservas têm movimentos de pagamento não pode ser apagado (são
registo financeiro). Em alternativa, o proprietário usa «Anonimizar dados» na
ficha do hóspede (`GET /api/guests/:id/anonymization` mostra a
pré-visualização; `POST /api/guests/:id/anonymize` com o número de reservas
confirmado aplica-a). É irreversível.

- Recusada se houver estadia ativa ou futura, ou pagamento online em curso.
- Remove: nome, apelidos, contactos, documento, nascimento, NIF, empresa,
  morada, classificações; notas das reservas (texto livre) e os valores de notas
  no histórico; acompanhantes (e as suas fichas, se não aparecerem noutras
  reservas); `guest_snapshot`; ligações públicas e de pré-check-in; destinatário,
  assunto e conteúdo das mensagens enviadas; o email no pedido guardado das
  tentativas Stripe terminadas.
- Mantém: datas, alojamento, montantes, pagamentos, tentativas e IDs Stripe,
  número/data de fatura, país do hóspede (estatística) e a auditoria.
- Não apaga dados em fornecedores externos (Stripe, Gmail enviado, Google
  Calendar/Tasks de quem os criou): tratar diretamente nesses serviços.

Decisões pendentes do responsável pelo produto: prazos de conservação (não
definidos aqui), se o país deve ser mantido, se as mensagens enviadas devem
manter o conteúdo por motivos de prova, e se a anonimização deve passar a ser
automática após um prazo.

## Uploads órfãos

```bash
docker compose exec backend node scripts/uploads-orphans.cjs                 # lista
docker compose exec backend node scripts/uploads-orphans.cjs --delete --expected <n>
```

Lista ficheiros em `data/uploads` sem referência em nenhuma organização (capas,
galerias, logótipos, talões) e miniaturas cujo original já saiu, com mais de 24 h
(`--min-age-hours`). Apagar exige o número visto na listagem e volta a confirmar
cada referência antes de apagar. Fazer backup antes. As substituições de imagens
na aplicação já apagam o ficheiro antigo quando deixa de ser usado; este
procedimento cobre o que ficou para trás (ex.: falhas a meio de um upload).

## Incidente e rollback

1. Se existir risco de envio indevido, definir `EMAIL_ENABLED=false` e reiniciar.
   Para suspender pagamentos online, remover `STRIPE_SECRET_KEY` e reiniciar:
   novas reservas voltam à aprovação manual.
2. Preservar logs, imagem em execução e uma cópia dos dados antes de intervir.
3. Revogar credenciais ou sessões afetadas quando necessário.
4. Corrigir ou repor a versão apenas depois de avaliar a compatibilidade do
   esquema da base de dados.
5. Validar `/health`, autenticação, isolamento entre organizações e fluxos
   críticos depois da recuperação.
6. Documentar causa, impacto, janela temporal e prevenção.

Não substituir uma base de dados de produção por um backup sem confirmar o alvo,
a data, a integridade e a possibilidade de recuperar o estado atual.
