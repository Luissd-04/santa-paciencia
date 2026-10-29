// Experiência temporária (29/10/2026): a app nova do Gmail no iPhone deixou
// de aplicar as regras u + .body que prendiam o texto no modo escuro. Este
// email mostra o mesmo bloco em 5 versões, cada uma com outra técnica para o
// texto, para escolher no iPhone a que fica igual ao modo claro. Segue com os
// exemplos (Definições → Emails → Receber todos os emails). Escolhida a
// versão, ela passa para o emailComposer e este ficheiro sai.
//
// Os fundos usam em todas o gradiente inline, que a app nova já respeita.
const { PALETTE: C, SERIF } = require('./emailComposer');

const bg = color => `background-color:${color};background-image:linear-gradient(${color},${color});`;

// Cada técnica embrulha um texto de cor `color`; `light` = texto claro sobre
// terracota.
const blendClasses = (p, light, html) => `<span class="${p}-g${light ? 's' : 'e'}"><span class="${p}-gd">${html}</span></span>`;
const blendRules = (scope, p) => `<style>
${scope} .${p}-gs { background:#000; mix-blend-mode:screen; }
${scope} .${p}-ge { background:#000; mix-blend-mode:exclusion; }
${scope} .${p}-gd { background:#000; mix-blend-mode:difference; color:#fff; }
</style>`;

const VARIANTS = [
  { n: 1, name: 'Camadas de mistura (u + .body)', note: 'a técnica atual',
    styles: ['u + .body', 'u ~ .body', 'u + div.body'].map(s => blendRules(s, 'v1')).join('\n'),
    text: (html, color, light) => blendClasses('v1', light, html) },
  { n: 2, name: 'Camadas de mistura (.body)', note: 'a mesma, sem depender do <u> do Gmail',
    styles: blendRules('.body', 'v2'),
    text: (html, color, light) => blendClasses('v2', light, html) },
  { n: 3, name: 'Camadas de mistura (inline)', note: 'sem bloco <style>',
    styles: '',
    text: (html, color, light) => `<span style="background:#000;mix-blend-mode:${light ? 'screen' : 'exclusion'};"><span style="background:#000;mix-blend-mode:difference;color:#fff;">${html}</span></span>` },
  { n: 4, name: 'Texto pintado (gradiente)', note: 'a cor vem de um gradiente, como os fundos',
    styles: '',
    text: (html, color) => `<span style="color:${color};background-image:linear-gradient(${color},${color});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${html}</span>` },
  { n: 5, name: 'Cor de preenchimento', note: '-webkit-text-fill-color',
    styles: '',
    text: (html, color) => `<span style="color:${color};-webkit-text-fill-color:${color};">${html}</span>` },
];

function card(v) {
  const t = (html, color, light = false) => v.text(html, color, light);
  const p = (html, extra = '') => `<p style="font-family:${SERIF};font-size:16px;line-height:1.6;color:${C.textSoft};margin:0 0 10px;${extra}">${html}</p>`;
  return `<tr><td style="padding:0 0 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-radius:12px;border:1px solid ${C.divider};${bg(C.cardBg)}">
    <tr><td style="padding:16px 18px;${bg(C.cardBg)}border-radius:12px;">
      <div style="font-family:${SERIF};font-size:12px;font-weight:bold;letter-spacing:2px;color:${C.muted};margin:0 0 8px;">${t(`VERSÃO ${v.n} · ${v.name.toUpperCase()}`, C.muted)}</div>
      <div style="font-family:${SERIF};font-size:13px;color:${C.muted};margin:0 0 12px;">${t(v.note.replace(/</g, '&lt;'), C.muted)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td style="${bg(C.okBg)}border-radius:999px;padding:6px 12px;">
        <span style="font-family:${SERIF};font-size:11px;font-weight:bold;letter-spacing:2px;color:${C.ok};">${t('PAGAMENTO RECEBIDO', C.ok)}</span>
      </td></tr></table>
      <div style="font-family:${SERIF};font-size:24px;font-weight:bold;line-height:1.25;color:${C.text};margin:0 0 10px;">${t('Recebemos 80,00 €', C.text)}</div>
      ${p(`${t('Olá ', C.textSoft)}<strong style="color:${C.text};">${t('Rui', C.text)}</strong>${t(', obrigado pelo pagamento.', C.textSoft)}`)}
      ${p(t('Texto castanho da marca', C.brand), `color:${C.brand};`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0;"><tr><td align="center" style="${bg(C.brand)}border-radius:10px;padding:13px 16px;">
        <span style="font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.brandText};">${t('Pagar 160,00 €', C.brandText, true)}</span>
      </td></tr></table>
    </td></tr>
  </table>
</td></tr>`;
}

function build() {
  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
${VARIANTS.map(v => v.styles).filter(Boolean).join('\n')}
<title>Teste do modo escuro</title>
</head>
<body class="body" style="margin:0;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${bg(C.surface)}">
  <tr><td align="center" style="padding:16px 12px;${bg(C.surface)}">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 0 18px;font-family:${SERIF};font-size:16px;line-height:1.6;color:${C.text};">
        <strong>Teste do modo escuro.</strong> Abra no Gmail do iPhone em modo escuro e em modo claro: o número da versão que ficar igual nos dois modos é a que passa para todos os emails.
      </td></tr>
      ${VARIANTS.map(card).join('\n')}
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject: 'Teste do modo escuro — 5 versões', html };
}

module.exports = { build, VARIANTS };
