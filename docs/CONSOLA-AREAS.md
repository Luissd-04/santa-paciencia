# Consola por áreas — 11/11/2026

Trabalho sobre `claude/adoring-ride-pchzjc` (a393db1), juntamente com o lote C.
Mantém os endereços anteriores da consola; a barra lateral agrupa as páginas
em áreas expansíveis. A ficha de cada estabelecimento tem separadores para
Comercial, acompanhamento, Suporte, Marketing, Finanças, Produto, Operações e
Tarefas. O menu em ecrã pequeno continua a funcionar como gaveta.

## Funções disponíveis

| Área | Páginas e funções |
| --- | --- |
| Visão geral | Resumo de clientes/suporte/saúde e negócio; tarefas pessoais |
| Comercial | Contactos, origem, responsável, próxima ação/data; propostas com valor, periodicidade e validade; demonstrações e testes privados |
| Clientes | Estabelecimentos; ficha de acompanhamento com contactos, responsável, serviço de marketing e próxima ação; ligações às outras áreas |
| Suporte | Pedidos e conversas; gestão autónoma de respostas guardadas; registar bug/sugestão ou criar tarefa a partir de um pedido |
| Marketing | Resumo, campanhas, calendário de conteúdos por data, materiais por ligação e comunicados; distinção Santa Paciência / marca do cliente |
| Finanças | Subscrições, pagamentos, despesas, resumo de recebimentos/despesas liquidados, saldo, valores por receber/em atraso e receita mensal contratada |
| Produto | Bugs e sugestões, prioridade, reprodução/resultado esperado, ligação ao suporte e à versão; gestão de versões |
| Operações | Estado do processo, disco/base, tarefas automáticas, incidentes/integrações, utilização/diagnóstico, manutenções e exportação interna |
| Administração | Equipa/papéis, pacotes, nome/email de contacto/notas internas e auditoria |

Registos têm estados próprios, pesquisa e filtros, paginação de 50 linhas,
comentários com autor/data e ligações a cliente, responsável e origem.
Campanhas podem ter conteúdos e materiais; propostas ligam a contactos;
pagamentos ligam a subscrições; bugs ligam a pedidos e versões. As tarefas
continuam num quadro único, com área, cliente, pedido e registo de origem.
A lista de conteúdos é ordenada pela data de publicação e permite filtrar por mês;
não é uma grelha de mês com arrastar publicações. Finanças permite filtrar pela
data do movimento; a estimativa de receita mensal usa sempre as subscrições ativas.

As referências são verificadas no servidor, incluindo a coerência entre
clientes. A edição exige a revisão atual do registo (409 quando outra pessoa
já o alterou). Registos com dependentes não podem ser apagados sem desligar
as referências. Registos financeiros conservam-se: são anulados/cancelados,
não eliminados. Exportar página CSV inclui apenas a página/filtros visíveis,
com valores em euros e proteção de células que pudessem ser interpretadas como fórmulas.

## Acessos comerciais

- **Demonstração:** cria uma organização nova e independente com uma casa,
  três hóspedes/reservas e uma despesa fictícios. Nenhum dado é copiado de um
  cliente real. Não se partilha o mesmo ambiente entre interessados.
- **Teste privado:** cria uma organização vazia para os dados do cliente.
- Ambos são criados por Administração ou Marketing, com nome, email,
  contacto comercial opcional, pacote opcional e prazo de 1 a 90 dias.
- O convite de proprietário é válido por 7 dias e partilhado manualmente.
  O token é guardado como hash; não aparece na auditoria ou exportação interna.
  Pode ser renovado antes da aceitação, invalidando o anterior.
- O prazo começa na primeira sessão criada (aceitação/login), separadamente
  da validade do convite. Só criar ou visualizar o acesso na consola não o inicia.
- Expiração ou encerramento bloqueiam pedidos autenticados, incluindo sessões
  que já estavam abertas. É possível sair ou mudar de organização; uma pessoa
  com outro espaço ativo consegue continuar a entrar nesse espaço.
- Prolongar repõe o acesso encerrado/expirado. Antes da primeira entrada,
  a duração total não pode ultrapassar 90 dias; depois pode prolongar de 1 a
  90 dias por operação. Prolongar não reativa uma organização suspensa.
- Converter um teste privado é exclusivo da Administração: mantém a organização,
  utilizadores e dados, muda o estado para Ativo e o contacto para Ganho.
  A conversão não subscreve nem cobra automaticamente um pacote financeiro.
- Uma demonstração não é convertida com os dados fictícios: criar o teste
  privado a partir do mesmo contacto comercial, para começar limpo.
- A tarefa `trial_followups` corre de hora a hora e cria uma tarefa Comercial
  quando faltam três dias (ou o prazo já passou), com o responsável do contacto,
  se ainda tiver acesso. Não duplica a tarefa. Encerrar/converter conclui-a;
  prolongar atualiza o prazo e reabre-a. Sem responsável, aparece na equipa.

Nas demonstrações são bloqueados OAuth/email, escrita Google Tasks/push,
leitura de talões por API e importação de backups reais. Os transportes de
email e push e a disponibilidade Stripe também verificam o modo/expiração,
e as páginas públicas não expõem demonstrações nem testes expirados.
Google Tasks/Calendar deixam de considerar válidas as ligações desses acessos.
O utilizador vê uma faixa que identifica o ambiente e o prazo. Os acessos
não são apagados automaticamente ao expirar.

## Permissões

Cada pessoa pode ter vários cargos (Administração, Marketing e comercial,
Suporte) e as permissões somam-se (ver `CONSOLA-LOTE-C.md`). Administração
mantém acesso completo. Marketing pode gerir contactos, propostas,
acompanhamento, campanhas, conteúdos, materiais, bugs/sugestões,
demonstrações/testes, tarefas e comunicados. Suporte vê e responde aos pedidos
de suporte e gere bugs/sugestões e tarefas. Fora da Administração ninguém vê
Finanças, Equipa, Configurações, exportação integral, registo de ações nem
diagnóstico; os pedidos de suporte e anexos são só do Suporte. A API aplica as
mesmas regras quando alguém tenta abrir um endereço diretamente. Tarefas
financeiras/administrativas só aparecem à Administração, nem podem ser
abertas/editadas por identificador.

A página Equipa permite escolher um ou mais cargos de pessoas que já estão autorizadas
pela marca `platform_admin` e por `PLATFORM_ADMIN_EMAILS`. Não permite retirar
o próprio cargo de Administração. Atribuir cargos fecha desbloqueios anteriores.
Contas novas/autorização no ambiente continuam pelo procedimento de servidor
em `CONSOLA-LOTE-C.md`; a interface não permite contornar a lista de acesso.

## Limites deliberados

- Finanças é um controlo interno manual em EUR. Não emite faturas, não executa
  cobranças, não reconcilia extratos e não gera movimentos automaticamente.
  A receita mensal contratada normaliza anuidades por 12, sem efeitos contabilísticos.
- A aprovação/publicação de conteúdos e a publicação de versões são estados
  de acompanhamento interno; não publicam em redes sociais nem instalam código.
- Materiais são ligações HTTP(S) a ficheiros, não armazenamento de ficheiros.
- Exportação interna JSON inclui registos/comentários, tarefas/comentários e
  configurações informativas. Não é uma cópia completa ou um mecanismo de restauro;
  não inclui bases dos clientes, anexos ou credenciais do sistema. Cópias e
  restauro da instância seguem `OPERACOES.md` e devem ser executados pelo operador.
- Email de contacto é informativo. Email da empresa, IA e configuração inicial
  guiada continuam adiados. Criar contas comerciais por convite já funciona.

## Validação

```sh
cd backend/src
npm run check
node --test --test-concurrency=1
npm run test:departments
BROWSER_ENGINE=webkit npm run test:departments
npm run test:console
```

O teste novo de servidor cobre permissões, ligações entre clientes, revisões
concorrentes, valores em cêntimos, exportação/auditoria, isolamento, convites,
restrições externas, expiração/prolongamento/conversão, acompanhamento e
login com vários espaços. O teste browser exercita CRM/propostas,
campanhas/tarefas, recebimentos/ficha de cliente, convite de demonstração e
comentários, mais 22 páginas a 1280/360 px nos três aspetos (132 combinações).
As verificações utilizam bases descartáveis e dados fictícios; não ligam
serviços externos. A CI inclui Chromium e WebKit.
