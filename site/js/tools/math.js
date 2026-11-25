import { T, fail } from '../core/registry.js';
import { fnum, int, num, plural, randInt, shuffle, duration, lines, bytesHuman, LOCALE } from '../core/util.js';
import { localZone, isoIn } from '../lib/time.js';

// ---------- Calculator ----------
const FN = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, sign: Math.sign,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, exp: Math.exp, ln: Math.log, log: (x, b) => b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b), log2: Math.log2, log10: Math.log10,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, min: Math.min, max: Math.max, hypot: Math.hypot, pow: Math.pow,
  sum: (...a) => a.reduce((x, y) => x + y, 0), avg: (...a) => a.reduce((x, y) => x + y, 0) / a.length, mean: (...a) => a.reduce((x, y) => x + y, 0) / a.length,
  gcd: (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; },
  lcm: (a, b) => Math.abs(a * b) / FN.gcd(a, b), fact: x => fact(x),
  ncr: (n, k) => fact(n) / (fact(k) * fact(n - k)), npr: (n, k) => fact(n) / fact(n - k), random: () => Math.random(),
};
const TRIG = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2'];
const CONST = { pi: Math.PI, π: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
function fact(n) {
  if (!Number.isInteger(n) || n < 0) fail('Factorial (!) only exists for whole numbers from 0 up.');
  if (n > 170) return Infinity;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
export function evaluate(src, vars = {}, deg = false) {
  const toks = [];
  const re = /\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|(0x[0-9a-f]+|0b[01]+)|([A-Za-z_π][\w]*)|(\*\*|[-+*/^%!(),;=×÷]))/giy;
  let m, i = 0;
  const s = src.trim();
  while (i < s.length) {
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) fail(`Unknown character “${s[i]}” at position ${i + 1}. Use a dot as the decimal point, such as 2.5.`);
    i = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) });
    else if (m[2]) toks.push({ t: 'n', v: Number(m[2]) });
    else if (m[3]) toks.push({ t: 'id', v: m[3].toLowerCase() === 'π' ? 'pi' : m[3] });
    else toks.push({ t: 'op', v: { '×': '*', '÷': '/', '**': '^', ';': ',' }[m[4]] ?? m[4] });
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  let p = 0;
  const peek = () => toks[p], eat = v => { if (toks[p]?.v === v) { p++; return true; } return false; };
  const need = v => { if (!eat(v)) fail(`Expected “${v}”${toks[p] ? ' but found “' + toks[p].v + '”' : ' at the end'}. Check the parentheses.`); };
  const trig = (f, x) => Math[f](deg && !f.startsWith('a') ? x * Math.PI / 180 : x);
  const atrig = (f, x) => deg ? Math[f](x) * 180 / Math.PI : Math[f](x);
  function primary() {
    const t = toks[p++];
    if (!t) fail('The calculation is incomplete.');
    if (t.t === 'n') return t.v;
    if (t.v === '(') { const v = expr(); need(')'); return v; }
    if (t.v === '-') return -unary();
    if (t.v === '+') return unary();
    if (t.t === 'id') {
      const name = t.v.toLowerCase();
      if (eat('(')) {
        const args = [];
        if (!eat(')')) { do args.push(expr()); while (eat(',')); need(')'); }
        if (TRIG.includes(name)) return name === 'atan2' ? (deg ? Math.atan2(...args) * 180 / Math.PI : Math.atan2(...args)) : name.startsWith('a') ? atrig(name, args[0]) : trig(name, args[0]);
        if (!FN[name]) fail(`Unknown function “${t.v}”. Known ones include sqrt, round, log, ln, sin, min, max and avg.`);
        return FN[name](...args);
      }
      if (name in vars) return vars[name];
      if (name in CONST) return CONST[name];
      fail(`Unknown name “${t.v}”. Define a variable first, such as “${t.v} = 5”.`);
    }
    fail(`Unexpected “${t.v}”.`);
  }
  // % right after a number is a percentage (21% = 0.21), unless another value follows (10 % 3 = remainder).
  const startsValue = t => t && (t.t === 'n' || t.t === 'id' || t.v === '(');
  function postfix() {
    let v = primary();
    for (;;) {
      if (peek()?.v === '!') { p++; v = fact(v); }
      else if (peek()?.v === '%' && !startsValue(toks[p + 1])) { p++; v /= 100; }
      else return v;
    }
  }
  function power() { const b = postfix(); if (eat('^')) return b ** unary(); return b; }
  function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) { const d = unary(); v /= d; }
      else if (eat('%')) v %= unary();
      else if (peek() && (peek().v === '(' || peek().t === 'id')) v *= unary(); // 2pi, 3(4+1)
      else return v;
    }
  }
  function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } }
  let assign = null;
  if (toks[0]?.t === 'id' && toks[1]?.v === '=') { assign = toks[0].v.toLowerCase(); if (assign in CONST || assign in FN) fail(`“${assign}” is a reserved name and cannot be a variable.`); p = 2; }
  const v = expr();
  if (p < toks.length) fail(`Unexpected “${toks[p].v}” after the end of the calculation.`);
  return { v, assign };
}
const fmtNum = x => !Number.isFinite(x) ? (Number.isNaN(x) ? 'not a number (for example the square root of a negative number)' : x > 0 ? '∞' : '−∞') : Math.abs(x) >= 1e15 || (Math.abs(x) < 1e-6 && x !== 0) ? x.toExponential(10).replace(/\.?0+e/, 'e') : fnum(+x.toPrecision(15), 10);
T({
  id: 'calc', cat: 'math', ic: '=', name: 'Calculator',
  desc: 'A multi-line calculator with functions, constants, variables and ans for the previous answer.',
  kw: 'calculator math evaluator calculate formula square root sine log variables',
  fields: [
    { k: 's', t: 'area', label: 'Calculations (one per line)', rows: 8, def: '2 * (3 + 4)^2\nans / 7\nsqrt(2)\nprice = 19.95\ntax = 8.25%\nprice * (1 + tax)\nround(pi, 4)\n5!' },
    { k: 'deg', t: 'chk', label: 'Angles in degrees', def: true },
  ],
  run(v) {
    const vars = {}, rows = [];
    let ans;
    for (const [i, line] of lines(v.s).entries()) {
      const src = line.replace(/#.*$|\/\/.*$/, '').trim();
      if (!src) continue;
      try {
        if (ans !== undefined) vars.ans = ans;
        const r = evaluate(src, vars, v.deg);
        if (r.assign) vars[r.assign] = r.v;
        ans = r.v;
        rows.push([i + 1, src, (r.assign ? r.assign + ' = ' : '') + fmtNum(r.v)]);
      } catch (e) { rows.push([i + 1, src, '⚠ ' + e.message]); }
    }
    if (!rows.length) return [{ note: 'Type a calculation, such as 12 * 7 or sqrt(81).', kind: 'info' }];
    return [{ l: 'Result', v: fmtNum(ans ?? NaN), big: true }, { l: 'Per line', table: { head: ['Line', 'Calculation', 'Result'], rows } },
      { note: 'Functions: sqrt, cbrt, abs, round(x, d), floor, ceil, ln, log, log2, exp, sin, cos, tan, asin, acos, atan, min, max, avg, sum, gcd, lcm, ncr, npr. Constants: pi, e, tau, phi. Also ^, % (percent or remainder), ! (factorial) and hex (0xff).', kind: 'info' }];
  },
});

// ---------- ETA ----------
T({
  id: 'eta', cat: 'math', ic: 'ETA', name: 'ETA calculator',
  desc: 'Calculate when a job will be done, from the total amount and the rate, or from the progress so far.',
  kw: 'eta arrival time finish remaining time progress rate speed estimate',
  fields: [
    { k: 'm', t: 'sel', label: 'I know', opts: [['rate', 'The rate'], ['progress', 'How much is done and how long that took']] },
    { k: 'total', t: 'num', label: 'Total amount', def: 1500 },
    { k: 'done', t: 'num', label: 'Already done', def: 300 },
    { k: 'rate', t: 'num', label: 'Rate (count)', def: 40, show: v => v.m === 'rate' },
    { k: 'per', t: 'sel', label: 'Per', def: '60', opts: [['1', 'second'], ['60', 'minute'], ['3600', 'hour'], ['86400', 'day']], show: v => v.m === 'rate' },
    { k: 'elapsed', t: 'text', label: 'Time so far (hh:mm or hh:mm:ss)', def: '00:45', show: v => v.m === 'progress' },
    { k: 'start', t: 'dt', label: 'Start time (empty = now)' },
  ],
  run(v) {
    const total = v.total, done = v.done || 0;
    if (!(total > 0)) fail('Enter a total amount greater than 0.');
    if (done > total) fail('More has been done than the total.');
    let perSec;
    if (v.m === 'rate') { if (!(v.rate > 0)) fail('Enter a rate greater than 0.'); perSec = v.rate / Number(v.per); }
    else {
      const t = v.elapsed.trim();
      if (!/^\d+(:\d{1,2}){1,2}$/.test(t)) fail('Enter the time as hh:mm or hh:mm:ss, for example 01:30.');
      const p = t.split(':').map(Number), secs = p.length === 2 ? p[0] * 3600 + p[1] * 60 : p[0] * 3600 + p[1] * 60 + p[2];
      if (!(secs > 0 && done > 0)) fail('Enter how much is done and how long that took.');
      perSec = done / secs;
    }
    const left = (total - done) / perSec;
    const startMs = v.start ? new Date(v.start).getTime() : Date.now();
    const end = startMs + left * 1000;
    const tz = localZone();
    return [{ l: 'Done at', v: new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full', timeStyle: 'short' }).format(end), big: true },
      { kv: [['Remaining', duration(left)], ['Still to do', `${fnum(total - done)} of ${fnum(total)} (${fnum(done / total * 100, 1)}% done)`], ['Rate', `${fnum(perSec * 60, 2)} per minute, ${fnum(perSec * 3600, 1)} per hour`], ['Total duration', duration(total / perSec)], ['Time (ISO)', isoIn(end, tz)]] }];
  },
});

// ---------- Percentages ----------
T({
  id: 'percent', cat: 'math', ic: '%', name: 'Percentage calculator',
  desc: 'Percentage of a number, what percentage it is, percentage change and increasing or decreasing by a percentage.',
  kw: 'percent percentage calculate discount increase decrease change tax',
  fields: [
    { k: 'x', t: 'text', label: 'Number X', def: '15' },
    { k: 'y', t: 'text', label: 'Number Y', def: '80' },
  ],
  ex: [{ n: '8.25% of 49.95', v: { x: '8.25', y: '49.95' } }, { n: 'From 120 to 90', v: { x: '120', y: '90' } }],
  run(v) {
    const x = num(v.x, 'number for X'), y = num(v.y, 'number for Y');
    const f = n => Number.isFinite(n) ? fnum(+n.toPrecision(12), 4) : '—';
    return [{ l: 'Results', kv: [
      [`${f(x)}% of ${f(y)}`, f(x / 100 * y)], [`${f(x)} is … % of ${f(y)}`, y ? f(x / y * 100) + '%' : '— (division by zero)'],
      [`From ${f(x)} to ${f(y)}`, x ? (y >= x ? '+' : '') + f((y - x) / Math.abs(x) * 100) + '%' : '— (start is zero)'], [`Difference between ${f(x)} and ${f(y)}`, f(Math.abs(y - x) / ((x + y) / 2) * 100) + '% (relative to the average)'],
      [`${f(y)} plus ${f(x)}%`, f(y * (1 + x / 100))], [`${f(y)} minus ${f(x)}%`, f(y * (1 - x / 100))],
      [`${f(y)} includes ${f(x)}%; without it, that is`, f(y / (1 + x / 100))],
    ] }];
  },
});

// ---------- Randomness ----------
T({
  id: 'random', cat: 'math', ic: '🎲', name: 'Random number, dice and picker', regen: true,
  desc: 'Draw a random number, roll dice, flip a coin or pick from a list, using cryptographically secure randomness.',
  kw: 'random number dice roll coin flip heads tails draw lottery pick list shuffle',
  fields: [
    { k: 'm', t: 'sel', label: 'What', opts: [['num', 'Number'], ['dice', 'Dice'], ['coin', 'Coin'], ['pick', 'Pick from a list'], ['shuffle', 'Shuffle a list']] },
    { k: 'min', t: 'num', label: 'From', def: 1, show: v => v.m === 'num' },
    { k: 'max', t: 'num', label: 'Through', def: 100, show: v => v.m === 'num' },
    { k: 'n', t: 'num', label: 'Count', def: 1, min: 1, max: 1000, show: v => ['num', 'coin', 'pick'].includes(v.m) },
    { k: 'uniq', t: 'chk', label: 'No repeats', show: v => v.m === 'num' || v.m === 'pick' },
    { k: 'dice', t: 'text', label: 'Roll (e.g. 2d6+3, d20, 4d6)', def: '2d6', mono: true, show: v => v.m === 'dice' },
    { k: 'list', t: 'area', label: 'List (one per line)', rows: 5, def: 'Alice\nBob\nCarol\nDave\nEve', show: v => v.m === 'pick' || v.m === 'shuffle' },
  ],
  run(v) {
    if (v.m === 'num') {
      const lo = Math.ceil(v.min), hi = Math.floor(v.max), n = Math.round(v.n);
      if (!(hi >= lo)) fail('“Through” must be greater than or equal to “from”.');
      if (hi - lo + 1 > 2 ** 32) fail('The range is too large (at most about 4 billion numbers).');
      if (v.uniq && n > hi - lo + 1) fail(`There are only ${hi - lo + 1} different numbers in this range.`);
      const out = [], seen = new Set();
      while (out.length < n) { const x = lo + randInt(hi - lo + 1); if (v.uniq) { if (seen.has(x)) continue; seen.add(x); } out.push(x); }
      return [{ l: n === 1 ? 'Number' : 'Numbers', v: out.join(n > 20 ? ', ' : '\n'), big: n === 1 }];
    }
    if (v.m === 'dice') {
      const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(v.dice);
      if (!m) fail('Write the roll as, for example, 2d6 (two six-sided dice) or d20+5.');
      const cnt = Number(m[1] || 1), sides = Number(m[2]), mod = Number((m[3] || '0').replace(/\s/g, ''));
      if (cnt < 1 || cnt > 100 || sides < 2 || sides > 1000) fail('Use 1 to 100 dice with 2 to 1000 sides.');
      const rolls = Array.from({ length: cnt }, () => 1 + randInt(sides));
      const total = rolls.reduce((a, b) => a + b, 0) + mod;
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      return [{ l: 'Total', v: String(total), big: true }, { l: 'Rolls', v: rolls.map(r => sides === 6 ? `${faces[r - 1]} ${r}` : r).join('   ') + (mod ? `   (${mod > 0 ? '+' : ''}${mod})` : '') }];
    }
    if (v.m === 'coin') {
      const n = Math.round(v.n);
      const out = Array.from({ length: n }, () => randInt(2) ? 'Heads' : 'Tails');
      return [{ l: n === 1 ? 'Result' : 'Results', v: out.join(n > 10 ? ', ' : '\n'), big: n === 1 }, n > 1 ? { note: `Heads: ${out.filter(x => x === 'Heads').length}, tails: ${out.filter(x => x === 'Tails').length}.`, kind: 'info' } : null];
    }
    const items = lines(v.list).map(x => x.trim()).filter(Boolean);
    if (!items.length) fail('Fill the list with at least one item.');
    if (v.m === 'shuffle') return [{ l: 'Shuffled', v: shuffle(items).join('\n') }];
    const n = Math.round(v.n);
    if (v.uniq && n > items.length) fail(`The list has only ${items.length} items.`);
    const out = v.uniq ? shuffle(items).slice(0, n) : Array.from({ length: n }, () => items[randInt(items.length)]);
    return [{ l: n === 1 ? 'Picked' : 'Picked items', v: out.join('\n'), big: n === 1 }];
  },
});

// ---------- RAID and ZFS ----------
const LEVELS = {
  raid0: ['RAID 0 (striping)', 2, n => n, () => 0, 'n× read, n× write'], raid1: ['RAID 1 (mirror)', 2, () => 1, n => n - 1, 'n× read, 1× write'],
  raid5: ['RAID 5 (parity)', 3, n => n - 1, () => 1, '(n−1)× read, slower writes due to parity'], raid6: ['RAID 6 (double parity)', 4, n => n - 2, () => 2, '(n−2)× read, slower writes'],
  raid10: ['RAID 10 (striped mirrors)', 4, n => n / 2, () => '1 per mirror (up to n/2 if you are lucky)', 'n× read, n/2× write'],
  raidz1: ['ZFS RAIDZ1', 3, n => n - 1, () => 1, 'IOPS of roughly one disk per vdev'], raidz2: ['ZFS RAIDZ2', 4, n => n - 2, () => 2, 'IOPS of roughly one disk per vdev'],
  raidz3: ['ZFS RAIDZ3', 5, n => n - 3, () => 3, 'IOPS of roughly one disk per vdev'], mirror: ['ZFS mirror (per vdev)', 2, () => 1, n => n - 1, 'n× read, 1× write per vdev'],
};
T({
  id: 'raid', cat: 'math', ic: 'RAID', name: 'RAID and ZFS calculator',
  desc: 'Calculate usable capacity and fault tolerance of RAID 0/1/5/6/10 and ZFS RAIDZ, including multiple vdevs.',
  kw: 'raid zfs raidz capacity storage nas disks calculate parity mirror truenas unraid',
  fields: [
    { k: 'lvl', t: 'sel', label: 'Level', def: 'raidz2', opts: Object.entries(LEVELS).map(([k, x]) => [k, x[0]]) },
    { k: 'n', t: 'num', label: 'Disks per group (vdev)', def: 6, min: 1 },
    { k: 'groups', t: 'num', label: 'Number of groups (vdevs)', def: 1, min: 1, hint: 'Two RAIDZ2 vdevs of 6 disks is 12 disks in total.' },
    { k: 'size', t: 'num', label: 'Size per disk (TB)', def: 8, min: 0.001 },
    { k: 'res', t: 'range', label: 'Space to keep free (%)', def: 0, min: 0, max: 30, hint: 'ZFS slows down above 80% full; keep for example 20% free.' },
  ],
  run(v) {
    const [name, min, data, tol, perf] = LEVELS[v.lvl];
    const n = Math.round(v.n), g = Math.round(v.groups);
    if (n < min) fail(`${name} needs at least ${min} disks.`);
    if (v.lvl === 'raid10' && n % 2) fail('RAID 10 needs an even number of disks.');
    const usableTB = data(n) * v.size * g;
    const raw = n * g * v.size;
    const after = usableTB * (1 - v.res / 100);
    const tib = x => fnum(x * 1e12 / 1024 ** 4, 2) + ' TiB';
    const t = tol(n);
    return [{ l: 'Usable', v: `${fnum(after, 2)} TB (${tib(after)})`, big: true },
      { kv: [['Total disks', String(n * g)], ['Raw capacity', `${fnum(raw, 2)} TB`], ['Usable (before reserve)', `${fnum(usableTB, 2)} TB = ${tib(usableTB)}`], ['Efficiency', fnum(usableTB / raw * 100, 1) + '%'],
        ['Can fail', typeof t === 'number' ? (g > 1 ? `${t} per group (so ${t} to ${t * g} in total)` : plural(t, 'disk', 'disks')) : t], ['Performance (rough)', perf]] },
      v.lvl === 'raid0' ? { note: 'RAID 0 has no redundancy: if one disk fails, you lose everything.', kind: 'err' } : null,
      v.lvl === 'raid5' && v.size >= 4 ? { note: 'With large disks a rebuild takes a long time and the chance of a second failure is high. Consider RAID 6 or RAIDZ2.', kind: 'warn' } : null,
      { note: 'TB is 10¹² bytes (as on the box), TiB is 2⁴⁰ bytes (as your operating system shows). ZFS also reserves a few percent itself. RAID is not a backup.', kind: 'info' }];
  },
});

// ---------- SLA ----------
const PERIODS = [['Per day', 86400], ['Per week', 604800], ['Per month (30.44 days)', 2629746], ['Per quarter', 7889238], ['Per year', 31556952]];
T({
  id: 'sla', cat: 'math', ic: 'SLA', name: 'Uptime and SLA calculator',
  desc: 'How much downtime is allowed at 99%, 99.9% or 99.99% availability? Also the combined availability of several components.',
  kw: 'sla uptime availability downtime nines 99.9 outage',
  fields: [
    { k: 'pct', t: 'text', label: 'Availability (%)', def: '99.9' },
    { k: 'chain', t: 'text', label: 'Components in series (optional, %)', ph: 'e.g. 99.95 99.9 99.99', hint: 'If one component fails, everything is down. The total availability is then lower.' },
  ],
  ex: [{ n: 'Four nines', v: { pct: '99.99' } }, { n: 'Chain', v: { chain: '99.95 99.9 99.99' } }],
  run(v) {
    const p = num(v.pct, 'percentage');
    if (!(p >= 0 && p <= 100)) fail('Availability lies between 0 and 100%.');
    const res = [{ l: `Allowed downtime at ${fnum(p, 5)}%`, table: { head: ['Period', 'Downtime', 'Uptime'], rows: PERIODS.map(([n, s]) => [n, duration(s * (1 - p / 100)) || '0 seconds', duration(s * p / 100)]) } }];
    const parts = v.chain.split(/[\s;]+/).filter(Boolean).map(x => num(x, 'percentage') / 100);
    if (parts.length) {
      const serial = parts.reduce((a, b) => a * b, 1), parallel = 1 - parts.reduce((a, b) => a * (1 - b), 1);
      res.push({ l: 'Combined', kv: [['In series (all required)', fnum(serial * 100, 5) + '% → ' + duration(31556952 * (1 - serial)) + ' per year'], ['In parallel (one is enough, redundant)', fnum(parallel * 100, 8) + '% → ' + (duration(31556952 * (1 - parallel)) || '0 s') + ' per year']] });
    }
    return res;
  },
});
