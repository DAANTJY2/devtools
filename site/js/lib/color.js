// Read and convert colors: HEX, RGB, HSL, HSV, HWB, CMYK, Lab, LCH, OKLab, OKLCH and CSS names.
// Internally we work with sRGB values from 0 to 1 plus alpha.
import { fail } from '../core/registry.js';

export const NAMES = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000',
  blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff', darkblue: '00008b',
  darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b',
  darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493',
  deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000',
  greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c',
  lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa',
  mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee',
  mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa',
  mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23',
  orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee',
  palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6',
  purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072',
  sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080',
  thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5',
  yellow: 'ffff00', yellowgreen: '9acd32',
};

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mul = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const toLin = c => { const a = Math.abs(c); return Math.sign(c) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4); };
const fromLin = c => { const a = Math.abs(c); return Math.sign(c) * (a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055); };
const M_RGB_XYZ = [[0.4123907992659595, 0.357584339383878, 0.1804807884018343], [0.21263900587151036, 0.7151686787677559, 0.07219231536073371], [0.01933081871559185, 0.11919477979462599, 0.9505321522496606]];
const M_XYZ_RGB = [[3.2409699419045213, -1.5373831775700935, -0.4986107602930033], [-0.9692436362808798, 1.8759675015077206, 0.04155505740717561], [0.05563007969699361, -0.20397695888897657, 1.0569715142428786]];
const D65_D50 = [[1.0479298208405488, 0.022946793341019088, -0.05019222954313557], [0.029627815688159344, 0.990434484573249, -0.01707382502938514], [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008]];
const D50_D65 = [[0.9554734527042182, -0.023098536874261423, 0.0632593086610217], [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008], [0.012314001688319899, -0.020507696433477912, 1.3303659366080753]];
const W50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const EPS = 216 / 24389, KAP = 24389 / 27;

export function toLab({ r, g, b }) {
  const xyz = mul(D65_D50, mul(M_RGB_XYZ, [r, g, b].map(toLin))).map((v, i) => v / W50[i]);
  const f = xyz.map(t => t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116);
  return { L: 116 * f[1] - 16, a: 500 * (f[0] - f[1]), b: 200 * (f[1] - f[2]) };
}
export function fromLab(L, a, b) {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const xyz = [fx ** 3 > EPS ? fx ** 3 : (116 * fx - 16) / KAP, L > KAP * EPS ? fy ** 3 : L / KAP, fz ** 3 > EPS ? fz ** 3 : (116 * fz - 16) / KAP].map((v, i) => v * W50[i]);
  const [r, g, bb] = mul(M_XYZ_RGB, mul(D50_D65, xyz)).map(fromLin);
  return { r, g, b: bb };
}
export function toOklab({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s };
}
export function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return { r: fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s) };
}
const polar = (a, b) => ({ C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360 });
const cart = (C, H) => [C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)];

export function toHsl({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}
export function fromHsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4) };
}
export function toHsv(c) {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  return { h: toHsl(c).h, s: max ? (max - min) / max : 0, v: max };
}
export function fromHwb(h, w, bl) {
  if (w + bl >= 1) { const g = w / (w + bl); return { r: g, g, b: g }; }
  const c = fromHsl(h, 1, 0.5);
  return { r: c.r * (1 - w - bl) + w, g: c.g * (1 - w - bl) + w, b: c.b * (1 - w - bl) + w };
}
export function toCmyk({ r, g, b }) {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return { c: (1 - r - k) / (1 - k), m: (1 - g - k) / (1 - k), y: (1 - b - k) / (1 - k), k };
}

// Read one component: number, percentage or angle.
function comp(s, scale = 1, pctScale = 1) {
  if (s === undefined) fail('The color is missing values.');
  if (s === 'none') return 0;
  const m = /^(-?[\d.]+(?:e-?\d+)?)(%|deg|grad|rad|turn)?$/i.exec(s);
  if (!m) fail('Cannot read “' + s + '” as a number in the color.');
  const n = parseFloat(m[1]);
  switch (m[2]?.toLowerCase()) {
    case '%': return n / 100 * pctScale;
    case 'rad': return n * 180 / Math.PI;
    case 'grad': return n * 0.9;
    case 'turn': return n * 360;
    default: return n * scale;
  }
}

export function parse(input) {
  let s = String(input).trim().toLowerCase();
  if (!s) fail('Enter a color, for example #2f6fde, rgb(47 111 222) or oklch(0.6 0.17 260).');
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMES[s]) s = '#' + NAMES[s];
  if (/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) {
    let h = s.replace('#', '');
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.substr(i, 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  const m = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!m) fail('Unknown color format. Use, for example, #ff8800, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), cmyk() or a CSS name.');
  const fn = m[1];
  const [main, alpha] = m[2].split('/');
  const p = main.trim().split(/[\s,]+/).filter(Boolean);
  let parts = p;
  let a = alpha !== undefined ? comp(alpha.trim(), 1, 1) : 1;
  if (alpha === undefined && p.length === 4 && !/cmyk/.test(fn)) { a = comp(p[3], 1, 1); parts = p.slice(0, 3); }
  let c;
  switch (fn) {
    case 'rgb': case 'rgba': c = { r: comp(parts[0], 1 / 255, 1), g: comp(parts[1], 1 / 255, 1), b: comp(parts[2], 1 / 255, 1) }; break;
    case 'hsl': case 'hsla': c = fromHsl(comp(parts[0]), comp(parts[1], 1 / 100, 1), comp(parts[2], 1 / 100, 1)); break;
    case 'hwb': c = fromHwb(comp(parts[0]), comp(parts[1], 1 / 100, 1), comp(parts[2], 1 / 100, 1)); break;
    case 'hsv': case 'hsb': { const h = comp(parts[0]), sv = comp(parts[1], 1 / 100, 1), v = comp(parts[2], 1 / 100, 1); const l = v * (1 - sv / 2); c = fromHsl(h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l); break; }
    case 'lab': c = fromLab(comp(parts[0], 1, 100), comp(parts[1], 1, 125), comp(parts[2], 1, 125)); break;
    case 'lch': { const [A, B] = cart(comp(parts[1], 1, 150), comp(parts[2])); c = fromLab(comp(parts[0], 1, 100), A, B); break; }
    case 'oklab': c = fromOklab(comp(parts[0], 1, 1), comp(parts[1], 1, 0.4), comp(parts[2], 1, 0.4)); break;
    case 'oklch': { const [A, B] = cart(comp(parts[1], 1, 0.4), comp(parts[2])); c = fromOklab(comp(parts[0], 1, 1), A, B); break; }
    case 'cmyk': case 'device-cmyk': {
      const [cc, mm, yy, kk] = p.map(x => comp(x, x.includes('%') ? 1 : (parseFloat(x) > 1 ? 1 / 100 : 1), 1));
      c = { r: (1 - cc) * (1 - kk), g: (1 - mm) * (1 - kk), b: (1 - yy) * (1 - kk) }; a = 1; break;
    }
    default: fail('Unknown color function “' + fn + '()”.');
  }
  const out = !['r', 'g', 'b'].every(k => c[k] >= -0.0005 && c[k] <= 1.0005);
  return { r: clamp(c.r), g: clamp(c.g), b: clamp(c.b), a: clamp(a), outOfGamut: out };
}

const r0 = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
const pct = x => r0(x * 100, 1) + '%';
const aSuffix = (a, sep = ' / ') => a < 1 ? sep + r0(a, 3) : '';
export const hex = c => '#' + [c.r, c.g, c.b, ...(c.a < 1 ? [c.a] : [])].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
export function formats(c) {
  const hsl = toHsl(c), hsv = toHsv(c), lab = toLab(c), ok = toOklab(c), cmyk = toCmyk(c);
  const lch = polar(lab.a, lab.b), oklch = polar(ok.a, ok.b);
  const w = Math.min(c.r, c.g, c.b), bl = 1 - Math.max(c.r, c.g, c.b);
  const name = Object.entries(NAMES).find(([, v]) => '#' + v === hex({ ...c, a: 1 }))?.[0];
  return [
    ['HEX', hex(c)],
    ['RGB', `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)}${aSuffix(c.a)})`],
    ['RGB (legacy)', c.a < 1 ? `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${r0(c.a, 3)})` : `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`],
    ['HSL', `hsl(${r0(hsl.h, 1)} ${pct(hsl.s)} ${pct(hsl.l)}${aSuffix(c.a)})`],
    ['HSV / HSB', `hsv(${r0(hsv.h, 1)} ${pct(hsv.s)} ${pct(hsv.v)})`],
    ['HWB', `hwb(${r0(hsl.h, 1)} ${pct(w)} ${pct(bl)}${aSuffix(c.a)})`],
    ['Lab', `lab(${r0(lab.L, 2)}% ${r0(lab.a, 2)} ${r0(lab.b, 2)}${aSuffix(c.a)})`],
    ['LCH', `lch(${r0(lab.L, 2)}% ${r0(lch.C, 2)} ${r0(lch.C < 0.01 ? 0 : lch.H, 2)}${aSuffix(c.a)})`],
    ['OKLab', `oklab(${r0(ok.L, 4)} ${r0(ok.a, 4)} ${r0(ok.b, 4)}${aSuffix(c.a)})`],
    ['OKLCH', `oklch(${r0(ok.L, 4)} ${r0(oklch.C, 4)} ${r0(oklch.C < 0.0001 ? 0 : oklch.H, 2)}${aSuffix(c.a)})`],
    ['CMYK', `cmyk(${pct(cmyk.c)} ${pct(cmyk.m)} ${pct(cmyk.y)} ${pct(cmyk.k)})`],
    ['CSS name', name || '(no exact CSS name)'],
  ];
}

// Relative luminance and contrast according to WCAG 2.
export const luminance = c => 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Composite a foreground with alpha over a background.
export const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
