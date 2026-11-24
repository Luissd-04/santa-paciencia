// Configuração da marca: o único sítio onde se muda o nome, o domínio, os contactos,
// o interruptor de indexação e os planos. Os textos do site usam estes valores.
// Tudo o que está marcado «POR CONFIRMAR» é provisório e deve ser revisto antes de publicar.

const env = (nome: string): string => (typeof process !== 'undefined' ? process.env[nome] ?? '' : '');

export interface Plano {
  id: string;
  /** Preço mensal em euros, sem IVA. POR CONFIRMAR. */
  mensal: number;
  /** Preço por mês com pagamento anual, em euros, sem IVA. POR CONFIRMAR. */
  anual: number;
  destaque?: boolean;
}

/** Plano com o texto de uma língua (nome, para quem, o que inclui, limites), ver `planosDe` em src/i18n/index.ts. */
export interface PlanoTexto extends Plano {
  nome: string;
  para: string;
  inclui: string[];
  limites: string;
}

export const marca = {
  // «Santa Paciência» é um nome provisório (docs/SITE-MAPA-SEO.md): ao mudar, edita só esta linha e revê os textos.
  nome: 'Santa Paciência',
  slogan: 'Software de gestão de alojamento local',
  sloganEn: 'Vacation rental management software',
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

// Planos: os valores. Os nomes, o «para quem», o que inclui e os limites estão em src/i18n/*/comum.ts
// (que vêm da plataforma: backend/src/config/migrations-platform/plans.js).
// POR CONFIRMAR: os preços 19 / 49 / 99 € por mês e 15 / 39 / 79 € por mês no plano anual são valores
// de referência e o desconto anual («2 meses grátis») é uma sugestão. Decidir antes de ligar a indexação.
export const planos: Plano[] = [
  { id: 'essencial', mensal: 19, anual: 15 }, // POR CONFIRMAR
  { id: 'profissional', mensal: 49, anual: 39, destaque: true }, // POR CONFIRMAR
  { id: 'premium', mensal: 99, anual: 79 }, // POR CONFIRMAR
];

// Tabela de comparação: [linha (chave do texto em i18n), Essencial, Profissional, Premium].
export const comparacao: [string, boolean, boolean, boolean][] = [
  ['calendario', true, true, true],
  ['precheckin', true, true, true],
  ['paginaReservas', true, true, true],
  ['pagamentos', false, true, true],
  ['emails', false, true, true],
  ['reservasNoSite', false, false, true],
  ['equipa', false, false, true],
  ['pdf', false, false, true],
];

// Funcionalidades (slugs do docs/SITE-MAPA-SEO.md, secção 3.2) e ícone de cada uma.
// O texto dos ladrilhos está em src/i18n/*/funcionalidades.ts.
export const funcionalidades = [
  { slug: 'calendario', icone: 'cal' },
  { slug: 'reservas-diretas', icone: 'web' },
  { slug: 'pagamentos-online', icone: 'pay' },
  { slug: 'pre-check-in', icone: 'key' },
  { slug: 'equipa-e-tarefas', icone: 'clean' },
  { slug: 'mensagens-automaticas', icone: 'mail' },
  { slug: 'despesas', icone: 'receipt' },
  { slug: 'relatorios', icone: 'chart' },
] as const;

// Endereço de uma funcionalidade na língua pedida (PT por omissão). Ver src/i18n/rotas.ts.
export { urlFuncionalidade } from '../i18n/rotas';
