import { T, fail } from '../core/registry.js';
import {
  utf8, fromUtf8, lib, toHex, fromHex, toB64, fromB64, toB32, randBytes, randInt, shuffle, int, fnum,
  parseJSON, duration, needSubtle, hasSubtle, plural, concat,
} from '../core/util.js';
import { crc32, hashers } from '../lib/hash.js';
import * as A from '../lib/asn1.js';
import { decodeCert, decodeCsr } from '../lib/x509.js';

const enc3 = [['text', 'Text (UTF-8)'], ['hex', 'Hex'], ['base64', 'Base64']];
const toBytes = (s, e) => e === 'hex' ? fromHex(s) : e === 'base64' ? fromB64(s) : utf8(s);
const outFmt = (b, f) => f === 'base64' ? toB64(b) : f === 'HEX' ? toHex(b).toUpperCase() : toHex(b);

// ---------- Token generator ----------
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ALPHABETS = {
  alnum: ALNUM, hex: '0123456789abcdef', b64url: ALNUM + '-_', b32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
  lower: 'abcdefghijklmnopqrstuvwxyz0123456789', digits: '0123456789',
};
export const randomString = (len, alphabet) => Array.from({ length: len }, () => alphabet[randInt(alphabet.length)]).join('');
T({
  id: 'token', cat: 'crypto', ic: 'TK', name: 'Token generator', regen: true,
  desc: 'Random API keys, secrets and session IDs in hex, Base64URL, Base32 or alphanumeric.',
  kw: 'token api key secret random session id generator',
  fields: [
    { k: 'fmt', t: 'sel', label: 'Format', opts: [['alnum', 'Alphanumeric (A–Z, a–z, 0–9)'], ['hex', 'Hex'], ['b64url', 'Base64URL'], ['b32', 'Base32'], ['lower', 'Lowercase letters and digits'], ['digits', 'Digits only']] },
    { k: 'len', t: 'num', label: 'Length (characters)', def: 32, min: 4, max: 512 },
    { k: 'n', t: 'num', label: 'Count', def: 5, min: 1, max: 200 },
    { k: 'pre', t: 'text', label: 'Prefix (optional)', ph: 'e.g. sk_live_', mono: true },
  ],
  ex: [{ n: 'Hex 64', v: { fmt: 'hex', len: 64 } }, { n: 'API key', v: { fmt: 'alnum', len: 40, pre: 'sk_' } }, { n: 'PIN', v: { fmt: 'digits', len: 6, n: 10 } }],
  run(v) {
    const len = Math.round(v.len), n = Math.round(v.n);
    if (!(len >= 1 && len <= 4096)) fail('Choose a length between 1 and 4096 characters.');
    if (!(n >= 1 && n <= 1000)) fail('Choose a count between 1 and 1000.');
    const a = ALPHABETS[v.fmt];
    const list = Array.from({ length: n }, () => v.pre + randomString(len, a));
    return [{ l: n === 1 ? 'Token' : 'Tokens', v: list.join('\n') },
      { note: `Entropy: ${fnum(len * Math.log2(a.length), 0)} bits per token (${a.length} possible characters per position).`, kind: 'info' }];
  },
});

// ---------- Hash text ----------
T({
  id: 'hash', cat: 'crypto', ic: '#', name: 'Hash text',
  desc: 'Compute MD5, SHA-1, SHA-2, SHA-3, RIPEMD-160 and CRC32 of a text, in hex or Base64.',
  kw: 'hash md5 sha1 sha256 sha512 sha3 ripemd crc32 checksum digest keccak',
  fields: [
    { k: 's', t: 'area', label: 'Input', def: 'Hello world', rows: 4 },
    { k: 'in', t: 'sel', label: 'Input is', opts: enc3 },
    { k: 'out', t: 'sel', label: 'Output', opts: [['hex', 'hex (lowercase)'], ['HEX', 'HEX (uppercase)'], ['base64', 'Base64']] },
  ],
  ex: [{ n: 'Empty', v: { s: '' } }, { n: 'abc', v: { s: 'abc' } }],
  async run(v) {
    const b = toBytes(v.s, v.in);
    const H = await hashers();
    const rows = Object.entries(H).map(([name, f]) => [name, outFmt(f(b), v.out)]);
    const c = crc32(b);
    rows.push(['CRC32', v.out === 'base64' ? toB64(Uint8Array.of(c >>> 24, c >>> 16 & 255, c >>> 8 & 255, c & 255)) : outFmt(fromHex(c.toString(16).padStart(8, '0')), v.out)]);
    return [{ l: `Hashes of ${plural(b.length, 'byte', 'bytes')}`, kv: rows },
      { note: 'MD5 and SHA-1 are no longer safe for signatures or passwords; use them only as checksums.', kind: 'info' }];
  },
});

// ---------- Bcrypt ----------
T({
  id: 'bcrypt', cat: 'crypto', ic: 'BC', name: 'Bcrypt', btn: 'Run',
  desc: 'Hash a password with bcrypt, or check whether a password matches a bcrypt hash.',
  kw: 'bcrypt password hash compare verify salt cost',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['hash', 'Hash'], ['cmp', 'Compare']] },
    { k: 'pw', t: 'text', label: 'Password', def: 'secret123' },
    { k: 'cost', t: 'range', label: 'Cost (2^n rounds)', def: 10, min: 4, max: 15, show: v => v.m === 'hash' },
    { k: 'hash', t: 'text', label: 'Bcrypt hash', mono: true, def: '$2b$10$WrDGmHC.2o6hbdfN7rTATO76UYKQJfkF30DDOOIPgJV/DLJ/9fzji', show: v => v.m === 'cmp' },
  ],
  ex: [{ n: 'Compare', v: { m: 'cmp', pw: 'password', hash: '$2b$10$WrDGmHC.2o6hbdfN7rTATO76UYKQJfkF30DDOOIPgJV/DLJ/9fzji' } }],
  async run(v) {
    const { default: bcrypt } = await lib('bcrypt');
    if (utf8(v.pw).length > 72) fail('Bcrypt uses at most 72 bytes of a password; this password is longer.');
    if (v.m === 'hash') {
      const t = performance.now();
      const hash = await bcrypt.hash(v.pw, Math.round(v.cost));
      return [{ l: 'Bcrypt hash', v: hash }, { note: `Computed in ${fnum(performance.now() - t, 0)} ms. The random salt produces a different hash every time.`, kind: 'info' }];
    }
    if (!/^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(v.hash.trim())) fail('This is not a valid bcrypt hash. A bcrypt hash starts with $2a$, $2b$ or $2y$ and is 60 characters long.');
    const ok = await bcrypt.compare(v.pw, v.hash.trim());
    return [{ note: ok ? 'The password matches this hash.' : 'The password does not match this hash.', kind: ok ? 'ok' : 'err' }];
  },
});

// ---------- UUID ----------
const NS = { dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8', oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8', x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8' };
const fmtUuid = b => { const h = toHex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const parseUuid = s => {
  const h = s.trim().replace(/^urn:uuid:/i, '').replace(/[{}-]/g, '');
  if (!/^[0-9a-f]{32}$/i.test(h)) fail('This is not a valid UUID. A UUID consists of 32 hexadecimal characters, usually written as 8-4-4-4-12.');
  return fromHex(h);
};
let v1seq = randInt(0x4000), lastV1 = 0;
export async function uuid(ver, ns, name) {
  let b;
  if (ver === 'nil') return '00000000-0000-0000-0000-000000000000';
  if (ver === 'max') return 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  if (ver === 'v4') b = randBytes(16);
  else if (ver === 'v7') {
    b = randBytes(16);
    const ms = BigInt(Date.now());
    for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 255n);
  } else if (ver === 'v1') {
    let t = (BigInt(Date.now()) + 12219292800000n) * 10000n;
    if (t <= BigInt(lastV1)) t = BigInt(lastV1) + 1n;
    lastV1 = t;
    b = new Uint8Array(16);
    const low = t & 0xffffffffn, mid = (t >> 32n) & 0xffffn, hi = (t >> 48n) & 0x0fffn;
    b.set([Number(low >> 24n), Number(low >> 16n & 255n), Number(low >> 8n & 255n), Number(low & 255n), Number(mid >> 8n), Number(mid & 255n), Number(hi >> 8n), Number(hi & 255n)]);
    v1seq = (v1seq + 1) & 0x3fff;
    b[8] = v1seq >> 8; b[9] = v1seq & 255;
    const node = randBytes(6); node[0] |= 1; // multicast bit: not a real MAC address
    b.set(node, 10);
  } else {
    const H = await lib('hashes');
    const data = concat(parseUuid(NS[ns] || ns), utf8(name));
    b = (ver === 'v3' ? H.md5 : H.sha1)(data).slice(0, 16);
  }
  const vn = { v1: 1, v3: 3, v4: 4, v5: 5, v7: 7 }[ver];
  b[6] = (b[6] & 0x0f) | (vn << 4);
  b[8] = (b[8] & 0x3f) | 0x80;
  return fmtUuid(b);
}
T({
  id: 'uuid', cat: 'crypto', ic: 'ID', name: 'UUID generator', regen: true,
  desc: 'Generate UUIDs (nil, v1, v3, v4, v5, v7) or see what is inside an existing UUID.',
  kw: 'uuid guid generator v4 v7 v1 v5 v3 nil unique id',
  fields: [
    { k: 'ver', t: 'sel', label: 'Version', def: 'v4', opts: [['v4', 'v4 (random)'], ['v7', 'v7 (time + random, sortable)'], ['v1', 'v1 (time)'], ['v5', 'v5 (SHA-1 of name)'], ['v3', 'v3 (MD5 of name)'], ['nil', 'Nil (all zeros)'], ['max', 'Max (all f)']] },
    { k: 'n', t: 'num', label: 'Count', def: 5, min: 1, max: 500, show: v => ['v4', 'v7', 'v1'].includes(v.ver) },
    { k: 'ns', t: 'sel', label: 'Namespace', opts: [['dns', 'DNS'], ['url', 'URL'], ['oid', 'OID'], ['x500', 'X.500']], show: v => v.ver === 'v3' || v.ver === 'v5' },
    { k: 'name', t: 'text', label: 'Name', def: 'www.example.com', show: v => v.ver === 'v3' || v.ver === 'v5' },
    { k: 'up', t: 'chk', label: 'Uppercase' },
    { k: 'nodash', t: 'chk', label: 'No hyphens' },
    { k: 'braces', t: 'chk', label: 'With braces { }' },
    { k: 'inspect', t: 'text', label: 'Inspect a UUID (optional)', ph: 'Paste a UUID to see its version and time', mono: true, full: true },
  ],
  ex: [{ n: 'v5 of example.com', v: { ver: 'v5', ns: 'dns', name: 'www.example.com' } }, { n: 'Inspect', v: { inspect: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f' } }],
  async run(v) {
    const n = ['v4', 'v7', 'v1'].includes(v.ver) ? Math.round(v.n) : 1;
    if (!(n >= 1 && n <= 5000)) fail('Choose a count between 1 and 5000.');
    const list = [];
    for (let i = 0; i < n; i++) {
      let u = await uuid(v.ver, v.ns, v.name);
      if (v.nodash) u = u.replace(/-/g, '');
      if (v.up) u = u.toUpperCase();
      if (v.braces) u = '{' + u + '}';
      list.push(u);
    }
    const res = [{ l: n === 1 ? 'UUID' : 'UUIDs', v: list.join('\n') }];
    if (v.inspect.trim()) {
      const b = parseUuid(v.inspect);
      const ver = b[6] >> 4, variant = b[8] >> 6 === 2 ? 'RFC 9562 (10xx)' : b[8] >> 7 === 0 ? 'NCS (0xxx)' : b[8] >> 5 === 6 ? 'Microsoft (110x)' : 'reserved';
      const kv = [['Normalized', fmtUuid(b)], ['Version', String(ver)], ['Variant', variant]];
      if (ver === 7) kv.push(['Timestamp', new Date(Number(BigInt('0x' + toHex(b.slice(0, 6))))).toISOString()]);
      if (ver === 1) {
        const h = toHex(b);
        const t = BigInt('0x' + h.slice(13, 16) + h.slice(8, 12) + h.slice(0, 8));
        kv.push(['Timestamp', new Date(Number(t / 10000n - 12219292800000n)).toISOString()], ['Node', toHex(b.slice(10), ':')]);
      }
      res.push({ l: 'Inspection', kv });
    }
    return res;
  },
});

// ---------- ULID ----------
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid(ms = Date.now()) {
  let t = '';
  for (let i = 0; i < 10; i++) { t = CROCK[ms % 32] + t; ms = Math.floor(ms / 32); }
  return t + Array.from({ length: 16 }, () => CROCK[randInt(32)]).join('');
}
T({
  id: 'ulid', cat: 'crypto', ic: 'UL', name: 'ULID generator', regen: true,
  desc: 'Sortable 26-character unique IDs (timestamp + randomness).',
  kw: 'ulid unique id sortable crockford base32',
  fields: [
    { k: 'n', t: 'num', label: 'Count', def: 5, min: 1, max: 500 },
    { k: 'lower', t: 'chk', label: 'Lowercase' },
    { k: 'inspect', t: 'text', label: 'Decode a ULID (optional)', mono: true, ph: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
  ],
  ex: [{ n: 'Decode', v: { inspect: '01ARZ3NDEKTSV4RRFFQ69G5FAV' } }],
  run(v) {
    const n = Math.round(v.n);
    if (!(n >= 1 && n <= 5000)) fail('Choose a count between 1 and 5000.');
    const list = Array.from({ length: n }, () => v.lower ? ulid().toLowerCase() : ulid());
    const res = [{ l: n === 1 ? 'ULID' : 'ULIDs', v: list.join('\n') }];
    const s = v.inspect.trim().toUpperCase();
    if (s) {
      if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(s)) fail('This is not a valid ULID: 26 characters of Crockford Base32 (without I, L, O and U).');
      let ms = 0; for (const c of s.slice(0, 10)) ms = ms * 32 + CROCK.indexOf(c);
      res.push({ l: 'Decoded', kv: [['Timestamp (ms)', String(ms)], ['Time (UTC)', new Date(ms).toISOString()], ['Random part', s.slice(10)]] });
    }
    return res;
  },
});

// ---------- Encryption ----------
const GCM_ITER = 100000;
async function pbkdf(pass, salt) {
  if (hasSubtle()) {
    const k = await crypto.subtle.importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: GCM_ITER }, k, 256));
  }
  const H = await lib('hashes');
  return H.pbkdf2(H.sha256, utf8(pass), salt, { c: GCM_ITER, dkLen: 32 });
}
const pemDer = (pem, what) => {
  const b = A.pemBlocks(pem);
  if (!b.length) fail(`Paste a ${what} in PEM format (starts with -----BEGIN …-----).`);
  return b[0];
};
T({
  id: 'aes', cat: 'crypto', ic: 'AE', name: 'Encrypt and decrypt text',
  desc: 'Encrypt text with AES-GCM, AES, TripleDES, Rabbit, RC4 or RSA-OAEP, and decrypt it again.',
  kw: 'encrypt decrypt cipher aes gcm tripledes 3des rabbit rc4 rsa oaep password',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['enc', 'Encrypt'], ['dec', 'Decrypt']] },
    { k: 'alg', t: 'sel', label: 'Method', opts: [['gcm', 'AES-256-GCM with PBKDF2 (recommended)'], ['aes', 'AES (CryptoJS/OpenSSL format)'], ['3des', 'TripleDES'], ['rabbit', 'Rabbit'], ['rc4', 'RC4'], ['rsa', 'RSA-OAEP (key pair)']] },
    { k: 's', t: 'area', label: 'Text', def: 'This is secret.', rows: 5 },
    { k: 'key', t: 'text', label: 'Password', def: 'my-password', show: v => v.alg !== 'rsa' },
    { k: 'pem', t: 'area', label: 'Key (PEM): public to encrypt, private to decrypt', rows: 5, show: v => v.alg === 'rsa', ph: '-----BEGIN PUBLIC KEY-----' },
  ],
  ex: [
    { n: 'Decrypt AES-GCM', v: { m: 'dec', alg: 'gcm', key: 'my-password', s: '/8VLIXNfkblcFtdcj5QR/yJgzDV+QJxKdoXpgHEkB5aatVAElZzI8iZhCJaWt4Z3iUF0b5sYDqlUTxE=' } },
    { n: 'Decrypt OpenSSL AES', v: { m: 'dec', alg: 'aes', key: 'secret', s: 'U2FsdGVkX18JygFhIdQ6cLkg5QGkU2IvFdR1Io1yXG8=' } },
  ],
  async run(v) {
    if (v.alg === 'rsa') {
      const subtle = needSubtle();
      if (!v.pem.trim()) return [{ note: 'Paste a public key (to encrypt) or a private key (to decrypt). You can create a key pair with the RSA key pair generator.', kind: 'info' }];
      const blk = pemDer(v.pem, 'key');
      if (v.m === 'enc') {
        if (!/PUBLIC KEY/.test(blk.type)) fail('Use a public key (-----BEGIN PUBLIC KEY-----) to encrypt.');
        const key = await subtle.importKey('spki', blk.der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']).catch(() => fail('This public key could not be read. Use an RSA key in SPKI PEM format.'));
        const ct = await subtle.encrypt({ name: 'RSA-OAEP' }, key, utf8(v.s)).catch(() => fail('The text is too long for RSA. A 2048-bit key fits at most 190 bytes.'));
        return [{ l: 'Encrypted (Base64)', v: toB64(new Uint8Array(ct)) }];
      }
      if (!/PRIVATE KEY/.test(blk.type) || /RSA PRIVATE/.test(blk.type)) fail('Use a private key in PKCS#8 format (-----BEGIN PRIVATE KEY-----) to decrypt.');
      const key = await subtle.importKey('pkcs8', blk.der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']).catch(() => fail('This private key could not be read.'));
      const pt = await subtle.decrypt({ name: 'RSA-OAEP' }, key, fromB64(v.s)).catch(() => fail('Decryption failed: wrong key or corrupted data.'));
      return [{ l: 'Decrypted', v: fromUtf8(new Uint8Array(pt)) }];
    }
    if (!v.key) fail('Enter a password.');
    if (v.alg === 'gcm') {
      const { gcm } = await lib('ciphers');
      if (v.m === 'enc') {
        const salt = randBytes(16), iv = randBytes(12);
        const ct = gcm(await pbkdf(v.key, salt), iv).encrypt(utf8(v.s));
        return [{ l: 'Encrypted (Base64: salt + IV + data)', v: toB64(concat(salt, iv, ct)) },
          { note: `AES-256-GCM, key derived with PBKDF2-SHA-256 (${int(GCM_ITER)} rounds). Every encryption produces a different result.`, kind: 'info' }];
      }
      const all = fromB64(v.s);
      if (all.length < 16 + 12 + 16) fail('This input is too short to be AES-GCM data from this tool.');
      let pt;
      try { pt = gcm(await pbkdf(v.key, all.slice(0, 16)), all.slice(16, 28)).decrypt(all.slice(28)); } catch { fail('Decryption failed: the password is wrong or the data has been modified.'); }
      return [{ l: 'Decrypted', v: fromUtf8(pt) }];
    }
    const C = await lib('cryptojs');
    const algo = { aes: C.AES, '3des': C.TripleDES, rabbit: C.Rabbit, rc4: C.RC4 }[v.alg];
    if (v.m === 'enc') return [{ l: 'Encrypted (Base64, OpenSSL format)', v: algo.encrypt(v.s, v.key).toString() },
      v.alg === 'rc4' || v.alg === '3des' ? { note: (v.alg === 'rc4' ? 'RC4' : 'TripleDES') + ' is outdated. Use it only for compatibility with legacy systems.', kind: 'warn' } : null];
    let out;
    try { out = algo.decrypt(v.s.trim(), v.key).toString(C.Utf8); } catch { out = ''; }
    if (!out) fail('Decryption failed: the password or method is wrong, or the input is not valid encrypted text.');
    return [{ l: 'Decrypted', v: out }];
  },
});

// ---------- BIP39 ----------
T({
  id: 'bip39', cat: 'crypto', ic: 'B39', name: 'BIP39 passphrase generator', regen: true,
  desc: 'Generate a 12- to 24-word recovery phrase from the standard BIP39 word list, or validate one.',
  kw: 'bip39 mnemonic recovery seed phrase passphrase words wallet',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['gen', 'Generate'], ['check', 'Validate']] },
    { k: 'words', t: 'sel', label: 'Number of words', opts: [['12', '12 words (128 bit)'], ['15', '15 words'], ['18', '18 words'], ['21', '21 words'], ['24', '24 words (256 bit)']], show: v => v.m === 'gen' },
    { k: 'phrase', t: 'area', label: 'Recovery phrase', rows: 3, show: v => v.m === 'check', def: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' },
  ],
  async run(v) {
    const B = await lib('bip39');
    if (v.m === 'gen') {
      const m = B.generateMnemonic(B.wordlist, Number(v.words) / 3 * 32);
      return [{ l: 'Recovery phrase', v: m }, { l: 'Numbered', table: { head: ['#', 'Word'], rows: m.split(' ').map((w, i) => [i + 1, w]) } },
        { l: 'Entropy (hex)', v: toHex(B.mnemonicToEntropy(m, B.wordlist)) },
        { note: 'Only use a recovery phrase for real funds if you use this page offline and never store the phrase digitally.', kind: 'warn' }];
    }
    const words = v.phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(words.length)) fail(`A BIP39 phrase has 12, 15, 18, 21 or 24 words; this one has ${words.length}.`);
    const bad = words.filter(w => !B.wordlist.includes(w));
    if (bad.length) fail('These words are not in the BIP39 list: ' + bad.join(', ') + '.');
    const ok = B.validateMnemonic(words.join(' '), B.wordlist);
    return [{ note: ok ? 'Valid recovery phrase: the checksum is correct.' : 'All words exist, but the checksum is wrong. Check the order and spelling.', kind: ok ? 'ok' : 'err' },
      ok ? { l: 'Entropy (hex)', v: toHex(B.mnemonicToEntropy(words.join(' '), B.wordlist)) } : null];
  },
});

// ---------- HMAC ----------
T({
  id: 'hmac', cat: 'crypto', ic: 'HM', name: 'HMAC generator',
  desc: 'Compute an HMAC with a secret key (MD5, SHA-1, SHA-2 and SHA-3).',
  kw: 'hmac mac sha256 signature webhook key',
  fields: [
    { k: 's', t: 'area', label: 'Message', def: 'what do ya want for nothing?', rows: 4 },
    { k: 'key', t: 'text', label: 'Secret key', def: 'Jefe' },
    { k: 'kenc', t: 'sel', label: 'Key is', opts: enc3 },
    { k: 'alg', t: 'sel', label: 'Algorithm', def: 'SHA-256', opts: ['MD5', 'SHA-1', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-512'] },
    { k: 'out', t: 'sel', label: 'Output', opts: [['hex', 'hex'], ['HEX', 'HEX'], ['base64', 'Base64']] },
  ],
  async run(v) {
    const H = await hashers();
    const { hmac } = await lib('hashes');
    const mac = hmac(H[v.alg], toBytes(v.key, v.kenc), utf8(v.s));
    return [{ l: 'HMAC-' + v.alg, v: outFmt(mac, v.out) }];
  },
});

// ---------- RSA key pair ----------
const sshString = b => concat(Uint8Array.of(b.length >>> 24, b.length >>> 16 & 255, b.length >>> 8 & 255, b.length & 255), b);
const mpint = b => sshString(b[0] & 0x80 ? concat(Uint8Array.of(0), b) : b);
T({
  id: 'rsa', cat: 'crypto', ic: 'RSA', name: 'RSA key pair generator', btn: 'Generate key pair', browser: true,
  desc: 'Create an RSA key pair (PEM and OpenSSH) locally in your browser.',
  kw: 'rsa key pair pem openssh ssh-rsa public private',
  fields: [
    { k: 'bits', t: 'sel', label: 'Key size', def: '2048', opts: [['2048', '2048 bit'], ['3072', '3072 bit'], ['4096', '4096 bit']] },
    { k: 'use', t: 'sel', label: 'Usage', opts: [['RSASSA-PKCS1-v1_5', 'Signing (PKCS#1 v1.5)'], ['RSA-OAEP', 'Encryption (OAEP)'], ['RSA-PSS', 'Signing (PSS)']] },
    { k: 'comment', t: 'text', label: 'OpenSSH comment', def: 'user@host' },
  ],
  async run(v) {
    const subtle = needSubtle();
    const t = performance.now();
    const kp = await subtle.generateKey({ name: v.use, modulusLength: Number(v.bits), publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true,
      v.use === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify']);
    const spki = new Uint8Array(await subtle.exportKey('spki', kp.publicKey));
    const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey));
    const jwk = await subtle.exportKey('jwk', kp.publicKey);
    const ssh = toB64(concat(sshString(utf8('ssh-rsa')), mpint(fromB64(jwk.e)), mpint(fromB64(jwk.n))));
    return [{ l: 'Public key (PEM)', v: A.toPem('PUBLIC KEY', spki) }, { l: 'Private key (PEM, PKCS#8)', v: A.toPem('PRIVATE KEY', pkcs8) },
      { l: 'OpenSSH public key', v: `ssh-rsa ${ssh}${v.comment ? ' ' + v.comment : ''}` },
      { note: `Generated in ${fnum((performance.now() - t) / 1000, 1)} s. Keep the private key safe; this page does not remember it.`, kind: 'ok' }];
  },
});

// ---------- Password strength ----------
const COMMON = 'password 123456 12345678 123456789 1234567890 qwerty abc123 111111 123123 welcome welcome1 password1 secret letmein iloveyou admin monkey dragon sunshine princess football baseball master shadow superman trustno1 passw0rd p@ssw0rd qwertyuiop azerty summer winter spring autumn michael jordan charlie london hello test test123 changeme default root toor login freedom whatever starwars pokemon computer internet'.split(' ');
export function pwStrength(pw) {
  const findings = [];
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^\w\s]|_/.test(pw)) pool += 33;
  if (/\s/.test(pw)) pool += 1;
  if (/[^\x00-\x7f]/.test(pw)) pool += 100;
  const len = [...pw].length;
  let bits = len * Math.log2(Math.max(pool, 1));
  const low = pw.toLowerCase();
  const unleet = t => t.replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[$5]/g, 's').replace(/7/g, 't');
  const leet = unleet(low);
  const base = unleet(low.replace(/[\d\W_]+$/, '')); // without trailing digits and symbols
  if (COMMON.includes(low) || COMMON.includes(leet)) { bits = Math.min(bits, 8); findings.push('This password appears on lists of commonly used passwords.'); }
  else if (COMMON.some(w => w.length >= 4 && (base === w || leet.includes(w)))) { bits = Math.min(bits, 18 + (len - base.length) * 3.3); findings.push('Contains a common word or password.'); }
  if (/(.)\1{2,}/.test(pw)) { bits -= 6; findings.push('Contains repeated characters (such as “aaa”).'); }
  const seqs = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'azertyuiop'];
  if (seqs.some(s => { for (let i = 0; i + 4 <= s.length; i++) if (low.includes(s.slice(i, i + 4)) || low.includes([...s.slice(i, i + 4)].reverse().join(''))) return true; return false; })) { bits -= 8; findings.push('Contains a sequence or keyboard pattern (such as “1234” or “qwer”).'); }
  if (/(19|20)\d\d/.test(pw)) { bits -= 4; findings.push('Contains a year.'); }
  if (len < 12) findings.push('Shorter than 12 characters. Longer passwords are much stronger.');
  if (pool <= 26 && len) findings.push('Uses only one kind of character.');
  bits = Math.max(0, bits);
  const label = bits < 28 ? 'Very weak' : bits < 36 ? 'Weak' : bits < 60 ? 'Fair' : bits < 80 ? 'Strong' : 'Very strong';
  return { bits, label, findings, pool, len };
}
T({
  id: 'pwcheck', cat: 'crypto', ic: 'PW', name: 'Password strength',
  desc: 'Estimate the entropy and crack time of a password. Everything stays in your browser.',
  kw: 'password strength entropy crack time analysis checker',
  fields: [{ k: 'pw', t: 'text', label: 'Password', def: 'Summer2024!' }],
  ex: [{ n: 'Weak', v: { pw: 'welcome1' } }, { n: 'Passphrase', v: { pw: 'correct horse battery staple' } }, { n: 'Random', v: { pw: 'q7#Lp!x2Vr9@kM4z' } }],
  run(v) {
    if (!v.pw) return [{ note: 'Type a password to see its strength.', kind: 'info' }];
    const r = pwStrength(v.pw);
    const guesses = 2 ** r.bits / 2;
    const kind = r.bits < 36 ? 'err' : r.bits < 60 ? 'warn' : 'ok';
    return [{ note: `${r.label}: about ${fnum(r.bits, 0)} bits of entropy.`, kind },
      { l: 'Estimated crack time (average)', kv: [
        ['Online, 100 guesses per hour', duration(guesses / (100 / 3600))],
        ['Online, 10 guesses per second', duration(guesses / 10)],
        ['Offline, slow hash (bcrypt), 10⁴ per second', duration(guesses / 1e4)],
        ['Offline, fast hash (MD5) on GPUs, 10¹¹ per second', duration(guesses / 1e11)],
      ] },
      { l: 'Details', kv: [['Length', String(r.len)], ['Character pool', String(r.pool)]] },
      r.findings.length ? { note: r.findings.join(' '), kind: 'warn' } : null,
      { note: 'This is an estimate. Attackers use word lists and patterns; a long, random passphrase from a password manager is the safest choice.', kind: 'info' }];
  },
});

// ---------- PDF signatures ----------
export async function pdfSignatures(bytes) {
  const txt = new TextDecoder('latin1').decode(bytes);
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const H = await hashers();
  const out = [];
  let m;
  while ((m = re.exec(txt))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    const sig = { range: [a, b, c, d], coversAll: c + d === bytes.length };
    const contents = /\/Contents\s*<([0-9A-Fa-f\s]+)>/.exec(txt.slice(a + b - 256, c + 32));
    const hex = (contents?.[1] || '').replace(/[\s]/g, '');
    const win = txt.slice(Math.max(0, a + b - 4000), Math.min(txt.length, c + 4000));
    const field = k => { const r = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(win); return r ? r[1].replace(/\\(.)/g, '$1') : ''; };
    sig.name = field('Name'); sig.reason = field('Reason'); sig.location = field('Location');
    const md = field('M').match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
    if (md) sig.time = `${md[1]}-${md[2] || '01'}-${md[3] || '01'} ${md[4] || '00'}:${md[5] || '00'}:${md[6] || '00'}`;
    sig.subFilter = (/\/SubFilter\s*\/([\w.]+)/.exec(win) || [])[1] || '';
    try {
      const der = fromHex(hex);
      const ci = A.parseOne(der);
      if (A.oid(ci.kids[0]) !== '1.2.840.113549.1.7.2') throw 0;
      const sd = A.ctx(ci, 0).kids[0];
      const certsNode = sd.kids.find(k => k.cls === 2 && k.tag === 0);
      const si = sd.kids[sd.kids.length - 1].kids[0];
      const digestAlg = A.oidName(A.oid(si.kids[2].kids[0]));
      sig.digestAlg = digestAlg;
      const attrs = si.kids.find(k => k.cls === 2 && k.tag === 0);
      let digest = null;
      for (const at of attrs?.kids || []) {
        const o = A.oid(at.kids[0]);
        if (o === '1.2.840.113549.1.9.4') digest = A.value(at.kids[1].kids[0]);
        if (o === '1.2.840.113549.1.9.5') sig.signingTime = A.time(at.kids[1].kids[0])?.toISOString();
      }
      const hf = H[digestAlg];
      if (digest && hf) {
        const data = concat(bytes.subarray(a, a + b), bytes.subarray(c, c + d));
        sig.intact = toHex(hf(data)) === toHex(digest);
      }
      const serial = toHex(A.value(si.kids[1].kids?.[1] || si.kids[1]));
      sig.certs = [];
      for (const cn of certsNode?.kids || []) {
        const cert = await decodeCert(A.raw(cn));
        cert.signer = cert.serial.replace(/:/g, '') === serial;
        sig.certs.push(cert);
      }
    } catch { sig.error = 'The signature data (PKCS#7/CMS) could not be read.'; }
    out.push(sig);
  }
  return out;
}
T({
  id: 'pdfsig', cat: 'crypto', ic: 'PDF', name: 'PDF signature checker',
  desc: 'Show the digital signatures in a PDF: signer, time, certificate and whether the content is unchanged.',
  kw: 'pdf signature digital signed pades certificate verify',
  fields: [{ k: 'f', t: 'file', label: 'PDF file', accept: '.pdf,application/pdf' }],
  async run(v) {
    if (!v.f) return [{ note: 'Choose a PDF file. It is read only in your browser.', kind: 'info' }];
    const bytes = new Uint8Array(await v.f.arrayBuffer());
    if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-') fail('This file is not a PDF: it does not start with %PDF-.');
    const sigs = await pdfSignatures(bytes);
    if (!sigs.length) return [{ note: 'No digital signatures found in this PDF.', kind: 'info' }];
    const res = [{ note: `Found ${plural(sigs.length, 'signature', 'signatures')}.`, kind: 'info' }];
    sigs.forEach((s, i) => {
      const signer = s.certs?.find(c => c.signer) || s.certs?.[0];
      const cn = signer?.subject.find(x => x[0] === 'CN')?.[1];
      res.push({ l: `Signature ${i + 1}`, kv: [
        ['Signer', cn || s.name || '(unknown)'], ['Name in PDF', s.name || null], ['Reason', s.reason || null], ['Location', s.location || null],
        ['Time (PDF)', s.time || null], ['Time (signature)', s.signingTime || null], ['Format', s.subFilter || null], ['Hash algorithm', s.digestAlg || null],
        ['Certificate subject', signer ? A.nameStr(signer.subject) : null], ['Issuer', signer ? A.nameStr(signer.issuer) : null],
        ['Certificate valid', signer ? `${signer.notBefore?.toISOString().slice(0, 10)} to ${signer.notAfter?.toISOString().slice(0, 10)}` : null],
        ['Covers the whole file', s.coversAll ? 'yes' : 'no, changes were appended afterwards'],
      ] });
      if (s.error) res.push({ note: s.error, kind: 'err' });
      else if (s.intact === true) res.push({ note: 'The signed content is unchanged: the hash matches.', kind: 'ok' });
      else if (s.intact === false) res.push({ note: 'The hash does not match: the content was modified after signing.', kind: 'err' });
    });
    res.push({ note: 'This checks whether the content matches the signature. The certificate’s chain of trust and revocation status are not checked.', kind: 'info' });
    return res;
  },
});

// ---------- Password generator ----------
const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789' };
const AMBIG = /[Il1O0o|`'"]/g;
export function password(o) {
  const sets = [];
  if (o.lower) sets.push(SETS.lower);
  if (o.upper) sets.push(SETS.upper);
  if (o.digits) sets.push(SETS.digits);
  if (o.sym && o.syms) sets.push([...new Set(o.syms)].join(''));
  const clean = sets.map(s => o.noamb ? s.replace(AMBIG, '') : s).filter(Boolean);
  if (!clean.length) fail('Choose at least one kind of character.');
  if (o.len < clean.length) fail(`A password of ${o.len} characters cannot contain all ${clean.length} chosen character types.`);
  const all = clean.join('');
  // One character from each chosen set, the rest from everything, then shuffle.
  const chars = clean.map(s => s[randInt(s.length)]);
  while (chars.length < o.len) chars.push(all[randInt(all.length)]);
  return { pw: shuffle(chars).join(''), pool: all.length };
}
T({
  id: 'password', cat: 'crypto', ic: 'PG', name: 'Password generator', regen: true,
  desc: 'Strong passwords from cryptographically secure randomness, with configurable character sets.',
  kw: 'password generator strong random passphrase',
  fields: [
    { k: 'len', t: 'range', label: 'Length', def: 20, min: 4, max: 128 },
    { k: 'n', t: 'num', label: 'Count', def: 5, min: 1, max: 100 },
    { k: 'upper', t: 'chk', label: 'Uppercase (A–Z)', def: true },
    { k: 'lower', t: 'chk', label: 'Lowercase (a–z)', def: true },
    { k: 'digits', t: 'chk', label: 'Digits (0–9)', def: true },
    { k: 'sym', t: 'chk', label: 'Symbols', def: true },
    { k: 'syms', t: 'text', label: 'Which symbols', def: '!@#$%^&*-_=+?', mono: true, show: v => v.sym },
    { k: 'noamb', t: 'chk', label: 'No ambiguous characters (I, l, 1, O, 0)' },
  ],
  ex: [{ n: 'Wi-Fi (long, no symbols)', v: { len: 24, sym: false, noamb: true } }, { n: 'PIN', v: { len: 6, upper: false, lower: false, sym: false, digits: true } }],
  run(v) {
    const n = Math.round(v.n);
    if (!(n >= 1 && n <= 1000)) fail('Choose a count between 1 and 1000.');
    const list = [];
    let pool = 0;
    for (let i = 0; i < n; i++) { const r = password(v); list.push(r.pw); pool = r.pool; }
    return [{ l: n === 1 ? 'Password' : 'Passwords', v: list.join('\n') },
      { note: `About ${fnum(v.len * Math.log2(pool), 0)} bits of entropy per password (${pool} possible characters).`, kind: 'info' }];
  },
});

// ---------- Create JWT ----------
const b64urlJson = o => toB64(utf8(JSON.stringify(o)), true);
export async function signJwt(header, payload, keyBytes) {
  const { hmac } = await lib('hashes');
  const H = await hashers();
  const algo = { HS256: H['SHA-256'], HS384: H['SHA-384'], HS512: H['SHA-512'] }[header.alg];
  const data = b64urlJson(header) + '.' + b64urlJson(payload);
  return data + '.' + toB64(hmac(algo, keyBytes, utf8(data)), true);
}
T({
  id: 'jwtsign', cat: 'crypto', ic: 'JW+', name: 'JWT builder (HMAC)',
  desc: 'Sign a payload with HS256, HS384 or HS512 and get a JWT.',
  kw: 'jwt json web token create sign hs256 hmac',
  fields: [
    { k: 'alg', t: 'sel', label: 'Algorithm', opts: ['HS256', 'HS384', 'HS512'] },
    { k: 'p', t: 'area', label: 'Payload (JSON)', rows: 7, def: '{\n  "sub": "1234567890",\n  "name": "Jane Doe",\n  "admin": true\n}' },
    { k: 'key', t: 'text', label: 'Secret key', def: 'my-secret-key' },
    { k: 'kenc', t: 'sel', label: 'Key is', opts: enc3 },
    { k: 'iat', t: 'chk', label: 'Add “iat” (now)' },
    { k: 'exp', t: 'num', label: 'Expires after (minutes, empty = never)', min: 1 },
  ],
  async run(v) {
    const payload = parseJSON(v.p, 'payload JSON');
    if (typeof payload !== 'object' || Array.isArray(payload) || !payload) fail('The payload must be a JSON object, for example {"sub": "123"}.');
    const now = Math.floor(Date.now() / 1000);
    if (v.iat) payload.iat = now;
    if (v.exp) payload.exp = now + Math.round(v.exp * 60);
    const key = toBytes(v.key, v.kenc);
    if (!key.length) fail('Enter a secret key.');
    const token = await signJwt({ alg: v.alg, typ: 'JWT' }, payload, key);
    const min = { HS256: 32, HS384: 48, HS512: 64 }[v.alg];
    return [{ l: 'JWT', v: token },
      { l: 'Structure', seg: token.split('.').flatMap((p, i) => [[p, 'g' + (i + 1)], i < 2 ? ['.', 'dim'] : null]).filter(Boolean), copy: false },
      key.length < min ? { note: `The key is shorter than ${min} bytes; at least ${min} bytes are recommended for ${v.alg}.`, kind: 'warn' } : null];
  },
});

// ---------- Hash identifier ----------
const HASH_RULES = [
  [/^\$2[abxy]?\$\d\d\$[./A-Za-z0-9]{53}$/, 'bcrypt'], [/^\$argon2(id|i|d)\$/, 'Argon2'], [/^\$y\$/, 'yescrypt (modern Linux /etc/shadow)'],
  [/^\$7\$/, 'scrypt (crypt)'], [/^\$6\$/, 'SHA-512-crypt (Linux /etc/shadow)'], [/^\$5\$/, 'SHA-256-crypt'], [/^\$1\$/, 'MD5-crypt'],
  [/^\$apr1\$/, 'Apache MD5 (htpasswd)'], [/^\$[PH]\$/, 'phpass (WordPress, phpBB)'], [/^\$sha1\$/, 'SHA-1-crypt (NetBSD)'],
  [/^\{SHA\}/i, 'LDAP SHA-1'], [/^\{SSHA\}/i, 'LDAP salted SHA-1'], [/^\{SSHA512\}/i, 'LDAP salted SHA-512'], [/^\{MD5\}/i, 'LDAP MD5'],
  [/^pbkdf2_sha256\$\d+\$/, 'Django PBKDF2-SHA-256'], [/^\$pbkdf2(-sha\d+)?\$/, 'PBKDF2 (passlib)'], [/^(scrypt|pbkdf2):/, 'Werkzeug (Flask)'],
  [/^sha1\$\w+\$[a-f0-9]{40}$/, 'Django SHA-1'], [/^\*[A-F0-9]{40}$/i, 'MySQL 4.1+ (double SHA-1)'], [/^0x0100[A-F0-9]{48}$/i, 'MSSQL 2005'],
  [/^0x0200[A-F0-9]{136}$/i, 'MSSQL 2012+'], [/^md5[a-f0-9]{32}$/, 'PostgreSQL MD5'], [/^SCRAM-SHA-256\$/, 'PostgreSQL SCRAM-SHA-256'],
  [/^[a-f0-9]{32}:[a-z0-9]{1,32}$/i, 'Salted MD5 (e.g. Joomla, osCommerce)'], [/^[a-f0-9]{40}:[a-z0-9]+$/i, 'Salted SHA-1'],
  [/^[A-Za-z0-9./]{13}$/, 'DES-crypt (traditional Unix)'], [/^\$S\$/, 'Drupal 7 (SHA-512)'],
];
const HEX_LEN = {
  8: ['CRC32', 'Adler-32', 'FNV-1a 32'], 16: ['MySQL 3.x (OLD_PASSWORD)', 'CRC64', 'half MD5'], 32: ['MD5', 'NTLM', 'MD4', 'LM'],
  40: ['SHA-1', 'RIPEMD-160', 'MySQL 4.1+ (without *)'], 48: ['Tiger-192'], 56: ['SHA-224', 'SHA3-224'], 64: ['SHA-256', 'SHA3-256', 'Keccak-256', 'BLAKE2s', 'BLAKE3'],
  96: ['SHA-384', 'SHA3-384'], 128: ['SHA-512', 'SHA3-512', 'BLAKE2b', 'Whirlpool'],
};
export function identifyHash(s) {
  const h = s.trim();
  const out = HASH_RULES.filter(([re]) => re.test(h)).map(r => r[1]);
  if (/^[a-f0-9]+$/i.test(h) && HEX_LEN[h.length]) out.push(...HEX_LEN[h.length]);
  if (!out.length && /^[A-Za-z0-9+/]+={0,2}$/.test(h) && h.length % 4 === 0) {
    const n = h.replace(/=+$/, '').length * 3 / 4 | 0;
    const map = { 16: 'MD5 (Base64)', 20: 'SHA-1 (Base64)', 28: 'SHA-224 (Base64)', 32: 'SHA-256 (Base64)', 48: 'SHA-384 (Base64)', 64: 'SHA-512 (Base64)' };
    if (map[n]) out.push(map[n]);
  }
  return out;
}
T({
  id: 'hashid', cat: 'crypto', ic: 'H?', name: 'Hash identifier',
  desc: 'Guess which hash algorithm produced a hash value (MD5, SHA, bcrypt, crypt and more).',
  kw: 'hash identify detect type algorithm hashid',
  fields: [{ k: 's', t: 'text', label: 'Hash', mono: true, def: '5d41402abc4b2a76b9719d911017c592', full: true }],
  ex: [{ n: 'bcrypt', v: { s: '$2b$10$WrDGmHC.2o6hbdfN7rTATO76UYKQJfkF30DDOOIPgJV/DLJ/9fzji' } }, { n: 'shadow', v: { s: '$6$rounds=5000$salt$abc' } }, { n: 'SHA-256', v: { s: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' } }],
  run(v) {
    if (!v.s.trim()) return [{ note: 'Paste a hash.', kind: 'info' }];
    const r = identifyHash(v.s);
    if (!r.length) return [{ note: 'No known hash format recognized. Check that the hash is complete and contains no spaces or line breaks.', kind: 'warn' }];
    return [{ l: 'Possible algorithms (most likely first)', table: { head: ['#', 'Algorithm'], rows: r.map((x, i) => [i + 1, x]) } },
      { note: `Length: ${v.s.trim().length} characters. A hash by itself does not always reveal with certainty which algorithm was used.`, kind: 'info' }];
  },
});

// ---------- File checksum ----------
T({
  id: 'filehash', cat: 'crypto', ic: 'FH', name: 'File checksum',
  desc: 'Compute MD5, SHA-1, SHA-256, SHA-512 and CRC32 of a file and compare with an expected hash.',
  kw: 'checksum file hash md5 sha256 verify download iso integrity',
  fields: [
    { k: 'f', t: 'file', label: 'File' },
    { k: 'exp', t: 'text', label: 'Expected hash (optional)', mono: true, full: true },
  ],
  async run(v) {
    if (!v.f) return [{ note: 'Choose a file. It is read only in your browser, even large files.', kind: 'info' }];
    const H = await hashers();
    const algs = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];
    const st = algs.map(a => H[a].create());
    let crc = 0;
    const reader = v.f.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      st.forEach(s => s.update(value));
      crc = crc32(value, crc);
    }
    const rows = algs.map((a, i) => [a, toHex(st[i].digest())]);
    rows.push(['CRC32', crc.toString(16).padStart(8, '0')]);
    const res = [{ l: v.f.name, kv: rows }];
    const e = v.exp.trim().toLowerCase().replace(/\s/g, '').split(/[*\s]/)[0];
    if (e) {
      const hit = rows.find(r => r[1] === e);
      res.push(hit ? { note: `Matches the ${hit[0]} hash. The file is unchanged.`, kind: 'ok' }
        : { note: 'The expected hash does not match any computed hash. The file may be corrupted or different.', kind: 'err' });
    }
    return res;
  },
});

// ---------- Certificate decoder ----------
const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIIB4zCCAYqgAwIBAgIUKzWjJRVxHKXoT52tAkPEIpgKHbowCgYIKoZIzj0EAwIw
OTELMAkGA1UEBhMCVVMxFDASBgNVBAoMC0V4YW1wbGUgSW5jMRQwEgYDVQQDDAtl
eGFtcGxlLmNvbTAeFw0yNjEwMjIxMzI2MjNaFw0zNjEwMTkxMzI2MjNaMDkxCzAJ
BgNVBAYTAlVTMRQwEgYDVQQKDAtFeGFtcGxlIEluYzEUMBIGA1UEAwwLZXhhbXBs
ZS5jb20wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATVmaubqzy5euvsLSjo7EML
XE/CxArONypSbz9NG/YVeEC+JVzyYsAYOG8dI52HGUQpUbng9xdYYOJ6UBYLQcLd
o3AwbjAdBgNVHQ4EFgQUXwlcUVlG3Tn2pUtbOQopaSl7EYQwDwYDVR0TAQH/BAUw
AwEB/zAnBgNVHREEIDAeggtleGFtcGxlLmNvbYIPd3d3LmV4YW1wbGUuY29tMBMG
A1UdJQQMMAoGCCsGAQUFBwMBMAoGCCqGSM49BAMCA0cAMEQCIHlHchl9n6ae17r1
CKiU3XvoIZv6pUuPTp9qG9WWPpFJAiBUaBNtETkpOTQpsx/K3gNJJti12B8RPB+b
Ka+Bsv9iHQ==
-----END CERTIFICATE-----`;
const day = 86400000;
T({
  id: 'cert', cat: 'crypto', ic: 'CRT', name: 'Certificate decoder',
  desc: 'Decode an X.509 certificate or CSR (PEM): subject, issuer, validity, SANs and fingerprints.',
  kw: 'certificate x509 pem ssl tls decoder viewer san fingerprint csr openssl',
  fields: [{ k: 's', t: 'area', label: 'Certificate or CSR (PEM, a whole chain also works)', def: SAMPLE_CERT, rows: 10 }],
  async run(v) {
    let blocks = A.pemBlocks(v.s);
    if (!blocks.length && /^[A-Za-z0-9+/=\s]+$/.test(v.s.trim()) && v.s.trim()) blocks = [{ type: 'CERTIFICATE', der: fromB64(v.s) }];
    if (!blocks.length) fail('No PEM block found. Paste a certificate that starts with -----BEGIN CERTIFICATE-----.');
    const res = [];
    for (const [i, b] of blocks.entries()) {
      const title = blocks.length > 1 ? ` ${i + 1}` : '';
      if (/CERTIFICATE REQUEST/.test(b.type)) {
        const c = decodeCsr(b.der);
        res.push({ l: 'Certificate signing request (CSR)' + title, kv: [['Subject', A.nameStr(c.subject)], ['Key', c.key.desc], ['Signature', c.sigAlg], ['Alternative names', c.san || null]] });
        continue;
      }
      if (b.type !== 'CERTIFICATE') { res.push({ note: `Skipped block “${b.type}”: only certificates and CSRs are decoded.`, kind: 'info' }); continue; }
      const c = await decodeCert(b.der);
      const now = Date.now();
      const days = Math.floor((c.notAfter - now) / day);
      res.push({ l: 'Certificate' + title + (c.subject.find(x => x[0] === 'CN') ? ': ' + c.subject.find(x => x[0] === 'CN')[1] : ''), kv: [
        ['Subject', A.nameStr(c.subject)], ['Issuer', A.nameStr(c.issuer) + (c.selfSigned ? ' (self-signed)' : '')],
        ['Valid from', c.notBefore.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'], ['Valid until', c.notAfter.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'],
        ['Alternative names', c.san || null], ['Key', c.key.desc], ['Signature', c.sigAlg], ['Serial number', c.serial], ['Version', 'v' + c.version],
        ['SHA-256 fingerprint', c.sha256], ['SHA-1 fingerprint', c.sha1], ['SPKI pin (SHA-256, Base64)', c.spkiSha256],
      ] });
      res.push(c.notAfter < now ? { note: `Expired ${plural(-days, 'day', 'days')} ago.`, kind: 'err' }
        : c.notBefore > now ? { note: 'Not yet valid.', kind: 'warn' }
        : { note: `Valid, ${plural(days, 'day', 'days')} remaining.`, kind: days < 30 ? 'warn' : 'ok' });
      const other = c.exts.filter(e => e.oid !== '2.5.29.17');
      if (other.length) res.push({ l: 'Extensions' + title, table: { head: ['Extension', 'Critical', 'Value'], rows: other.map(e => [e.name, e.critical ? 'yes' : 'no', e.value]) } });
    }
    return res;
  },
});

// ---------- CSR generator ----------
T({
  id: 'csr', cat: 'crypto', ic: 'CSR', name: 'CSR generator', btn: 'Generate CSR and key', browser: true,
  desc: 'Create a certificate signing request (CSR) with a private key, including SANs, plus the matching OpenSSL command.',
  kw: 'csr certificate signing request openssl ssl tls san generate',
  fields: [
    { k: 'cn', t: 'text', label: 'Common Name (CN)', def: 'example.com' },
    { k: 'san', t: 'text', label: 'Extra names (SAN), comma-separated', def: 'www.example.com' },
    { k: 'o', t: 'text', label: 'Organization (O)' },
    { k: 'ou', t: 'text', label: 'Organizational unit (OU)' },
    { k: 'l', t: 'text', label: 'Locality (L)' },
    { k: 'st', t: 'text', label: 'State or province (ST)' },
    { k: 'c', t: 'text', label: 'Country (C, two letters)', def: 'US' },
    { k: 'e', t: 'text', label: 'Email address' },
    { k: 'key', t: 'sel', label: 'Key', opts: [['rsa2048', 'RSA 2048'], ['rsa3072', 'RSA 3072'], ['rsa4096', 'RSA 4096'], ['p256', 'ECDSA P-256'], ['p384', 'ECDSA P-384']] },
  ],
  async run(v) {
    const subtle = needSubtle();
    if (!v.cn.trim()) fail('Enter a Common Name, for example the domain name.');
    if (v.c && !/^[A-Za-z]{2}$/.test(v.c.trim())) fail('The country must be a two-letter country code, for example US or GB.');
    const ec = v.key.startsWith('p');
    const params = ec ? { name: 'ECDSA', namedCurve: v.key === 'p256' ? 'P-256' : 'P-384' }
      : { name: 'RSASSA-PKCS1-v1_5', modulusLength: Number(v.key.slice(3)), publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' };
    const kp = await subtle.generateKey(params, true, ['sign', 'verify']);
    const spki = new Uint8Array(await subtle.exportKey('spki', kp.publicKey));
    const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', kp.privateKey));
    const attr = (o, val, printable) => A.SET(A.SEQ(A.OID(o), printable ? A.PRINTABLE(val) : A.UTF8(val)));
    const rdns = [];
    if (v.c.trim()) rdns.push(attr('2.5.4.6', v.c.trim().toUpperCase(), true));
    if (v.st.trim()) rdns.push(attr('2.5.4.8', v.st.trim()));
    if (v.l.trim()) rdns.push(attr('2.5.4.7', v.l.trim()));
    if (v.o.trim()) rdns.push(attr('2.5.4.10', v.o.trim()));
    if (v.ou.trim()) rdns.push(attr('2.5.4.11', v.ou.trim()));
    rdns.push(attr('2.5.4.3', v.cn.trim()));
    if (v.e.trim()) rdns.push(A.SET(A.SEQ(A.OID('1.2.840.113549.1.9.1'), A.IA5(v.e.trim()))));
    const names = [...new Set([v.cn.trim(), ...v.san.split(/[\s,]+/).filter(Boolean)])];
    const gn = names.map(n => /^\d+\.\d+\.\d+\.\d+$/.test(n) ? A.tlv(0x87, n.split('.').map(Number)) : A.tlv(0x82, utf8(n)));
    const extReq = A.SEQ(A.OID('1.2.840.113549.1.9.14'), A.SET(A.SEQ(A.SEQ(A.OID('2.5.29.17'), A.OCTETS(A.SEQ(...gn))))));
    const info = A.SEQ(A.INT(0), A.SEQ(...rdns), spki, A.CTX(0, extReq));
    const hash = v.key === 'p384' ? 'SHA-384' : 'SHA-256';
    let sig = new Uint8Array(await subtle.sign(ec ? { name: 'ECDSA', hash } : { name: 'RSASSA-PKCS1-v1_5' }, kp.privateKey, info));
    if (ec) { const h = sig.length / 2; sig = A.SEQ(A.INT(sig.slice(0, h)), A.INT(sig.slice(h))); }
    const alg = ec ? A.SEQ(A.OID(v.key === 'p384' ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2')) : A.SEQ(A.OID('1.2.840.113549.1.1.11'), A.NULL());
    const csr = A.SEQ(info, alg, A.BITS(sig));
    const subj = [['C', v.c], ['ST', v.st], ['L', v.l], ['O', v.o], ['OU', v.ou], ['CN', v.cn], ['emailAddress', v.e]].filter(x => x[1].trim()).map(([k, x]) => `/${k}=${x.trim().replace(/\//g, '\\/')}`).join('');
    const keyArg = ec ? `-newkey ec -pkeyopt ec_paramgen_curve:${v.key === 'p256' ? 'P-256' : 'P-384'}` : `-newkey rsa:${v.key.slice(3)}`;
    const cmd = `openssl req -new ${keyArg} -nodes -keyout ${v.cn.trim()}.key -out ${v.cn.trim()}.csr \\\n  -subj "${subj}" \\\n  -addext "subjectAltName=${names.map(n => (/^\d+\.\d+\.\d+\.\d+$/.test(n) ? 'IP:' : 'DNS:') + n).join(',')}"`;
    return [{ l: 'CSR (PEM)', v: A.toPem('CERTIFICATE REQUEST', csr) }, { l: 'Private key (PEM, PKCS#8)', v: A.toPem('PRIVATE KEY', pkcs8) },
      { l: 'Same with OpenSSL', v: cmd },
      { note: 'Send only the CSR to the certificate authority. The private key stays with you and is not stored by this page.', kind: 'info' }];
  },
});

// ---------- PGP ----------
T({
  id: 'pgp', cat: 'crypto', ic: 'PGP', name: 'PGP encryption', btn: 'Run',
  desc: 'Create PGP keys, encrypt for a public key or with a password, and decrypt messages.',
  kw: 'pgp gpg openpgp encrypt decrypt key email',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['gen', 'Create key pair'], ['enc', 'Encrypt for public key'], ['dec', 'Decrypt with private key'], ['senc', 'Encrypt with password'], ['sdec', 'Decrypt with password']] },
    { k: 'name', t: 'text', label: 'Name', def: 'Jane Doe', show: v => v.m === 'gen' },
    { k: 'email', t: 'text', label: 'Email address', def: 'jane@example.com', show: v => v.m === 'gen' },
    { k: 'type', t: 'sel', label: 'Key type', opts: [['curve25519', 'Curve25519 (modern, recommended)'], ['rsa', 'RSA 4096']], show: v => v.m === 'gen' },
    { k: 'key', t: 'area', label: 'Key (ASCII armor)', rows: 5, show: v => v.m === 'enc' || v.m === 'dec' },
    { k: 'pass', t: 'text', label: 'Password (of key or message)', show: v => v.m !== 'enc' },
    { k: 's', t: 'area', label: 'Message', rows: 6, def: 'This is a secret message.', show: v => v.m !== 'gen' },
  ],
  async run(v) {
    const pgp = await lib('openpgp');
    const wrap = (p, msg) => p.catch(e => fail(msg + (e?.message ? ' (' + e.message + ')' : '')));
    if (v.m === 'gen') {
      const k = await wrap(pgp.generateKey({ type: v.type === 'rsa' ? 'rsa' : 'curve25519', rsaBits: 4096, userIDs: [{ name: v.name, email: v.email }], passphrase: v.pass || undefined, format: 'armored' }), 'Creating the key failed.');
      return [{ l: 'Public key', v: k.publicKey }, { l: 'Private key', v: k.privateKey }, !v.pass ? { note: 'The private key has no password. Enter one to protect it.', kind: 'warn' } : null];
    }
    if (v.m === 'senc') {
      if (!v.pass) fail('Enter a password.');
      return [{ l: 'Encrypted message', v: await pgp.encrypt({ message: await pgp.createMessage({ text: v.s }), passwords: [v.pass] }) }];
    }
    if (v.m === 'sdec') {
      const msg = await wrap(pgp.readMessage({ armoredMessage: v.s }), 'This is not a valid PGP message.');
      const { data } = await wrap(pgp.decrypt({ message: msg, passwords: [v.pass] }), 'Decryption failed: wrong password?');
      return [{ l: 'Decrypted', v: data }];
    }
    if (!v.key.trim()) fail('Paste the ' + (v.m === 'enc' ? 'public' : 'private') + ' key (starts with -----BEGIN PGP …-----).');
    if (v.m === 'enc') {
      const key = await wrap(pgp.readKey({ armoredKey: v.key }), 'This public key could not be read.');
      return [{ l: 'Encrypted message', v: await pgp.encrypt({ message: await pgp.createMessage({ text: v.s }), encryptionKeys: key }) }];
    }
    let key = await wrap(pgp.readPrivateKey({ armoredKey: v.key }), 'This private key could not be read.');
    if (!key.isDecrypted()) key = await wrap(pgp.decryptKey({ privateKey: key, passphrase: v.pass }), 'The private key’s password is wrong.');
    const msg = await wrap(pgp.readMessage({ armoredMessage: v.s }), 'This is not a valid PGP message.');
    const { data } = await wrap(pgp.decrypt({ message: msg, decryptionKeys: key }), 'Decryption failed: this message was not encrypted for this key.');
    return [{ l: 'Decrypted', v: data }];
  },
});
