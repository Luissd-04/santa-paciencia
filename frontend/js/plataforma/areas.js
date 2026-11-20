// Estrutura da consola: rotas antigas mantêm-se válidas.
(() => {
const groups=[
 ['overview','Visão geral','layout-dashboard',[[ 'geral','/plataforma','Resumo','geral'],['minhas','/plataforma/minhas-tarefas','As minhas tarefas','tarefas']]],
 ['sales','Comercial','handshake',[[ 'leads','/plataforma/comercial/contactos','Potenciais clientes','workspace','lead'],['proposals','/plataforma/comercial/propostas','Propostas','workspace','proposal'],['trials','/plataforma/comercial/acessos','Demonstrações e testes','workspaceTrials']]],
 ['clients','Clientes','building-2',[[ 'clientes','/plataforma/clientes','Estabelecimentos','clientes'],['profiles','/plataforma/clientes/acompanhamento','Acompanhamento','workspace','profile']]],
 ['support','Suporte','inbox',[[ 'suporte','/plataforma/suporte','Pedidos','suporte'],['supportModels','/plataforma/suporte/respostas','Respostas guardadas','workspaceReplies']]],
 ['marketing','Marketing','megaphone',[[ 'marketing','/plataforma/marketing','Resumo de marketing','workspaceDashboard'],['campaigns','/plataforma/marketing/campanhas','Campanhas','workspace','campaign'],['content','/plataforma/marketing/conteudos','Calendário de conteúdos','workspace','content'],['materials','/plataforma/marketing/materiais','Materiais','workspace','material'],['comunicados','/plataforma/comunicados','Comunicados','comunicados']]],
 ['finance','Finanças','wallet',[[ 'finance','/plataforma/financas','Resumo financeiro','workspaceDashboard'],['subscriptions','/plataforma/financas/subscricoes','Subscrições','workspace','subscription'],['payments','/plataforma/financas/pagamentos','Pagamentos','workspace','entry','income'],['expenses','/plataforma/financas/despesas','Despesas','workspace','entry','expense']]],
 ['product','Produto','layers',[[ 'issues','/plataforma/produto/pedidos','Bugs e sugestões','workspace','issue'],['releases','/plataforma/produto/versoes','Versões','workspace','release'],['tarefas','/plataforma/tarefas','Tarefas da equipa','tarefas']]],
 ['operations','Operações','activity',[[ 'system','/plataforma/operacoes','Estado do sistema','workspaceOperations'],['incidentes','/plataforma/incidentes','Incidentes e integrações','incidentes'],['utilizacao','/plataforma/utilizacao','Utilização e diagnóstico','utilizacao'],['maintenance','/plataforma/operacoes/manutencoes','Manutenções','workspace','maintenance'],['exports','/plataforma/operacoes/exportacoes','Exportação interna','workspaceExport']]],
 ['administration','Administração','settings',[[ 'team','/plataforma/administracao/equipa','Equipa e permissões','workspaceTeam'],['pacotes','/plataforma/pacotes','Pacotes','pacotes'],['settings','/plataforma/administracao/configuracoes','Configurações','workspaceSettings'],['registo','/plataforma/registo','Registo de ações','registo']]],
];
const routes=groups.flatMap(([area,,,items])=>items.map(([key,path,title,page,kind,preset])=>({area,key,path,title,page,kind,preset})));
// Definições da pessoa (conta, aspeto, versão, sessão): não é uma área de trabalho.
routes.push({area:null,key:'definicoes',path:'/plataforma/definicoes',title:'Definições',page:'definicoes'});
const recordRoute=kind=>routes.find(r=>r.kind===kind);
function recordHref(kind,id){const route=recordRoute(kind);return route?`${route.path}/${encodeURIComponent(id)}`:'/plataforma';}
AppModules.define('consola',{areas:{get:()=>({groups,routes,recordHref})}});
})();
