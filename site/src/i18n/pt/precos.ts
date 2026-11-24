// Preços (/precos/): textos em português de Portugal. Os valores ficam em src/config/brand.ts.
export const precos = {
  titulo: 'Preços do software de alojamento local',
  descricao: 'Planos a partir de {preco} por mês, sem comissões por reserva nem fidelização. Escolha pelo número de casas e experimente.',
  produtoDescricao: 'Software de gestão de alojamento local.',
  h1: 'Preços simples. Zero comissões.',
  lede: 'Escolha pelo número de casas. Todas as reservas que fizer são suas, por inteiro.',
  planosAria: 'Planos',
  semComissoes: 'Sem comissões por reserva',
  semFidelizacao: 'Sem fidelização',
  ajuda: 'Ajuda na configuração',
  compare: 'Compare os planos',
  perguntasH2: 'Perguntas sobre preços',
  perguntas: [
    ['Há comissões por reserva?', 'Não. Paga só o plano. Nos pagamentos por cartão aplicam-se as taxas da Stripe, como em qualquer loja online.'],
    ['Posso mudar de plano?', 'Sempre que quiser, para cima ou para baixo.'],
    ['Há fidelização?', 'Não. No plano mensal pode cancelar quando quiser.'],
    ['Os preços incluem IVA?', 'Os valores apresentados não incluem IVA à taxa legal em vigor.'],
  ] as [string, string][],
};
