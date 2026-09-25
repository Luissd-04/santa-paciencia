# Operações

Procedimentos de desenvolvimento, publicação e recuperação. Confirmado em 20 de
setembro de 2026.

## Configuração

O ficheiro de referência é `backend/src/.env.example`. As variáveis essenciais
em produção são:

- `NODE_ENV=production`, `PORT`, `TZ`;
- `PUBLIC_APP_URL` com origem HTTPS canónica;
- `TRUST_PROXY` limitado aos proxies realmente controlados;
- `DB_PATH` e `FRONTEND_PATH`;
- credenciais Google e os três redirect URIs, quando a integração está ativa;
- chaves Turnstile para aceitar reservas públicas;
- `TOKEN_ENCRYPTION_KEY` ou `TOKEN_ENCRYPTION_KEY_FILE`, se a chave não for
  gerada junto à base de dados;
- `EMAIL_ENABLED`, que funciona como interruptor global de envio.

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

Fluxo recomendado:

1. Criar cópia consistente da base de dados e dos uploads.
2. Guardar, separadamente, a chave usada para encriptar tokens Google.
3. Executar a validação completa indicada no `README.md`.
4. Rever alterações de migração e espaço disponível no volume `data`.
5. Construir e iniciar a nova imagem com Docker Compose.
6. Confirmar `GET /health`, login, uma leitura autenticada e os estados das
   integrações Google/email/push.
7. Verificar os logs dos schedulers e a fila de limpeza de Google Tasks.

O Compose atual monta `./data` em `/app/data`, executa o container com filesystem
read-only e expõe a aplicação apenas no loopback. O Cloudflare Tunnel é o ponto
de entrada público.

## Migrações

As migrações correm automaticamente no arranque. Por isso:

- nunca publicar sem backup prévio;
- não iniciar simultaneamente uma versão nova em várias réplicas sem validar a
  segurança concorrente da migração;
- não reverter apenas o binário se uma migração deixou o esquema incompatível;
- registar qualquer migração que exija uma tarefa manual no roadmap ou na nota
  da versão.

A migração de 20 de setembro de 2026 cria `google_task_cleanup_queue`. É aplicada
no primeiro arranque da versão que contém a correção.

## Cópias de segurança

Uma recuperação completa requer:

- base de dados SQLite;
- pasta de uploads;
- chave de encriptação de tokens;
- configuração/segredos do ambiente, guardados num cofre seguro.

O ZIP exportado pela aplicação não inclui a chave de encriptação dos tokens.
Sem essa chave, os tokens Google restaurados não podem ser desencriptados e as
organizações terão de voltar a autorizar as integrações.

Testar regularmente o restauro num ambiente isolado. Um backup que nunca foi
restaurado não deve ser considerado validado.

## Monitorização mínima

- disponibilidade e latência de `/health`;
- reinícios e consumo de disco do container/volume;
- falhas dos schedulers e mensagens pendentes;
- estado OAuth de Calendar, Gmail e Tasks;
- tamanho e antiguidade das filas duráveis;
- taxas anormais de login, reserva pública e pré-check-in;
- validade do certificado, domínio público e túnel.

Os logs atuais são de processo e ainda não constituem uma solução completa de
observabilidade. A adoção de logs estruturados e alertas está priorizada em
[Melhorias técnicas](MELHORIAS.md).

## Incidente e rollback

1. Se existir risco de envio indevido, definir `EMAIL_ENABLED=false` e reiniciar.
2. Preservar logs, imagem em execução e uma cópia dos dados antes de intervir.
3. Revogar credenciais ou sessões afetadas quando necessário.
4. Corrigir ou repor a versão apenas depois de avaliar a compatibilidade do
   esquema da base de dados.
5. Validar `/health`, autenticação, isolamento entre organizações e fluxos
   críticos depois da recuperação.
6. Documentar causa, impacto, janela temporal e prevenção.

Não substituir uma base de dados de produção por um backup sem confirmar o alvo,
a data, a integridade e a possibilidade de recuperar o estado atual.
