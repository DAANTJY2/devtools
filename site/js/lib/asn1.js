// Small ASN.1/DER reader and writer, enough for X.509, CSRs and PKCS#7.
import { fail } from '../core/registry.js';
import { toHex, fromB64, utf8 } from '../core/util.js';

export function parse(buf, off = 0, end = buf.length, depth = 0) {
  if (depth > 40) fail('The ASN.1 structure is nested too deeply.');
  const nodes = [];
  while (off < end) {
    const start = off;
    const b = buf[off++];
    const cls = b >> 6, constructed = !!(b & 0x20);
    let tag = b & 0x1f;
    if (tag === 0x1f) { tag = 0; let x; do { x = buf[off++]; tag = tag * 128 + (x & 0x7f); } while (x & 0x80); }
    let len = buf[off++];
    if (len === undefined) fail('Incomplete ASN.1 data: the file appears to be truncated.');
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) fail('Invalid or unsupported ASN.1 length (not DER).');
      len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[off++];
    }
    const hlen = off - start;
    if (off + len > end) fail('Incomplete ASN.1 data: an element is longer than the file.');
    const node = { cls, tag, constructed, start, hlen, len, end: off + len, buf };
    if (constructed) node.kids = parse(buf, off, off + len, depth + 1);
    else if (cls === 0 && (tag === 3 || tag === 4) && len > 1) {
      // Bit strings and octet strings sometimes contain DER themselves (extensions, keys).
      const inner = tag === 3 ? off + 1 : off;
      try { const k = parse(buf, inner, off + len, depth + 1); if (k.length && k[k.length - 1].end === off + len && (buf[inner] === 0x30 || buf[inner] === 0x04 || buf[inner] === 0x03)) node.kids = k; } catch { /* no nested DER */ }
    }
    nodes.push(node);
    off += len;
  }
  return nodes;
}
export const parseOne = buf => {
  const n = parse(buf);
  if (!n.length) fail('It contains no ASN.1 data.');
  return n[0];
};

export const value = n => n.buf.subarray(n.start + n.hlen, n.end);
export const raw = n => n.buf.subarray(n.start, n.end);
export const kid = (n, ...path) => { let x = n; for (const i of path) x = x?.kids?.[i]; return x; };
export const ctx = (n, t) => n?.kids?.find(k => k.cls === 2 && k.tag === t);

export function oid(n) {
  const b = value(n);
  const parts = [];
  let v = 0n;
  for (let i = 0; i < b.length; i++) {
    v = (v << 7n) | BigInt(b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      if (!parts.length) { const f = v < 80n ? v / 40n : 2n; parts.push(f, v - f * 40n); } else parts.push(v);
      v = 0n;
    }
  }
  return parts.join('.');
}
export function bigint(n) {
  const b = value(n);
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  if (b[0] & 0x80) v -= 1n << BigInt(b.length * 8);
  return v;
}
export function str(n) {
  const b = value(n);
  if (n.tag === 30) { let s = ''; for (let i = 0; i < b.length; i += 2) s += String.fromCharCode(b[i] << 8 | b[i + 1]); return s; } // BMPString
  return new TextDecoder(n.tag === 12 ? 'utf-8' : 'latin1').decode(b);
}
export function time(n) {
  const s = str(n);
  const m = /^(\d{2,4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?(Z|[+-]\d{4})?$/.exec(s);
  if (!m) return null;
  let y = +m[1];
  if (m[1].length === 2) y += y < 50 ? 2000 : 1900;
  return new Date(Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6] || 0));
}

// ---------- PEM ----------
export function pemBlocks(text) {
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ type: m[1], der: fromB64(m[2].replace(/^[\w-]+:.*$/gm, '')) });
  return out;
}
export function toPem(type, der) {
  let b = '';
  for (let i = 0; i < der.length; i += 0x8000) b += String.fromCharCode.apply(null, der.subarray(i, i + 0x8000));
  return `-----BEGIN ${type}-----\n${btoa(b).replace(/.{1,64}/g, '$&\n')}-----END ${type}-----\n`;
}

// ---------- writing (DER) ----------
function lenBytes(n) {
  if (n < 128) return [n];
  const out = [];
  while (n) { out.unshift(n & 255); n = Math.floor(n / 256); }
  return [0x80 | out.length, ...out];
}
export function tlv(tag, content) {
  const c = content instanceof Uint8Array ? content : Uint8Array.from(content);
  const head = [tag, ...lenBytes(c.length)];
  const out = new Uint8Array(head.length + c.length);
  out.set(head); out.set(c, head.length);
  return out;
}
const cat = parts => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
export const SEQ = (...p) => tlv(0x30, cat(p));
export const SET = (...p) => tlv(0x31, cat(p));
export const CTX = (n, ...p) => tlv(0xa0 | n, cat(p));
export const NULL = () => tlv(5, []);
export const UTF8 = s => tlv(12, utf8(s));
export const PRINTABLE = s => tlv(19, utf8(s));
export const IA5 = s => tlv(22, utf8(s));
export const OCTETS = b => tlv(4, b);
export const BITS = b => tlv(3, cat([Uint8Array.of(0), b]));
export const BOOL = v => tlv(1, [v ? 0xff : 0]);
export function INT(v) {
  if (v instanceof Uint8Array) { let b = v; let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.subarray(i); return tlv(2, b[0] & 0x80 ? cat([Uint8Array.of(0), b]) : b); }
  const out = []; let x = BigInt(v);
  do { out.unshift(Number(x & 255n)); x >>= 8n; } while (x > 0n);
  if (out[0] & 0x80) out.unshift(0);
  return tlv(2, out);
}
export function OID(s) {
  const p = s.split('.').map(BigInt);
  const out = [Number(p[0] * 40n + p[1])];
  for (const v of p.slice(2)) {
    const bytes = []; let x = v;
    do { bytes.unshift(Number(x & 127n)); x >>= 7n; } while (x > 0n);
    for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
    out.push(...bytes);
  }
  return tlv(6, out);
}

// ---------- names for OIDs ----------
export const OIDS = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber',
  '2.5.4.9': 'street', '2.5.4.17': 'postalCode', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.12': 'title', '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'E', '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC', '2.5.4.15': 'businessCategory',
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.10045.2.1': 'EC', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448', '1.2.840.10040.4.1': 'DSA',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
  '1.2.840.113549.1.1.5': 'SHA-1 with RSA', '1.2.840.113549.1.1.11': 'SHA-256 with RSA', '1.2.840.113549.1.1.12': 'SHA-384 with RSA',
  '1.2.840.113549.1.1.13': 'SHA-512 with RSA', '1.2.840.113549.1.1.10': 'RSA-PSS', '1.2.840.113549.1.1.4': 'MD5 with RSA',
  '1.2.840.10045.4.3.2': 'ECDSA with SHA-256', '1.2.840.10045.4.3.3': 'ECDSA with SHA-384', '1.2.840.10045.4.3.4': 'ECDSA with SHA-512',
  '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512', '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.4': 'SHA-224', '1.2.840.113549.2.5': 'MD5',
  '2.5.29.17': 'Subject Alternative Names (SAN)', '2.5.29.19': 'Basic Constraints', '2.5.29.15': 'Key Usage', '2.5.29.37': 'Extended Key Usage',
  '2.5.29.14': 'Subject Key Identifier', '2.5.29.35': 'Authority Key Identifier', '2.5.29.31': 'CRL Distribution Points', '2.5.29.32': 'Certificate Policies',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access (AIA)', '1.3.6.1.4.1.11129.2.4.2': 'Certificate Transparency (SCTs)',
  '1.3.6.1.5.5.7.3.1': 'Server authentication (TLS server)', '1.3.6.1.5.5.7.3.2': 'Client authentication (TLS client)', '1.3.6.1.5.5.7.3.3': 'Code signing',
  '1.3.6.1.5.5.7.3.4': 'Email protection', '1.3.6.1.5.5.7.3.8': 'Time stamping', '1.3.6.1.5.5.7.3.9': 'OCSP signing',
  '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'CA issuers',
  '1.2.840.113549.1.7.2': 'signedData', '1.2.840.113549.1.7.1': 'data', '1.2.840.113549.1.9.3': 'contentType', '1.2.840.113549.1.9.4': 'messageDigest',
  '1.2.840.113549.1.9.5': 'signingTime', '1.2.840.113549.1.9.14': 'extensionRequest', '1.2.840.113549.1.9.16.2.47': 'signingCertificateV2',
};
export const oidName = o => OIDS[o] || o;

export function name(n) {
  // Name ::= SEQUENCE OF SET OF AttributeTypeAndValue
  const parts = [];
  for (const rdn of n.kids || []) for (const atv of rdn.kids || []) parts.push([oidName(oid(atv.kids[0])), str(atv.kids[1])]);
  return parts;
}
export const nameStr = parts => parts.map(([k, v]) => `${k}=${v}`).join(', ');
export { toHex };
