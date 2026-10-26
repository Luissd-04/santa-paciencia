// Experiência temporária: o mesmo email em três versões, para escolher no
// iPhone (Gmail em modo escuro) qual fica bem. Usado só pelo botão «Teste de
// cores» em Definições › Emails. Escolhida a versão, ela passa para o
// emailComposer e este ficheiro sai.
//
//   A — como hoje: cores simples, o Gmail inverte tudo (legível, escuro).
//   B — cores presas: fundos com gradiente (o Gmail não mexe em imagens de
//       fundo) e letras em camadas de mistura que só o Gmail ativa
//       (u + .body). As regras do Gmail vão em blocos <style> próprios, sem
//       nada que o Gmail possa recusar, para um bloco não levar o outro.
//   C — desenhado para inverter: só o cabeçalho fica preso (logótipo sobre o
//       terracota); botões e total passam a contorno, que invertem bem.
const sanitizeHtml = require('sanitize-html');
const { PALETTE, BODY_START, BODY_END } = require('./emailComposer');

const LIGHT_TEXT = /\bsp-(?:brand-on-text|brand-subtext)\b/;
const DARK_TEXT = /\bsp-(?:text|text-soft|muted-text|brand-text|brand-soft-text)\b/;
const LIGHT_SURFACE = /\bsp-(?:surface|card|card-alt|page|divider)-bg\b/;

function splitBody(html) {
  const match = html.match(/(<body\b[^>]*>)([\s\S]*)(<\/body>)/);
  return match ? { before: html.slice(0, match.index) + match[1], inner: match[2], after: match[3] + html.slice(match.index + match[0].length) } : null;
}

// Gradiente da mesma cor por cima de cada fundo: o Gmail inverte cores, não
// imagens de fundo.
function lockBackgrounds(html) {
  return html.replace(/style="([^"]*)"/g, (whole, style) => {
    const bg = style.match(/background-color:\s*(#[0-9a-fA-F]{6})/);
    if (!bg || /background-image/i.test(style)) return whole;
    return `style="${style}${style.trim().endsWith(';') || !style.trim() ? '' : ';'}background-image:linear-gradient(${bg[1]},${bg[1]});"`;
  });
}

// Cada texto passa a duas camadas: no Gmail invertido, «difference» repõe o
// branco e «screen»/«exclusion» devolvem letra clara sobre terracota ou
// escura sobre creme. Nos outros clientes as camadas não têm estilo.
function blendText(inner) {
  const frames = [];
  return sanitizeHtml(inner.replace(BODY_START, '<sp-body-start></sp-body-start>').replace(BODY_END, '<sp-body-end></sp-body-end>'), {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    onOpenTag(tag, attribs) {
      const parent = frames.at(-1) || { light: false };
      const classes = String(attribs.class || '');
      let light = parent.light;
      if (/\bsp-brand-bg\b/.test(classes)) light = true;
      if (LIGHT_SURFACE.test(classes) || DARK_TEXT.test(classes)) light = false;
      if (LIGHT_TEXT.test(classes)) light = true;
      frames.push({ light, skip: tag === 'style' || tag === 'title' });
    },
    onCloseTag() { frames.pop(); },
    textFilter(text) {
      const frame = frames.at(-1);
      if (!frame || frame.skip || !text.replace(/&(?:nbsp|#160);/g, '').trim()) return text;
      return `<span class="sp-g${frame.light ? 's' : 'e'}"><span class="sp-gd">${text}</span></span>`;
    },
  })
    .replace(/<\/span><\/span><span class="sp-g[se]"><span class="sp-gd">/g, '')
    .replace('<sp-body-start></sp-body-start>', BODY_START)
    .replace('<sp-body-end></sp-body-end>', BODY_END);
}

const GMAIL_BLEND_STYLES = ['u + .body', 'u ~ .body', 'u + div.body']
  .map(scope => `<style>
${scope} .sp-gs { background:#000; mix-blend-mode:screen; }
${scope} .sp-ge { background:#000; mix-blend-mode:exclusion; }
${scope} .sp-gd { background:#000; mix-blend-mode:difference; color:#fff; }
</style>`).join('\n');

function lockedColors(html) {
  const parts = splitBody(lockBackgrounds(html));
  if (!parts) return html;
  const head = parts.before.replace('<style>', `${GMAIL_BLEND_STYLES}\n<style>`);
  return `${head}${blendText(parts.inner)}${parts.after}`;
}

// Só o cabeçalho fica preso; sem a linha «ALOJAMENTO LOCAL», que o Gmail
// tornaria escura sobre o terracota. Botões e total ficam em contorno.
function invertFriendly(html) {
  const brand = PALETTE.brand;
  let out = html.replace(/(<td align="center" bgcolor="#843424" class="sp-brand-bg" style=")([^"]*padding:24px 24px 20px[^"]*)(")/,
    (whole, a, style, z) => `${a}${style};background-image:linear-gradient(${brand},${brand});${z}`)
    .replace(/<div class="sp-brand-subtext"[^>]*>[^<]*<\/div>/, '');
  const headerEnd = out.indexOf('</tr>', out.indexOf('padding:24px 24px 20px'));
  const header = out.slice(0, headerEnd);
  const rest = out.slice(headerEnd)
    .replace(/bgcolor="#843424" class="sp-brand-bg" style="([^"]*)"/g, (whole, style) =>
      `class="sp-outline" style="${style.replace(/background-color:#843424;?/g, '')};border:1.5px solid ${brand};"`)
    .replace(/class="sp-brand-on-text" style="([^"]*)"/g, (whole, style) =>
      `class="sp-brand-text" style="${style.replace(/color:#fbf3ea/g, `color:${brand}`)}"`);
  return header + rest;
}

const VARIANTS = [
  { key: 'A', label: 'como está hoje', transform: html => html },
  { key: 'B', label: 'cores presas', transform: lockedColors },
  { key: 'C', label: 'desenho para inverter', transform: invertFriendly },
];

module.exports = { VARIANTS, lockedColors, invertFriendly };
