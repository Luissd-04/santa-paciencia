import { funcionalidades, urlFuncionalidade } from './brand';
import type { NomeIcone } from '../components/Icon.astro';

// Ladrilhos de «Funciona ainda melhor com»: o ícone e o endereço vêm de `brand.ts`,
// o rótulo é o nome curto da funcionalidade.
const ROTULOS: Record<string, string> = {
  'calendario': 'Calendário',
  'reservas-diretas': 'Reservas no seu site',
  'pagamentos-online': 'Pagamentos online',
  'pre-check-in': 'Pré-check-in',
  'equipa-e-tarefas': 'Limpezas',
  'mensagens-automaticas': 'Emails automáticos',
  'despesas': 'Despesas',
  'relatorios': 'Relatórios',
};

export const relacionadas = (...slugs: string[]): { icone: NomeIcone; rotulo: string; href: string }[] =>
  slugs.map((slug) => {
    const f = funcionalidades.find((x) => x.slug === slug);
    if (!f) throw new Error(`Funcionalidade desconhecida: ${slug}`);
    return { icone: f.icone as NomeIcone, rotulo: ROTULOS[slug], href: urlFuncionalidade(slug) };
  });
