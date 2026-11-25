// Hash functions in one place, named as they appear in the tools.
import { lib } from '../core/util.js';

let table;
export function crc32(bytes, crc = 0) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  crc = ~crc;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (~crc) >>> 0;
}
export const crc32Bytes = n => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);

// Name -> function from @noble/hashes.
export async function hashers() {
  const H = await lib('hashes');
  return {
    'MD5': H.md5, 'SHA-1': H.sha1, 'SHA-224': H.sha224, 'SHA-256': H.sha256, 'SHA-384': H.sha384, 'SHA-512': H.sha512,
    'SHA3-224': H.sha3_224, 'SHA3-256': H.sha3_256, 'SHA3-384': H.sha3_384, 'SHA3-512': H.sha3_512,
    'Keccak-256': H.keccak_256, 'RIPEMD-160': H.ripemd160,
  };
}
