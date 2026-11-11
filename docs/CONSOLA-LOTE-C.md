# Consola — lote C e criação de estabelecimentos

Implementação de 11/11/2026, sobre `claude/adoring-ride-pchzjc` (a393db1).

## Criar um estabelecimento

Na consola, abrir **Clientes → Novo estabelecimento**. Preencher o nome,
email do proprietário, pacote opcional e estado inicial (Teste ou Ativo).
A operação cria uma organização independente, configurações e modelos de email
iniciais, e um convite de proprietário válido por sete dias. O administrador
copia e partilha a ligação; não há envio automático por email. O proprietário
escolhe a palavra-passe ao aceitar; quem já tem conta confirma a sua palavra-passe.
O administrador da plataforma não ganha uma associação à organização criada.
O pacote tem de permitir pelo menos um membro. Um erro reverte a criação inteira.

«Estabelecimento» neste fluxo significa um cliente/organização. Os alojamentos
individuais continuam a ser criados dentro da respetiva organização.

## Login

O login, convites, recuperação e escolha de destino ficam sempre no Clássico,
desde o primeiro desenho, incluindo se o aparelho tinha Vidro guardado. Depois
de entrar, aplica-se a preferência da conta; terminar sessão volta ao Clássico.
A preferência da pessoa não é substituída pelo aspeto do login.

## Utilização e diagnóstico

**Utilização** mostra, nos últimos 30 dias:

- Contagem de erros de script, recursos e promises da app. Não recolhe mensagens,
  stacks, nomes de ficheiros, URLs, IPs nem dados de hóspedes.
- Número de pedidos, tempo médio/máximo e erros HTTP 5xx por área da API. O tempo
  é medido no servidor após autenticação, até terminar a resposta; exclui o
  tempo de rede, parsers e autenticação. Não é uma medição de percentis.
- Adoção: organizações que abriram cada página e número de visitas. Mede visitas,
  não confirma a conclusão de ações. O denominador inclui todas as organizações.
- Primeiros passos por cliente: proprietário com acesso, alojamento, reserva,
  equipa, email e calendário. Equipa e integrações são opcionais.

A recolha começa com a publicação, sem retroatividade para erros e tempos.
Adoção usa os totais de utilização existentes. Só membros autenticados enviam
erros, limitados aos três tipos conhecidos e a 50 por tipo/pedido, sob o limite
já existente de telemetria. As sessões só da plataforma não contam para clientes.
Os diagnósticos são conservados por 400 dias, como a restante utilização.

## Suporte

- Na conversa, **Respostas guardadas** permite criar, editar, escolher e apagar
  modelos partilhados (até 100; título de 80 caracteres, texto de 5000).
  Escolher coloca o texto no rascunho para revisão; nunca envia automaticamente.
- A caixa de entrada mostra o tempo médio até à primeira resposta da plataforma
  nos pedidos criados nos últimos 30 dias que já tiveram resposta. A métrica já
  existia; foi exposta também no Suporte. Pedidos sem resposta não entram na média.
- Administração pode apagar um anexo ou um pedido inteiro após segunda confirmação.
  Apagar o pedido remove mensagens, leituras e anexos; tarefas ligadas perdem só
  a referência ao pedido. O registo conserva o identificador da ação, sem textos.
- O prazo de conservação configura-se na caixa de entrada: **0 desliga**; de
  **30 a 3650 dias** elimina pedidos resolvidos sem alterações nesse período.
  A tarefa corre de hora a hora, até 100 pedidos por passagem. Pedidos abertos
  nunca são apagados por esta política. Por defeito está desligada.
- `SUPPORT_RETENTION_DAYS` é uma alternativa inicial; guardar no ecrã passa a ter
  prioridade sobre o ambiente. Não confundir com o prazo das cópias da instância.
- Uma fila persistente de ficheiros por eliminar permite repetir a limpeza do
  disco após falhas ou interrupções, sem voltar a expor o anexo na API.

## Papéis da consola

O acesso continua a exigir a marca `platform_admin`, email em
`PLATFORM_ADMIN_EMAILS`, conta ativa e desbloqueio por palavra-passe.
O novo `platform_role` tem dois valores:

| Papel | Leitura | Escrita |
| --- | --- | --- |
| Administração (`admin`) | Toda a consola | Clientes, pacotes, suporte, tarefas, comunicados |
| Marketing (`marketing`) | Consola sem Finanças/Administração | Comercial, Marketing, acompanhamento, sugestões, tarefas e comunicados (ver CONSOLA-AREAS.md) |

Não concede acesso aos dados de operação dentro das organizações. O papel é
verificado na base a cada pedido; esconder botões não é a proteção de acesso.
Os administradores existentes mantêm `admin`. Atribuir pelo comando de operação,
na pasta `backend/src` (email continua a ter de estar na lista do ambiente):

```sh
npm run platform-admin -- grant colega@example.com marketing
npm run platform-admin -- grant dono@example.com admin
npm run platform-admin -- list
```

Mudar o papel pelo comando fecha os desbloqueios anteriores da conta. A gestão
dos papéis é feita por este comando, não há editor de permissões na interface.

## Validação

```sh
cd backend/src
npm run check
npm test
npm run test:console
BROWSER_ENGINE=webkit npm run test:console
```

Os testes novos cobrem criação e aceitação do convite, ausência de acesso
implícito do administrador ao cliente, reversão em erros, papéis no servidor,
modelos de resposta, conservação de pedidos abertos e remoção real de anexos,
agregados sem dados privados, login/fim de sessão e conservação da preferência.
O browser verifica as páginas novas a 1280 e 360 px nos três aspetos.
Usam apenas dados sintéticos e bases descartáveis. A CI inclui ambos os browsers.

## Fora deste lote

Email da empresa e LLM ficam para depois. Mantêm-se as decisões em aberto do
plano sobre PDFs, cópias de suporte por organização, ajuda na V1, notificações
por mudança de estado, limites na reativação/importação e email de contas só
de plataforma. Não são apresentadas como concluídas por este lote.
