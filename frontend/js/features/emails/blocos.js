// Estado privado; interface partilhada em AppModules.definicoes.
// Catálogo do editor de emails: os blocos automáticos (HTML montado pelo
// servidor em emailService.buildBlocks) e os dados que entram no texto, com
// nomes que a equipa reconhece. Também converte o corpo guardado (HTML com
// marcadores {{…}}) numa lista de blocos e de volta, sem mudar o formato.
(() => {
AppModules.define('definicoes', {
  EMAIL_BLOCKS: { get: () => BLOCKS },
  EMAIL_TEXT_VARS: { get: () => TEXT_VARS },
  BLOCK_FIELDS: { get: () => BLOCK_FIELDS },
  blockInfo: { get: () => blockInfo },
  varLabel: { get: () => varLabel },
  parseEmailBody: { get: () => parseEmailBody },
  serializeEmailBody: { get: () => serializeEmailBody },
  textSegmentHtml: { get: () => textSegmentHtml },
  suggestedBlocks: { get: () => suggestedBlocks },
});

// [nome, o que mostra]
const BLOCKS = {
  titulo_reserva: ['Título segundo o estado', 'Pedido recebido, aguarda o sinal, confirmada ou cancelada'],
  estadia: ['Datas da estadia', 'Entrada, saída, noites, hóspedes e referência'],
  resumo_pagamento: ['Pagamentos', 'Pago, total e o que falta'],
  proximo_passo: ['Próximo passo', 'Segundo o estado: acompanhar o pedido, pagar o sinal ou o pré-check-in'],
  contacto: ['Contacto', 'Email e telefone do alojamento'],
  botao_mapa: ['Botão do mapa', 'Abre a morada do alojamento no mapa'],
  titulo_aceite: ['Título — reserva aceite', '«As datas são suas», ou «Está tudo marcado» com o sinal pago'],
  mensagem_aceite: ['Sinal e prazo', 'Valor do sinal e o prazo de 48 horas para o pagar'],
  botao_pagar_sinal: ['Botão — pagar o sinal', 'Pagamento online pela Stripe'],
  proximo_pre_checkin: ['Pré-check-in', 'Convite e botão, enquanto não estiver feito'],
  titulo_pagamento: ['Título do pagamento', 'Recebido, sinal que confirma ou pago na totalidade'],
  mensagem_pagamento: ['Mensagem do pagamento', 'Valor recebido; diz se confirmou a reserva'],
  botao_reserva: ['Botão — ver a reserva', 'Página da reserva e dos pagamentos'],
  titulo_chegada: ['Título — chegada', '«Tudo para a sua chegada»'],
  como_chegar: ['Como chegar', 'Morada, instruções de chegada e botão do mapa'],
  como_entrar: ['Como entrar', 'Instruções de entrada, código da porta e Wi-Fi (só com a reserva paga)'],
  dia_saida: ['Dia da saída', 'Hora de saída e os passos do alojamento'],
  codigos_acesso: ['Códigos de acesso', 'Código da porta e Wi-Fi, só com a reserva paga'],
  titulo_obrigado: ['Título — obrigado', '«Obrigado pela visita» com o primeiro nome'],
  botao_avaliar: ['Botões — avaliação', 'Deixar uma avaliação e voltar a reservar'],
  titulo_cancelamento: ['Título do cancelamento', 'Segundo o motivo: pedido expirado, sinal fora do prazo, equipa ou hóspede'],
  mensagem_cancelamento: ['Mensagem do cancelamento', 'Texto segundo o motivo do cancelamento'],
  resumo_cancelamento: ['Resumo do cancelamento', 'Alojamento, datas e referência'],
  botao_novo_pedido: ['Botão — novo pedido', 'Só quando o pedido expirou ou o sinal não chegou'],
  titulo_pre_checkin: ['Título — pré-check-in', '«Complete o pré-check-in»'],
  lista_pre_checkin: ['O que o pré-check-in pede', 'Hora de chegada, documentos e pedidos especiais'],
  botao_pre_checkin: ['Botão — pré-check-in', 'Abre o formulário do pré-check-in'],
  titulo_reembolso: ['Título — reembolso', 'Valor a devolver segundo a política'],
  resumo_reembolso: ['Pago e a devolver', 'Resumo do reembolso'],
  titulo_aviso_pagamento: ['Título — pagamento em falta', 'Quanto falta para concluir'],
  botao_pagar: ['Botão — pagar o que falta', 'Pagamento online do restante'],
  aviso_prazo: ['Aviso do prazo', 'Prazo do restante e o que acontece depois'],
  titulo_boas_vindas: ['Título — boas-vindas', '«Boas-vindas» com o primeiro nome'],
  info_estadia: ['Wi-Fi e saída', 'Rede, senha e hora do check-out'],
  botao_alojamento: ['Botão — o alojamento', 'Abre o site do alojamento'],
  titulo_checkout: ['Título — lembrete de saída', 'Dia e hora do check-out'],
  lista_checkout: ['Lista antes de sair', 'Passos genéricos antes de sair'],
  nota_checkout_tardio: ['Saída mais tarde', 'Caixa com o convite para pedir mais tempo'],
  cartao_reserva: ['Cartão da reserva (antigo)', 'Desenho anterior a outubro de 2026'],
  cartao_reserva_sem_total: ['Cartão da reserva sem total (antigo)', 'Desenho anterior a outubro de 2026'],
  cartao_pagamento: ['Cartão do pagamento (antigo)', 'Desenho anterior a outubro de 2026'],
  acompanhe_nos: ['Redes sociais (antigo)', 'Agora no rodapé de todos os emails'],
};

// Dados do alojamento de que cada bloco precisa (emailReadiness).
const BLOCK_FIELDS = {
  como_chegar: ['arrival_instructions'],
  como_entrar: ['entry'],
  dia_saida: ['checkout_instructions'],
  botao_avaliar: ['review_url'],
  botao_pagar_sinal: ['stripe'],
};

// Blocos sugeridos primeiro em cada modelo (o resto fica por baixo).
const SUGGESTED = {
  confirmacao: ['titulo_reserva', 'estadia', 'resumo_pagamento', 'proximo_passo', 'contacto'],
  reserva_aceite: ['titulo_aceite', 'mensagem_aceite', 'resumo_pagamento', 'botao_pagar_sinal', 'proximo_pre_checkin', 'estadia', 'contacto'],
  pagamento: ['titulo_pagamento', 'mensagem_pagamento', 'resumo_pagamento', 'proximo_pre_checkin', 'estadia', 'botao_reserva', 'contacto'],
  coordenadas: ['titulo_chegada', 'estadia', 'como_chegar', 'como_entrar', 'dia_saida', 'contacto'],
  obrigado: ['titulo_obrigado', 'botao_avaliar', 'contacto'],
  cancelamento: ['titulo_cancelamento', 'mensagem_cancelamento', 'resumo_cancelamento', 'botao_novo_pedido', 'contacto'],
  pre_checkin: ['titulo_pre_checkin', 'lista_pre_checkin', 'botao_pre_checkin', 'estadia', 'contacto'],
};

// Dados que entram no meio do texto (e no assunto).
const TEXT_VARS = [
  ['Hóspede', [['primeiro_nome', 'Primeiro nome'], ['nome_hospede', 'Nome completo']]],
  ['Alojamento', [['alojamento', 'Nome do alojamento'], ['localidade', 'Localidade'], ['wifi_nome', 'Rede Wi-Fi'],
    ['wifi_password', 'Senha do Wi-Fi'], ['codigo_porta', 'Código da porta']]],
  ['Reserva', [['referencia', 'Referência'], ['data_checkin', 'Data de entrada'], ['hora_checkin', 'Hora de entrada'],
    ['data_checkout', 'Data de saída'], ['hora_checkout', 'Hora de saída'], ['noites', 'Noites'], ['num_hospedes', 'N.º de hóspedes'],
    ['total', 'Total'], ['titulo_estado', 'Estado da reserva'], ['mensagem_estado', 'Mensagem segundo o estado'], ['titulo_aceite_assunto', 'Aceite ou confirmada']]],
  ['Pagamentos', [['valor_pagamento', 'Valor deste pagamento'], ['total_pago', 'Total já pago'], ['valor_em_falta', 'Valor em falta'],
    ['valor_sinal', 'Valor do sinal'], ['prazo_sinal', 'Prazo do sinal'], ['prazo_pagamento', 'Prazo do restante'], ['valor_reembolso', 'Reembolso']]],
  ['Ligações', [['link_reserva', 'Link da página da reserva'], ['link_pre_checkin', 'Link do pré-check-in']]],
];
const VAR_LABELS = Object.fromEntries(TEXT_VARS.flatMap(([, vars]) => vars));

const human = key => key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
function blockInfo(key) {
  const [name, desc] = BLOCKS[key] || [human(key), 'Bloco automático'];
  return { key, name, desc, fields: BLOCK_FIELDS[key] || [] };
}
function varLabel(key) {
  return VAR_LABELS[key] || BLOCKS[key]?.[0] || human(key);
}
// { top: os blocos deste modelo, rest: os outros } (só os que o servidor conhece).
function suggestedBlocks(slug, known = Object.keys(BLOCKS)) {
  const has = new Set(known);
  const top = (SUGGESTED[slug] || []).filter(key => has.has(key));
  return { top, rest: Object.keys(BLOCKS).filter(key => has.has(key) && !top.includes(key)) };
}

const MARKER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
// Estilo dos parágrafos novos: o mesmo dos modelos por omissão
// (config/emailTemplateDefaults.js).
const P_STYLE = "font-family:Georgia, 'Times New Roman', Times, serif;font-size:16px;line-height:1.7;color:#5d554c;margin:0 0 14px;";

// HTML guardado → [{ type: 'block', key } | { type: 'text', html }]. Um
// marcador de bloco sozinho (solto, ou o único conteúdo de um parágrafo) é um
// bloco; o resto é texto, com os marcadores lá dentro.
function parseEmailBody(html, blockNames) {
  const known = new Set(blockNames || Object.keys(BLOCKS));
  const box = document.createElement('template');
  box.innerHTML = String(html || '');
  const out = [];
  const pushText = value => { if (value && value.replace(/&nbsp;|\s/g, '')) out.push({ type: 'text', html: value }); };
  for (const node of [...box.content.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      let last = 0;
      const text = node.textContent;
      for (const match of text.matchAll(MARKER)) {
        if (!known.has(match[1])) continue;
        pushText(paragraph(escapeText(text.slice(last, match.index))));
        out.push({ type: 'block', key: match[1] });
        last = match.index + match[0].length;
      }
      pushText(paragraph(escapeText(text.slice(last))));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const only = node.textContent.trim().match(/^\{\{\s*([a-z0-9_]+)\s*\}\}$/i);
      if (only && known.has(only[1]) && !node.querySelector('img,a')) out.push({ type: 'block', key: only[1] });
      else pushText(node.outerHTML);
    }
  }
  return out;
}

function escapeText(value) {
  return AppModules.core.escapeHtml(String(value || '').trim());
}
function paragraph(inner) {
  return inner ? `<p style="${P_STYLE}">${inner}</p>` : '';
}

// Texto para editar: os marcadores passam a etiquetas com o nome do dado
// (só nos nós de texto — um marcador num href fica como está).
function textSegmentHtml(html) {
  const box = document.createElement('template');
  box.innerHTML = html;
  const walker = document.createTreeWalker(box.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.textContent;
    if (!/\{\{\s*[a-z0-9_]+\s*\}\}/i.test(text)) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(MARKER)) {
      frag.append(text.slice(last, match.index));
      frag.append(chip(match[1]));
      last = match.index + match[0].length;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return box.innerHTML;
}

function chip(key) {
  const el = document.createElement('span');
  el.className = 'emb-var';
  el.contentEditable = 'false';
  el.dataset.var = key;
  el.textContent = varLabel(key);
  return el;
}

// Lista do editor → HTML guardado. As etiquetas voltam a marcadores e o texto
// solto passa a parágrafo com o estilo dos modelos.
function serializeEmailBody(segments) {
  return segments.map(seg => {
    if (seg.type === 'block') return `{{${seg.key}}}`;
    const box = document.createElement('div');
    box.innerHTML = seg.html;
    box.querySelectorAll('.emb-var').forEach(el => el.replaceWith(`{{${el.dataset.var}}}`));
    // Parágrafos e listas ficam como estão; o texto solto entre eles (por
    // exemplo um dado inserido fora de um parágrafo) junta-se num parágrafo.
    let out = '';
    let loose = '';
    const flush = () => {
      if (loose.replace(/&nbsp;|\s/g, '')) out += paragraph(loose.trim());
      loose = '';
    };
    for (const node of [...box.childNodes]) {
      if (node.nodeType === Node.ELEMENT_NODE && /^(P|H2|H3|UL|OL|HR|TABLE|DIV|BLOCKQUOTE)$/.test(node.nodeName)) {
        flush();
        out += node.outerHTML;
      } else {
        loose += node.nodeType === Node.ELEMENT_NODE ? node.outerHTML : AppModules.core.escapeHtml(node.textContent);
      }
    }
    flush();
    return out;
  }).join('');
}
})();
