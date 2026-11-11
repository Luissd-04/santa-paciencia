// Browser, sistema e tipo de dispositivo a partir do User-Agent, só em grandes
// grupos (para totais e para o nome dos dispositivos push). A ordem conta: o
// Edge, o Samsung Internet e o Opera também dizem «Chrome»; o Chrome em iOS diz
// «CriOS» e o Firefox em iOS «FxiOS»; o iPhone diz «like Mac OS X». O iPadOS
// em modo computador apresenta-se como Mac: sem forma de saber, fica macOS/desktop.
function browserOf(ua) {
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera|Chromium\//.test(ua)) return 'Outro';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/CriOS\/|Chrome\//.test(ua)) return 'Chrome';
  // A PWA instalada no iOS não inclui o token «Safari»: fica «Outro».
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Outro';
}

function osOf(ua) {
  if (/iPhone|iPod/.test(ua)) return 'iOS';
  if (/iPad/.test(ua)) return 'iPadOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'Outro';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return 'Outro';
}

function parseUserAgent(ua = '') {
  ua = String(ua || '');
  const os = osOf(ua);
  // Tablets Android não dizem «Mobile».
  const device = os === 'iPadOS' || (os === 'Android' && !/Mobile/.test(ua)) || /Tablet/.test(ua) ? 'tablet'
    : os === 'iOS' || os === 'Android' || /Mobi/.test(ua) ? 'mobile'
    : 'desktop';
  return { browser: browserOf(ua), os, device };
}

module.exports = { parseUserAgent };
