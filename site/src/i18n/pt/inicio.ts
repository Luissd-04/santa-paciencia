// Início (/): textos em português de Portugal.
export const inicio = {
  titulo: 'Software de gestão de alojamento local',
  descricao: 'Reservas, pagamentos, hóspedes e limpezas do seu alojamento local num só sítio. Sem comissões por reserva, feito em Portugal. Peça acesso antecipado.',
  appDescricao: 'Software de gestão de alojamento local: reservas, pagamentos online, pré-check-in, limpezas e relatórios.',
  hero: {
    kickerTag: 'Novo',
    kicker: 'Reservas no seu site, sem comissões',
    h1: 'Alojamento local sem dores de cabeça.',
    lede: 'Reservas, pagamentos, hóspedes e limpezas num só sítio. Menos telefonemas e folhas de cálculo, mais tempo para receber bem quem chega.',
    cta: 'Quero experimentar',
    ctaSec: 'Ver um dia normal',
    factos: ['Sem instalar nada', 'Funciona no telemóvel', 'Em português de Portugal'],
    palcoAria: 'Calendário de reservas com avisos: nova reserva pelo site, sinal recebido e limpeza atribuída',
    avisos: [
      { titulo: 'Nova reserva', texto: 'Pelo seu site · 0 € de comissão' },
      { titulo: 'Sinal recebido', texto: 'Quarto Azul · 54,00 €' },
      { titulo: 'Limpeza marcada', texto: 'Sábado, 10:00 · Rita' },
    ],
  },
  dores: {
    h2: 'Se tem alojamento local, já viveu isto.',
    itens: [
      ['22:47', '«Ainda tem vaga para o fim de semana?»', 'E lá vai abrir três calendários para ter a certeza.'],
      ['Sexta', 'Ninguém sabe se o sinal já entrou.', 'Procura no banco, no email e nas mensagens. Duas vezes.'],
      ['Sábado', 'A limpeza foi combinada por WhatsApp.', 'Às onze da noite, numa conversa que já ninguém encontra.'],
      ['Março', 'Os talões estão numa caixa de sapatos.', 'E o contabilista quer tudo até sexta-feira.'],
    ] as [string, string, string][],
    resposta: 'Nós também passámos por isso. Por isso juntámos tudo num só sítio.',
    ver: 'Ver como fica',
  },
  dia: {
    h2: 'Um dia normal, sem correrias.',
    sub: 'É isto que acontece enquanto está a tratar de outra coisa qualquer.',
    passos: [
      ['09:12', 'Entra uma reserva pelo seu site', 'Sem intermediários e sem comissão. As datas ficam ocupadas no calendário e deixam de aparecer livres na sua página.'],
      ['09:13', 'O hóspede paga o sinal', 'Recebe um link e paga por cartão. Não precisa de enviar o IBAN nem de confirmar transferências.'],
      ['3 dias antes', 'Chega o pré-check-in', 'O hóspede preenche os dados no telemóvel, já com o que precisa para o SIBA.'],
      ['Véspera', 'A Rita sabe o que limpar', 'A limpeza fica atribuída com hora marcada e aparece no telemóvel dela.'],
      ['Saída', 'As contas fazem-se sozinhas', 'O saldo é cobrado, a taxa turística fica calculada e o relatório do mês atualizado.'],
    ] as [string, string, string][],
    telemovel: { titulo: 'Hoje', sub: 'qui, 12 nov' },
    hoje: [
      { hora: '09:12', titulo: 'Nova reserva · Loft do Rio', texto: '3 noites · pelo seu site' },
      { hora: '09:13', titulo: 'Sinal recebido', texto: '120,00 € por cartão' },
      { hora: '10:00', titulo: 'Limpeza · Casa da Eira', texto: 'Atribuída à Rita', feito: false, destaque: true },
      { hora: '15:30', titulo: 'Pré-check-in feito', texto: 'Família Lopes · 4 hóspedes' },
      { hora: '16:00', titulo: 'Chegada · Casa da Eira', texto: 'Instruções de chegada enviadas', feito: false },
    ] as { hora: string; titulo: string; texto: string; feito?: boolean; destaque?: boolean }[],
  },
  tudo: {
    h2: 'Tudo o que o seu alojamento precisa. Nada do que não precisa.',
    sub: 'Oito ferramentas que falam umas com as outras: a reserva sabe do pagamento, a limpeza sabe da saída, o relatório sabe de tudo.',
    saberMais: 'Saber mais',
  },
  portugal: {
    h2: 'Feito em Portugal, para quem recebe em Portugal.',
    sub: 'Os programas estrangeiros não sabem o que é a taxa turística de Lisboa nem o que o SIBA pede. Este sabe.',
    cta: 'Quero experimentar',
    itens: [
      ['receipt', 'Taxa turística calculada', 'Por noite e por hóspede, já nas reservas e nos relatórios.'],
      ['key', 'Dados para o SIBA', 'O pré-check-in recolhe tudo o que precisa para comunicar.'],
      ['book', 'Sinal, saldo e cancelamento à portuguesa', 'As regras que já usa, aplicadas sempre da mesma maneira.'],
      ['flag', 'Português de Portugal', 'Nos ecrãs, nos emails e no apoio. Sem traduções à pressa.'],
      ['shield', 'RGPD tratado', 'O consentimento de cada hóspede fica registado com a reserva.'],
    ] as [string, string, string][],
  },
  quem: {
    h2: 'Do primeiro quarto à empresa de gestão.',
    itens: [
      ['1–3', 'Proprietários', 'Gere as casas nas horas vagas e quer deixar de viver agarrado ao telemóvel.', 'proprietarios'],
      ['4–20', 'Gestores de várias casas', 'Precisa de ver tudo de uma vez: quem chega, quem pagou, o que falta limpar.', 'gestores'],
      ['20+', 'Empresas de gestão', 'Equipas, permissões por função e relatórios para enviar a cada proprietário.', 'empresas-de-gestao'],
    ] as [string, string, string, string][],
  },
  perguntas: {
    h2: 'Perguntas que nos fazem sempre.',
    itens: [
      ['Funciona com o Airbnb e o Booking.com?', 'As reservas dessas plataformas ficam no mesmo calendário, registadas por si com o canal identificado. A sincronização automática ainda não existe; as reservas feitas no seu site entram sozinhas.'],
      ['Preciso de instalar alguma coisa?', 'Não. Funciona no browser, no computador e no telemóvel. Se quiser, pode adicioná-lo ao ecrã principal do telemóvel como uma app.'],
      ['Quanto custa?', 'Há três planos mensais, consoante o número de casas, e nenhuma comissão por reserva. Pode ver tudo na página de preços.'],
      ['Comunica os hóspedes ao SIBA?', 'O pré-check-in recolhe todos os dados que o SIBA pede. A comunicação continua a ser feita por si, mas com os dados já organizados.'],
      ['Os meus dados estão seguros?', 'Sim. O acesso é protegido, cada pessoa da equipa vê só o que precisa e o consentimento dos hóspedes fica registado.'],
      ['Posso mudar a meio da época?', 'Pode. Ajudamos a passar as reservas que já tem, para não perder nada pelo caminho.'],
    ] as [string, string][],
  },
};
