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
    name: 'Pedido recebido',
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

  // Pedido aceite pela equipa: o sinal a pagar (online, com a Stripe), o prazo
  // de 48 h e o pré-check-in. Com o sinal já pago, diz que está confirmada.
  reserva_aceite: {
    name: 'Reserva aceite',
    subject: '{{titulo_aceite_assunto}} — {{alojamento}}',
    body: [
      '{{titulo_aceite}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      '{{mensagem_aceite}}',
      '{{resumo_pagamento}}',
      '{{botao_pagar_sinal}}',
      '{{proximo_pre_checkin}}',
      '{{estadia}}',
      '{{contacto}}',
    ].join(''),
  },

  apos_checkin: {
    name: 'Após check-in',
    subject: 'Boas-vindas a {{alojamento}}, {{primeiro_nome}}',
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
      '{{titulo_cancelamento}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      '{{mensagem_cancelamento}}',
      '{{resumo_cancelamento}}',
      '{{botao_novo_pedido}}',
      '{{contacto}}',
    ].join(''),
  },

  pre_checkin: {
    name: 'Preenchimento do formulário de check-in',
    subject: 'Complete o seu pré-check-in — {{alojamento}}',
    body: [
      '{{titulo_pre_checkin}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Para termos tudo pronto à sua chegada, precisamos de alguns dados.'),
      '{{lista_pre_checkin}}',
      '{{botao_pre_checkin}}',
      '{{estadia}}',
      '{{contacto}}',
    ].join(''),
  },

  // Tudo para a estadia num só email: como chegar, como entrar, Wi-Fi e o dia
  // da saída (antes eram «Informações», «Boas-vindas» e «Lembrete de
  // check-out»). Os códigos seguem as regras de emailEligibility: o email só
  // sai com a reserva aceite e paga na totalidade.
  coordenadas: {
    name: 'Tudo para a sua chegada',
    subject: 'Tudo para a sua chegada — {{alojamento}}',
    body: [
      '{{titulo_chegada}}',
      p('Olá <strong>{{primeiro_nome}}</strong>,'),
      p('Guarde este email: tem tudo o que precisa para a estadia.'),
      '{{estadia}}',
      '{{como_chegar}}',
      '{{como_entrar}}',
      '{{dia_saida}}',
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
      '{{mensagem_pagamento}}',
      '{{resumo_pagamento}}',
      '{{proximo_pre_checkin}}',
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
      p('Foi um gosto receber a sua visita em <strong>{{alojamento}}</strong>. Se tiver um minuto, a sua avaliação ajuda outras pessoas a escolher e ajuda-nos a melhorar.'),
      '{{botao_avaliar}}',
      '{{contacto}}',
    ].join(''),
  },
};

// Momento de envio por omissão. Os acontecimentos fixos (reserva, aprovação,
// cancelamento, pagamento e avisos da política) enviam no momento em que
// acontecem; checkin/checkout são agendados pelo emailScheduler.
const TIMING = {
  confirmacao:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'booking' },
  cancelamento:   { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'cancellation' },
  reserva_aceite: { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'approval' },
  // Enviado pela equipa (botão «Enviar pré-check-in» na reserva).
  pre_checkin:    { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'manual' },
  coordenadas:    { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkin' },
  apos_checkin:   { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkin' },
  antes_checkout: { timing_offset: 1, timing_unit: 'days',  timing_direction: 'before', timing_event: 'checkout' },
  obrigado:       { timing_offset: 2, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'checkout' },
  pagamento:      { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'payment' },
  aviso_restante: { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after',  timing_event: 'balance_notice' },
  cancelamento_politica: { timing_offset: 0, timing_unit: 'hours', timing_direction: 'after', timing_event: 'policy_cancellation' },
};

// Modelos desligados por omissão: o conteúdo passou para «Tudo para a sua
// chegada». Ficam para quem os quiser voltar a ligar.
const INACTIVE = new Set(['apos_checkin', 'antes_checkout']);

function defaultsList() {
  return Object.entries(TEMPLATES).map(([slug, tpl]) => ({ slug, ...tpl, ...TIMING[slug], active: INACTIVE.has(slug) ? 0 : 1 }));
}

module.exports = { TEMPLATES, TIMING, INACTIVE, defaultsList, SERIF, COLORS: C };
