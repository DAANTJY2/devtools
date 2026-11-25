// Shared helpers for tools. Works in the browser and in Node (for the tests).
import { fail } from './registry.js';

export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const utf8 = s => enc.encode(s);
export const fromUtf8 = (b, fatal = false) => new TextDecoder('utf-8', { fatal }).decode(b);

// Load a library from site/vendor/, only when it is needed.
const cache = {};
export const lib = name => cache[name] ??= import(new URL('../../vendor/' + name + '.js', import.meta.url).href);

// Data from site/data/ (in Node via the file system).
export async function dataFile(name) {
  const url = new URL('../../data/' + name, import.meta.url);
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const r = await fetch(url);
  if (!r.ok) fail('Could not load the data file ' + name + '.');
  return r.text();
}

export const hasSubtle = () => !!globalThis.crypto?.subtle;
export function needSubtle() {
  if (!hasSubtle()) fail('This feature uses Web Crypto and only works over HTTPS or on localhost. Open the site over a secure connection.');
  return crypto.subtle;
}

// ---------- bytes ----------
export const toHex = (b, sep = '') => Array.from(b, x => x.toString(16).padStart(2, '0')).join(sep);
export function fromHex(s) {
  const h = s.replace(/^0x/i, '').replace(/[\s:,-]|0x/gi, '');
  if (!/^[0-9a-f]*$/i.test(h)) fail('This is not valid hexadecimal input: only 0–9 and a–f are allowed.');
  if (h.length % 2) fail('Hexadecimal input must have an even number of characters (two per byte).');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
export function toB64(b, url = false) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  const r = btoa(s);
  return url ? r.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : r;
}
export function fromB64(s) {
  let t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t)) fail('This is not valid Base64: it contains characters that do not occur in Base64.');
  t = t.replace(/=+$/, '');
  if (t.length % 4 === 1) fail('This Base64 is truncated: the length is wrong.');
  t += '='.repeat((4 - t.length % 4) % 4);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function toB32(b, pad = false) {
  let bits = 0, val = 0, out = '';
  for (const x of b) {
    val = (val << 8) | x; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  if (pad) while (out.length % 8) out += '=';
  return out;
}
export function fromB32(s) {
  const t = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const c of t) {
    const i = B32.indexOf(c);
    if (i < 0) fail('Invalid Base32 character “' + c + '”: only A–Z and 2–7 are allowed.');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

// ---------- randomness ----------
export const randBytes = n => crypto.getRandomValues(new Uint8Array(n));
// Uniformly random integer in [0, n) without modulo bias.
export function randInt(n) {
  if (n <= 1) return 0;
  const lim = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}
export const pick = arr => arr[randInt(arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- numbers and text ----------
export const LOCALE = 'en-US';
const nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 6 });
// Formatted number with at most d decimals (no trailing zeros).
export const fnum = (n, d) => d === undefined ? nf.format(n) : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d }).format(n);
export const int = n => new Intl.NumberFormat(LOCALE).format(n);
// Number from text: a dot is the decimal point; commas, spaces and underscores group thousands.
export function num(s, what = 'number') {
  if (typeof s === 'number') return s;
  const t = String(s).trim();
  const n = Number(t.replace(/[\s,_]/g, ''));
  if (t === '' || !Number.isFinite(n)) fail('Enter a valid ' + what + '.');
  return n;
}
export function bytesHuman(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0; while (Math.abs(n) >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return fnum(n, i ? 2 : 0) + ' ' + u[i];
}
export function bytesIEC(n) {
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let i = 0; while (Math.abs(n) >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return fnum(n, i ? 2 : 0) + ' ' + u[i];
}
export function duration(sec) {
  if (!Number.isFinite(sec)) return 'infinite';
  if (sec < 1) return fnum(sec * 1000, 0) + ' ms';
  const parts = [];
  const units = [[31557600, 'year', 'years'], [86400, 'day', 'days'], [3600, 'hour', 'hours'], [60, 'minute', 'minutes'], [1, 'second', 'seconds']];
  for (const [s, one, many] of units) {
    if (sec >= s) { const n = Math.floor(sec / s); sec -= n * s; parts.push(int(n) + ' ' + (n === 1 ? one : many)); }
    if (parts.length === 2) break;
  }
  return parts.join(' and ');
}
export const lines = s => s.split(/\r?\n/);
export const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many);
export const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- JSON with clear error messages ----------
export function parseJSON(s, what = 'JSON') {
  if (!s.trim()) fail('The input is empty. Paste or type ' + what + '.');
  try { return JSON.parse(s); } catch { /* build a clear message below */ }
  const pos = jsonErrorPos(s);
  const before = s.slice(0, pos.i);
  const line = before.split('\n').length, col = pos.i - before.lastIndexOf('\n');
  fail(`Invalid ${what} at line ${line}, column ${col}: ${pos.msg}.`);
}
// Small JSON reader that only finds the position and reason of the first error.
function jsonErrorPos(s) {
  let i = 0;
  const err = msg => { throw { i, msg }; };
  const ws = () => { while (/\s/.test(s[i] || '')) i++; };
  const ch = c => (s[i] === c ? (i++, true) : false);
  const show = () => i >= s.length ? 'the end of the input' : '“' + s[i] + '”';
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++; ws(); if (ch('}')) return;
      for (;;) {
        ws(); if (s[i] !== '"') err(s[i] === "'" ? 'keys and strings must use double quotes' : s[i] === '}' ? 'trailing comma before the closing brace' : 'expected a key in double quotes, but found ' + show());
        str(); ws(); if (!ch(':')) err('expected a colon after the key, but found ' + show());
        value(); ws();
        if (ch('}')) return;
        if (!ch(',')) err('expected a comma or }, but found ' + show());
      }
    }
    if (c === '[') {
      i++; ws(); if (ch(']')) return;
      for (;;) {
        ws(); if (s[i] === ']') err('trailing comma before the closing bracket');
        value(); ws();
        if (ch(']')) return;
        if (!ch(',')) err('expected a comma or ], but found ' + show());
      }
    }
    if (c === '"') return str();
    if (c === "'") err('strings must use double quotes, not single quotes');
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (m && m[0]) { i += m[0].length; return; }
    for (const w of ['true', 'false', 'null']) if (s.startsWith(w, i)) { i += w.length; return; }
    if (s.startsWith('//', i) || s.startsWith('/*', i)) err('comments are not allowed in JSON');
    err('unexpected ' + show());
  };
  const str = () => {
    i++;
    while (i < s.length) {
      const c = s[i];
      if (c === '"') { i++; return; }
      if (c === '\n') err('string runs to the end of the line; is a closing quote missing?');
      if (c === '\\') { i++; if (!/["\\/bfnrtu]/.test(s[i] || '')) err('invalid escape sequence \\' + (s[i] || '')); }
      i++;
    }
    err('the string is not closed with a quote');
  };
  try {
    value(); ws();
    if (i < s.length) err('there is more after the end of the JSON: ' + show());
    return { i: 0, msg: 'unknown error' };
  } catch (e) { if (e && 'msg' in e) return e; throw e; }
}

// Display a value neatly in a table.
export const show = v => v === undefined ? '' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v);
