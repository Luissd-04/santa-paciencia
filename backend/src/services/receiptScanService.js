const Anthropic = require('@anthropic-ai/sdk');

// Categorias válidas (têm de bater certo com EXPENSE_CATS no frontend, sem o legado).
const VALID_CATEGORIES = [
  'limpeza', 'produtos_limpeza', 'pequenos_almocos', 'roupas',
  'manutencao', 'marketing', 'impostos', 'servicos', 'consumiveis', 'outro',
];

// Modelo barato com visão. Trocável por env se quiseres subir para Opus/Sonnet.
const MODEL = process.env.RECEIPT_SCAN_MODEL || 'claude-haiku-4-5';

const SYSTEM_PROMPT = `És um assistente que lê fotografias de talões e faturas de compras portuguesas para um alojamento local.
Extrai os dados e responde APENAS com um objeto JSON válido (sem texto antes ou depois, sem markdown), com esta forma exata:
{
  "supplier": "nome da loja/fornecedor (ex.: Lidl, Continente, Pingo Doce) ou \\"\\" se não visível",
  "invoice_ref": "número do documento/fatura ou \\"\\" se não existir",
  "date": "data da compra em AAAA-MM-DD ou \\"\\" se ilegível",
  "items": [
    { "description": "nome do artigo", "amount": 0.00, "category": "categoria" }
  ]
}
Regras:
- Cada linha/artigo do talão é um item separado.
- "amount" é o preço TOTAL desse artigo em euros, como número (usa ponto decimal). Se houver quantidade, usa o total da linha.
- Escolhe a "category" mais adequada de entre EXATAMENTE esta lista:
  limpeza, produtos_limpeza, pequenos_almocos, roupas, manutencao, marketing, impostos, servicos, consumiveis, outro.
  Guia: comida/bebida/mercearia -> pequenos_almocos; detergentes/amaciador/lixívia -> produtos_limpeza;
  guardanapos/cápsulas de café/rolo de cozinha/consumíveis descartáveis -> consumiveis; toalhas/têxteis/roupa -> roupas;
  ferramentas/reparações -> manutencao; se nenhuma servir -> outro.
- Não inventes valores. Se um campo não for legível, deixa "" (ou omite o item se ilegível).
- Ignora subtotais, IVA, total do talão e troco — só artigos comprados.`;

function normalizeDate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const pt = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/); // DD/MM/AAAA
  if (pt) return `${pt[3]}-${pt[2]}-${pt[1]}`;
  return '';
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch { /* tenta extrair o bloco { ... } */ }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

/**
 * Lê um talão a partir de uma imagem base64 e devolve os campos estruturados.
 * @param {{ base64: string, mediaType: string }} img
 * @returns {Promise<{supplier:string, invoice_ref:string, date:string, items:Array}>}
 */
async function scanReceipt({ base64, mediaType }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY não configurada no servidor.');
    err.statusCode = 503;
    throw err;
  }

  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Extrai os artigos deste talão em JSON, seguindo estritamente o formato indicado.' },
      ],
    }],
  });

  const textBlock = (message.content || []).find(b => b.type === 'text');
  const parsed = extractJson(textBlock && textBlock.text);
  if (!parsed) {
    const err = new Error('Não foi possível interpretar o talão. Tenta outra foto mais nítida.');
    err.statusCode = 422;
    throw err;
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalizedItems = items
    .map(it => {
      const amount = Number(String(it.amount).toString().replace(',', '.')) || 0;
      const category = VALID_CATEGORIES.includes(it.category) ? it.category : 'outro';
      const description = String(it.description || '').trim();
      return { description, amount: Math.round(amount * 100) / 100, category };
    })
    .filter(it => it.description && it.amount > 0);

  return {
    supplier: String(parsed.supplier || '').trim(),
    invoice_ref: String(parsed.invoice_ref || '').trim(),
    date: normalizeDate(parsed.date),
    items: normalizedItems,
  };
}

module.exports = { scanReceipt, VALID_CATEGORIES };
