// «Para quem» (/para/<perfil>/): texto de cada perfil, em português de Portugal.
import type { SlugPerfil } from '../rotas';
type Bloco = { icone: string; titulo: string; texto: string };
type Seccao = { id: string; titulo: string; blocos: Bloco[]; frase?: string; colunas?: 3 };
export interface PaginaPerfil {
  titulo: string; descricao: string; nome: string; fase: number; h1: string; lede: string;
  seccoes: Seccao[];
  planoTitulo: string; planoTexto: string; planoIds: string[];
  fimTitulo: string; fimTexto: string;
}

export const perfis: Record<SlugPerfil, PaginaPerfil> = {
  proprietarios: {
    titulo: 'Programa de alojamento local para proprietários',
    descricao: 'Tem uma ou duas casas e gere nas horas vagas? Reservas, pagamentos e hóspedes tratados sozinhos, para deixar de viver agarrado ao telemóvel.',
    nome: 'Proprietários', fase: 2.4,
    h1: 'Tem um alojamento local. Não precisa de ter um segundo emprego.',
    lede: 'Para quem gere uma, duas ou três casas nas horas vagas. Menos mensagens, menos contas de cabeça, mais fins de semana seus.',
    seccoes: [
      { id: 'semana', titulo: 'O que muda já na primeira semana.', blocos: [
        { icone: 'cal', titulo: 'Um calendário só', texto: 'As reservas do seu site, do Airbnb, do Booking.com e do telefone no mesmo sítio. Para saber se a casa está livre, basta um olhar.' },
        { icone: 'pay', titulo: 'O sinal paga-se por cartão', texto: 'O hóspede paga online e a reserva confirma-se. Não anda a pedir transferências nem a conferir o banco (pagamentos online a partir do plano Profissional).' },
        { icone: 'key', titulo: 'Hóspedes que chegam registados', texto: 'O pré-check-in faz-se no telemóvel, antes da viagem, com os dados que o SIBA pede já organizados.' },
        { icone: 'mail', titulo: 'Emails que se escrevem sozinhos', texto: 'Confirmação, instruções de chegada e agradecimento saem na hora certa, na língua do hóspede (a partir do plano Profissional).' },
      ] },
      { id: 'tempo', titulo: 'Quanto tempo poupa?', blocos: [], frase: 'As tarefas que hoje faz à mão passam a acontecer sozinhas.' },
    ],
    planoTitulo: 'O plano que costuma servir.',
    planoTexto: 'Comece pelo Essencial se só quer sair da folha de cálculo. Escolha o Profissional se quer receber o sinal online e ter os emails automáticos.',
    planoIds: ['essencial', 'profissional'],
    fimTitulo: 'Os seus fins de semana agradecem.',
    fimTexto: 'Estamos a abrir aos poucos, com acompanhamento pessoal na configuração. Peça já o seu lugar.',
  },
  gestores: {
    titulo: 'Gestão de várias casas de AL num só sítio',
    descricao: 'Gere várias casas de alojamento local num só calendário: quem chega, quem pagou e o que falta limpar, de uma vez.',
    nome: 'Gestores de várias casas', fase: 2.8,
    h1: 'Dez casas. Um só ecrã.',
    lede: 'Quando as casas se multiplicam, o problema já não é o trabalho, é a coordenação. Aqui vê tudo de uma vez.',
    seccoes: [
      { id: 'relance', titulo: 'Num relance.', colunas: 3, blocos: [
        { icone: 'key', titulo: 'Chegadas de hoje', texto: 'Quem entra, a que horas e se já preencheu o pré-check-in.' },
        { icone: 'pay', titulo: 'Pagamentos em falta', texto: 'Sinais e saldos por receber, reserva a reserva, sem ir ao extrato.' },
        { icone: 'clean', titulo: 'Limpezas por fazer', texto: 'O que falta preparar antes da próxima chegada, casa a casa.' },
      ] },
      { id: 'equipa', titulo: 'A equipa em sintonia.', blocos: [
        { icone: 'clean', titulo: 'Cada tarefa com dono', texto: 'Limpezas, manutenção e check-ins atribuídos a quem os faz, com casa e hora.' },
        { icone: 'guest', titulo: 'Cada um vê o que deve', texto: 'A equipa vê chegadas e tarefas no telemóvel, mas não vê os números do negócio.' },
      ] },
      { id: 'numeros', titulo: 'Os números de cada casa.', blocos: [
        { icone: 'chart', titulo: 'Receita, ocupação e margem', texto: 'Por casa, por mês e por canal, calculados com o que já registou. Sem fórmulas.' },
        { icone: 'receipt', titulo: 'Despesas na casa certa', texto: 'Uma fotografia ao talão e a despesa fica arrumada por casa e categoria.' },
      ] },
    ],
    planoTitulo: 'O plano que costuma servir.',
    planoTexto: 'O Profissional aguenta até 10 alojamentos e 5 utilizadores, com pagamentos online, emails automáticos e relatórios completos.',
    planoIds: ['profissional'],
    fimTitulo: 'Com dez casas, cada minuto conta.',
    fimTexto: 'Estamos a abrir aos poucos, com acompanhamento pessoal na configuração. Peça já o seu lugar.',
  },
  'empresas-de-gestao': {
    titulo: 'Software para empresas de gestão de AL',
    descricao: 'Equipas, departamentos, permissões por função e relatórios por proprietário. O software para empresas de gestão de alojamento local.',
    nome: 'Empresas de gestão', fase: 3.0,
    h1: 'A sua empresa cresce. A confusão não.',
    lede: 'Equipas, departamentos e permissões para que cada pessoa veja só o que precisa, e relatórios em PDF para enviar a cada proprietário.',
    seccoes: [
      { id: 'permissoes', titulo: 'Cada pessoa vê o que precisa.', colunas: 3, blocos: [
        { icone: 'shield', titulo: 'Permissões por função', texto: 'A receção vê chegadas e tarefas, a gestão trata de reservas e preços, a administração vê os números.' },
        { icone: 'clean', titulo: 'Departamentos', texto: 'Organize a equipa por áreas, com responsáveis, e atribua as tarefas a quem as faz.' },
        { icone: 'book', titulo: 'Quem fez o quê', texto: 'Cancelamentos, reembolsos e mudanças de permissões ficam registados.' },
      ] },
      { id: 'clientes', titulo: 'Para os proprietários e para os seus sites.', blocos: [
        { icone: 'chart', titulo: 'Relatórios para proprietários', texto: 'Receita, ocupação e despesas por casa, em PDF, prontos para enviar a cada proprietário.' },
        { icone: 'web', titulo: 'Reservas dentro do site de cada cliente', texto: 'A reserva aparece dentro do site, com as cores, a letra e os cantos desse site.' },
      ] },
    ],
    planoTitulo: 'O plano que costuma servir.',
    planoTexto: 'O Premium não tem limite de alojamentos nem de utilizadores, e traz equipa, departamentos, permissões, relatórios em PDF e reservas dentro do seu site.',
    planoIds: ['premium'],
    fimTitulo: 'Mais casas, a mesma calma.',
    fimTexto: 'Estamos a abrir aos poucos, com acompanhamento pessoal na configuração. Fale connosco e vemos como ficaria a sua equipa.',
  },
};
