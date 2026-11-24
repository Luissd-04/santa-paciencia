// Pricing (/en/pricing/): English text. The values stay in src/config/brand.ts.
import type { Dict } from '../index';

export const precos: Dict['precos'] = {
  titulo: 'Vacation rental software pricing',
  descricao: 'Plans from {preco} a month, with no commission per booking and no lock-in. Choose by number of properties and give it a try.',
  produtoDescricao: 'Vacation rental management software for Portugal.',
  h1: 'Simple pricing. Zero commission.',
  lede: 'Choose by number of properties. Every booking you take is yours, in full.',
  planosAria: 'Plans',
  semComissoes: 'No commission per booking',
  semFidelizacao: 'No lock-in',
  ajuda: 'Help with setup',
  compare: 'Compare the plans',
  perguntasH2: 'Pricing questions',
  perguntas: [
    ['Is there a commission per booking?', 'No. You only pay for the plan. Card payments carry Stripe’s fees, as in any online shop.'],
    ['Can I change plan?', 'Any time, up or down.'],
    ['Is there a minimum term?', 'No. On the monthly plan you can cancel whenever you like.'],
    ['Do the prices include VAT?', 'The prices shown do not include VAT at the legal rate in force.'],
  ],
};
