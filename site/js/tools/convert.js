import { T, fail } from '../core/registry.js';
import { utf8, fromUtf8, lib, toHex, fromHex, toB64, fromB64, parseJSON, int, plural, bytesIEC, LOCALE } from '../core/util.js';
import * as C from '../lib/color.js';
import { parseMoment, allFormats, localZone, zones } from '../lib/time.js';

// ---------- Date and time ----------
const tzOpts = () => [...new Set(['UTC', localZone(), 'America/New_York', 'Europe/London', ...zones()])];
T({
  id: 'timestamp', cat: 'convert', ic: 'DT', name: 'Date-time converter',
  desc: 'Convert moments between ISO 8601, Unix (s, ms, µs, ns), RFC 2822, RFC 3339, Excel, LDAP/FILETIME and Julian dates.',
  kw: 'timestamp unix epoch date time iso 8601 rfc 2822 3339 excel ldap filetime julian week number converter',
  fields: [
    { k: 's', t: 'text', label: 'Moment', def: 'now', mono: true, hint: 'For example 1792671000, 2026-10-22T14:30:00Z, 10/22/2026 2:30 PM, 2026/295, 133xxxxxxxxxxxxxxx or “now”.' },
    { k: 'mode', t: 'sel', label: 'Input is', opts: [['auto', 'Detect automatically'], ['unix', 'Unix seconds'], ['unixms', 'Unix milliseconds'], ['unixus', 'Unix microseconds'], ['unixns', 'Unix nanoseconds'], ['excel', 'Excel serial date'], ['ldap', 'LDAP/FILETIME (18 digits)'], ['ordinal', 'Julian date YYYY/DDD'], ['jd', 'Julian Day (JD)'], ['mjd', 'Modified Julian Day']] },
    { k: 'tz', t: 'sel', label: 'Time zone', def: localZone, opts: tzOpts() },
  ],
  ex: [{ n: 'Unix', v: { s: '1700000000' } }, { n: 'Milliseconds', v: { s: '1700000000000' } }, { n: 'LDAP', v: { s: '133432704000000000' } }, { n: 'Julian', v: { s: '2026/295' } }, { n: 'Excel', v: { s: '46317.5', mode: 'excel' } }],
  run(v) {
    const { ms, how } = parseMoment(v.s, v.mode, v.tz);
    return [{ note: 'Read as: ' + how + '.', kind: 'info' }, { l: 'Formats', kv: allFormats(ms, v.tz) }];
  },
});

// ---------- Number bases ----------
const DIG = '0123456789abcdefghijklmnopqrstuvwxyz';
export function parseBig(s, base) {
  let t = s.trim().toLowerCase().replace(/[\s_',]/g, '');
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (base === 'auto') {
    if (/^0x/.test(t)) { base = 16; t = t.slice(2); } else if (/^0b/.test(t)) { base = 2; t = t.slice(2); } else if (/^0o/.test(t)) { base = 8; t = t.slice(2); } else base = 10;
  } else if ((base === 16 && t.startsWith('0x')) || (base === 2 && t.startsWith('0b')) || (base === 8 && t.startsWith('0o'))) t = t.slice(2);
  if (!t) fail('Enter a number.');
  let v = 0n;
  const B = BigInt(base);
  for (const c of t) {
    const d = DIG.indexOf(c);
    if (d < 0 || d >= base) fail(`“${c}” is not a valid digit in base ${base}. Allowed: ${DIG.slice(0, base).split('').join(' ').toUpperCase()}.`);
    v = v * B + BigInt(d);
  }
  return { v: neg ? -v : v, base };
}
const group = (s, n, sep = ' ') => s.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), sep);
T({
  id: 'base', cat: 'convert', ic: '0x', name: 'Number base converter',
  desc: 'Convert integers between binary, octal, decimal, hexadecimal and any base up to 36, including very large numbers.',
  kw: 'binary octal decimal hexadecimal hex base radix number system converter bin',
  fields: [
    { k: 's', t: 'text', label: 'Number', def: '255', mono: true },
    { k: 'from', t: 'sel', label: 'From base', opts: [['auto', 'Automatic (0x, 0b, 0o)'], ['10', '10 (decimal)'], ['16', '16 (hex)'], ['2', '2 (binary)'], ['8', '8 (octal)'], ['custom', 'Other base…']] },
    { k: 'fb', t: 'num', label: 'Other base (2–36)', def: 36, min: 2, max: 36, show: v => v.from === 'custom' },
    { k: 'to', t: 'num', label: 'Extra output in base', def: 36, min: 2, max: 36 },
    { k: 'grp', t: 'chk', label: 'Group digits', def: true },
  ],
  ex: [{ n: '0xFF', v: { s: '0xFF', from: 'auto' } }, { n: 'Binary', v: { s: '1011 0110', from: '2' } }, { n: 'Large', v: { s: '18446744073709551615' } }],
  run(v) {
    const fb = v.from === 'custom' ? Math.round(v.fb) : v.from === 'auto' ? 'auto' : Number(v.from);
    if (fb !== 'auto' && !(fb >= 2 && fb <= 36)) fail('The base must be between 2 and 36.');
    const to = Math.round(v.to);
    if (!(to >= 2 && to <= 36)) fail('The extra base must be between 2 and 36.');
    const { v: n } = parseBig(v.s, fb);
    const g = (s, k, sep) => v.grp ? (s.startsWith('-') ? '-' + group(s.slice(1), k, sep) : group(s, k, sep)) : s;
    const abs = n < 0n ? -n : n;
    const bits = abs.toString(2).length;
    return [{ l: 'Result', kv: [
      ['Decimal (10)', v.grp ? n.toLocaleString(LOCALE) : n.toString()],
      ['Hexadecimal (16)', g(n.toString(16).toUpperCase(), 4)],
      ['Octal (8)', g(n.toString(8), 3)],
      ['Binary (2)', g(n.toString(2), 4)],
      ['Base 32', n.toString(32)],
      ['Base 36', n.toString(36)],
      ['Base ' + to, n.toString(to)],
    ] }, { note: `${plural(bits, 'bit', 'bits')} needed${bits <= 64 ? `; fits in ${bits <= 8 ? '8' : bits <= 16 ? '16' : bits <= 32 ? '32' : '64'} bits` : ''}.`, kind: 'info' }];
  },
});

// ---------- Roman numerals ----------
const ROM = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) fail('Roman numerals range from 1 through 3999. Enter a whole number within that range.');
  let s = '';
  for (const [v, r] of ROM) while (n >= v) { s += r; n -= v; }
  return s;
}
export function fromRoman(s) {
  const t = s.trim().toUpperCase();
  if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(t) || !t) fail('This is not a valid Roman numeral. Use I, V, X, L, C, D and M in the correct order, such as MMXXVI.');
  let n = 0, i = 0;
  for (const [v, r] of ROM) while (t.startsWith(r, i)) { n += v; i += r.length; }
  return n;
}
T({
  id: 'roman', cat: 'convert', ic: 'XIV', name: 'Roman numerals',
  desc: 'Convert numbers (1–3999) to Roman numerals and back.',
  kw: 'roman numeral number mmxxvi',
  fields: [{ k: 's', t: 'text', label: 'Number or Roman numeral', def: '2026' }],
  ex: [{ n: 'MCMXCIV', v: { s: 'MCMXCIV' } }, { n: '3999', v: { s: '3999' } }],
  run(v) {
    const s = v.s.trim();
    if (!s) return [{ note: 'Enter a number or a Roman numeral.', kind: 'info' }];
    if (/^\d+$/.test(s)) return [{ l: 'Roman', v: toRoman(Number(s)), big: true }];
    return [{ l: 'Number', v: String(fromRoman(s)), big: true }];
  },
});

// ---------- Base64 ----------
const CP1252 = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
const CP1252_REV = Object.fromEntries(Object.entries(CP1252).map(([b, c]) => [c, +b]));
export function encodeText(s, cs) {
  if (cs === 'utf-8') return utf8(s);
  if (cs === 'utf-16le' || cs === 'utf-16be') {
    const out = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[i * 2 + (cs === 'utf-16le' ? 0 : 1)] = c & 255;
      out[i * 2 + (cs === 'utf-16le' ? 1 : 0)] = c >> 8;
    }
    return out;
  }
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (cs === 'ascii' && c < 128) out.push(c);
    else if (cs === 'latin1' && c < 256) out.push(c);
    else if (cs === 'windows-1252' && (c < 128 || (c >= 0xa0 && c < 256))) out.push(c);
    else if (cs === 'windows-1252' && CP1252_REV[c] !== undefined) out.push(CP1252_REV[c]);
    else fail(`The character “${ch}” (U+${c.toString(16).toUpperCase().padStart(4, '0')}) does not exist in ${cs.toUpperCase()}. Choose UTF-8 or UTF-16.`);
  }
  return Uint8Array.from(out);
}
export function decodeText(b, cs) {
  if (cs === 'latin1') return Array.from(b, x => String.fromCharCode(x)).join('');
  if (cs === 'ascii') { const bad = b.findIndex(x => x > 127); if (bad >= 0) fail(`Byte ${bad + 1} (0x${b[bad].toString(16)}) is not ASCII. Choose a different character set.`); return Array.from(b, x => String.fromCharCode(x)).join(''); }
  try { return new TextDecoder(cs, { fatal: true }).decode(b); } catch { fail(`These bytes are not valid ${cs.toUpperCase()} text. Choose a different character set, or it is binary data (use Base64 to file instead).`); }
}
const CHARSETS = [['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'], ['latin1', 'ISO-8859-1 (Latin-1)'], ['windows-1252', 'Windows-1252'], ['ascii', 'ASCII']];
T({
  id: 'base64', cat: 'convert', ic: 'B64', name: 'Base64 encode and decode',
  desc: 'Convert text to Base64 and back, with UTF-8, UTF-16, Latin-1 or Windows-1252 and URL-safe Base64.',
  kw: 'base64 encode decode url-safe base64url utf-16 charset mime',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Text → Base64'], ['dec', 'Base64 → text']] },
    { k: 's', t: 'area', label: 'Input', def: 'Hello world! Café, naïve and €.', rows: 5 },
    { k: 'cs', t: 'sel', label: 'Character set', opts: CHARSETS },
    { k: 'url', t: 'chk', label: 'URL-safe (- and _, no =)', show: v => v.m === 'enc' },
    { k: 'wrap', t: 'chk', label: '76-character lines (MIME)', show: v => v.m === 'enc' },
  ],
  ex: [{ n: 'Decode', v: { m: 'dec', s: 'SGVsbG8gd29ybGQh' } }, { n: 'UTF-16 LE', v: { m: 'enc', cs: 'utf-16le', s: 'Hello' } }, { n: 'URL-safe', v: { m: 'dec', s: 'PDw_Pz4-' } }],
  run(v) {
    if (v.m === 'enc') {
      let out = toB64(encodeText(v.s, v.cs), v.url);
      if (v.wrap) out = out.replace(/.{76}(?=.)/g, '$&\n');
      return [{ l: 'Base64', v: out }];
    }
    if (!v.s.trim()) return [{ note: 'Paste Base64 to decode.', kind: 'info' }];
    const b = fromB64(v.s.replace(/^data:[^,]*,/, ''));
    return [{ l: `Text (${plural(b.length, 'byte', 'bytes')})`, v: decodeText(b, v.cs) }];
  },
});

// ---------- Base64 file ----------
const MAGIC = [[[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'], [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'], [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
  [[0x25, 0x50, 0x44, 0x46], 'application/pdf', 'pdf'], [[0x50, 0x4b, 0x03, 0x04], 'application/zip', 'zip'], [[0x52, 0x49, 0x46, 0x46], 'image/webp', 'webp'],
  [[0x42, 0x4d], 'image/bmp', 'bmp'], [[0x00, 0x00, 0x01, 0x00], 'image/x-icon', 'ico'], [[0x1f, 0x8b], 'application/gzip', 'gz']];
export function sniff(b) {
  for (const [sig, mime, ext] of MAGIC) if (sig.every((x, i) => b[i] === x)) return { mime, ext };
  const head = new TextDecoder().decode(b.subarray(0, 200)).trim();
  if (/^(<\?xml[^>]*>\s*)?<svg/i.test(head)) return { mime: 'image/svg+xml', ext: 'svg' };
  return { mime: 'application/octet-stream', ext: 'bin' };
}
T({
  id: 'base64file', cat: 'convert', ic: 'B64F', name: 'Base64 file converter',
  desc: 'Convert a file to Base64 or a data URL, or preview and download Base64 as a file.',
  kw: 'base64 file data url image download decode',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'File → Base64'], ['dec', 'Base64 → file']] },
    { k: 'f', t: 'file', label: 'File', show: v => v.m === 'enc' },
    { k: 's', t: 'area', label: 'Base64 or data URL', rows: 5, show: v => v.m === 'dec', def: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzJmNmZkZSIvPjwvc3ZnPg==' },
  ],
  async run(v) {
    if (v.m === 'enc') {
      if (!v.f) return [{ note: 'Choose a file to convert.', kind: 'info' }];
      if (v.f.size > 50e6) fail('This file is larger than 50 MB; that is too heavy for the browser as Base64.');
      const b = new Uint8Array(await v.f.arrayBuffer());
      const mime = v.f.type || sniff(b).mime;
      const b64 = toB64(b);
      return [{ l: `Base64 (${int(b64.length)} characters)`, v: b64 }, { l: 'Data URL', v: `data:${mime};base64,${b64}` },
        mime.startsWith('image/') ? { l: 'Preview', img: `data:${mime};base64,${b64}`, alt: v.f.name } : null];
    }
    const s = v.s.trim();
    if (!s) return [{ note: 'Paste Base64 or a data URL.', kind: 'info' }];
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(s);
    if (m && !m[2]) {
      const b = utf8(decodeURIComponent(m[3]));
      return show(b, m[1] || 'text/plain');
    }
    const b = fromB64(m ? m[3] : s);
    return show(b, m?.[1] || sniff(b).mime);
    function show(bytes, mime) {
      const ext = MAGIC.find(x => x[1] === mime)?.[2] || (mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1] || 'bin');
      return [{ l: 'File', kv: [['Type', mime], ['Size', bytesIEC(bytes.length) + ` (${int(bytes.length)} bytes)`]] },
        /^image\/(png|jpeg|gif|webp|bmp|x-icon|svg\+xml)$/.test(mime) ? { l: 'Preview', img: `data:${mime};base64,${toB64(bytes)}`, alt: 'Decoded image' } : null,
        { l: 'Download as file', dl: { name: 'file.' + ext.replace(/[^a-z0-9]/gi, ''), data: bytes, mime } }];
    }
  },
});

// ---------- Colors ----------
T({
  id: 'color', cat: 'convert', ic: 'CLR', name: 'Color converter',
  desc: 'Convert colors between HEX, RGB, HSL, HSV, HWB, Lab, LCH, OKLab, OKLCH, CMYK and CSS names.',
  kw: 'color colour converter hex rgb hsl hsv hwb lab lch oklch oklab cmyk css name picker',
  fields: [
    { k: 'c', t: 'text', label: 'Color (any format)', def: '#2f6fde', mono: true },
    { k: 'p', t: 'color', label: 'Color picker', def: '#2f6fde', on: (v, ctx) => ctx.set('c', v.p) },
  ],
  ex: [{ n: 'rebeccapurple', v: { c: 'rebeccapurple' } }, { n: 'oklch', v: { c: 'oklch(0.7 0.15 150)' } }, { n: 'hsl', v: { c: 'hsl(30 100% 50% / 0.8)' } }, { n: 'CMYK', v: { c: 'cmyk(0% 60% 100% 0%)' } }],
  run(v, ctx) {
    const c = C.parse(v.c);
    ctx.sync?.('p', C.hex({ ...c, a: 1 }));
    return [{ l: 'Color', color: C.hex(c) }, { l: 'Formats', kv: C.formats(c) },
      c.outOfGamut ? { note: 'This color is outside the sRGB range of a normal display; the values were clamped to the nearest sRGB color.', kind: 'warn' } : null,
      { note: `Relative luminance: ${C.luminance(c).toFixed(4)}. Contrast with white ${C.contrast(c, { r: 1, g: 1, b: 1 }).toFixed(2)}:1, with black ${C.contrast(c, { r: 0, g: 0, b: 0 }).toFixed(2)}:1.`, kind: 'info' }];
  },
});

// ---------- Case ----------
export function words(s) { return s.match(/\p{Lu}?[\p{Ll}\p{Lo}\p{M}]+|\p{Lu}+(?![\p{Ll}])|\p{N}+/gu) || []; }
const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
export const CASES = {
  camel: ['camelCase', s => words(s).map((w, i) => i ? cap(w) : w.toLowerCase()).join('')],
  pascal: ['PascalCase', s => words(s).map(cap).join('')],
  snake: ['snake_case', s => words(s).map(w => w.toLowerCase()).join('_')],
  constant: ['CONSTANT_CASE', s => words(s).map(w => w.toUpperCase()).join('_')],
  kebab: ['kebab-case', s => words(s).map(w => w.toLowerCase()).join('-')],
  cobol: ['COBOL-CASE', s => words(s).map(w => w.toUpperCase()).join('-')],
  header: ['Header-Case', s => words(s).map(cap).join('-')],
  dot: ['dot.case', s => words(s).map(w => w.toLowerCase()).join('.')],
  path: ['path/case', s => words(s).map(w => w.toLowerCase()).join('/')],
  title: ['Title Case', s => s.toLowerCase().replace(/(^|[\s\-("'“‘])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  sentence: ['Sentence case', s => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  lower: ['lowercase', s => s.toLowerCase()],
  upper: ['UPPERCASE', s => s.toUpperCase()],
  swap: ['sWAP cASE', s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')],
  alt: ['aLtErNaTiNg', s => { let i = 0; return [...s].map(c => /\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c).join(''); }],
};
T({
  id: 'case', cat: 'convert', ic: 'Aa', name: 'Case converter',
  desc: 'camelCase, snake_case, kebab-case, PascalCase, Title Case and more, optionally line by line.',
  kw: 'case converter camelcase snake_case kebab pascal title uppercase lowercase constant',
  fields: [
    { k: 's', t: 'area', label: 'Text', def: 'Hello world, this is an example\nXMLHttpRequest userId', rows: 4 },
    { k: 'per', t: 'chk', label: 'Convert each line separately', def: true },
  ],
  run(v) {
    const conv = f => v.per ? v.s.split('\n').map(f).join('\n') : f(v.s);
    return [{ l: 'Styles (click to copy)', kv: Object.values(CASES).map(([n, f]) => [n, conv(f)]) }];
  },
});

// ---------- Spelling alphabet ----------
const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ');
const NATO_DIG = 'Zero One Two Three Four Five Six Seven Eight Nine'.split(' ');
const NL = 'Anton Bernard Cornelis Dirk Eduard Ferdinand Gerard Hendrik Izaak Jan Karel Lodewijk Maria Nico Otto Pieter Quotiënt Richard Simon Teunis Utrecht Victor Willem Xantippe Ypsilon Zaandam'.split(' ');
const NL_DIG = 'nul een twee drie vier vijf zes zeven acht negen'.split(' ');
const PUNCT = { ' ': '(space)', '.': 'period', ',': 'comma', '-': 'hyphen', '_': 'underscore', '@': 'at sign', '/': 'slash', '\\': 'backslash', ':': 'colon', ';': 'semicolon', '!': 'exclamation mark', '?': 'question mark', '#': 'hash', '&': 'ampersand', '+': 'plus', '=': 'equals sign', '*': 'asterisk', '(': 'open parenthesis', ')': 'close parenthesis', '\'': 'apostrophe', '"': 'quotation mark', '$': 'dollar sign', '%': 'percent', '€': 'euro sign', '£': 'pound sign' };
T({
  id: 'spell', cat: 'convert', ic: 'ABC', name: 'Spelling alphabet (NATO)',
  desc: 'Spell text with the NATO phonetic alphabet (or the Dutch one), handy on the phone.',
  kw: 'nato phonetic alphabet spelling alfa bravo charlie icao radio phone',
  fields: [
    { k: 's', t: 'text', label: 'Text', def: 'Server-42' },
    { k: 'a', t: 'sel', label: 'Alphabet', opts: [['nato', 'NATO/ICAO (Alfa, Bravo…)'], ['nl', 'Dutch (Anton, Bernard…)']] },
    { k: 'ij', t: 'chk', label: 'Treat IJ as one letter', def: true, show: v => v.a === 'nl' },
  ],
  run(v) {
    const out = [];
    const chars = [...v.s.normalize('NFC')];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (v.a === 'nl' && v.ij && /i/i.test(ch) && /j/i.test(chars[i + 1] || '')) { out.push([ch + chars[i + 1], 'IJmuiden']); i++; continue; }
      const base = ch.normalize('NFD')[0];
      const up = base.toUpperCase();
      let w;
      if (/[A-Z]/.test(up)) w = (v.a === 'nl' ? NL : NATO)[up.charCodeAt(0) - 65];
      else if (/\d/.test(ch)) w = (v.a === 'nl' ? NL_DIG : NATO_DIG)[+ch];
      else w = PUNCT[ch] || ch;
      if (base !== ch && /[A-Za-z]/.test(base)) w += ` (with ${ch.normalize('NFD').slice(1) === '̈' ? 'diaeresis' : 'accent'})`;
      if (/[A-Z]/.test(ch)) w += ' (capital)';
      out.push([ch, w]);
    }
    return [{ l: 'Spelled', v: out.map(x => x[1]).join(' – ') }, { l: 'Per character', table: { head: ['Character', 'Word'], rows: out } }];
  },
});

// ---------- Text to bytes ----------
const RADIX = { bin: [2, 8], oct: [8, 3], dec: [10, 3], hex: [16, 2] };
T({
  id: 'textbin', cat: 'convert', ic: '01', name: 'Text to binary, hex or decimal',
  desc: 'Convert text (UTF-8) to bytes in binary, octal, decimal or hex, and back.',
  kw: 'text binary ascii hex octal decimal bytes utf-8 convert',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Text → bytes'], ['dec', 'Bytes → text']] },
    { k: 's', t: 'area', label: 'Input', def: 'Hi!', rows: 4 },
    { k: 'f', t: 'sel', label: 'Notation', opts: [['bin', 'Binary'], ['hex', 'Hexadecimal'], ['dec', 'Decimal'], ['oct', 'Octal']] },
    { k: 'sep', t: 'sel', label: 'Separator', opts: [[' ', 'Space'], ['', 'None'], [', ', 'Comma'], ['\n', 'New line']], show: v => v.m === 'enc' },
    { k: 'pre', t: 'chk', label: 'Prefix (0b, 0x, 0o)', show: v => v.m === 'enc' && v.f !== 'dec' },
  ],
  ex: [{ n: 'Back to text', v: { m: 'dec', f: 'bin', s: '01001000 01101001 00100001' } }, { n: 'Hex to text', v: { m: 'dec', f: 'hex', s: '48 69 21' } }],
  run(v) {
    const [r, w] = RADIX[v.f];
    if (v.m === 'enc') {
      const pre = v.pre ? { bin: '0b', hex: '0x', oct: '0o', dec: '' }[v.f] : '';
      return [{ l: 'Bytes', v: Array.from(utf8(v.s), b => pre + b.toString(r).padStart(v.f === 'dec' ? 0 : w, '0')).join(v.sep) }];
    }
    let toks = v.s.trim().split(/[\s,;]+/).filter(Boolean).map(t => t.replace(/^0[xbo]/i, ''));
    if (toks.length === 1 && v.f !== 'dec' && toks[0].length > w) toks = toks[0].match(new RegExp(`.{1,${w}}`, 'g'));
    const bytes = toks.map(t => {
      const n = parseInt(t, r);
      if (!new RegExp(`^[${'0123456789abcdef'.slice(0, r)}]+$`, 'i').test(t) || n > 255) fail(`“${t}” is not a valid byte in this notation (0 to 255).`);
      return n;
    });
    return [{ l: 'Text', v: fromUtf8(Uint8Array.from(bytes)) }];
  },
});

// ---------- Unicode ----------
T({
  id: 'unicode', cat: 'convert', ic: 'U+', name: 'Text to Unicode',
  desc: 'See the code points, UTF-8 and UTF-16 bytes and escapes of every character, or turn escapes back into text.',
  kw: 'unicode codepoint code point utf-8 utf-16 escape emoji character html entity \\u',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Text → code points'], ['dec', 'Escapes → text']] },
    { k: 's', t: 'area', label: 'Input', def: 'Café 👍 €', rows: 3, mono: false },
  ],
  ex: [{ n: 'Escapes to text', v: { m: 'dec', s: 'Caf\\u00e9 \\u{1F44D} U+20AC &#x2603; &amp;' } }],
  run(v) {
    if (v.m === 'dec') {
      const ents = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', copy: '©', reg: '®' };
      const out = v.s
        .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|U\+([0-9a-f]{4,6})|&#x([0-9a-f]+);|&#(\d+);|\\x([0-9a-f]{2})/gi, (m, a, b, c, d, e, f) => {
          const cp = parseInt(a || b || c || d || f, 16) || parseInt(e, 10);
          return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
        })
        .replace(/&([a-z]+);/gi, (m, n) => ents[n.toLowerCase()] ?? m);
      return [{ l: 'Text', v: out }];
    }
    const rows = [];
    for (const ch of v.s) {
      const cp = ch.codePointAt(0);
      const u16 = [...Array(ch.length)].map((_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'));
      rows.push([ch === ' ' ? '(space)' : ch === '\n' ? '(line break)' : ch, 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), cp, toHex(utf8(ch), ' ').toUpperCase(), u16.join(' '), `&#x${cp.toString(16).toUpperCase()};`, cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : '\\u' + u16[0]]);
    }
    const js = rows.map(r => r[6]).join('');
    return [{ l: `${plural(rows.length, 'character', 'characters')}, ${plural(utf8(v.s).length, 'byte', 'bytes')} in UTF-8`, table: { head: ['Character', 'Code point', 'Decimal', 'UTF-8', 'UTF-16', 'HTML', 'JavaScript'], rows } },
      { l: 'As JavaScript escapes', v: js }, { l: 'As code points', v: rows.map(r => r[1]).join(' ') }];
  },
});

// ---------- YAML, JSON, TOML and XML ----------
const YAML_HINTS = [
  [/bad indentation of a mapping entry/, 'bad indentation of a key'], [/bad indentation of a sequence entry/, 'bad indentation of a list item'],
  [/duplicated mapping key/, 'this key appears twice'], [/end of the stream or a document separator is expected/, 'unexpected content; check the indentation'],
  [/can not read a block mapping entry/, 'this line is not a valid “key: value”; is a colon missing or is the indentation off?'],
  [/unexpected end of the stream within a (double|single) quoted scalar/, 'a quote is never closed'], [/missed comma between flow collection entries/, 'a comma is missing between items'],
  [/tab characters must not be used in indentation|end of the stream or a document separator/, 'indent with spaces, not tabs'],
  [/incomplete explicit mapping pair/, 'incomplete key-value pair'], [/unknown tag/, 'unknown type (tag)'], [/unexpected end of the stream/, 'the input ends unexpectedly'],
];
export async function parseAs(fmt, s, opts = {}) {
  if (!s.trim()) fail('The input is empty.');
  if (fmt === 'json') return parseJSON(s);
  if (fmt === 'yaml') {
    const Y = await lib('yaml');
    try {
      const docs = Y.loadAll(s);
      return docs.length === 1 ? docs[0] : docs;
    } catch (e) {
      const why = YAML_HINTS.find(([re]) => re.test(e.reason))?.[1] || e.reason;
      fail(`Invalid YAML at line ${(e.mark?.line ?? 0) + 1}, column ${(e.mark?.column ?? 0) + 1}: ${why}.`);
    }
  }
  if (fmt === 'toml') {
    const TM = await lib('toml');
    try { return TM.parse(s); } catch (e) {
      fail(`Invalid TOML${e.line ? ` at line ${e.line}, column ${e.column}` : ''}: ${String(e.message).split('\n')[0].replace(/^Invalid TOML document: /, '')}.`);
    }
  }
  if (fmt === 'xml') {
    const X = await lib('xml');
    const ok = X.XMLValidator.validate(s);
    if (ok !== true) fail(`Invalid XML at line ${ok.err.line}, column ${ok.err.col}: ${xmlErr(ok.err)}.`);
    const p = new X.XMLParser({ ignoreAttributes: !opts.attrs, attributeNamePrefix: opts.prefix ?? '@', textNodeName: '#text', parseTagValue: !!opts.typed, parseAttributeValue: !!opts.typed, trimValues: true, ignoreDeclaration: true, commentPropName: false });
    return p.parse(s);
  }
}
export function xmlErr(e) {
  const m = e.msg;
  if (/Expected closing tag '(.+?)'.*instead of closing tag '(.+?)'/.test(m)) { const [, a, b] = m.match(/Expected closing tag '(.+?)'.*instead of closing tag '(.+?)'/); return `expected closing tag </${a}>, but found </${b}>`; }
  if (/Closing tag '(.+)' doesn't have proper opening tag/.test(m)) return `closing tag </${m.match(/'(.+?)'/)[1]}> has no matching opening tag`;
  if (/Closing tag '(.+)' is expected inplace of '(.+)'/.test(m)) { const [, a, b] = m.match(/'(.+?)'.*'(.+?)'/); return `expected closing tag </${a}>, but found </${b}>`; }
  if (/Unclosed tag|not closed/i.test(m)) return 'a tag is never closed: ' + (m.match(/'(.+?)'/)?.[1] || '');
  if (/Attribute '(.+)' is repeated/.test(m)) return 'attribute “' + m.match(/'(.+?)'/)[1] + '” appears twice';
  if (/boolean attribute|without value/i.test(m)) return 'an attribute has no value';
  if (/Extra text at the end|Multiple possible root/i.test(m)) return 'there may be only one root element';
  if (/Invalid '\[|startTag|Tag '.*' is an invalid name/i.test(m)) return 'invalid tag name';
  return m;
}
const sortDeep = o => Array.isArray(o) ? o.map(sortDeep) : o && typeof o === 'object' && !(o instanceof Date) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortDeep(o[k])])) : o;
export async function stringifyAs(fmt, o, opts = {}) {
  const ind = opts.indent === 'tab' ? '\t' : Number(opts.indent || 2);
  if (opts.sort) o = sortDeep(o);
  if (fmt === 'json') return JSON.stringify(o, null, ind);
  if (fmt === 'yaml') { const Y = await lib('yaml'); return Y.dump(o, { indent: typeof ind === 'number' ? ind : 2, lineWidth: -1, noRefs: true }); }
  if (fmt === 'toml') {
    const TM = await lib('toml');
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail('TOML needs an object (table) at the top level, not a list or a single value.');
    const nullAt = (x, p) => { if (x === null) return p || '(top level)'; if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { const r = nullAt(y, p ? `${p}.${k}` : k); if (r) return r; } return null; };
    const np = nullAt(o, '');
    if (np) fail(`TOML has no null values, and “${np}” is null. Remove or replace that value in your input.`);
    try { return TM.stringify(o); } catch (e) {
      if (/null|undefined/i.test(e.message)) fail('TOML has no null values. Remove or replace the null values in your input.');
      fail('Converting to TOML failed: ' + e.message);
    }
  }
}
const SAMPLES = {
  yaml: 'services:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    environment:\n      TZ: America/New_York\n    restart: unless-stopped\n',
  json: '{\n  "name": "toolkit",\n  "version": "2.0.0",\n  "active": true,\n  "ports": [80, 443],\n  "database": { "host": "db", "port": 5432 }\n}',
  toml: 'title = "Example"\n\n[server]\nhost = "0.0.0.0"\nport = 8080\n\n[[users]]\nname = "alice"\nroles = ["admin", "dev"]\n',
};
const NAMES = { yaml: 'YAML', json: 'JSON', toml: 'TOML' };
function conv(id, from, to, extra = {}) {
  T({
    id, cat: 'convert', ic: from[0].toUpperCase() + '→' + to[0].toUpperCase(), name: `${NAMES[from]} to ${NAMES[to]}`,
    desc: extra.desc || `Convert ${NAMES[from]} to ${NAMES[to]}.`,
    kw: `${from} ${to} converter convert ${from}2${to} ${from}-to-${to} config`,
    fields: [
      { k: 's', t: 'area', label: NAMES[from], def: SAMPLES[from], rows: 12 },
      ...(to !== 'toml' ? [{ k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces'], ...(to === 'json' ? [['tab', 'Tab']] : [])] }] : []),
      { k: 'sort', t: 'chk', label: 'Sort keys' },
    ],
    async run(v) { return [{ l: NAMES[to], v: await stringifyAs(to, await parseAs(from, v.s), v) }]; },
  });
}
conv('yaml2json', 'yaml', 'json', { desc: 'Convert YAML (e.g. Docker Compose and Kubernetes) to JSON. Multiple documents become a list.' });
conv('yaml2toml', 'yaml', 'toml');
conv('json2yaml', 'json', 'yaml', { desc: 'Convert JSON to clean YAML.' });
conv('json2toml', 'json', 'toml');
conv('toml2json', 'toml', 'json');
conv('toml2yaml', 'toml', 'yaml');

// ---------- Lists ----------
T({
  id: 'listconv', cat: 'convert', ic: 'LST', name: 'List converter',
  desc: 'Turn lines into a comma list, SQL IN (…), JSON array or another shape, with quotes and a prefix or suffix. Or the other way around.',
  kw: 'list converter comma csv sql in json array lines quotes text to list',
  fields: [
    { k: 's', t: 'area', label: 'Input', def: 'apple\npear\nbanana\napple', rows: 7 },
    { k: 'from', t: 'sel', label: 'Input separated by', opts: [['lines', 'Lines'], ['auto', 'Commas, semicolons or lines'], ['ws', 'Spaces and lines']] },
    { k: 'wrap', t: 'sel', label: 'Output as', opts: [['plain', 'Plain list'], ['sqlin', 'SQL IN (…)'], ['json', 'JSON array'], ['paren', '(…)'], ['brackets', '[…]'], ['lines', 'One per line']] },
    { k: 'q', t: 'sel', label: 'Quotes', opts: [['', 'None'], ["'", "Single ' '"], ['"', 'Double " "'], ['`', 'Backtick ` `']] },
    { k: 'sep', t: 'text', label: 'Separator', def: ', ', mono: true },
    { k: 'pre', t: 'text', label: 'Prefix', mono: true },
    { k: 'suf', t: 'text', label: 'Suffix', mono: true },
    { k: 'trim', t: 'chk', label: 'Trim spaces', def: true },
    { k: 'empty', t: 'chk', label: 'Skip empty items', def: true },
    { k: 'uniq', t: 'chk', label: 'Remove duplicates' },
    { k: 'sort', t: 'chk', label: 'Sort' },
    { k: 'lower', t: 'chk', label: 'Lowercase' },
  ],
  ex: [{ n: 'SQL IN', v: { wrap: 'sqlin', q: "'", uniq: true } }, { n: 'Commas to lines', v: { s: 'a, b, c; d', from: 'auto', wrap: 'lines' } }],
  run(v) {
    const splitter = { lines: /\r?\n/, auto: /\s*[,;\n]\s*/, ws: /\s+/ }[v.from];
    let items = v.s.split(splitter);
    if (v.trim) items = items.map(x => x.trim());
    if (v.empty) items = items.filter(x => x !== '');
    if (v.lower) items = items.map(x => x.toLowerCase());
    if (v.uniq) items = [...new Set(items)];
    if (v.sort) items = items.sort((a, b) => a.localeCompare(b, LOCALE, { numeric: true }));
    const q = v.wrap === 'json' ? '"' : v.q;
    const esc = x => q ? x.replaceAll('\\', q === '"' ? '\\\\' : '\\').replaceAll(q, q === "'" && v.wrap === 'sqlin' ? "''" : '\\' + q) : x;
    const quoted = items.map(x => v.pre + q + (v.wrap === 'json' ? JSON.stringify(x).slice(1, -1) : esc(x)) + q + v.suf);
    const sep = v.wrap === 'lines' ? '\n' : v.wrap === 'json' ? ', ' : v.sep;
    let out = quoted.join(sep);
    if (v.wrap === 'sqlin') out = 'IN (' + out + ')';
    if (v.wrap === 'paren') out = '(' + out + ')';
    if (v.wrap === 'brackets' || v.wrap === 'json') out = '[' + out + ']';
    return [{ l: plural(items.length, 'item', 'items'), v: out }];
  },
});

// ---------- XML and JSON ----------
T({
  id: 'xml2json', cat: 'convert', ic: 'X→J', name: 'XML to JSON',
  desc: 'Convert XML to JSON, with or without attributes.',
  kw: 'xml json converter convert xml2json attributes',
  fields: [
    { k: 's', t: 'area', label: 'XML', rows: 10, def: '<?xml version="1.0"?>\n<books>\n  <book id="1" lang="en">\n    <title>Nineteen Eighty-Four</title>\n    <author>George Orwell</author>\n    <year>1949</year>\n  </book>\n  <book id="2" lang="en">\n    <title>Brave New World</title>\n    <author>Aldous Huxley</author>\n    <year>1932</year>\n  </book>\n</books>' },
    { k: 'attrs', t: 'chk', label: 'Include attributes', def: true },
    { k: 'prefix', t: 'text', label: 'Attribute prefix', def: '@', mono: true, show: v => v.attrs },
    { k: 'typed', t: 'chk', label: 'Detect numbers and true/false', def: true },
  ],
  async run(v) { return [{ l: 'JSON', v: JSON.stringify(await parseAs('xml', v.s, v), null, 2) }]; },
});
T({
  id: 'json2xml', cat: 'convert', ic: 'J→X', name: 'JSON to XML',
  desc: 'Convert JSON to XML; keys starting with @ become attributes.',
  kw: 'json xml converter convert json2xml',
  fields: [
    { k: 's', t: 'area', label: 'JSON', rows: 10, def: '{\n  "book": {\n    "@id": "1",\n    "title": "Nineteen Eighty-Four",\n    "author": "George Orwell",\n    "tags": ["novel", "classic"]\n  }\n}' },
    { k: 'root', t: 'text', label: 'Root element (if the JSON has none)', def: 'root' },
    { k: 'prefix', t: 'text', label: 'Attribute prefix', def: '@', mono: true },
    { k: 'decl', t: 'chk', label: 'Add XML declaration', def: true },
    { k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces'], ['0', 'None (one line)']] },
  ],
  async run(v) {
    let o = parseJSON(v.s);
    const X = await lib('xml');
    if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).filter(k => !k.startsWith(v.prefix)).length !== 1) {
      if (!/^[A-Za-z_][\w.-]*$/.test(v.root)) fail('Enter a valid name for the root element, for example root.');
      o = { [v.root]: Array.isArray(o) ? { item: o } : o };
    }
    const b = new X.XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: v.prefix, textNodeName: '#text', format: v.indent !== '0', indentBy: ' '.repeat(Number(v.indent)), suppressEmptyNode: true });
    const xml = b.build(o).trim();
    return [{ l: 'XML', v: (v.decl ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '') + xml }];
  },
});

// ---------- Markdown ----------
T({
  id: 'markdown', cat: 'convert', ic: 'MD', name: 'Markdown to HTML',
  desc: 'Write Markdown and see the result right away; copy the HTML.',
  kw: 'markdown html converter preview md gfm',
  fields: [{ k: 's', t: 'area', label: 'Markdown', rows: 12, mono: true, def: '# Title\n\nThis is **bold**, this is *italic* and this is `code`.\n\n- Point one\n- Point two\n\n| Tool | Category |\n|---|---|\n| Subnet | Network |\n\n> A quote.\n\n[A link](https://example.com)' }],
  async run(v) {
    const { marked } = await lib('marked');
    let html = marked.parse(v.s, { gfm: true, breaks: false });
    if (typeof window !== 'undefined') {
      const { default: purify } = await lib('purify');
      html = purify.sanitize(html);
    }
    return [{ l: 'Preview', html }, { l: 'HTML', v: html.trim() }];
  },
});

// ---------- Contrast ----------
function fixContrast(fg, bg, target) {
  // Adjust the lightness in OKLCH towards black or white until the contrast is sufficient.
  const ok = C.toOklab(fg), ch = Math.hypot(ok.a, ok.b), hue = Math.atan2(ok.b, ok.a);
  const tryDir = up => {
    let lo = ok.L, hi = up ? 1 : 0;
    const at = L => { const c = C.fromOklab(L, ch * Math.cos(hue), ch * Math.sin(hue)); return { r: Math.min(1, Math.max(0, c.r)), g: Math.min(1, Math.max(0, c.g)), b: Math.min(1, Math.max(0, c.b)), a: 1 }; };
    if (C.contrast(at(hi), bg) < target) return null;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (C.contrast(at(mid), bg) >= target) hi = mid; else lo = mid; }
    return at(hi);
  };
  return [tryDir(false), tryDir(true)].filter(Boolean);
}
T({
  id: 'contrast', cat: 'convert', ic: 'WCAG', name: 'Contrast checker (WCAG)',
  desc: 'Check the contrast between text and background color according to WCAG 2, with a suggestion when it falls short.',
  kw: 'contrast wcag accessibility color aa aaa readability a11y',
  fields: [
    { k: 'fg', t: 'text', label: 'Text color', def: '#767676', mono: true },
    { k: 'bg', t: 'text', label: 'Background color', def: '#ffffff', mono: true },
  ],
  ex: [{ n: 'White on blue', v: { fg: '#ffffff', bg: '#2f6fde' } }, { n: 'Gray on white', v: { fg: '#aaaaaa', bg: 'white' } }],
  run(v) {
    const bg = C.parse(v.bg), fg0 = C.parse(v.fg);
    const fg = fg0.a < 1 ? C.over(fg0, { ...bg, a: 1 }) : fg0;
    const r = C.contrast(fg, bg);
    const chk = (min, what) => [what, `${r >= min ? '✓ passes' : '✗ fails'} (minimum ${min}:1)`];
    const res = [
      { l: 'Preview', css: `color:${C.hex(fg)};background:${C.hex(bg)};font-size:18px;padding:16px;border-radius:8px;width:100%`, text: 'The quick brown fox jumps over the lazy dog. Large text looks like this.', cls: 'full' },
      { note: `Contrast ratio ${r.toFixed(2)}:1`, kind: r >= 7 ? 'ok' : r >= 4.5 ? 'ok' : r >= 3 ? 'warn' : 'err' },
      { l: 'WCAG 2.2', kv: [chk(4.5, 'AA, normal text'), chk(3, 'AA, large text (24 px or 18.7 px bold and up)'), chk(7, 'AAA, normal text'), chk(4.5, 'AAA, large text'), chk(3, 'Icons and UI components (1.4.11)')] },
    ];
    if (r < 4.5) {
      const fix = fixContrast(fg, bg, 4.5);
      if (fix.length) res.push({ l: 'Suggested text color (AA, 4.5:1)', kv: fix.map(c => [C.contrast(c, bg).toFixed(2) + ':1', C.hex(c)]) });
    }
    return res;
  },
});

// ---------- Morse ----------
const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.',
  ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
  Ä: '.-.-', Ö: '---.', Ü: '..--', É: '..-..', Ñ: '--.--',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
T({
  id: 'morse', cat: 'convert', ic: '·–', name: 'Morse code',
  desc: 'Text to Morse and back. Letters are separated by a space, words by a slash.',
  kw: 'morse code sos telegraph dot dash',
  fields: [{ k: 's', t: 'area', label: 'Text or Morse', def: 'SOS help', rows: 3 }],
  ex: [{ n: 'Morse to text', v: { s: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..' } }],
  run(v) {
    const s = v.s.trim();
    if (!s) return [{ note: 'Type text or Morse.', kind: 'info' }];
    if (/^[.\-–—·•_\s/|]+$/.test(s)) {
      const out = s.replace(/[–—_]/g, '-').replace(/[·•]/g, '.').split(/\s*[/|]\s*|\s{3,}/).map(w => w.split(/\s+/).filter(Boolean).map(c => MORSE_REV[c] ?? '�').join('')).join(' ');
      return [{ l: 'Text', v: out }, out.includes('�') ? { note: 'Some characters are unknown and shown as �.', kind: 'warn' } : null];
    }
    const unknown = new Set();
    const out = s.toUpperCase().split(/\s+/).map(w => [...w].map(c => MORSE[c] ?? MORSE[c.normalize('NFD')[0]] ?? (unknown.add(c), '')).filter(Boolean).join(' ')).join(' / ');
    return [{ l: 'Morse', v: out }, unknown.size ? { note: 'No Morse for: ' + [...unknown].join(' '), kind: 'warn' } : null];
  },
});
