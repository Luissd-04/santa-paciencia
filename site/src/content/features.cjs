const { icon, cta, pageHero, mock, related, brandTitle } = require('../layout.cjs');

const F = [
  {
    slug: 'reservas-e-calendario', ico: 'calendar', name: 'Reservas e calendário',
    title: 'Gestão de reservas e calendário para alojamento local',
    description: 'Um calendário único por alojamento para reservas diretas e de outros canais, com página de reservas própria, estados claros e histórico completo.',
    h1: 'Todas as reservas num <em>calendário único</em>',
    lead: 'As reservas diretas, as do Booking.com, as do Airbnb e as que chegam por telefone ficam no mesmo calendário, por alojamento. Acabou a dúvida sobre o que está livre.',
    card: 'Calendário por alojamento, página de reservas própria e estados claros do pedido à saída.',
    blocks: [
      { h2: 'Um calendário que se lê num relance', p: 'Cada alojamento tem a sua linha, cada reserva a sua barra. Vê quem entra hoje, quem sai amanhã e onde há noites por vender. Mudar datas é arrastar a reserva; o preço é recalculado e pede confirmação se algo deixar de bater certo.',
        ticks: ['Reservas e bloqueios de datas no mesmo calendário', 'Reservas identificadas por canal de origem', 'Sincronização com o Google Calendar da equipa'],
        mock: { title: 'Reservas · esta semana', rows: [['Marta Silva', 'Casa da Eira · 9 → 13 jun · 2 hóspedes', 'Confirmada', 'ok'], ['João Almeida', 'Quarto Azul · 10 → 13 jun · Booking.com', 'Em curso', 'marca'], ['Família Lopes', 'Casa da Eira · 13 → 16 jun · Site', 'Aguarda sinal', 'espera'], ['Ana e Pedro', 'Loft do Rio · 11 → 14 jun · Direto', 'Pré-check-in', 'neutro']], foot: 'Dados de exemplo' } },
      { h2: 'A sua própria página de reservas', p: 'Partilhe uma ligação e receba reservas diretas, sem comissões de intermediários. O hóspede vê as datas livres e o preço da época; o pedido entra no calendário e pode ser aprovado antes de confirmar.',
        ticks: ['Disponibilidade e preços sempre atuais', 'Pedidos com aprovação ou confirmação imediata', 'Proteção contra pedidos automáticos'] },
      { h2: 'Cada reserva conta a sua história', p: 'Hóspede, valores, descontos, pagamentos, mensagens enviadas e alterações ficam na ficha da reserva. Quando alguém pergunta «quem mudou isto?», a resposta está lá.',
        ticks: ['Estados claros: pedido, confirmada, em curso, concluída, cancelada', 'Histórico de alterações com data e autor', 'Cancelamento com o valor a devolver calculado pela sua política'] },
    ],
    rel: ['precos-por-epoca', 'pagamentos-online', 'hospedes-e-pre-check-in'],
  },
  {
    slug: 'precos-por-epoca', ico: 'tag', name: 'Preços por época',
    title: 'Preços por época e estadia mínima no alojamento local',
    description: 'Defina preços por noite para cada época, dias da semana e estadia mínima por alojamento. O total de cada reserva é calculado automaticamente.',
    h1: 'O preço certo para cada noite, <em>sem contas de cabeça</em>',
    lead: 'Época alta, fins de semana, pontes e festas da terra: defina uma vez e deixe a plataforma calcular o total de cada reserva.',
    card: 'Períodos de preço, dias da semana e estadia mínima por alojamento.',
    blocks: [
      { h2: 'Períodos de preço com nome próprio', p: 'Crie períodos como «Verão», «Páscoa» ou «Época baixa», com data de início e de fim, preço por noite e dias da semana a que se aplicam. Cada alojamento tem o seu calendário de preços.',
        ticks: ['Preço por noite por período', 'Preços diferentes para dias de semana e fim de semana', 'Estadia mínima em noites por período'],
        mock: { title: 'Preços · Casa da Eira', rows: [['Época baixa', '1 nov → 31 mar · todos os dias', '70 € / noite', 'neutro'], ['Primavera', '1 abr → 14 jun · mín. 2 noites', '95 € / noite', 'neutro'], ['Verão', '15 jun → 15 set · mín. 4 noites', '140 € / noite', 'marca'], ['Fins de semana de verão', 'sex e sáb · 15 jun → 15 set', '160 € / noite', 'marca']], foot: 'Valores de exemplo' } },
      { h2: 'O total faz-se sozinho', p: 'Ao criar uma reserva, na sua página pública ou no balcão, o total resulta das noites e dos períodos em vigor. Se mudar as datas, o valor acompanha. Se quiser dar um preço especial, pode editá-lo à mão e fica registado que o fez.',
        ticks: ['O mesmo cálculo na página pública e na gestão', 'Preço editado à mão sempre assinalado', 'Descontos e vouchers aplicados sobre o valor certo'] },
      { h2: 'Regras que evitam noites soltas', p: 'A estadia mínima impede reservas de uma noite a meio de agosto. O hóspede percebe porquê antes de pedir, e o calendário fica mais fácil de encher.',
        ticks: ['Estadia mínima visível para o hóspede', 'Regras diferentes por época e por alojamento'] },
    ],
    rel: ['reservas-e-calendario', 'comunicacoes-e-vouchers', 'relatorios'],
  },
  {
    slug: 'hospedes-e-pre-check-in', ico: 'users', name: 'Hóspedes e pré-check-in',
    title: 'Fichas de hóspedes e pré-check-in online',
    description: 'Fichas de hóspedes com histórico de estadias e pré-check-in online: o hóspede indica quem vem e a hora de chegada antes de sair de casa.',
    h1: 'Conheça o hóspede <em>antes de ele chegar</em>',
    lead: 'O pré-check-in recolhe os dados e a hora de chegada antes da viagem. À porta, fica só a parte boa: receber.',
    card: 'Fichas com histórico e pré-check-in feito pelo hóspede no telemóvel.',
    blocks: [
      { h2: 'Pré-check-in no telemóvel do hóspede', p: 'Depois de confirmada a reserva, o hóspede recebe uma ligação. Em dois passos indica quem o acompanha e a hora a que conta chegar. Não precisa de criar conta nem de instalar nada.',
        ticks: ['Dados do titular e dos acompanhantes', 'Hora prevista de chegada', 'Informação de privacidade apresentada ao hóspede'],
        mock: { title: 'Pré-check-in · chegadas de hoje', rows: [['Marta Silva + 1', 'Casa da Eira · chega às 16:30', 'Feito', 'ok'], ['Ana e Pedro', 'Loft do Rio · chega às 18:00', 'Feito', 'ok'], ['Família Lopes', 'Casa da Eira · 4 hóspedes', 'Por preencher', 'espera']], foot: 'Dados de exemplo' } },
      { h2: 'Uma ficha por hóspede, com memória', p: 'Quem já ficou consigo, quando, onde e quanto pagou. Assinale os hóspedes que quer voltar a receber e os que prefere não receber. Da próxima vez que reservarem, sabe com quem está a falar.',
        ticks: ['Histórico de estadias e valores', 'Marcações de VIP, favorito e indesejado', 'Pesquisa por nome, email ou telefone'] },
      { h2: 'Dados pessoais tratados com cuidado', p: 'A equipa vê apenas o que precisa: quem está na operação consulta as fichas, quem gere pode editá-las. Quando um hóspede pede para ser esquecido, a ficha é anonimizada sem perder os registos de pagamento que a lei manda guardar.',
        ticks: ['Permissões por função sobre as fichas', 'Anonimização com pré-visualização do que vai mudar'] },
    ],
    rel: ['comunicacoes-e-vouchers', 'reservas-e-calendario', 'equipa-e-tarefas'],
  },
  {
    slug: 'pagamentos-online', ico: 'card', name: 'Pagamentos online',
    title: 'Pagamentos online para reservas diretas de alojamento local',
    description: 'Receba o sinal e o saldo das reservas diretas por cartão com Stripe. Política de pagamento e de cancelamento aplicada automaticamente a cada reserva.',
    h1: 'O sinal entra, <em>a reserva confirma-se</em>',
    lead: 'Deixe de conferir transferências. O hóspede paga por cartão, a reserva passa a confirmada e o valor fica registado.',
    card: 'Sinal e saldo por cartão, com a sua política de cancelamento.',
    blocks: [
      { h2: 'Pagamento por cartão, sem trabalho seu', p: 'Nas reservas feitas no seu site ou diretamente consigo, o hóspede recebe uma ligação de pagamento segura da Stripe. Quando paga, a reserva atualiza-se: sinal recebido, saldo em falta, liquidada.',
        ticks: ['Página de pagamento segura da Stripe', 'Os dados do cartão nunca passam pela Santa Paciência', 'Estado financeiro da reserva sempre coerente com o que foi recebido'],
        mock: { title: 'Pagamentos · Família Lopes', rows: [['Total da estadia', '3 noites · Casa da Eira', '420,00 €', 'neutro'], ['Sinal (30%)', 'Pago por cartão · 2 jun', '126,00 €', 'ok'], ['Saldo', 'A pagar até 10 jun', '294,00 €', 'espera']], foot: 'Valores de exemplo' } },
      { h2: 'A sua política, aplicada sempre da mesma maneira', p: 'Defina quanto pede de sinal, até quando se paga o resto e o que devolve em caso de cancelamento. O hóspede aceita as condições ao reservar e a plataforma aplica-as. Ao cancelar, vê o valor a devolver antes de confirmar.',
        ticks: ['Sinal em percentagem e prazo para o saldo', 'Condições aceites pelo hóspede e guardadas na reserva', 'Reembolsos calculados e registados'] },
      { h2: 'Também regista o que recebe por fora', p: 'Dinheiro à chegada, transferência ou MB Way combinado por mensagem: lance o pagamento à mão e a reserva fica com as contas certas.',
        ticks: ['Pagamentos manuais com data e método', 'Cada movimento fica no histórico da reserva'] },
    ],
    rel: ['reservas-e-calendario', 'relatorios', 'comunicacoes-e-vouchers'],
  },
  {
    slug: 'despesas-e-fornecedores', ico: 'receipt', name: 'Despesas e fornecedores',
    title: 'Controlo de despesas e fornecedores no alojamento local',
    description: 'Registe despesas por alojamento, categoria e fornecedor. Fotografe o talão e a despesa é preenchida por si. Saiba quanto custa cada casa.',
    h1: 'Saiba quanto <em>custa cada casa</em>',
    lead: 'Lavandaria, limpeza, reparações, consumíveis. Registe na hora, com o telemóvel, e veja a margem real de cada alojamento.',
    card: 'Despesas por alojamento e fornecedor, a partir da fotografia do talão.',
    blocks: [
      { h2: 'Fotografe o talão e já está', p: 'Tire uma fotografia ao talão e a plataforma lê a data, o valor e o fornecedor. Só tem de confirmar e escolher o alojamento. O original fica guardado junto da despesa.',
        ticks: ['Leitura automática de talões', 'Fotografia guardada com a despesa', 'Registo em segundos, a partir do telemóvel'],
        mock: { title: 'Despesas · junho', rows: [['Lavandaria Central', 'Casa da Eira · Limpeza e roupa', '86,40 €', 'neutro'], ['Canalizador', 'Loft do Rio · Manutenção', '120,00 €', 'neutro'], ['Supermercado', 'Quarto Azul · Consumíveis', '32,15 €', 'neutro'], ['Total do mês', '14 despesas', '1 284,60 €', 'marca']], foot: 'Valores de exemplo' } },
      { h2: 'Cada despesa no seu lugar', p: 'Organize por alojamento e por categoria. Ao fim do mês sabe o que gastou em limpeza, em manutenção e em consumíveis, sem separar papéis.',
        ticks: ['Categorias adaptadas ao alojamento local', 'Filtros por período, alojamento e fornecedor', 'Exportação para entregar à contabilidade'] },
      { h2: 'Os fornecedores à mão', p: 'A lavandaria, o canalizador, a empresa de limpezas: contactos e histórico de despesas no mesmo sítio, para a equipa inteira.',
        ticks: ['Ficha de cada fornecedor com contactos', 'Quanto pagou a cada um, e quando'] },
    ],
    rel: ['relatorios', 'equipa-e-tarefas', 'reservas-e-calendario'],
  },
  {
    slug: 'equipa-e-tarefas', ico: 'team', name: 'Equipa e tarefas',
    title: 'Gestão de equipa, limpezas e tarefas no alojamento local',
    description: 'Atribua limpezas, manutenção e check-ins à equipa, com permissões por função, departamentos e avisos no telemóvel.',
    h1: 'Cada pessoa sabe <em>o que tem para fazer</em>',
    lead: 'Limpezas, manutenção, check-ins e reuniões atribuídos a quem os faz. Sem grupos de mensagens, sem «pensava que eras tu».',
    card: 'Tarefas atribuídas, permissões por função e avisos no telemóvel.',
    blocks: [
      { h2: 'Tarefas ligadas ao alojamento', p: 'Marque uma limpeza, uma reparação ou uma reunião, associe-a a um alojamento e a um responsável. Quem a faz marca-a como concluída e todos ficam a saber.',
        ticks: ['Tipos de tarefa definidos por si', 'Responsável, data e estado em cada tarefa', 'Vistas por semana, por mês e por alojamento'],
        mock: { title: 'Tarefas · hoje', rows: [['Limpeza de saída', 'Casa do Forno · Rosa · 11:00', 'Concluída', 'ok'], ['Check-in', 'Casa da Eira · Miguel · 16:30', 'Planeada', 'neutro'], ['Trocar esquentador', 'Loft do Rio · Canalizador · 14:00', 'Planeada', 'neutro']], foot: 'Dados de exemplo' } },
      { h2: 'Cada um vê o que deve ver', p: 'O proprietário vê tudo. Quem gere trata de reservas e preços. A equipa operacional consulta chegadas, saídas e tarefas, sem aceder aos números do negócio. Em equipas maiores, os departamentos organizam quem faz o quê.',
        ticks: ['Funções de proprietário, gestor e equipa', 'Departamentos para equipas maiores', 'Convites por email para novos membros'] },
      { h2: 'Avisos onde a equipa está', p: 'Nova reserva, pagamento recebido, pré-check-in feito: o aviso chega ao telemóvel. As tarefas também podem aparecer no Google Tasks de cada pessoa.',
        ticks: ['Notificações no telemóvel e no computador', 'Ligação ao Google Tasks e ao Google Calendar', 'Funciona como aplicação no ecrã inicial'] },
    ],
    rel: ['reservas-e-calendario', 'despesas-e-fornecedores', 'hospedes-e-pre-check-in'],
  },
  {
    slug: 'comunicacoes-e-vouchers', ico: 'mail', name: 'Comunicações e vouchers',
    title: 'Emails automáticos para hóspedes e vouchers de desconto',
    description: 'Envie emails de confirmação, chegada e saída na hora certa, a partir da sua conta Gmail. Crie vouchers de desconto com regras claras.',
    h1: 'A mensagem certa, <em>na hora certa</em>',
    lead: 'Confirmação, instruções de chegada, agradecimento à saída. Escreva uma vez e deixe a plataforma enviar quando faz sentido.',
    card: 'Emails automáticos a partir do seu Gmail e vouchers com regras.',
    blocks: [
      { h2: 'Emails que saem sozinhos', p: 'Crie modelos para cada momento da estadia. A plataforma preenche o nome do hóspede, as datas e o alojamento, e envia na altura certa. As instruções de acesso só seguem quando a reserva está em condições de as receber.',
        ticks: ['Modelos para confirmação, chegada, saída e cancelamento', 'Envio agendado em relação à data de chegada ou de saída', 'Cada email fica assinalado como enviado, pendente ou falhado'],
        mock: { title: 'Mensagens · Marta Silva', rows: [['Reserva confirmada', 'Enviado a 2 jun, 10:14', 'Enviado', 'ok'], ['Como chegar e entrar', 'Agendado para 8 jun, 09:00', 'Agendado', 'neutro'], ['Obrigado pela visita', 'Agendado para 13 jun, 12:00', 'Agendado', 'neutro']], foot: 'Dados de exemplo' } },
      { h2: 'Do seu endereço, com as respostas à vista', p: 'Os emails saem da sua conta Gmail, com o seu nome. O hóspede responde e a conversa aparece junto da reserva, para qualquer pessoa da equipa dar seguimento.',
        ticks: ['Envio pela sua conta Gmail', 'Conversas com hóspedes dentro da plataforma', 'Arquivo das conversas resolvidas'] },
      { h2: 'Vouchers com regras claras', p: 'Ofereça um desconto a quem volta ou uma noite a um parceiro. Defina o valor, o número de utilizações, os alojamentos e as noites mínimas. O voucher aplica-se na reserva e fica registado onde foi usado.',
        ticks: ['Desconto em percentagem ou em noites oferecidas', 'Limites por alojamento e por estadia mínima', 'Registo de cada utilização'] },
    ],
    rel: ['hospedes-e-pre-check-in', 'pagamentos-online', 'precos-por-epoca'],
  },
  {
    slug: 'relatorios', ico: 'chart', name: 'Relatórios',
    title: 'Relatórios de receita, ocupação e despesas do alojamento local',
    description: 'Receita, ocupação, despesas e margem por mês, por alojamento e por canal de reserva. Relatórios sempre atualizados, sem folhas de cálculo.',
    h1: 'Os números do negócio, <em>sem fórmulas</em>',
    lead: 'Quanto faturou, com que ocupação, por que canal e com que margem. Os relatórios constroem-se a partir do que já registou.',
    card: 'Receita, ocupação e margem por mês, alojamento e canal.',
    blocks: [
      { h2: 'Receita e ocupação, mês a mês', p: 'Veja a evolução do ano inteiro ou de um mês em particular: reservas, noites vendidas, taxa de ocupação e receita. Compare alojamentos e perceba quais puxam pelo negócio.',
        ticks: ['Receita mensal e ocupação', 'Receita por alojamento', 'Resumo mensal de reservas e noites'],
        mock: { title: 'Relatório · junho', rows: [['Receita', '38 reservas · 142 noites', '14 820 €', 'marca'], ['Ocupação média', '4 alojamentos', '79%', 'neutro'], ['Despesas', '14 registos', '1 285 €', 'neutro'], ['Margem', 'Receita menos despesas', '13 535 €', 'ok']], foot: 'Valores de exemplo' } },
      { h2: 'De onde vêm as reservas', p: 'A receita por canal mostra quanto vem das plataformas e quanto vem de reservas diretas. É a conta de que precisa para decidir onde investir.',
        ticks: ['Receita por canal de reserva', 'Peso das reservas diretas no total'] },
      { h2: 'Receita contra despesas', p: 'Como as despesas estão na mesma plataforma, a margem aparece sem trabalho adicional: por mês, com as despesas divididas por categoria.',
        ticks: ['Receita, despesas e margem lado a lado', 'Despesas por categoria e por mês', 'Exportação em PDF no pacote Premium'] },
    ],
    rel: ['despesas-e-fornecedores', 'reservas-e-calendario', 'pagamentos-online'],
  },
];

const bySlug = Object.fromEntries(F.map((f) => [f.slug, f]));

const featurePage = (f) => ({
  path: `/funcionalidades/${f.slug}/`,
  title: brandTitle(f.title),
  description: f.description,
  ogHeadline: f.h1.replace(/<[^>]+>/g, ''),
  crumbs: [['/funcionalidades/', 'Funcionalidades'], [`/funcionalidades/${f.slug}/`, f.name]],
  body: `${pageHero({ eyebrow: f.name, h1: f.h1, lead: f.lead })}
<div class="wrap">
${f.blocks.map((b) => `<section class="bloco">
  <div class="bloco-texto reveal">
    <h2>${b.h2}</h2>
    <p>${b.p}</p>
    <ul class="ticks">${b.ticks.map((t) => `<li>${icon('check')}<span>${t}</span></li>`).join('')}</ul>
  </div>
  ${b.mock ? mock(b.mock) : `<div class="bloco-arco reveal" aria-hidden="true">${icon(f.ico)}</div>`}
</section>`).join('\n')}
</div>
${related('Continue a ver', f.rel.map((s) => [`/funcionalidades/${s}/`, bySlug[s].name, bySlug[s].card]))}
${cta()}`,
});

const index = {
  path: '/funcionalidades/',
  title: 'Funcionalidades do software de alojamento local | Santa Paciência',
  description: 'Conheça as oito áreas da Santa Paciência: reservas e calendário, preços, hóspedes, pagamentos, despesas, equipa, comunicações e relatórios.',
  ogHeadline: 'Tudo o que a operação pede, no mesmo sítio',
  crumbs: [['/funcionalidades/', 'Funcionalidades']],
  body: `${pageHero({ eyebrow: 'Funcionalidades', h1: 'Uma plataforma, <em>a operação inteira</em>', lead: 'Oito áreas pensadas para o dia a dia do alojamento local. Use as que precisa hoje; as outras estão lá quando o negócio crescer.' })}
<section class="section papel">
  <div class="wrap">
    <div class="bento">
      ${F.map((f, i) => `<a class="tile reveal${i === 0 ? ' tile-dark' : ''}" href="/funcionalidades/${f.slug}/">${icon(f.ico)}<h2 class="h3">${f.name}</h2><p>${f.card}</p><span class="link-arrow">Saber mais ${icon('arrow')}</span></a>`).join('\n      ')}
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Também incluído</p>
      <h2>Os pormenores que <em>dão descanso</em></h2>
    </div>
    <ul class="integra">
      <li class="reveal"><strong>Aplicação no telemóvel</strong><span>Adicione ao ecrã inicial e use como uma aplicação, com notificações.</span></li>
      <li class="reveal"><strong>Cópias de segurança</strong><span>Exporte os seus dados quando quiser e volte a importá-los.</span></li>
      <li class="reveal"><strong>Registo de ações</strong><span>Fica registado quem cancelou, reembolsou ou alterou permissões.</span></li>
      <li class="reveal"><strong>Ajuda dentro da plataforma</strong><span>Fale connosco a partir da própria aplicação, sem mudar de sítio.</span></li>
    </ul>
  </div>
</section>
${cta()}`,
};

module.exports = [index, ...F.map(featurePage)];
module.exports.F = F;
