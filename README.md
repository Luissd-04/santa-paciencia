# Santa Paciência

Plataforma de operação de alojamento local. Centraliza reservas, alojamentos,
hóspedes, calendário, preços, despesas, fornecedores, equipa, comunicações,
vouchers, relatórios e tarefas operacionais.

## Estado do projeto

Aplicação web em produção ativa. O backend é uma API Express 5 com SQLite e o
frontend é uma SPA em JavaScript, HTML e CSS sem framework. O mesmo processo
serve a API, o frontend e as páginas públicas.

Integrações existentes:

- Google Calendar, Gmail e Google Tasks por OAuth;
- pagamentos online com Stripe Checkout (Test por omissão; Live protegido);
- leitura automática de talões de despesas com a API da Anthropic (opcional);
- notificações Web Push;
- Cloudflare Turnstile nas reservas públicas;
- importação e exportação de cópias de segurança;
- PWA instalável, com service worker e atalhos.

## Começar em desenvolvimento

Requisitos: Node.js 22 ou 24 e as ferramentas necessárias para compilar
`better-sqlite3`.

```bash
cd backend/src
cp .env.example .env
npm ci
```

No `.env`, usar `NODE_ENV=development`, definir `FRONTEND_PATH` com o caminho
absoluto para a pasta `frontend` e configurar as integrações que se pretende
testar. Depois:

```bash
npm run create-admin -- "Nome" "email@dominio.pt" "palavra-passe"
npm run dev
```

A aplicação fica disponível, por omissão, em `http://localhost:3001`.

## Validação

Executar a partir de `backend/src`:

```bash
npm run check
npm test
npm run test:http
node scripts/check-v1-functional.cjs        # aceitação V1 (também -security-email e -accounts)
node scripts/check-instance-restore.cjs     # backup + restauro completo, pasta temporária
node scripts/check-performance.cjs          # volume sintético (~7 500 reservas)
npm run test:browser
npm run test:mobile                         # e BROWSER_ENGINE=webkit npm run test:mobile
node scripts/check-wizard-voucher.cjs       # total do wizard = total gravado
node scripts/check-pwa-resilience.cjs       # rede instável, sessão expirada, versão nova
npm run measure:frontend
```

Os testes de browser necessitam de Chromium e WebKit do Playwright. Todos usam
bases descartáveis, dados inventados e serviços externos simulados. A CI executa
os anteriores (e os checks de pré-check-in, voucher público e política) em
Node 22 e 24, com auditoria de dependências. Antes de publicar, correr também
`node scripts/check-upgrade-rollback.cjs --previous <versão publicada>`
([Operações](docs/OPERACOES.md#antes-de-publicar)).

## Produção

O `Dockerfile` cria uma imagem Node 22 sem dependências de desenvolvimento e
executa a aplicação como utilizador não privilegiado. O `docker-compose.yml`
liga o backend apenas a `127.0.0.1:3001` e publica-o através de Cloudflare
Tunnel.

Antes de colocar uma versão em produção, consultar [Operações](docs/OPERACOES.md)
e [Segurança](SECURITY.md). Nunca incluir `.env`, a base de dados, documentos de
hóspedes, tokens OAuth ou a chave de encriptação no repositório.

## Documentação

- [Arquitetura e módulos](docs/ARQUITETURA.md)
- [Operações, configuração e recuperação](docs/OPERACOES.md)
- [Roadmap de produto](docs/ROADMAP.md)
- [Melhorias técnicas](docs/MELHORIAS.md)
- [Revisão de segurança, organização e emails — 8 de outubro](docs/REVISAO-2026-10-08.md)
- [Política e controlos de segurança](SECURITY.md)
- [Pagamentos Stripe](docs/stripe-payments.md)
- [Vouchers com várias utilizações](docs/VOUCHERS.md)
- [Sincronização com Google Tasks](docs/GOOGLE-TASKS.md)
- [Sincronização com Google Calendar](docs/GOOGLE-CALENDAR.md)
- [Âmbito V1/V2](docs/ESCOPO-V1-V2.md) e [fecho da V1 — 24 de outubro](docs/FECHO-V1-2026-10-24.md)
- [Emails no Gmail para iPhone](docs/EMAIL-GMAIL.md)

A documentação de base foi revista em 5 de outubro de 2026; o relatório de
8 de outubro acrescenta os achados sobre o código local e atualiza prioridades.
A revisão local não confirma o estado da publicação. Atualizar estas páginas
no mesmo pull request que alterar arquitetura, operação, segurança ou prioridades.
