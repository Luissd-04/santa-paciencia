// Configuração da marca: o único sítio onde se muda o nome, o domínio, os contactos,
// o interruptor de indexação e os planos. Os textos do site usam estes valores.
// Tudo o que está marcado «POR CONFIRMAR» é provisório e deve ser revisto antes de publicar.

const env = (nome: string): string => (typeof process !== 'undefined' ? process.env[nome] ?? '' : '');

export interface Plano {
  id: string;
  nome: string;
  /** Preço mensal em euros, sem IVA. POR CONFIRMAR. */
  mensal: number;
  /** Preço por mês com pagamento anual, em euros, sem IVA. POR CONFIRMAR. */
  anual: number;
  destaque?: boolean;
  para: string;
  inclui: string[];
  limites: string;
}

export const marca = {
  // «Santa Paciência» é um nome provisório (docs/SITE-MAPA-SEO.md): ao mudar, edita só esta linha e revê os textos.
  nome: 'Santa Paciência',
  slogan: 'Software de gestão de alojamento local',
  locale: 'pt-PT',

  // Domínio final, sem barra no fim. POR CONFIRMAR.
  // santapaciencia.xyz é o domínio de testes; santapaciencia.pt é de uma cliente e não deve ser usado.
  siteUrl: (env('SITE_URL') || 'https://santapaciencia.xyz').replace(/\/+$/, ''),

  // Email de contacto. POR CONFIRMAR.
  email: env('CONTACT_EMAIL') || 'ola@santapaciencia.xyz',

  // Endereço da aplicação (botão «Entrar»). Vazio = o botão não aparece.
  appUrl: env('APP_URL'),

  // Endereço que recebe o formulário por POST (JSON). Vazio = o formulário abre o email do visitante.
  contactEndpoint: env('CONTACT_ENDPOINT'),

  // Interruptor de indexação. Desligado por omissão enquanto a marca e o domínio forem provisórios:
  // todas as páginas levam noindex e o robots.txt bloqueia tudo. Ligar com INDEXAR=true no domínio definitivo.
  indexar: env('INDEXAR') === 'true',

  // Cor do tema do browser (barro, a cor da plataforma).
  corTema: '#843424',
} as const;

// Planos. Nomes e limites vêm da plataforma (backend/src/config/migrations-platform/plans.js).
// POR CONFIRMAR: os preços 19 / 49 / 99 € por mês e 15 / 39 / 79 € por mês no plano anual são valores
// de referência e o desconto anual («2 meses grátis») é uma sugestão. Decidir antes de ligar a indexação.
export const planos: Plano[] = [
  {
    id: 'essencial', nome: 'Essencial', mensal: 19, anual: 15, // POR CONFIRMAR
    para: 'Para quem tem até 3 casas e quer sair da folha de cálculo.',
    inclui: ['Reservas, calendário e preços por época', 'Pré-check-in dos hóspedes', 'Página de reservas própria', 'Despesas e talões', 'Relatórios essenciais'],
    limites: 'Até 3 alojamentos · 2 utilizadores',
  },
  {
    id: 'profissional', nome: 'Profissional', mensal: 49, anual: 39, destaque: true, // POR CONFIRMAR
    para: 'Para quem vive do alojamento local e quer receber online.',
    inclui: ['Tudo do Essencial', 'Pagamentos online de sinal e saldo', 'Política de cancelamento', 'Emails automáticos em 7 línguas', 'Relatórios completos'],
    limites: 'Até 10 alojamentos · 5 utilizadores',
  },
  {
    id: 'premium', nome: 'Premium', mensal: 99, anual: 79, // POR CONFIRMAR
    para: 'Para equipas e empresas de gestão com muitas casas.',
    // «Reservas dentro do seu site» só existe no Premium.
    inclui: ['Tudo do Profissional', 'Reservas dentro do seu site, com o aspeto dele', 'Equipa, departamentos e permissões', 'Relatórios em PDF', 'Ajuda prioritária na configuração'],
    limites: 'Alojamentos e utilizadores sem limite',
  },
];

// Tabela de comparação: [linha, Essencial, Profissional, Premium].
export const comparacao: [string, boolean, boolean, boolean][] = [
  ['Calendário com Airbnb e Booking.com', true, true, true],
  ['Pré-check-in e dados do SIBA', true, true, true],
  ['Página de reservas própria', true, true, true],
  ['Pagamentos online', false, true, true],
  ['Emails automáticos', false, true, true],
  ['Reservas dentro do seu site', false, false, true],
  ['Equipa e permissões', false, false, true],
  ['Relatórios em PDF', false, false, true],
];

// Funcionalidades (slugs do docs/SITE-MAPA-SEO.md, secção 3.2) com o texto dos ladrilhos do início.
export const funcionalidades = [
  { slug: 'calendario', icone: 'cal', titulo: 'Um calendário para todos', texto: 'Junta as reservas do Airbnb, do Booking.com e do seu site. Acabaram-se as reservas duplicadas.' },
  { slug: 'reservas-diretas', icone: 'web', titulo: 'Reservas no seu site', texto: 'Uma página de reservas bonita, ou um botão no site que já tem. Sem comissões.' },
  { slug: 'pagamentos-online', icone: 'pay', titulo: 'Pagamentos que se cobram sozinhos', texto: 'Sinal e saldo por cartão, nas datas certas. Sem andar atrás de ninguém.' },
  { slug: 'pre-check-in', icone: 'key', titulo: 'Hóspedes que chegam registados', texto: 'Pré-check-in no telemóvel, com os dados do SIBA prontos a usar.' },
  { slug: 'equipa-e-tarefas', icone: 'clean', titulo: 'Limpezas sem WhatsApp', texto: 'Cada tarefa com dono, hora e casa. A equipa vê tudo no telemóvel.' },
  { slug: 'mensagens-automaticas', icone: 'mail', titulo: 'Emails que se escrevem sozinhos', texto: 'Confirmação, instruções de chegada e agradecimento, em 7 línguas.' },
  { slug: 'despesas', icone: 'receipt', titulo: 'Despesas sem caixa de sapatos', texto: 'Tire uma fotografia ao talão e fica registado na casa certa.' },
  { slug: 'relatorios', icone: 'chart', titulo: 'Contas sempre à vista', texto: 'Receita, ocupação e margem por casa e por mês, sem fórmulas.' },
] as const;

export const urlFuncionalidade = (slug: string) => `/funcionalidades/${slug}/`;
