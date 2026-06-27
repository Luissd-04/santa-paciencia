# Política de Segurança

## Reportar uma vulnerabilidade

Se descobriste uma vulnerabilidade de segurança no Santa Paciência, **não abras um issue público**. Em vez disso:

1. Envia um email para **luisduartebernardo@gmail.com** com assunto `[SECURITY] <breve descrição>`
2. Inclui:
   - Descrição da vulnerabilidade e impacto potencial
   - Passos para reproduzir (PoC se possível)
   - Versão/commit afectado
3. Aguarda confirmação em 72h. Resposta com plano de correcção em 7 dias.

Não há programa de bug bounty, mas o teu nome será adicionado à lista de agradecimentos (se desejado) após a correcção.

## Versões suportadas

Apenas a `main` recebe correcções de segurança. Forks não são suportados.

## Modelo de ameaças

O sistema é **multi-tenant** (organizações separadas com staff/manager/owner).
Áreas críticas:

- **Motor público de reservas** (`/api/public/*`): aceita input não autenticado. Protegido por rate limit + Cloudflare Turnstile.
- **Pre-checkin** (`/pre-checkin/:token`): acessível apenas com token aleatório (32 bytes hex). TTL = data de check-out.
- **OAuth Google** (Calendar/Gmail/Tasks): `state` parameter é HMAC-SHA256 do session ID.
- **Backup** (`/api/backup/*`): apenas owner. Validação estrita de schemas/colunas no import.
- **Isolamento de organizações**: todas as queries devem incluir `AND organization_id = ?` (defesa em profundidade).

## Configuração de produção obrigatória

Antes de deploy verifica:

- [ ] `NODE_ENV=production` no `.env`
- [ ] `GOOGLE_CLIENT_SECRET` definido (usado também como chave HMAC para OAuth state)
- [ ] `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` definidos (sem isto, o motor público rejeita todas as reservas)
- [ ] `EMAIL_PASS` definido (senha de aplicação Gmail, não a senha normal)
- [ ] `data/santapaciencia.db` com permissões `600`
- [ ] HTTPS configurado (Cloudflare Tunnel, Caddy, nginx, etc.)
- [ ] Backups regulares da DB (descarregar via `/api/backup/export` ou copiar o ficheiro)

## Variáveis sensíveis

Estas envs **NÃO** podem ser logged, ecoadas para o frontend, ou commitadas:

- `GOOGLE_CLIENT_SECRET`
- `EMAIL_PASS`
- `TURNSTILE_SECRET_KEY`
- Tokens OAuth (guardados em `data/santapaciencia.db` na tabela `user_tokens`)
- Sessões (`auth_sessions.id`)
- Tokens de reset password (`password_reset_tokens.token`)
- Tokens públicos de reserva (`reservations.public_token`, `precheckin_token`)

## Dependências

Auditoria de dependências:

```bash
cd backend/src
npm audit
```

Aceita-se vulnerabilidades **moderate** em dependências transitivas (gaxios, uuid via google-auth-library) se não houver fix disponível. **High/Critical** devem ser corrigidas em < 30 dias.

## Headers HTTP

O servidor envia (via Helmet):
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (apenas com HTTPS)
- `Referrer-Policy: no-referrer`
- ⚠️ **CSP desligada** — pendente migração dos `onclick` inline (~229 ocorrências)

## Rate Limits

| Endpoint | Janela | Máx |
|---|---|---|
| `/auth/login` | 15 min | 10 |
| `/auth/forgot-password` | 1h | 5 |
| `/auth/google*/callback` | 15 min | 30 |
| `/api/public/booking/:slug/reservations` | 1h | 20 |
| `/api/public/booking/:slug/voucher` | 1h | 30 |
