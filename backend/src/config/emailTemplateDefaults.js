// Conteúdo por omissão dos modelos de email, no desenho dos prints de
// referência.
//
// Importante: alterar este ficheiro NÃO altera os modelos já guardados de
// nenhuma organização. O arranque só o usa para semear instalações novas
// (seedEmailTemplates) e para acrescentar modelos que ainda não existam
// (ensureNewEmailTemplateDefaults, com INSERT OR IGNORE). Aplicar o desenho
// novo a uma organização existente é uma operação deliberada:
//   node scripts/apply-email-design.cjs --org=<id>
// que guarda sempre a versão anterior antes de escrever.
//
// Os marcadores {{...}} dividem-se em dois tipos:
//   - variáveis de texto ({{primeiro_nome}}, {{total}}, …) — escapadas;
//   - blocos ({{cartao_reserva}}, {{acompanhe_nos}}, …) — HTML construído pelo
//     servidor em emailService.buildBlocks(), para o desenho não se partir ao
//     editar o texto à volta.

const C = {
  text:   '#2f2a25',
  soft:   '#5d554c',
  muted:  '#9a8f84',
  brand:  '#843424',
  cardBg: '#fcf9f3',
  cardAlt:'#f4ede1',
  border: '#e8decf',
  row:    '#f0e8da',
};

const SERIF = "Georgia, 'Times New Roman', Times, serif";

const p = (html, extra = '') => `<p style="font-family:${SERIF};font-size:16px;line-height:1.7;color:${C.soft};margin:0 0 14px;${extra}">${html}</p>`;

// Tabela simples de duas colunas para os modelos que não usam o cartão de
// reserva (Wi-Fi, código de porta). Mesma paleta, editável no editor.
const infoTable = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;overflow:hidden;">` +
  rows.map(([label, value, mono], i) => {
    const bg = i % 2 === 0 ? C.cardBg : C.cardAlt;
    return `<tr><td bgcolor="${bg}" style="background:${bg};padding:13px 18px;border-bottom:1px solid ${C.row};">` +
      `<div style="font-family:${SERIF};font-size:12.5px;line-height:1.4;color:${C.muted};margin:0 0 3px;">${label}</div>` +
      `<div style="font-family:${SERIF};font-size:16px;line-height:1.45;color:${C.text};${mono ? "font-family:'Courier New',Courier,monospace;letter-spacing:1px;" : ''}">${value}</div>` +
      `</td></tr>`;
  }).join('') + '</table>';

const TEMPLATES = {
  // ── Print 2 ──────────────────────────────────────────────────────────────
  // O título e a mensagem vêm do estado real da reserva: o gatilho dispara na
  // criação, que aceita pendente/aguardar_pagamento, e uma reserva por aprovar
  // não pode chegar ao hóspede anunciada como confirmada.
  confirmacao: {
    name: 'Agradecimento pela reserva',
    subject: '{{titulo_estado}} — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('{{mensagem_estado}}'),
      '{{cartao_reserva}}',
      p('Se tiver alguma questão, não hesite em contactar-nos.'),
    ].join(''),
  },

  // ── Print 1 ──────────────────────────────────────────────────────────────
  apos_checkin: {
    name: 'Após check-in',
    subject: 'Bem-vindo à {{alojamento}}, {{primeiro_nome}}',
    body: [
      '{{titulo_boas_vindas}}',
      p('Esperamos que desfrute de uma estadia tranquila em {{localidade}}.', 'text-align:center;'),
      '{{botao_alojamento}}',
      '{{acompanhe_nos}}',
    ].join(''),
  },

  cancelamento: {
    name: 'Cancelamento da reserva',
    subject: 'Reserva cancelada — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Informamos que a sua reserva em <strong>{{alojamento}}</strong> foi cancelada.'),
      '{{cartao_reserva_sem_total}}',
      p('Esperamos poder recebê-lo numa próxima oportunidade.'),
    ].join(''),
  },

  pre_checkin: {
    name: 'Preenchimento do formulário de check-in',
    subject: 'Complete o seu pré check-in — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('A sua reserva em <strong>{{alojamento}}</strong> foi aprovada. Para prepararmos a sua chegada, pedimos que complete o pré check-in com a hora prevista de chegada e os dados dos hóspedes.'),
      '{{botao_pre_checkin}}',
      p('Referência da reserva: <strong>{{referencia}}</strong>', `font-size:13.5px;color:${C.muted};`),
    ].join(''),
  },

  // Junta o que antes eram dois modelos (coordenadas + código de porta),
  // disparados ambos "1 dia antes do check-in" — a mesma informação de
  // chegada chegava em dois emails separados sem necessidade. O código de
  // porta continua sujeito às regras de emailEligibility (reserva aprovada e
  // integralmente paga): a deteção é pelo conteúdo ({{codigo_porta}} no
  // corpo), não pelo nome do modelo, por isso a fusão não contorna a regra —
  // torna-a mais estrita, porque agora as coordenadas só seguem juntas com o
  // código, ao contrário de antes (coordenadas seguiam mesmo sem pagamento
  // integral).
  coordenadas: {
    name: 'Informações e código de acesso',
    subject: 'Informações para a sua chegada — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Está quase na hora. Aqui ficam as informações para a sua chegada:'),
      infoTable([
        ['Check-in', '{{data_checkin}} a partir das {{hora_checkin}}'],
        ['Alojamento', '{{alojamento}}'],
        ['Wi-Fi', '{{wifi_nome}}'],
        ['Senha Wi-Fi', '{{wifi_password}}', true],
        ['Código da porta', '{{codigo_porta}}', true],
      ]),
      p('Se tiver alguma dúvida, não hesite em contactar-nos. Aguardamos a sua chegada.'),
      '{{acompanhe_nos}}',
    ].join(''),
  },

  antes_checkout: {
    name: 'Antes do check-out',
    subject: 'Lembrete de check-out — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('O seu check-out está previsto para <strong>{{data_checkout}}</strong>, até às <strong>{{hora_checkout}}</strong>.'),
      p('Por favor deixe o alojamento arrumado e entregue as chaves conforme o combinado.'),
      p('Foi um prazer tê-lo connosco, <strong>{{primeiro_nome}}</strong>.'),
    ].join(''),
  },

  obrigado: {
    name: 'Obrigado pela estadia',
    subject: 'Obrigado pela sua visita — {{alojamento}}',
    body: [
      '{{titulo_boas_vindas}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Esperamos que a sua estadia em <strong>{{alojamento}}</strong> tenha sido do seu agrado.'),
      p('A sua opinião é muito importante para nós. Se tiver um momento, adorávamos receber a sua avaliação.'),
      '{{acompanhe_nos}}',
    ].join(''),
  },
};

// Momento de envio por omissão. Mantém exatamente o que já estava configurado —
// esta etapa não altera gatilhos nem cria envios automáticos novos.
const TIMING = {
  confirmacao:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'booking' },
  cancelamento:   { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'cancellation' },
  pre_checkin:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'approval' },
  coordenadas:    { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkin' },
  apos_checkin:   { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkin' },
  antes_checkout: { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkout' },
  obrigado:       { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkout' },
};

function defaultsList() {
  return Object.entries(TEMPLATES).map(([slug, tpl]) => ({ slug, ...tpl, ...TIMING[slug] }));
}

module.exports = { TEMPLATES, TIMING, defaultsList, SERIF, COLORS: C };
