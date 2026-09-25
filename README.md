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
npm run test:browser
npm run measure:frontend
```

`test:browser` necessita de Chromium do Playwright. A CI executa análise
estática, testes Node e HTTP em Node 22 e 24, auditoria de dependências, testes
de browser e o orçamento de desempenho do frontend.

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
- [Política e controlos de segurança](SECURITY.md)

Estas páginas descrevem o estado confirmado em 20 de setembro de 2026. A regra
é atualizá-las no mesmo pull request que alterar arquitetura, operação,
segurança ou prioridades.
