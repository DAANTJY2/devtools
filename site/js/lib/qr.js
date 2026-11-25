// QR codes as SVG or PNG, using the vendored qrcode-generator library.
import { lib, toB64, utf8 } from '../core/util.js';
import { fail } from '../core/registry.js';

export async function qrMatrix(text, ecl = 'M') {
  const { default: qrcode } = await lib('qrcode');
  if (qrcode.stringToBytesFuncs?.['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, ecl);
  try { qr.addData(text, 'Byte'); qr.make(); } catch { fail('This text is too long for a QR code. Shorten it or choose a lower error-correction level.'); }
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}

const esc = s => String(s).replace(/[^#\w(),.% -]/g, '');
export function qrSvg(m, { fg = '#000000', bg = '#ffffff', margin = 4, scale = 8 } = {}) {
  const size = m.n + margin * 2;
  let d = '';
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * scale}" height="${size * scale}" shape-rendering="crispEdges">`
    + (bg === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${esc(bg)}"/>`) + `<path fill="${esc(fg)}" d="${d}"/></svg>`;
}
export const svgUrl = svg => 'data:image/svg+xml;base64,' + toB64(utf8(svg));

// Create a PNG via a canvas (browser only).
export async function qrPng(m, { fg = '#000000', bg = '#ffffff', margin = 4, scale = 10 } = {}) {
  if (typeof document === 'undefined') return null;
  const size = (m.n + margin * 2) * scale;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  g.fillStyle = fg;
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) g.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
