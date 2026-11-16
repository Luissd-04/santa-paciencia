// Dados do site que mudam sem tocar no design. Tudo o que está marcado
// «POR CONFIRMAR» é um valor de referência e deve ser revisto antes de publicar.
module.exports = {
  // Domínio final (sem barra no fim). Pode ser dado na construção: SITE_URL=https://… node build.cjs
  siteUrl: (process.env.SITE_URL || 'https://www.santapaciencia.pt').replace(/\/+$/, ''), // POR CONFIRMAR
  name: 'Santa Paciência',
  tagline: 'Software de gestão de alojamento local',
  locale: 'pt-PT',
  updated: '2026-11-16',

  // Contactos — POR CONFIRMAR
  email: 'ola@santapaciencia.pt',
  // Endereço que recebe o formulário por POST (JSON). Vazio = o formulário abre o email do visitante.
  contactEndpoint: process.env.CONTACT_ENDPOINT || '',
  // Endereço da aplicação, para o botão «Entrar». Vazio = o botão não aparece.
  appUrl: process.env.APP_URL || '',

  // Pacotes: os nomes e limites vêm da plataforma (migrations-platform/plans.js).
  // Os preços são de referência — POR CONFIRMAR.
  plans: [
    {
      id: 'essencial', name: 'Essencial', price: 19,
      for: 'Para quem gere até 3 alojamentos e quer sair da folha de cálculo.',
      limits: ['Até 3 alojamentos', '2 utilizadores'],
      features: ['Reservas, calendário e preços', 'Fichas de hóspedes e pré-check-in', 'Despesas e fornecedores', 'Página pública de reservas', 'Relatórios essenciais'],
    },
    {
      id: 'profissional', name: 'Profissional', price: 49, featured: true,
      for: 'Para quem vive do alojamento local e quer receber online.',
      limits: ['Até 10 alojamentos', '5 utilizadores'],
      features: ['Tudo do Essencial', 'Pagamentos online com Stripe', 'Sinal, saldo e política de cancelamento', 'Relatórios completos', 'Emails automáticos aos hóspedes'],
    },
    {
      id: 'premium', name: 'Premium', price: 99,
      for: 'Para equipas e empresas de gestão com muitas unidades.',
      limits: ['Alojamentos sem limite', 'Utilizadores sem limite'],
      features: ['Tudo do Profissional', 'Relatórios completos com PDF', 'Equipa, departamentos e permissões', 'Apoio prioritário na configuração'],
    },
  ],
};
