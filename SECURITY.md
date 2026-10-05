# Segurança

Estado dos controlos e processo de reporte, revisto em 5 de outubro de 2026.

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
- rate limiting em autenticação e fluxos públicos;
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
- login com tempo de resposta independente da existência da conta;
- limites de tamanho distintos para JSON, uploads e importação de backups;
- containers sem privilégios, filesystem read-only e porta ligada ao loopback;
- testes automatizados de autenticação, isolamento, CSP, dependências e HTTP.

Os controlos reduzem risco; não substituem revisão, monitorização, backups e
gestão de incidentes. Riscos conhecidos ainda por tratar (CSP com domínios CDN
inteiros, tokens de convite em claro, rate limit na mudança de palavra-passe,
injeção de fórmulas em exportações) estão em
[Melhorias técnicas](docs/MELHORIAS.md#p1--segurança).

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
- `TRUST_PROXY` identifica apenas os proxies controlados;
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
