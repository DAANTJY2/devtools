// HOTP (RFC 4226) and TOTP (RFC 6238).
import { lib } from '../core/util.js';

export async function hotp(key, counter, { digits = 6, algo = 'SHA1' } = {}) {
  const H = await lib('hashes');
  const hash = { SHA1: H.sha1, SHA256: H.sha256, SHA512: H.sha512 }[algo];
  const msg = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) { msg[i] = Number(c & 255n); c >>= 8n; }
  const mac = H.hmac(hash, key, msg);
  const o = mac[mac.length - 1] & 15;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
export const totp = (key, ms, { period = 30, ...o } = {}) => hotp(key, Math.floor(ms / 1000 / period), o);
