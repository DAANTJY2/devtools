import { T, fail } from '../core/registry.js';
import { lib, lines } from '../core/util.js';

const region = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return c => { try { return d.of(c); } catch { return c; } }; } catch { return c => c; } })();

// ---------- Phone numbers ----------
const TYPES = { MOBILE: 'mobile', FIXED_LINE: 'landline', FIXED_LINE_OR_MOBILE: 'landline or mobile', TOLL_FREE: 'toll-free', PREMIUM_RATE: 'premium rate', SHARED_COST: 'shared cost', VOIP: 'VoIP', PERSONAL_NUMBER: 'personal number', PAGER: 'pager', UAN: 'business number (UAN)', VOICEMAIL: 'voicemail' };
T({
  id: 'phone', cat: 'data', ic: '☎', name: 'Phone number parser and formatter',
  desc: 'Validate a phone number and see the country code, number type and the national, international and E.164 formats.',
  kw: 'phone number telephone format validate e164 country code mobile international',
  fields: [
    { k: 's', t: 'area', label: 'Phone numbers (one per line)', rows: 4, def: '(201) 555-0123\n+44 20 7946 0958\n+32 470 12 34 56\n800-555-0199' },
    { k: 'cc', t: 'sel', label: 'Country for numbers without +', def: 'US', opts: [['US', 'United States (+1)'], ['CA', 'Canada (+1)'], ['GB', 'United Kingdom (+44)'], ['IE', 'Ireland (+353)'], ['AU', 'Australia (+61)'], ['NZ', 'New Zealand (+64)'], ['NL', 'Netherlands (+31)'], ['BE', 'Belgium (+32)'], ['DE', 'Germany (+49)'], ['FR', 'France (+33)'], ['IN', 'India (+91)']] },
  ],
  async run(v) {
    const P = await lib('phone');
    const rows = [], details = [];
    for (const l of lines(v.s).map(x => x.trim()).filter(Boolean)) {
      try {
        const p = P.parsePhoneNumberWithError(l, v.cc);
        const valid = p.isValid();
        rows.push([l, valid ? '✓ valid' : p.isPossible() ? '? possible' : '✗ invalid', p.country ? region(p.country) : '—', TYPES[p.getType()] || '—', p.formatNational(), p.formatInternational(), p.number]);
        if (details.length < 1) details.push({ l: l, kv: [['Country', p.country ? `${region(p.country)} (${p.country})` : '—'], ['Country code', '+' + p.countryCallingCode], ['National number', p.nationalNumber], ['Type', TYPES[p.getType()] || 'unknown'], ['National', p.formatNational()], ['International', p.formatInternational()], ['E.164', p.number], ['Link (RFC 3966)', p.getURI()], ['Valid', valid ? 'yes' : 'no']] });
      } catch (e) {
        const why = { INVALID_COUNTRY: 'unknown country; start with + and the country code', NOT_A_NUMBER: 'not a phone number', TOO_SHORT: 'too short', TOO_LONG: 'too long', INVALID_LENGTH: 'invalid length' }[e.message] || e.message;
        rows.push([l, '✗ ' + why, '', '', '', '', '']);
      }
    }
    if (!rows.length) return [{ note: 'Enter a phone number.', kind: 'info' }];
    return [{ l: 'Overview', table: { head: ['Input', 'Status', 'Country', 'Type', 'National', 'International', 'E.164'], rows } }, ...details];
  },
});

// ---------- IBAN ----------
const LEN = { AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20 };
// Known banks by IBAN bank code (Netherlands, where the code identifies the bank directly).
const NL_BANKS = { ABNA: ['ABN AMRO', 'ABNANL2A'], INGB: ['ING', 'INGBNL2A'], RABO: ['Rabobank', 'RABONL2U'], SNSB: ['SNS (de Volksbank)', 'SNSBNL2A'], ASNB: ['ASN Bank (de Volksbank)', 'ASNBNL21'], RBRB: ['RegioBank (de Volksbank)', 'RBRBNL21'], TRIO: ['Triodos Bank', 'TRIONL2U'], KNAB: ['Knab', 'KNABNL2H'], BUNQ: ['bunq', 'BUNQNL2A'], FVLB: ['Van Lanschot Kempen', 'FVLBNL22'], HAND: ['Handelsbanken', 'HANDNL2A'], NNBA: ['Nationale-Nederlanden Bank', 'NNBANL2G'], DEUT: ['Deutsche Bank', 'DEUTNL2A'], BNGH: ['BNG Bank', 'BNGHNL2G'], AEGO: ['Aegon Bank', 'AEGONL2U'] };
// Where the bank part and the account part are (after the first 4 characters).
const LAYOUT = { NL: [4, 10], BE: [3, 9], DE: [8, 10], GB: [4, 14], FR: [10, 13], ES: [8, 12], IT: [11, 12], LU: [3, 13], AT: [5, 11], CH: [5, 12] };
export function ibanCheck(raw) {
  const s = raw.toUpperCase().replace(/[\s.-]/g, '').replace(/^IBAN:?/, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) fail(`“${raw.trim()}” is not an IBAN: an IBAN starts with a country code and two digits, such as GB82 WEST 1234 5698 7654 32.`);
  const cc = s.slice(0, 2);
  const want = LEN[cc];
  const rearr = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let mod = 0;
  for (const d of rearr) mod = (mod * 10 + +d) % 97;
  const expectCheck = (() => { const r = (s.slice(4) + cc + '00').replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55)); let m = 0; for (const d of r) m = (m * 10 + +d) % 97; return String(98 - m).padStart(2, '0'); })();
  return { s, cc, want, lenOk: !want || s.length === want, mod97: mod === 1, expectCheck };
}
T({
  id: 'iban', cat: 'data', ic: 'IBAN', name: 'IBAN validator',
  desc: 'Validate an IBAN (mod 97 and length) and see the country, bank, BIC and account number.',
  kw: 'iban validate check bank account number bic swift mod 97 bank',
  fields: [{ k: 's', t: 'area', label: 'IBANs (one per line)', rows: 4, def: 'GB82 WEST 1234 5698 7654 32\nDE89370400440532013000\nNL91 ABNA 0417 1643 00\nGB82 WEST 1234 5698 7654 33' }],
  run(v) {
    const rows = [], res = [];
    for (const l of lines(v.s).map(x => x.trim()).filter(Boolean)) {
      try {
        const r = ibanCheck(l);
        const ok = r.lenOk && r.mod97;
        const [b, a] = LAYOUT[r.cc] || [0, 0];
        const bank = r.s.slice(4, 4 + b), acct = r.s.slice(4 + b, 4 + b + a);
        const known = r.cc === 'NL' ? NL_BANKS[bank] : null;
        rows.push([r.s.replace(/(.{4})(?=.)/g, '$1 '), ok ? '✓ valid' : !r.want ? '? unknown country' : !r.lenOk ? `✗ length ${r.s.length}, should be ${r.want}` : `✗ check digits are wrong (should be ${r.expectCheck})`, region(r.cc), known ? known[0] : bank || '—', known ? known[1] : '—', acct || r.s.slice(4)]);
      } catch (e) { rows.push([l, '✗ ' + e.message, '', '', '', '']); }
    }
    if (!rows.length) return [{ note: 'Enter an IBAN.', kind: 'info' }];
    res.push({ l: 'Result', table: { head: ['IBAN', 'Status', 'Country', 'Bank', 'BIC', 'Account (BBAN part)'], rows } });
    res.push({ note: 'A valid IBAN only means the number is well-formed, not that the account exists or who owns it.', kind: 'info' });
    return res;
  },
});
