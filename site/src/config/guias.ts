// Pequenas funções dos guias: tempo de leitura (cerca de 200 palavras por minuto) e data por extenso.
export const tempoLeitura = (texto: string): number => Math.max(1, Math.ceil(texto.split(/\s+/).filter(Boolean).length / 200));
export const dataLonga = (d: Date): string => new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
