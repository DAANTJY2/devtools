// IPv4 and IPv6 arithmetic. IPv4 as a number (0 … 2^32−1), IPv6 as a BigInt.
import { fail } from '../core/registry.js';

export function parseIPv4(s, what = 'IPv4 address') {
  const t = String(s).trim();
  const p = t.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x))) fail(`“${t}” is not a valid ${what}. Use four numbers from 0 to 255 separated by dots, such as 192.168.1.10.`);
  const n = p.map(Number);
  const bad = n.findIndex(x => x > 255);
  if (bad >= 0) fail(`In “${t}”, ${n[bad]} is too large; each part of an IPv4 address is at most 255.`);
  return ((n[0] << 24) >>> 0) + (n[1] << 16) + (n[2] << 8) + n[3];
}
export const v4str = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
export const maskOf = p => p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
export function prefixOfMask(m) {
  const n = typeof m === 'number' ? m : parseIPv4(m, 'subnet mask');
  const inv = (~n) >>> 0;
  if ((inv & (inv + 1)) !== 0) fail(`${v4str(n)} is not a valid subnet mask: the ones must be contiguous from the left, such as 255.255.255.0.`);
  return 32 - Math.log2(inv + 1);
}
// "192.168.1.10/24", "192.168.1.10 255.255.255.0" or "192.168.1.10" (then /32)
export function parseCidr4(s, defPrefix = 32) {
  const t = String(s).trim();
  let [ip, rest] = t.includes('/') ? t.split('/') : t.split(/\s+/);
  const addr = parseIPv4(ip);
  let prefix = defPrefix;
  if (rest !== undefined && rest !== '') {
    if (/^\d{1,2}$/.test(rest)) { prefix = +rest; if (prefix > 32) fail('An IPv4 prefix ranges from /0 to /32.'); }
    else prefix = prefixOfMask(rest);
  }
  return { addr, prefix };
}
export function v4info(addr, prefix) {
  const mask = maskOf(prefix);
  const net = (addr & mask) >>> 0;
  const bc = (net | (~mask >>> 0)) >>> 0;
  const size = 2 ** (32 - prefix);
  const hosts = prefix >= 31 ? size : size - 2;
  return { net, bc, mask, wildcard: (~mask) >>> 0, size, hosts, first: prefix >= 31 ? net : net + 1, last: prefix >= 31 ? bc : bc - 1 };
}
export function v4type(n) {
  const inr = (base, p) => ((n & maskOf(p)) >>> 0) === parseIPv4(base);
  if (inr('10.0.0.0', 8) || inr('172.16.0.0', 12) || inr('192.168.0.0', 16)) return 'Private (RFC 1918)';
  if (inr('127.0.0.0', 8)) return 'Loopback';
  if (inr('169.254.0.0', 16)) return 'Link-local (APIPA)';
  if (inr('100.64.0.0', 10)) return 'Carrier-grade NAT (RFC 6598)';
  if (inr('224.0.0.0', 4)) return 'Multicast';
  if (inr('240.0.0.0', 4)) return n === 0xffffffff ? 'Broadcast' : 'Reserved';
  if (inr('0.0.0.0', 8)) return 'This network (0.0.0.0/8)';
  if (inr('192.0.2.0', 24) || inr('198.51.100.0', 24) || inr('203.0.113.0', 24)) return 'Documentation (TEST-NET)';
  if (inr('198.18.0.0', 15)) return 'Benchmarking (RFC 2544)';
  return 'Public';
}
export const v4class = n => { const a = n >>> 24; return a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D (multicast)' : 'E (reserved)'; };
export const bin32 = n => n.toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1.');

// ---------- IPv6 ----------
export function parseIPv6(s) {
  let t = String(s).trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (!t.includes(':')) fail(`“${s}” is not an IPv6 address; an IPv6 address contains colons, such as 2001:db8::1.`);
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (v4) { const n = parseIPv4(v4[1]); t = t.slice(0, -v4[1].length) + (n >>> 16).toString(16) + ':' + (n & 0xffff).toString(16); }
  const dbl = t.split('::');
  if (dbl.length > 2) fail('An IPv6 address may contain “::” only once.');
  const head = dbl[0] ? dbl[0].split(':') : [], tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : [];
  const groups = dbl.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  if (groups.length !== 8 || (dbl.length === 2 && head.length + tail.length > 7)) fail('An IPv6 address has eight groups; use “::” to shorten runs of zero groups.');
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) fail(`“${g}” is not a valid IPv6 group: use one to four hexadecimal characters.`);
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}
export const v6groups = n => Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(112 - i * 16)) & 0xffffn));
export const v6full = n => v6groups(n).map(g => g.toString(16).padStart(4, '0')).join(':');
export function v6str(n) {
  const g = v6groups(n);
  // replace the longest run of zeros (at least two) with ::  (RFC 5952)
  let best = -1, len = 0;
  for (let i = 0; i < 8;) { if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > len && j - i > 1) { best = i; len = j - i; } i = j; } else i++; }
  const hex = g.map(x => x.toString(16));
  if (best < 0) return hex.join(':');
  return hex.slice(0, best).join(':') + '::' + hex.slice(best + len).join(':');
}
export const v6mask = p => p === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - p)) - 1n);
export function parseCidr6(s) {
  const [ip, p] = String(s).trim().split('/');
  const addr = parseIPv6(ip);
  const prefix = p === undefined ? 128 : +p;
  if (!/^\d{1,3}$/.test(p ?? '128') || prefix > 128) fail('An IPv6 prefix ranges from /0 to /128.');
  return { addr, prefix };
}
export function v6type(n) {
  const inr = (base, p) => (n & v6mask(p)) === parseIPv6(base);
  if (n === 0n) return 'Unspecified (::)';
  if (n === 1n) return 'Loopback (::1)';
  if (inr('::ffff:0:0', 96)) return 'IPv4-mapped';
  if (inr('64:ff9b::', 96)) return 'NAT64 (64:ff9b::/96)';
  if (inr('fe80::', 10)) return 'Link-local';
  if (inr('fc00::', 7)) return 'Unique Local Address (ULA, private)';
  if (inr('ff00::', 8)) return 'Multicast';
  if (inr('2001:db8::', 32)) return 'Documentation (2001:db8::/32)';
  if (inr('2001::', 32)) return 'Teredo tunnel';
  if (inr('2002::', 16)) return '6to4';
  if (inr('2000::', 3)) return 'Global unicast (public)';
  return 'Reserved';
}

// Smallest list of CIDR blocks that exactly covers [start, end]. Works for 32 and 128 bits.
export function rangeToCidrs(start, end, bits = 32) {
  let s = BigInt(start), e = BigInt(end);
  if (s > e) fail('The start address comes after the end address.');
  const out = [];
  const B = BigInt(bits);
  while (s <= e) {
    let size = 0n;
    while (size < B && (s & ((1n << (size + 1n)) - 1n)) === 0n && s + (1n << (size + 1n)) - 1n <= e) size++;
    out.push([s, Number(B - size)]);
    s += 1n << size;
    if (out.length > 10000) fail('This range produces more than 10,000 blocks.');
  }
  return out;
}
