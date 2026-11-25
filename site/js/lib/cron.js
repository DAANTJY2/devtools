// Read cron expressions, explain them in plain English and compute the next runs.
import { fail } from '../core/registry.js';
import { parts, zonedToUtc, DAYS, MONTHS } from './time.js';

const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SPEC = [
  { name: 'minute', min: 0, max: 59 }, { name: 'hour', min: 0, max: 23 }, { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MON }, { name: 'day of week', min: 0, max: 7, names: DOW },
];

function field(src, spec) {
  const set = new Set();
  const val = s => {
    const low = s.toLowerCase();
    if (spec.names) { const i = spec.names.indexOf(low.slice(0, 3)); if (i >= 0 && /^[a-z]+$/.test(low)) return i + spec.min; }
    if (!/^\d+$/.test(s)) fail(`“${s}” is not a valid value for ${spec.name}.` + (/[LW#?]/.test(s) ? ' Characters such as L, W, # and ? belong to Quartz cron and are not supported here.' : ''));
    const n = +s;
    if (n < spec.min || n > spec.max) fail(`${spec.name[0].toUpperCase() + spec.name.slice(1)} must be between ${spec.min} and ${spec.max}; ${n} is not allowed.`);
    return n;
  };
  for (const part of src.split(',')) {
    const m = /^(\*|[^/-]+)(?:-([^/]+))?(?:\/(\d+))?$/.exec(part);
    if (!m) fail(`“${part}” is not a valid part for ${spec.name}.`);
    const step = m[3] ? +m[3] : 1;
    if (step < 1) fail('A step (/n) must be at least 1.');
    let lo, hi;
    if (m[1] === '*') { lo = spec.min; hi = spec.max === 7 ? 6 : spec.max; } else { lo = val(m[1]); hi = m[2] ? val(m[2]) : m[3] ? (spec.max === 7 ? 6 : spec.max) : lo; }
    if (lo > hi) fail(`The range ${lo}-${hi} for ${spec.name} runs backwards.`);
    for (let i = lo; i <= hi; i += step) set.add(spec.max === 7 && i === 7 ? 0 : i);
  }
  return { set, src, star: src === '*' || src === '*/1' };
}

export function parseCron(expr) {
  let s = expr.trim().replace(/\s+/g, ' ');
  if (!s) fail('Enter a cron expression, for example */5 * * * *.');
  if (s === '@reboot') return { reboot: true };
  if (s.startsWith('@')) { if (!MACROS[s]) fail(`Unknown shorthand “${s}”. Known ones are: ${Object.keys(MACROS).join(', ')} and @reboot.`); s = MACROS[s]; }
  const p = s.split(' ');
  let sec = null;
  if (p.length === 6) sec = field(p.shift(), { name: 'second', min: 0, max: 59 });
  if (p.length !== 5) fail(`A cron expression has 5 fields (minute hour day month weekday); this one has ${p.length}.`);
  const [mi, h, dom, mon, dow] = p.map((x, i) => field(x, SPEC[i]));
  return { sec, mi, h, dom, mon, dow, expr: s };
}

const list = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
const p2 = n => String(n).padStart(2, '0');
const hr = h => p2(h) + ':00';
function rangeText(f, unit, fmt = String) {
  const m = /^(\*|\d+)(?:-(\d+))?\/(\d+)$/.exec(f.src);
  if (m) {
    const from = m[1] === '*' ? '' : ` starting at ${fmt(+m[1])}`;
    return `every ${m[3]} ${unit}${m[2] ? ` from ${fmt(+m[1])} through ${fmt(+m[2])}` : from}`;
  }
  const r = /^(\d+)-(\d+)$/.exec(f.src);
  if (r) return `from ${fmt(+r[1])} through ${fmt(+r[2])}`;
  return null;
}
export function explain(c) {
  if (c.reboot) return 'Once, when the system starts.';
  const mins = [...c.mi.set].sort((a, b) => a - b), hrs = [...c.h.set].sort((a, b) => a - b);
  let time;
  if (c.mi.star && c.h.star) time = 'every minute';
  else if (!c.mi.star && c.h.star) time = mins.length === 1 ? (mins[0] === 0 ? 'every hour, on the hour' : `every hour at ${mins[0]} minutes past`) : rangeText(c.mi, 'minutes') || `every hour at minute ${list(mins)}`;
  else if (mins.length * hrs.length <= 6 && !/\//.test(c.mi.src + c.h.src)) time = 'at ' + list(hrs.flatMap(h => mins.map(m => `${p2(h)}:${p2(m)}`)));
  else {
    const mt = c.mi.star ? 'every minute' : rangeText(c.mi, 'minutes') || `at minute ${list(mins)}`;
    const ht = rangeText(c.h, 'hours', hr) || `during hour ${list(hrs.map(hr))}`;
    time = `${mt}, ${ht.startsWith('from') ? 'between ' + ht.replace('from ', '').replace(' through ', ' and ') : ht}`;
  }
  if (c.sec && !(c.sec.set.size === 1 && c.sec.set.has(0))) time = (rangeText(c.sec, 'seconds') || `at second ${list([...c.sec.set].sort((a, b) => a - b))}`) + ', ' + time;
  const dows = [...c.dow.set].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAYS[d]);
  const dowText = /^1-5$/.test(c.dow.src) ? 'on weekdays (Monday through Friday)' : /^(0,6|6,0|6-7|sat,sun|sun,sat)$/i.test(c.dow.src) ? 'on weekends' : rangeText(c.dow, 'days', d => DAYS[d % 7]) ? 'on ' + rangeText(c.dow, 'days', d => DAYS[d % 7]).replace(/^from /, '') : 'on ' + list(dows);
  const domText = rangeText(c.dom, 'days') ? rangeText(c.dom, 'days') + ' of the month' : `on day ${list([...c.dom.set].sort((a, b) => a - b))} of the month`;
  let day = '';
  if (!c.dom.star && !c.dow.star) day = `${domText}, and ${dowText}`;
  else if (!c.dom.star) day = domText;
  else if (!c.dow.star) day = dowText;
  const mon = c.mon.star ? '' : 'in ' + list([...c.mon.set].sort((a, b) => a - b).map(m => MONTHS[m - 1]));
  const out = [time, day, mon].filter(Boolean).join(', ');
  return out[0].toUpperCase() + out.slice(1) + '.';
}

// Next runs (in a time zone). Works day by day, so it is fast even for rare schedules.
export function nextRuns(c, from = Date.now(), n = 10, tz = 'UTC') {
  if (c.reboot) return [];
  const out = [];
  const start = parts(from, tz);
  let y = start.y, mo = start.mo, d = start.d;
  const hrs = [...c.h.set].sort((a, b) => a - b), mins = [...c.mi.set].sort((a, b) => a - b), secs = c.sec ? [...c.sec.set].sort((a, b) => a - b) : [0];
  for (let i = 0; i < 366 * 8 && out.length < n; i++) {
    const date = new Date(Date.UTC(y, mo - 1, d + i));
    const Y = date.getUTCFullYear(), M = date.getUTCMonth() + 1, D = date.getUTCDate(), W = date.getUTCDay();
    if (!c.mon.set.has(M)) continue;
    const domOk = c.dom.set.has(D), dowOk = c.dow.set.has(W);
    const dayOk = c.dom.star && c.dow.star ? true : c.dom.star ? dowOk : c.dow.star ? domOk : domOk || dowOk;
    if (!dayOk) continue;
    for (const h of hrs) for (const m of mins) for (const s of secs) {
      const t = zonedToUtc(Y, M, D, h, m, s, 0, tz);
      const back = parts(t, tz);
      if (back.h !== h || back.mi !== m) continue; // skipped by daylight saving time
      if (t > from && out.length < n && !out.includes(t)) out.push(t);
    }
  }
  return out;
}
