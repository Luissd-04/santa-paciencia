// Funcionalidades: ladrilhos do início e texto de cada página (/funcionalidades/<slug>/), em português de Portugal.
// Os visuais (cartões, avisos de vidro) levam dados de exemplo, também aqui.
type Item = { hora: string; titulo: string; texto: string; feito?: boolean; destaque?: boolean };
type Linha = { t: string; s?: string; v?: string; pill?: string; tom?: 'ok' | 'espera' | 'falha' | '' };
type Aviso = { titulo: string; texto: string };

export const funcionalidades = {
  // Ladrilhos do início e do índice (o ícone e o endereço vêm de src/config/brand.ts).
  ladrilhos: {
    'calendario': { titulo: 'Um calendário para todas', texto: 'As reservas do seu site, do Airbnb, do Booking.com e do telefone, lado a lado. Sem três aplicações abertas.' },
    'reservas-diretas': { titulo: 'Reservas no seu site', texto: 'Uma página de reservas bonita, ou um botão no site que já tem. Sem comissões.' },
    'pagamentos-online': { titulo: 'Pagamentos que se cobram sozinhos', texto: 'Sinal e saldo por cartão, nas datas certas. Sem andar atrás de ninguém.' },
    'pre-check-in': { titulo: 'Hóspedes que chegam registados', texto: 'Pré-check-in no telemóvel, com os dados do SIBA prontos a usar.' },
    'equipa-e-tarefas': { titulo: 'Limpezas sem WhatsApp', texto: 'Cada tarefa com dono, hora e casa. A equipa vê tudo no telemóvel.' },
    'mensagens-automaticas': { titulo: 'Emails que se escrevem sozinhos', texto: 'Confirmação, instruções de chegada e agradecimento, em 7 línguas.' },
    'despesas': { titulo: 'Despesas sem caixa de sapatos', texto: 'Tire uma fotografia ao talão e fica registado na casa certa.' },
    'relatorios': { titulo: 'Contas sempre à vista', texto: 'Receita, ocupação e margem por casa e por mês, sem fórmulas.' },
  } as Record<string, { titulo: string; texto: string }>,

  calendario: {
    titulo: 'Calendário de reservas para alojamento local',
    descricao: 'Todas as reservas do seu alojamento local num só calendário: do seu site, do Airbnb, do Booking.com e do telefone. Com preços por época e estadia mínima.',
    nome: 'Calendário',
    h1: 'Um calendário. Todas as reservas. Zero confusões.',
    lede: 'O calendário de reservas do seu alojamento local junta o seu site, o Airbnb, o Booking.com e o telefone. Vê num relance quem entra, quem sai e que noites estão por vender.',
    tituloPassos: 'Venha de onde vier, a reserva fica no mesmo sítio.',
    passos: [
      { titulo: 'As reservas do site entram sozinhas', texto: 'Quem reserva na sua página aparece logo no calendário, já com o sinal.' },
      { titulo: 'As outras registam-se num minuto', texto: 'Airbnb, Booking.com ou telefone: cada reserva fica com o canal de onde veio.' },
      { titulo: 'Vê tudo num relance', texto: 'Uma linha por casa, uma barra por reserva. O que está livre salta à vista.' },
    ],
    tituloBeneficios: 'Preços certos, noites bem vendidas.',
    beneficios: [
      { titulo: 'Preços por época', texto: 'Verão, Páscoa, fins de semana: define uma vez e o total calcula-se sozinho.' },
      { titulo: 'Estadia mínima', texto: 'Nada de noites soltas a meio de agosto.' },
      { titulo: 'Arrastar para mudar', texto: 'Muda as datas e o preço acompanha.' },
      { titulo: 'Cada reserva com história', texto: 'Hóspede, valores, pagamentos e quem mudou o quê.' },
    ],
    perguntas: [
      ['Sincroniza sozinho com o Airbnb e o Booking.com?', 'Ainda não. As reservas dessas plataformas são registadas por si, com o canal identificado, e ficam no mesmo calendário das reservas diretas. As reservas feitas na sua página entram sozinhas.'],
      ['Posso bloquear datas para mim?', 'Pode. Os bloqueios aparecem no calendário e essas datas deixam de estar disponíveis na sua página de reservas.'],
    ] as [string, string][],
    visualAria: 'Calendário de reservas com avisos: nova reserva pelo site e reserva do Booking.com registada',
    avisos: [
      { titulo: 'Nova reserva', texto: 'Pelo seu site · Loft do Rio' },
      { titulo: 'Reserva registada', texto: 'Booking.com · Quarto Azul' },
    ] as Aviso[],
    precos: {
      titulo: 'Preços · Casa da Eira', etiqueta: 'Por época',
      linhas: [
        { t: 'Época baixa', s: '1 nov a 31 mar · mín. 2 noites', v: '70 € / noite' },
        { t: 'Primavera', s: '1 abr a 14 jun · mín. 2 noites', v: '95 € / noite' },
        { t: 'Verão', s: '15 jun a 15 set · mín. 4 noites', v: '140 € / noite' },
        { t: 'Fins de semana de verão', s: 'sex e sáb · mín. 3 noites', v: '160 € / noite' },
      ] as Linha[],
    },
  },

  'reservas-diretas': {
    titulo: 'Reservas diretas para alojamento local',
    descricao: 'Receba reservas diretas no seu alojamento local, com página própria ou dentro do seu site. Sem comissões, com pagamento do sinal por cartão.',
    nome: 'Reservas no seu site',
    h1: 'As suas reservas, sem comissões pelo caminho.',
    lede: 'Reservas diretas para o seu alojamento local: uma página de reservas bonita para partilhar, ou um botão dentro do site que já tem. O hóspede escolhe as datas, paga o sinal e pronto.',
    tituloPassos: 'Do link à reserva, em três passos.',
    passos: [
      { titulo: 'Partilha o link ou cola o botão', texto: 'Uma página de reservas pronta a partilhar, ou um botão dentro do site que já tem.' },
      { titulo: 'O hóspede escolhe e paga', texto: 'Escolhe as datas e o quarto, vê o total e paga o sinal por cartão.' },
      { titulo: 'A reserva entra no calendário', texto: 'As datas ficam bloqueadas e o resto segue sozinho.' },
    ],
    tituloBeneficios: 'Mais reservas que ficam inteiras para si.',
    beneficios: [
      { titulo: 'Fica com o aspeto do seu site', texto: 'Cores, letra e cantos copiados do seu site (plano Premium).' },
      { titulo: 'Preço sempre certo', texto: 'As mesmas regras de época e estadia mínima.' },
      { titulo: 'Vouchers de desconto', texto: 'Para quem volta ou para parceiros, com regras claras.' },
      { titulo: 'Protegida contra robôs', texto: 'Pedidos falsos ficam à porta.' },
    ],
    perguntas: [
      ['Preciso de ter um site?', 'Não. A página de reservas funciona sozinha e pode partilhá-la nas redes ou por mensagem.'],
      ['Funciona com WordPress?', 'Sim. Basta colar duas linhas de código numa página.'],
    ] as [string, string][],
    aviso: { titulo: 'Reserva direta', texto: 'Quarto Azul · 0 € de comissão' } as Aviso,
    vouchers: {
      titulo: 'Vouchers', etiqueta: 'Página de reservas',
      linhas: [
        { t: 'VOLTAR10', s: 'Hóspedes que regressam · 10 %', pill: 'Ativo', tom: 'ok' },
        { t: 'PARCEIRO15', s: 'Parceiros · 15 % · até 31 dez', pill: 'Ativo', tom: 'ok' },
        { t: 'PRIMAVERA', s: 'Estadias de 3 noites ou mais', pill: 'Expirado', tom: 'espera' },
      ] as Linha[],
    },
  },

  'pagamentos-online': {
    titulo: 'Pagamentos online para alojamento local',
    descricao: 'Cobre o sinal e o saldo das reservas do seu alojamento local por cartão, sem transferências nem lembretes. Sem comissões por reserva.',
    nome: 'Pagamentos online',
    h1: 'Receba o sinal sem ter de pedir duas vezes.',
    lede: 'Pagamentos online para o seu alojamento local: o hóspede paga por cartão, a reserva confirma-se sozinha e o saldo é cobrado na data certa.',
    tituloPassos: 'Três passos, e nenhum é seu.',
    passos: [
      { titulo: 'Chega a reserva', texto: 'Pelo seu site ou registada por si. O valor do sinal é calculado com as suas regras.' },
      { titulo: 'O hóspede paga', texto: 'Recebe um email com o link e paga por cartão, em segurança, com a Stripe.' },
      { titulo: 'Tudo se atualiza', texto: 'A reserva fica confirmada, o pagamento registado e o saldo agendado.' },
    ],
    tituloBeneficios: 'Menos tempo no banco, mais noites vendidas.',
    beneficios: [
      { titulo: 'Sinal ou pagamento total', texto: 'Escolhe a percentagem e quando se cobra o resto.' },
      { titulo: 'Política de cancelamento clara', texto: 'O hóspede vê-a antes de pagar. Os reembolsos ficam registados.' },
      { titulo: 'Sem comissões por reserva', texto: 'Paga só as taxas do cartão, como em qualquer loja online.' },
      { titulo: 'Tudo no relatório do mês', texto: 'Cada pagamento fica ligado à reserva, à casa e ao canal.' },
    ],
    cartao: {
      casa: 'Casa da Eira', pill: 'Sinal · 30 %', valor: '120,00 €', hospede: 'Família Lopes · 9 a 12 de novembro',
      linhas: [['Total da estadia', '400,00 €'], ['Saldo a 2 de novembro', '280,00 €'], ['Taxa turística', '12,00 €']] as [string, string][],
      botao: 'Pagar 120,00 €',
    },
    aviso: { titulo: 'Pago por cartão', texto: 'Reserva confirmada' } as Aviso,
    telemovel: {
      titulo: 'Pagamentos', sub: 'novembro',
      itens: [
        { hora: '02 nov', titulo: 'Saldo · Casa da Eira', texto: '280,00 € cobrado' },
        { hora: '28 out', titulo: 'Sinal · Quarto Azul', texto: '54,00 € por cartão' },
        { hora: '27 out', titulo: 'Reembolso · Loft do Rio', texto: 'Cancelamento dentro do prazo' },
        { hora: '09 nov', titulo: 'Saldo · Monte Branco', texto: 'Agendado · 310,00 €', feito: false, destaque: true },
      ] as Item[],
    },
  },

  'mensagens-automaticas': {
    titulo: 'Mensagens automáticas para hóspedes de AL',
    descricao: 'Emails automáticos para os hóspedes do seu alojamento local: confirmação, instruções de chegada e agradecimento, em 7 línguas, a partir do seu Gmail.',
    nome: 'Emails automáticos',
    h1: 'Escreva uma vez. Envia-se sempre na hora certa.',
    lede: 'Mensagens automáticas para os hóspedes do seu alojamento local: a confirmação, as instruções de chegada e o obrigado saem sozinhos, do seu email, na língua de cada hóspede.',
    tituloPassos: 'Escreve uma vez, o resto envia-se.',
    passos: [
      { titulo: 'Escolhe os modelos', texto: 'Confirmação, instruções de chegada, agradecimento. Ajusta o texto à sua maneira.' },
      { titulo: 'Liga o seu Gmail', texto: 'Os emails saem do seu endereço, com a sua assinatura.' },
      { titulo: 'Os emails saem sozinhos', texto: 'Na hora certa e na língua de cada hóspede.' },
    ],
    tituloBeneficios: 'Hóspedes bem informados, sem teclar.',
    beneficios: [
      { titulo: 'Em 7 línguas', texto: 'Português, inglês, francês, espanhol, alemão, italiano e neerlandês.' },
      { titulo: 'Do seu endereço', texto: 'Os hóspedes respondem-lhe a si, e a conversa fica na reserva.' },
      { titulo: 'Instruções só quando faz sentido', texto: 'O código e as indicações só seguem com a reserva em ordem.' },
      { titulo: 'Sempre a saber o que saiu', texto: 'Enviado, agendado ou falhado, à vista.' },
    ],
    cartao: {
      titulo: 'Família Lopes', sub: 'Casa da Eira · 9 a 12 nov',
      linhas: [
        { t: 'Confirmação da reserva', s: '28 out · PT', pill: 'Enviado', tom: 'ok' },
        { t: 'Pedido de pré-check-in', s: '5 nov · PT', pill: 'Enviado', tom: 'ok' },
        { t: 'Instruções de chegada', s: '9 nov, 09:00 · PT', pill: 'Agendado', tom: 'espera' },
        { t: 'Agradecimento', s: '12 nov, 12:00 · PT', pill: 'Agendado', tom: 'espera' },
      ] as Linha[],
    },
    aviso: { titulo: 'Email enviado', texto: 'Confirmação · Família Lopes' } as Aviso,
  },

  'pre-check-in': {
    titulo: 'Check-in online para alojamento local e SIBA',
    descricao: 'Pré-check-in online para o seu alojamento local: o hóspede preenche os dados no telemóvel antes de chegar, já com os campos que o SIBA pede.',
    nome: 'Pré-check-in',
    h1: 'O hóspede chega. A papelada já ficou feita.',
    lede: 'Com o check-in online do seu alojamento local, o hóspede preenche os dados no telemóvel antes da viagem. À porta, fica só a parte boa: receber.',
    tituloPassos: 'O hóspede trata de tudo antes de sair de casa.',
    passos: [
      { titulo: 'A reserva confirma-se', texto: 'Com o sinal pago ou a reserva aceite, o pré-check-in fica disponível.' },
      { titulo: 'O hóspede recebe o link', texto: 'Por email, uns dias antes da chegada, no telemóvel e na sua língua.' },
      { titulo: 'Os dados ficam na ficha', texto: 'Titular, acompanhantes e hora de chegada, organizados na reserva.' },
    ],
    tituloBeneficios: 'Chegadas sem papéis nem perguntas.',
    beneficios: [
      { titulo: 'Sem contas nem apps', texto: 'O hóspede abre o link e preenche em dois minutos.' },
      { titulo: 'Tudo o que o SIBA pede', texto: 'Documento, nacionalidade, datas: organizado para comunicar.' },
      { titulo: 'Hora de chegada', texto: 'Sabe quando preparar a casa.' },
      { titulo: 'Portal do hóspede', texto: 'Morada, instruções e contactos num só link.' },
    ],
    perguntas: [
      ['Comunica ao SIBA sozinho?', 'Ainda não: recolhe e organiza os dados, e a comunicação continua a ser feita por si.'],
      ['E a privacidade do hóspede?', 'O hóspede vê a informação de privacidade antes de enviar, e a aceitação fica registada.'],
    ] as [string, string][],
    aviso: { titulo: 'Pré-check-in feito', texto: 'Família Lopes · 4 hóspedes' } as Aviso,
    telemovel: {
      titulo: 'Chegadas', sub: 'sáb, 9 nov',
      itens: [
        { hora: '16:30', titulo: 'Família Lopes · Casa da Eira', texto: 'Pré-check-in feito · 4 hóspedes' },
        { hora: '18:00', titulo: 'Ana e Pedro · Loft do Rio', texto: 'Pré-check-in feito · 2 hóspedes' },
        { hora: '19:30', titulo: 'J. Almeida · Quarto Azul', texto: 'Por preencher', feito: false, destaque: true },
      ] as Item[],
    },
  },

  despesas: {
    titulo: 'Gestão de despesas do alojamento local',
    descricao: 'Registe as despesas do seu alojamento local com uma fotografia do talão. Por casa, categoria e fornecedor, prontas para o contabilista.',
    nome: 'Despesas',
    h1: 'A caixa de sapatos pode reformar-se.',
    lede: 'A gestão de despesas do alojamento local começa no telemóvel: fotografa o talão, confirma o valor e fica arrumado na casa certa.',
    tituloPassos: 'Do talão ao registo, em três toques.',
    passos: [
      { titulo: 'Fotografa o talão', texto: 'Com o telemóvel, na própria loja. Sem cartas nem digitalizações.' },
      { titulo: 'Confirma o que foi lido', texto: 'Data, valor e fornecedor aparecem preenchidos. Corrige o que for preciso.' },
      { titulo: 'Fica na casa certa', texto: 'Arrumado por casa e categoria, e já conta nos relatórios.' },
    ],
    tituloBeneficios: 'Contas arrumadas ao longo do ano.',
    beneficios: [
      { titulo: 'Leitura automática', texto: 'Data, valor e fornecedor preenchidos por si.' },
      { titulo: 'Por casa e categoria', texto: 'Limpeza, manutenção, consumíveis.' },
      { titulo: 'Fornecedores à mão', texto: 'Contactos e quanto pagou a cada um.' },
      { titulo: 'Pronto para o contabilista', texto: 'Exporte o mês num clique.' },
    ],
    perguntas: [
      ['A leitura do talão é sempre certa?', 'A leitura é opcional e serve para poupar escrita: confirma sempre os valores antes de guardar.'],
    ] as [string, string][],
    aviso: { titulo: 'Talão lido', texto: 'Drogaria Central · 38,40 €' } as Aviso,
    mes: {
      titulo: 'Despesas · novembro', sub: 'Por casa',
      linhas: [
        { t: 'Drogaria Central', s: '6 nov · Casa da Eira · Consumíveis', v: '38,40 €' },
        { t: 'Lavandaria do Rio', s: '4 nov · Loft do Rio · Limpeza', v: '64,00 €' },
        { t: 'Canalizações Pereira', s: '2 nov · Monte Branco · Manutenção', v: '85,00 €' },
        { t: 'Total de novembro', s: '3 despesas', v: '187,40 €' },
      ] as Linha[],
    },
  },

  'equipa-e-tarefas': {
    titulo: 'Gestão de limpezas para alojamento local',
    descricao: 'Atribua limpezas, manutenção e check-ins à equipa do seu alojamento local, com avisos no telemóvel e permissões por função.',
    nome: 'Limpezas e equipa',
    h1: 'Cada um sabe o que tem para fazer. E quando.',
    lede: 'Gestão de limpezas para alojamento local sem grupos de WhatsApp: cada tarefa tem casa, hora e responsável, e a equipa vê tudo no telemóvel.',
    tituloPassos: 'Da saída ao «está pronto», sem mensagens.',
    passos: [
      { titulo: 'A saída é marcada', texto: 'Quando uma reserva termina, a limpeza da casa fica prevista no dia certo.' },
      { titulo: 'A limpeza fica atribuída', texto: 'Com casa, hora e responsável. Quem for escolhido recebe o aviso.' },
      { titulo: 'A Rita marca como feita', texto: 'Do telemóvel, sem ligar a ninguém. Vê logo que a casa está pronta.' },
    ],
    tituloBeneficios: 'Uma equipa alinhada, sem reuniões.',
    beneficios: [
      { titulo: 'Avisos no telemóvel', texto: 'Nova tarefa, nova chegada, pré-check-in feito.' },
      { titulo: 'Cada um vê o que deve', texto: 'A equipa vê chegadas e tarefas, não vê os números.' },
      { titulo: 'Google Tasks e Calendar', texto: 'As tarefas aparecem onde a equipa já está.' },
      { titulo: 'Departamentos', texto: 'Para equipas maiores, com responsáveis.' },
    ],
    perguntas: [
      ['A equipa paga utilizador?', 'Depende do plano: o Essencial inclui 2 utilizadores, o Profissional 5 e o Premium não tem limite.'],
    ] as [string, string][],
    aviso: { titulo: 'Nova tarefa', texto: 'Limpeza · Casa da Eira · 10:00' } as Aviso,
    telemovel: {
      titulo: 'Hoje', sub: 'sáb, 9 nov',
      itens: [
        { hora: '10:00', titulo: 'Limpeza · Casa da Eira', texto: 'Rita · saída da Família Lopes', feito: false, destaque: true },
        { hora: '12:30', titulo: 'Limpeza · Quarto Azul', texto: 'Rita · saída de J. Almeida' },
        { hora: '15:00', titulo: 'Manutenção · Loft do Rio', texto: 'Torneira da cozinha · Paulo', feito: false },
        { hora: '16:30', titulo: 'Chegada · Monte Branco', texto: 'Sofia M. · 2 hóspedes', feito: false },
      ] as Item[],
    },
    funcoes: {
      titulo: 'Equipa', etiqueta: 'Por função',
      linhas: [
        { t: 'Gestão', s: 'Reservas, pagamentos e relatórios', pill: 'Vê tudo', tom: 'ok' },
        { t: 'Rita · Limpezas', s: 'Chegadas e tarefas das suas casas', pill: 'Sem números', tom: 'espera' },
        { t: 'Paulo · Manutenção', s: 'Só as tarefas atribuídas a ele', pill: 'Sem números', tom: 'espera' },
      ] as Linha[],
    },
  },

  relatorios: {
    titulo: 'Relatórios de rentabilidade do alojamento local',
    descricao: 'Receita, ocupação, despesas e margem do seu alojamento local por mês, por casa e por canal. Sempre atualizados, sem folhas de cálculo.',
    nome: 'Relatórios',
    h1: 'Quanto ganhou este mês? Já está feito.',
    lede: 'Relatórios do alojamento local construídos com o que já registou: receita, ocupação e margem por casa e por canal, sem uma única fórmula.',
    tituloPassos: 'Três perguntas a que o relatório responde sozinho.',
    passos: [
      { titulo: 'Que casa rende mais?', texto: 'Receita e ocupação lado a lado, casa a casa, mês a mês.' },
      { titulo: 'Quanto veio do Airbnb e quanto foi direto?', texto: 'A receita por canal, para ver o que pesa e o que poupou.' },
      { titulo: 'Quanto sobrou depois das despesas?', texto: 'A margem, com as despesas por categoria.' },
    ],
    tituloBeneficios: 'Os números do negócio, sem folhas de cálculo.',
    beneficios: [
      { titulo: 'Receita e ocupação mês a mês', texto: 'Todas as casas ou uma de cada vez.' },
      { titulo: 'Receita por canal', texto: 'Saber quanto pagou em comissões e quanto poupou.' },
      { titulo: 'Margem real', texto: 'Receita menos despesas, por categoria.' },
      { titulo: 'Taxa turística calculada', texto: 'Por mês e por casa.' },
    ],
    aviso: { titulo: 'Relatório pronto', texto: 'Junho · 4 casas' } as Aviso,
  },
};
