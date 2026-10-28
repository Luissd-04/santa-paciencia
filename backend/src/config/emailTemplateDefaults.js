// Conteúdo por omissão dos modelos de email, no desenho dos prints de
// referência.
//
// Importante: alterar este ficheiro NÃO altera os modelos já guardados de
// nenhuma organização. O arranque só o usa para semear instalações novas
// (seedEmailTemplates) e para acrescentar modelos que ainda não existam
// (ensureNewEmailTemplateDefaults, com INSERT OR IGNORE). Um desenho novo
// passa para as organizações existentes por uma migração própria (ex.:
// 20261028_email_design) ou por scripts/apply-email-design.cjs; ambos usam
// services/emailDesign.js, que guarda sempre a versão anterior.
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

// Desenho de 10/2026: título com a etiqueta do estado, entrada e saída lado a
// lado, barra do que está pago, um próximo passo claro e botões em frase
// normal. Cada modelo é texto editável à volta de blocos do servidor.
const TEMPLATES = {
  // O título, a mensagem e o próximo passo vêm do estado real da reserva: o
  // gatilho dispara na criação, que aceita pré-reserva, pendente e
  // aguardar_pagamento, e uma reserva por aprovar não pode chegar ao hóspede
  // anunciada como confirmada.
  confirmacao: {
    name: 'Agradecimento pela reserva',
    subject: '{{titulo_estado}} — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('{{mensagem_estado}}'),
      '{{estadia}}',
      '{{resumo_pagamento}}',
      '{{proximo_passo}}',
      '{{contacto}}',
    ].join(''),
  },

  apos_checkin: {
    name: 'Após check-in',
    subject: 'Bem-vindo à {{alojamento}}, {{primeiro_nome}}',
    body: [
      '{{titulo_boas_vindas}}',
      p('Esperamos que a viagem tenha corrido bem. Fica aqui o que pode precisar durante a estadia em {{localidade}}.'),
      '{{info_estadia}}',
      '{{botao_alojamento}}',
      '{{contacto}}',
    ].join(''),
  },

  cancelamento: {
    name: 'Cancelamento da reserva',
    subject: 'Reserva cancelada — {{alojamento}}',
    body: [
      '{{titulo_reserva}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Confirmamos o cancelamento da sua reserva em <strong>{{alojamento}}</strong>.'),
      '{{resumo_cancelamento}}',
      p('Esperamos poder recebê-lo numa próxima oportunidade.'),
      '{{contacto}}',
    ].join(''),
  },

  pre_checkin: {
    name: 'Preenchimento do formulário de check-in',
    subject: 'Complete o seu pré-check-in — {{alojamento}}',
    body: [
      '{{titulo_pre_checkin}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Para termos tudo pronto à sua chegada, precisamos de alguns dados. Demora cerca de 2 minutos.'),
      '{{lista_pre_checkin}}',
      '{{botao_pre_checkin}}',
      '{{estadia}}',
      '{{contacto}}',
    ].join(''),
  },

  // Junta o que antes eram dois modelos (coordenadas + código de porta). O
  // código e a senha do Wi-Fi seguem as regras de emailEligibility (reserva
  // aprovada e integralmente paga); sem elas, os códigos não aparecem.
  coordenadas: {
    name: 'Informações e código de acesso',
    subject: 'Informações para a sua chegada — {{alojamento}}',
    body: [
      '{{titulo_chegada}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Falta pouco. Guarde este email: tem o que precisa para entrar.'),
      '{{estadia}}',
      '{{codigos_acesso}}',
      '{{botao_mapa}}',
      '{{contacto}}',
    ].join(''),
  },

  antes_checkout: {
    name: 'Antes do check-out',
    subject: 'Lembrete de check-out — {{alojamento}}',
    body: [
      '{{titulo_checkout}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Esperamos que esteja a gostar. Antes de sair:'),
      '{{lista_checkout}}',
      '{{nota_checkout_tardio}}',
    ].join(''),
  },

  // Enviado em cada pagamento recebido (manual ou Stripe): sinal, restante ou
  // pagamento único.
  pagamento: {
    name: 'Pagamento recebido',
    subject: 'Pagamento recebido — {{alojamento}}',
    body: [
      '{{titulo_pagamento}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Obrigado. Registámos o pagamento de <strong>{{valor_pagamento}}</strong> da sua reserva em <strong>{{alojamento}}</strong>.'),
      '{{resumo_pagamento}}',
      '{{estadia}}',
      '{{botao_reserva}}',
      '{{contacto}}',
    ].join(''),
  },

  // Política de pagamento: aviso do restante em falta, com o prazo a partir do
  // qual a reserva é cancelada sem devolução. Enviado logo (sem janela horária).
  aviso_restante: {
    name: 'Pagamento do restante',
    subject: 'Pagamento do restante — Reserva {{referencia}}',
    body: [
      '{{titulo_aviso_pagamento}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Falta concluir o pagamento da sua reserva em <strong>{{alojamento}}</strong>.'),
      '{{resumo_pagamento}}',
      '{{botao_pagar}}',
      '{{aviso_prazo}}',
      p('Pagou por cartão e não ficou concluído? O banco pode pedir uma nova autorização: volte a carregar no botão.', 'font-size:14px;'),
      '{{contacto}}',
    ].join(''),
  },

  // Política de pagamento: cancelamento (pelo hóspede, pela equipa ou por falta
  // de pagamento) com o reembolso contratado. Enviado logo.
  cancelamento_politica: {
    name: 'Cancelamento com reembolso',
    subject: 'Cancelamento — Reserva {{referencia}}',
    body: [
      '{{titulo_reembolso}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('A sua reserva em <strong>{{alojamento}}</strong> foi cancelada. Este é o resumo do reembolso, segundo a política aceite na reserva:'),
      '{{resumo_reembolso}}',
      '{{botao_reserva}}',
      '{{contacto}}',
    ].join(''),
  },

  obrigado: {
    name: 'Obrigado pela estadia',
    subject: 'Obrigado pela sua visita — {{alojamento}}',
    body: [
      '{{titulo_obrigado}}',
      p('Foi um gosto recebê-lo em <strong>{{alojamento}}</strong>.'),
      p('Se tiver um momento, deixe-nos uma avaliação: ajuda outros viajantes e ajuda-nos a melhorar.'),
      '{{botao_avaliar}}',
    ].join(''),
  },
};

// Momento de envio por omissão. Os acontecimentos fixos (reserva, aprovação,
// cancelamento, pagamento e avisos da política) enviam no momento em que
// acontecem; checkin/checkout são agendados pelo emailScheduler.
const TIMING = {
  confirmacao:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'booking' },
  cancelamento:   { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'cancellation' },
  pre_checkin:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'approval' },
  coordenadas:    { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkin' },
  apos_checkin:   { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkin' },
  antes_checkout: { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkout' },
  obrigado:       { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkout' },
  pagamento:      { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'payment' },
  aviso_restante: { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'balance_notice' },
  cancelamento_politica: { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after', timing_event: 'policy_cancellation' },
};

function defaultsList() {
  return Object.entries(TEMPLATES).map(([slug, tpl]) => ({ slug, ...tpl, ...TIMING[slug] }));
}

module.exports = { TEMPLATES, TIMING, defaultsList, SERIF, COLORS: C };
