// Experiência temporária (29–30/10/2026). A app nova do Gmail no iPhone
// deixou de aplicar as regras u + .body; o 1.º teste mostrou que as camadas
// de mistura com .body funcionam (igual nos dois modos), mas com a letra
// toda preta: a mistura devolve o inverso do fundo. Este 2.º teste mistura,
// em vez de branco, a cor calculada para que o resultado seja a cor da marca
// (castanho, verde) sobre o fundo de cada bloco. Segue com os exemplos
// (Definições → Emails → Receber todos os emails). Escolhida a versão, ela
// passa para o emailComposer e este ficheiro sai.
//
// Os fundos usam em todas o gradiente inline, que a app nova já respeita.
const { PALETTE: C, SERIF } = require('./emailComposer');

const bg = color => `background-color:${color};background-image:linear-gradient(${color},${color});`;

// Cor a misturar para que o resultado sobre o fundo `backdrop` seja `target`:
// «exclusion» dá B + S − 2BS (texto escuro sobre fundo claro); «screen» dá
// 1 − (1 − B)(1 − S) (texto claro sobre terracota).
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
function ink(target, backdrop, light) {
  const T = rgb(target), B = rgb(backdrop);
  return hex(T.map((t, i) => light ? 1 - (1 - t) / (1 - B[i]) : (t - B[i]) / (1 - 2 * B[i])));
}

// Cada técnica embrulha um texto de cor `color` sobre o fundo `backdrop`;
// `light` = texto claro sobre terracota.
const blendRules = (scope, p, extra = '') => `<style>
${scope} .${p}-gs { background:#000; mix-blend-mode:screen; }
${scope} .${p}-ge { background:#000; mix-blend-mode:exclusion; }
${scope} .${p}-gd { background:#000; mix-blend-mode:difference; color:#fff; }${extra}
</style>`;

// Pares cor/fundo usados no bloco de teste, para as regras da versão B.
const PAIRS = [
  [C.muted, C.cardBg], [C.ok, C.okBg], [C.text, C.cardBg], [C.textSoft, C.cardBg],
  [C.brand, C.cardBg], [C.brandText, C.brand, true],
];
const pairClass = (color, backdrop) => `vb-${color.slice(1)}-${backdrop.slice(1)}`;

const VARIANTS = [
  { n: 'A', name: 'Mistura (.body), letra preta', note: 'a versão 2 do 1.º teste, para comparar',
    styles: blendRules('.body', 'va'),
    text: (html, color, light) => `<span class="va-g${light ? 's' : 'e'}"><span class="va-gd">${html}</span></span>` },
  { n: 'B', name: 'Mistura (.body) com as cores', note: 'cores calculadas no bloco de estilos',
    styles: blendRules('.body', 'vb', PAIRS.map(([c, b, l]) => `\n.body .${pairClass(c, b)} { color:${ink(c, b, l)}; }`).join('')),
    text: (html, color, light, backdrop) => `<span class="vb-g${light ? 's' : 'e'}"><span class="vb-gd ${pairClass(color, backdrop)}">${html}</span></span>` },
  { n: 'C', name: 'Mistura (inline) com as cores', note: 'cores calculadas em cada texto',
    styles: '',
    text: (html, color, light, backdrop) => `<span style="background:#000;mix-blend-mode:${light ? 'screen' : 'exclusion'};"><span style="background:#000;mix-blend-mode:difference;color:${ink(color, backdrop, light)};">${html}</span></span>` },
];

function card(v) {
  const t = (html, color, light = false, backdrop = C.cardBg) => v.text(html, color, light, light ? C.brand : backdrop);
  const p = (html, extra = '') => `<p style="font-family:${SERIF};font-size:16px;line-height:1.6;color:${C.textSoft};margin:0 0 10px;${extra}">${html}</p>`;
  return `<tr><td style="padding:0 0 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-radius:12px;border:1px solid ${C.divider};${bg(C.cardBg)}">
    <tr><td style="padding:16px 18px;${bg(C.cardBg)}border-radius:12px;">
      <div style="font-family:${SERIF};font-size:12px;font-weight:bold;letter-spacing:2px;color:${C.muted};margin:0 0 8px;">${t(`VERSÃO ${v.n} · ${v.name.toUpperCase()}`, C.muted)}</div>
      <div style="font-family:${SERIF};font-size:13px;color:${C.muted};margin:0 0 12px;">${t(v.note.replace(/</g, '&lt;'), C.muted)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td style="${bg(C.okBg)}border-radius:999px;padding:6px 12px;">
        <span style="font-family:${SERIF};font-size:11px;font-weight:bold;letter-spacing:2px;color:${C.ok};">${t('PAGAMENTO RECEBIDO', C.ok, false, C.okBg)}</span>
      </td></tr></table>
      <div style="font-family:${SERIF};font-size:24px;font-weight:bold;line-height:1.25;color:${C.text};margin:0 0 10px;">${t('Recebemos 80,00 €', C.text)}</div>
      ${p(`${t('Olá ', C.textSoft)}<strong style="color:${C.text};">${t('Rui', C.text)}</strong>${t(', obrigado pelo pagamento.', C.textSoft)}`)}
      ${p(t('Texto castanho da marca', C.brand), `color:${C.brand};`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0;"><tr><td align="center" style="${bg(C.brand)}border-radius:10px;padding:13px 16px;">
        <span style="font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.brandText};">${t('Pagar 160,00 €', C.brandText, true, C.brand)}</span>
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
        <strong>Teste do modo escuro.</strong> Abra no Gmail do iPhone em modo escuro e em modo claro: a letra da versão que ficar igual nos dois modos, e com o castanho e o verde, é a que passa para todos os emails.
      </td></tr>
      ${VARIANTS.map(card).join('\n')}
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject: 'Teste do modo escuro (2) — 3 versões', html };
}

module.exports = { build, VARIANTS, ink };
