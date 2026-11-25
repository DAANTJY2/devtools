// Date and time: time zones, ISO weeks and the many formats of the date-time tool.
import { fail } from '../core/registry.js';

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function zones() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Europe/Amsterdam', 'Europe/London', 'America/New_York', 'Asia/Tokyo']; }
}
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    try {
      fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', timeZoneName: 'longOffset' }));
    } catch { fail('Unknown time zone “' + tz + '”. Use a name such as Europe/London or UTC.'); }
  }
  return fmtCache.get(tz);
}
// Components of a moment in a time zone, including the offset in minutes.
export function parts(ms, tz) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const off = /GMT(?:([+-])(\d{2}):?(\d{2}))?/.exec(p.timeZoneName);
  const offset = off && off[1] ? (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) : 0;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, ms: ((ms % 1000) + 1000) % 1000, offset, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
export const offsetOf = (ms, tz) => parts(ms, tz).offset;
// Wall-clock time in a time zone to UTC milliseconds.
export function zonedToUtc(y, mo, d, h = 0, mi = 0, s = 0, msec = 0, tz = 'UTC') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, msec);
  let t = guess - offsetOf(guess, tz) * 60000;
  const off2 = offsetOf(t, tz);
  t = guess - off2 * 60000;
  return t;
}
const p2 = n => String(n).padStart(2, '0');
export const offStr = (min, colon = true) => (min < 0 ? '-' : '+') + p2(Math.floor(Math.abs(min) / 60)) + (colon ? ':' : '') + p2(Math.abs(min) % 60);
export function isoIn(ms, tz, withMs = false) {
  const p = parts(ms, tz);
  return `${p.y}-${p2(p.mo)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}${withMs ? '.' + String(p.ms).padStart(3, '0') : ''}${p.offset === 0 && tz === 'UTC' ? 'Z' : offStr(p.offset)}`;
}
export function isoWeek(y, mo, d) {
  const t = new Date(Date.UTC(y, mo - 1, d));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const wy = t.getUTCFullYear();
  const first = new Date(Date.UTC(wy, 0, 4));
  return { year: wy, week: 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7) };
}
export const dayOfYear = (y, mo, d) => (Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1;
export const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function relative(ms, now = Date.now()) {
  const diff = (ms - now) / 1000;
  const a = Math.abs(diff);
  const [n, u] = a < 60 ? [diff, 'second'] : a < 3600 ? [diff / 60, 'minute'] : a < 86400 ? [diff / 3600, 'hour'] : a < 86400 * 30 ? [diff / 86400, 'day'] : a < 86400 * 365 ? [diff / 86400 / 30.44, 'month'] : [diff / 86400 / 365.25, 'year'];
  return rtf.format(Math.round(n), u);
}

export const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const FILETIME_OFFSET = 11644473600000n; // ms between 1601-01-01 and 1970-01-01

// Read a moment in almost any format. Returns { ms, how }.
export function parseMoment(input, mode = 'auto', tz = 'UTC') {
  const s = String(input).trim();
  if (!s || /^now$/i.test(s)) return { ms: Date.now(), how: 'now' };
  const isInt = /^-?\d+$/.test(s), isNum = /^-?\d+(\.\d+)?$/.test(s.replace(',', '.'));
  const n = isNum ? Number(s.replace(',', '.')) : NaN;
  const pick = m => {
    switch (m) {
      case 'unix': return { ms: n * 1000, how: 'Unix time in seconds' };
      case 'unixms': return { ms: n, how: 'Unix time in milliseconds' };
      case 'unixus': return { ms: n / 1000, how: 'Unix time in microseconds' };
      case 'unixns': return { ms: Number(BigInt(s) / 1000000n), how: 'Unix time in nanoseconds' };
      case 'excel': return { ms: EXCEL_EPOCH + n * 86400000, how: 'Excel serial date' };
      case 'ldap': return { ms: Number(BigInt(s.split('.')[0]) / 10000n - FILETIME_OFFSET), how: 'LDAP/Windows FILETIME (100 ns since 1601)' };
      case 'jd': return { ms: (n - 2440587.5) * 86400000, how: 'Julian Day (JD)' };
      case 'mjd': return { ms: (n + 2400000.5 - 2440587.5) * 86400000, how: 'Modified Julian Day (MJD)' };
    }
  };
  if (mode !== 'auto' && mode !== 'text' && mode !== 'ordinal') {
    if (!isNum) fail('Enter a number for this format.');
    if ((mode === 'ldap' || mode === 'unixns') && !isInt) fail('Enter a whole number for this format.');
    return pick(mode);
  }
  // Julian (ordinal) date: YYYY/DDD, YYYY-DDD or YYYYDDD
  const ord = /^(\d{4})[/-]?(\d{3})$/.exec(s);
  if (ord && (mode === 'ordinal' || (mode === 'auto' && (s.includes('/') || /^\d{4}-\d{3}$/.test(s))))) {
    const y = +ord[1], dd = +ord[2];
    if (dd < 1 || dd > (isLeap(y) ? 366 : 365)) fail(`Day ${dd} does not exist in ${y}; choose 1 to ${isLeap(y) ? 366 : 365}.`);
    const base = zonedToUtc(y, 1, 1, 0, 0, 0, 0, tz);
    return { ms: base + (dd - 1) * 86400000, how: 'Julian date (YYYY/DDD)' };
  }
  if (mode === 'ordinal') fail('Write a Julian date as YYYY/DDD, for example 2026/295.');
  if (isNum && mode === 'auto') {
    const digits = s.replace(/^-/, '').split('.')[0].length;
    if (/^JD/i.test(s)) return pick('jd');
    if (digits === 18 && isInt) return pick('ldap');
    if (digits >= 19 && isInt) return pick('unixns');
    if (digits >= 15) return pick('unixus');
    if (digits >= 13) return pick('unixms');
    if (digits <= 5 && n < 100000 && n > 0 && !isInt) return pick('excel');
    return pick('unix');
  }
  // ISO without a zone: read as time in the chosen time zone
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (iso) {
    const [, y, mo, d, h = 0, mi = 0, sec = 0, frac = '0', zone] = iso;
    const msec = Math.round(Number('0.' + frac) * 1000);
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +sec > 60) fail('This date or time does not exist. Check the month (1–12), day, hours (0–23) and minutes (0–59).');
    if (zone) {
      const off = zone.toUpperCase() === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (+zone.slice(1, 3) * 60 + +zone.slice(-2));
      return { ms: Date.UTC(y, mo - 1, d, h, mi, sec, msec) - off * 60000, how: 'ISO 8601' };
    }
    return { ms: zonedToUtc(+y, +mo, +d, +h, +mi, +sec, msec, tz), how: 'ISO 8601 (no zone, read as ' + tz + ')' };
  }
  // Day-month-year with dashes or dots: 22-10-2026 14:30 (slashes fall through to US month/day/year)
  const nlm = /^(\d{1,2})[-.](\d{1,2})[-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (nlm) {
    const [, d, mo, y, h = 0, mi = 0, sec = 0] = nlm;
    if (+mo > 12) fail('Month ' + mo + ' does not exist. With dashes or dots, use the order day-month-year.');
    return { ms: zonedToUtc(+y, +mo, +d, +h, +mi, +sec, 0, tz), how: 'Day-month-year' };
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return { ms: t, how: 'Date text (RFC 2822, US month/day/year or similar)' };
  fail('This moment could not be read. Try, for example, 2026-10-22T14:30:00Z, 1792671000, 10/22/2026 2:30 PM or “now”.');
}

const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function allFormats(ms, tz) {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) fail('This moment is outside the range a browser can handle (roughly the year −271,821 to 275,760).');
  const p = parts(ms, tz), u = parts(ms, 'UTC');
  const wk = isoWeek(p.y, p.mo, p.d);
  const jd = ms / 86400000 + 2440587.5;
  const ft = (BigInt(Math.round(ms)) + FILETIME_OFFSET) * 10000n;
  const local = `${DAYS[p.wd]}, ${MONTHS[p.mo - 1]} ${p.d}, ${p.y}, ${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}`;
  return [
    ['Local time (' + tz + ')', local + ' (UTC' + offStr(p.offset) + ')'],
    ['ISO 8601 (UTC)', new Date(ms).toISOString()],
    tz === 'UTC' ? null : ['ISO 8601 (' + tz + ')', isoIn(ms, tz)],
    ['RFC 3339 (with ms)', isoIn(ms, tz, true)],
    ['RFC 2822', `${DAY3[p.wd]}, ${p2(p.d)} ${MON3[p.mo - 1]} ${p.y} ${p2(p.h)}:${p2(p.mi)}:${p2(p.s)} ${offStr(p.offset, false)}`],
    ['ISO 9075 (SQL)', `${p.y}-${p2(p.mo)}-${p2(p.d)} ${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}`],
    ['HTTP date (RFC 7231)', `${DAY3[u.wd]}, ${p2(u.d)} ${MON3[u.mo - 1]} ${u.y} ${p2(u.h)}:${p2(u.mi)}:${p2(u.s)} GMT`],
    ['Unix time (seconds)', String(Math.floor(ms / 1000))],
    ['Unix time (milliseconds)', String(Math.round(ms))],
    ['Excel serial date', String(Math.round(((ms + p.offset * 60000 - EXCEL_EPOCH) / 86400000) * 1e6) / 1e6)],
    ['LDAP / Windows FILETIME', ft.toString()],
    ['Julian date (YYYY/DDD)', `${p.y}/${String(dayOfYear(p.y, p.mo, p.d)).padStart(3, '0')}`],
    ['Julian Day (JD)', jd.toFixed(5)],
    ['Modified Julian Day (MJD)', (jd - 2400000.5).toFixed(5)],
    ['ISO week number', `week ${wk.week} of ${wk.year} (${wk.year}-W${p2(wk.week)}-${(p.wd + 6) % 7 + 1})`],
    ['Day of year', `${dayOfYear(p.y, p.mo, p.d)} of ${isLeap(p.y) ? 366 : 365}`],
    ['Relative', relative(ms)],
  ].filter(Boolean);
}
