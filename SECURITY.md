# Segurança

Estado dos controlos e processo de reporte, com riscos conhecidos atualizados
em 10 de novembro de 2026.

## Reportar uma vulnerabilidade

Enviar uma descrição privada para `luisduartebernardo@gmail.com` com:

- componente e versão/commit afetado;
- passos mínimos de reprodução;
- impacto provável;
- evidência sem dados pessoais reais.

Não abrir publicamente detalhes exploráveis antes de existir correção. Será
acusada a receção e combinado um prazo de análise conforme a gravidade.

## Dados sensíveis

A aplicação trata dados de hóspedes, reservas, pagamentos, documentos de
despesas e credenciais de integrações. Nunca colocar em issues, logs, fixtures ou
capturas públicas:

- documentos de identificação e contactos reais;
- cookies de sessão ou tokens de reserva/pré-check-in;
- tokens OAuth, chaves Turnstile, segredos Google ou Stripe (`sk_`, `rk_`, `whsec_`);
- base de dados, `.env`, backups ou chave de encriptação;
- códigos de porta e palavras-passe Wi-Fi.

Usar sempre dados sintéticos nos testes.

## Controlos implementados

- autenticação por sessão e separação por organização;
- autorização por papel, incluindo operações exclusivas do proprietário;
  apagar hóspedes e alterar definições da organização exige `manager`;
- validação de origem, CORS restrito e cookies seguros em produção;
- Helmet/CSP com JavaScript inline bloqueado;
- rate limiting em autenticação e fluxos públicos, por IP real do visitante
  (atrás do Docker e do Cloudflare Tunnel, ver `TRUST_PROXY`), com limite
  adicional por conta no login e um teto geral nas rotas públicas;
- `Cache-Control: no-store` em respostas autenticadas e de API;
- uploads de recibos privados, autenticados e filtrados pela organização;
- tokens Google encriptados com AES-256-GCM;
- validação Turnstile fail-closed em produção para reserva pública;
- dados públicos de reserva normalizados no servidor (campos conhecidos dos
  acompanhantes, hora de chegada `HH:MM`) e escapados no backoffice;
- webhook Stripe autenticado pela assinatura sobre o corpo original; preço,
  moeda e montante calculados apenas no servidor; Live exige
  `STRIPE_MODE=live` e `NODE_ENV=production`;
- uploads de imagens, talões e backups validados por magic bytes; importação de
  backups aceita apenas imagens;
- subscrições push restritas aos serviços de push dos browsers (sem SSRF);
- login e recuperação de palavra-passe com resposta independente da
  existência da conta;
- anexos de emails recebidos servidos como dados, com CSP `sandbox`;
- staff sem acesso a tokens de reservas nem aos links iCal das plataformas;
- limites de tamanho distintos para JSON, uploads e importação de backups;
- containers sem privilégios, filesystem read-only e porta ligada ao loopback;
- testes automatizados de autenticação, isolamento, CSP, dependências e HTTP.

Os controlos reduzem risco; não substituem revisão, monitorização, backups e
gestão de incidentes.

Os problemas da [revisão de 8 de outubro](docs/REVISAO-2026-10-08.md) estão
corrigidos e verificados no código a 10 de novembro: tokens escondidos de
staff (S01), cabeçalhos MIME validados no transporte (S02), `npm audit` sem
avisos (S03), convites e recuperação com hash, limites por conta e confirmação
do novo email (S04), `state` OAuth de uso único (S05), CSV sem fórmulas (S06) e
imagens validadas por completo (S07).

A revisão de 10 de novembro encontrou e corrigiu: com o Compose de produção,
o pedido chega ao contentor pelo gateway da rede Docker, não pelo loopback, e
`TRUST_PROXY=loopback` fazia todos os visitantes partilharem o mesmo IP (os
limites de login, reservas e pré-check-in ficavam globais, um atacante
bloqueava-os a todos, e os IPs de consentimento RGPD ficavam errados). Depois
de publicar, confirmar em «A minha conta → Sessões» que cada sessão mostra o
IP real e não `172.x`.

Recomendações ainda por implementar: segundo fator (TOTP) para proprietários;
regras de rate limiting/WAF no Cloudflare como primeira barreira; cópias de
segurança fora do servidor com ensaio de restauro periódico; mencionar o OCR de
talões (Anthropic) entre os subcontratantes no texto RGPD.

## Dono da instância

O acesso à consola da plataforma é dado só no servidor, em `backend/src`:
`npm run platform-admin -- grant email` marca o utilizador,
`npm run platform-admin -- revoke email` retira a marca e fecha os desbloqueios
ativos, e `npm run platform-admin -- list` mostra quem a tem. Além da marca,
o email tem de estar em `PLATFORM_ADMIN_EMAILS`; alterar esta variável exige
recriar o contentor (`docker compose up -d --force-recreate backend`):
`docker compose restart` não volta a ler o `.env`. Ao revogar, retirar também o email da variável.

## Segredos e chaves

Configurar segredos apenas por ambiente protegido. A chave de encriptação dos
tokens pode ser fornecida por `TOKEN_ENCRYPTION_KEY` ou
`TOKEN_ENCRYPTION_KEY_FILE`; se for gerada automaticamente, fica junto à base de
dados com permissões restritas.

Guardar essa chave numa cópia separada. O backup exportado pela organização não
a inclui. Rodar ou perder a chave sem um procedimento de migração torna os tokens
OAuth existentes inutilizáveis.

## Checklist de produção

- `PUBLIC_APP_URL` é HTTPS e corresponde ao domínio público;
- `TRUST_PROXY` identifica apenas os proxies controlados (no Compose,
  `loopback,uniquelocal`: o cloudflared chega pelo gateway da rede Docker);
- `COOKIE_SECURE` está ativo por configuração ou por `NODE_ENV=production`;
- Turnstile está configurado para o hostname correto;
- Stripe: modo, chave e segredo de webhook pertencem ao mesmo ambiente;
- redirect URIs Google coincidem exatamente com o ambiente;
- `.env`, dados, tokens, uploads e backups não são servidos pelo frontend;
- backups e restauro foram testados e a chave de tokens está recuperável;
- dependências e imagem foram auditadas;
- `/health`, login e isolamento entre organizações foram verificados;
- logs não contêm dados pessoais, tokens ou códigos de acesso.

## Dependências e testes

A CI executa os testes em Node 22 e 24, auditoria de produção do backend com
limiar `moderate`, auditoria das bibliotecas declaradas do frontend com limiar
`high`, testes de browser e orçamento de desempenho. Antes de publicar:

```bash
cd backend/src
npm run check
npm test
npm run test:http
npm run test:browser
npm run measure:frontend
npm audit --omit=dev --audit-level=moderate
```

As bibliotecas de frontend declaradas em `frontend/package.json` também devem ser
auditadas a partir dessa pasta.

## Resposta a incidente

Preservar evidência, limitar o acesso afetado, revogar sessões/credenciais quando
necessário e evitar alterações destrutivas antes de obter uma cópia dos dados. A
recuperação e o rollback estão descritos em [Operações](docs/OPERACOES.md).

Depois do incidente, registar a causa raiz, dados e organizações afetadas, janela
temporal, medidas de contenção e ações preventivas. Cumprir as obrigações legais
de notificação aplicáveis com aconselhamento adequado.
