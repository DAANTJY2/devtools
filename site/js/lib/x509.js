// Decode X.509 certificates and CSRs.
import * as A from './asn1.js';
import { toHex } from '../core/util.js';
import { fail } from '../core/registry.js';

const KU = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];

function generalNames(seq) {
  const out = [];
  for (const g of seq?.kids || []) {
    const v = A.value(g);
    if (g.tag === 2) out.push('DNS:' + new TextDecoder().decode(v));
    else if (g.tag === 1) out.push('email:' + new TextDecoder().decode(v));
    else if (g.tag === 6) out.push('URI:' + new TextDecoder().decode(v));
    else if (g.tag === 7) out.push('IP:' + (v.length === 4 ? [...v].join('.') : toHex(v).replace(/(.{4})(?!$)/g, '$1:')));
    else if (g.tag === 4 && g.kids) out.push('DirName:' + A.nameStr(A.name(g.kids[0])));
  }
  return out;
}
const uris = n => { const out = []; const walk = x => { if (x.cls === 2 && x.tag === 6 && !x.constructed) out.push(new TextDecoder().decode(A.value(x))); (x.kids || []).forEach(walk); }; walk(n); return out; };

export function publicKey(spki) {
  const algOid = A.oid(spki.kids[0].kids[0]);
  const alg = A.oidName(algOid);
  const bits = spki.kids[1];
  if (alg === 'RSA') {
    const rsa = bits.kids?.[0] || A.parseOne(A.value(bits).subarray(1));
    const n = A.value(rsa.kids[0]);
    const nb = (n[0] === 0 ? n.length - 1 : n.length) * 8;
    return { alg: 'RSA', size: nb, desc: `RSA ${nb} bit (exponent ${A.bigint(rsa.kids[1])})` };
  }
  if (alg === 'EC') { const c = A.oidName(A.oid(spki.kids[0].kids[1])); return { alg: 'EC', desc: 'ECDSA ' + c }; }
  return { alg, desc: alg };
}

function extensions(list) {
  const out = [];
  for (const ext of list?.kids || []) {
    const o = A.oid(ext.kids[0]);
    const critical = ext.kids.length === 3 && A.value(ext.kids[1])[0] !== 0;
    const oct = ext.kids[ext.kids.length - 1];
    const inner = oct.kids?.[0] ?? (() => { try { return A.parseOne(A.value(oct)); } catch { return null; } })();
    let v;
    try {
      switch (o) {
        case '2.5.29.17': v = generalNames(inner).join(', '); break;
        case '2.5.29.19': {
          const ca = inner.kids?.find(k => k.tag === 1);
          const pl = inner.kids?.find(k => k.tag === 2);
          v = (ca && A.value(ca)[0] ? 'CA: yes' : 'CA: no') + (pl ? ', max path length ' + A.bigint(pl) : ''); break;
        }
        case '2.5.29.15': {
          const b = A.value(inner); const used = [];
          for (let i = 0; i < 9; i++) if (b[1 + (i >> 3)] & (0x80 >> (i & 7))) used.push(KU[i]);
          v = used.join(', '); break;
        }
        case '2.5.29.37': v = inner.kids.map(k => A.oidName(A.oid(k))).join(', '); break;
        case '2.5.29.14': v = toHex(A.value(inner), ':'); break;
        case '2.5.29.35': { const k = A.ctx(inner, 0); v = k ? toHex(A.value(k), ':') : ''; break; }
        case '1.3.6.1.5.5.7.1.1': v = inner.kids.map(ad => A.oidName(A.oid(ad.kids[0])) + ': ' + uris(ad).join(' ')).join('\n'); break;
        case '2.5.29.31': v = uris(inner).join('\n'); break;
        case '2.5.29.32': v = inner.kids.map(p => A.oid(p.kids[0])).join(', '); break;
        default: v = '(' + A.value(oct).length + ' bytes)';
      }
    } catch { v = '(could not be read)'; }
    out.push({ oid: o, name: A.oidName(o), critical, value: v, inner });
  }
  return out;
}

export async function decodeCert(der) {
  const { sha1, sha256 } = await import('../../vendor/hashes.js');
  const cert = A.parseOne(der);
  const tbs = cert.kids?.[0];
  if (!tbs?.kids || cert.kids.length < 3) fail('This does not look like an X.509 certificate.');
  let i = 0;
  let version = 1;
  if (tbs.kids[0].cls === 2 && tbs.kids[0].tag === 0) { version = Number(A.bigint(tbs.kids[0].kids[0])) + 1; i++; }
  const serial = A.value(tbs.kids[i++]);
  const sigAlg = A.oidName(A.oid(tbs.kids[i++].kids[0]));
  const issuer = A.name(tbs.kids[i++]);
  const validity = tbs.kids[i++];
  const subject = A.name(tbs.kids[i++]);
  const spki = tbs.kids[i++];
  const exts = extensions(A.ctx(tbs, 3)?.kids?.[0]);
  const notBefore = A.time(validity.kids[0]), notAfter = A.time(validity.kids[1]);
  return {
    version, serial: toHex(serial, ':'), sigAlg, issuer, subject, notBefore, notAfter,
    key: publicKey(spki), exts,
    san: exts.find(e => e.oid === '2.5.29.17')?.value || '',
    selfSigned: A.nameStr(issuer) === A.nameStr(subject),
    sha1: toHex(sha1(der), ':').toUpperCase(), sha256: toHex(sha256(der), ':').toUpperCase(),
    spkiSha256: btoaBytes(sha256(A.raw(spki))),
  };
}

export function decodeCsr(der) {
  const csr = A.parseOne(der);
  const info = csr.kids?.[0];
  if (!info?.kids || info.kids.length < 3) fail('This does not look like a CSR (certificate signing request).');
  const subject = A.name(info.kids[1]);
  const key = publicKey(info.kids[2]);
  let exts = [];
  const attrs = A.ctx(info, 0);
  for (const a of attrs?.kids || []) if (A.oid(a.kids[0]) === '1.2.840.113549.1.9.14') exts = extensions(a.kids[1].kids[0]);
  return { subject, key, exts, sigAlg: A.oidName(A.oid(csr.kids[1].kids[0])), san: exts.find(e => e.oid === '2.5.29.17')?.value || '' };
}

const btoaBytes = b => btoa(String.fromCharCode(...b));
