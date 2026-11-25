import { T, fail } from '../core/registry.js';
import { fnum, int, num, plural, lines, duration } from '../core/util.js';
import { parts, zonedToUtc, localZone, zones, isoIn, offStr, DAYS, MONTHS, parseMoment, isoWeek } from '../lib/time.js';

// ---------- Stopwatch and timer ----------
const fmtMs = ms => { const t = Math.max(0, ms); const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, cs = Math.floor(t / 10) % 100; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0'); };
T({
  id: 'chrono', cat: 'time', ic: '⏱', name: 'Stopwatch and timer',
  desc: 'A stopwatch with lap times and a countdown timer with sound.',
  kw: 'stopwatch chronometer timer countdown lap times alarm',
  ui(root, { h, copy }) {
    // Stopwatch
    let start = 0, acc = 0, running = false, laps = [], raf;
    const disp = h('div', { class: 'bigtime', role: 'timer', 'aria-live': 'off' }, fmtMs(0));
    const now = () => acc + (running ? performance.now() - start : 0);
    const tick = () => { disp.textContent = fmtMs(now()); if (running) raf = requestAnimationFrame(tick); };
    const sBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => { if (running) { acc = now(); running = false; sBtn.textContent = 'Resume'; } else { start = performance.now(); running = true; sBtn.textContent = 'Pause'; tick(); } lapBtn.disabled = !running; } }, 'Start');
    const lapBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => { const t = now(); laps.push(t); drawLaps(); } }, 'Lap');
    const rBtn = h('button', { class: 'btn', type: 'button', onclick: () => { running = false; acc = 0; laps = []; sBtn.textContent = 'Start'; lapBtn.disabled = true; disp.textContent = fmtMs(0); drawLaps(); } }, 'Reset');
    const lapBox = h('div');
    function drawLaps() {
      if (!laps.length) { lapBox.replaceChildren(); return; }
      const rows = laps.map((t, i) => [i + 1, fmtMs(t - (laps[i - 1] || 0)), fmtMs(t)]).reverse();
      const tb = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Lap'), h('th', {}, 'Lap time'), h('th', {}, 'Total'))), h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, String(c)))))));
      lapBox.replaceChildren(h('div', { class: 'row', style: 'justify-content:flex-end;margin:8px 0' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => copy(rows.map(r => r.join('\t')).join('\n')) }, 'Copy laps')), h('div', { class: 'tablewrap' }, tb));
    }
    // Timer
    let tEnd = 0, tLeft = 0, tRun = false, tRaf, ctxA;
    const tDisp = h('div', { class: 'bigtime', role: 'timer' }, '05:00.00');
    const mins = h('input', { type: 'number', min: 0, value: 5, 'aria-label': 'Minutes', style: 'width:90px' });
    const secs = h('input', { type: 'number', min: 0, max: 59, value: 0, 'aria-label': 'Seconds', style: 'width:90px' });
    const tStatus = h('p', { class: 'muted small', role: 'status' });
    const beep = () => { try { ctxA ??= new AudioContext(); for (let i = 0; i < 3; i++) { const o = ctxA.createOscillator(), g = ctxA.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctxA.destination); g.gain.setValueAtTime(0.25, ctxA.currentTime + i * 0.35); g.gain.exponentialRampToValueAtTime(0.001, ctxA.currentTime + i * 0.35 + 0.3); o.start(ctxA.currentTime + i * 0.35); o.stop(ctxA.currentTime + i * 0.35 + 0.3); } } catch { /* no sound available */ } };
    const tTick = () => {
      const left = tRun ? tEnd - performance.now() : tLeft;
      tDisp.textContent = fmtMs(left);
      if (tRun && left <= 0) { tRun = false; tLeft = 0; tBtn.textContent = 'Start'; tStatus.textContent = 'Time is up!'; document.title = '⏰ Time is up · DevTools'; beep(); return; }
      if (tRun) tRaf = requestAnimationFrame(tTick);
    };
    const setFromInputs = () => { tLeft = (Number(mins.value) * 60 + Number(secs.value)) * 1000; tDisp.textContent = fmtMs(tLeft); };
    mins.addEventListener('input', () => !tRun && setFromInputs()); secs.addEventListener('input', () => !tRun && setFromInputs());
    const tBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
      if (tRun) { tLeft = tEnd - performance.now(); tRun = false; tBtn.textContent = 'Resume'; return; }
      if (tLeft <= 0) setFromInputs();
      if (tLeft <= 0) { tStatus.textContent = 'Set a time first.'; return; }
      ctxA ??= (() => { try { return new AudioContext(); } catch { return undefined; } })();
      tEnd = performance.now() + tLeft; tRun = true; tBtn.textContent = 'Pause'; tStatus.textContent = ''; tTick();
    } }, 'Start');
    const tReset = h('button', { class: 'btn', type: 'button', onclick: () => { tRun = false; tBtn.textContent = 'Start'; tStatus.textContent = ''; setFromInputs(); } }, 'Reset');
    const presets = h('div', { class: 'row' }, [1, 3, 5, 10, 15, 25, 30, 60].map(m => h('button', { class: 'chip', type: 'button', onclick: () => { mins.value = m; secs.value = 0; if (!tRun) setFromInputs(); } }, m + ' min')));
    root.append(h('div', { class: 'panel' }, h('h2', { style: 'margin-top:0' }, 'Stopwatch'), disp, h('div', { class: 'row', style: 'justify-content:center' }, sBtn, lapBtn, rBtn), lapBox),
      h('div', { class: 'panel', style: 'margin-top:12px' }, h('h2', { style: 'margin-top:0' }, 'Timer'), tDisp, h('div', { class: 'row', style: 'justify-content:center' }, mins, h('span', {}, 'min'), secs, h('span', {}, 's'), tBtn, tReset), h('div', { style: 'margin-top:10px' }, presets), tStatus));
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(tRaf); running = false; tRun = false; ctxA?.close?.(); };
  },
});

// ---------- Units ----------
const U = {
  len: ['Length', { µm: 1e-6, mm: 1e-3, cm: 0.01, dm: 0.1, m: 1, km: 1000, 'inch (in)': 0.0254, 'foot (ft)': 0.3048, 'yard (yd)': 0.9144, 'mile (mi)': 1609.344, 'nautical mile (nmi)': 1852 }, 'm'],
  mass: ['Mass', { mg: 1e-6, g: 1e-3, kg: 1, 'metric ton (t)': 1000, 'ounce (oz)': 0.028349523125, 'pound (lb)': 0.45359237, 'stone (st)': 6.35029318, 'short ton (US)': 907.18474, 'long ton (UK)': 1016.0469088 }, 'kg'],
  vol: ['Volume', { ml: 1e-3, cl: 0.01, dl: 0.1, 'liter (l)': 1, 'm³': 1000, 'cm³': 1e-3, 'teaspoon (US)': 0.00492892159375, 'tablespoon (US)': 0.01478676478125, 'cup (US)': 0.2365882365, 'fl oz (US)': 0.0295735295625, 'pint (US)': 0.473176473, 'quart (US)': 0.946352946, 'gallon (US)': 3.785411784, 'pint (UK)': 0.56826125, 'gallon (UK)': 4.54609 }, 'liter (l)'],
  area: ['Area', { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, 'are (a)': 100, 'hectare (ha)': 1e4, 'km²': 1e6, 'in²': 0.00064516, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224, 'mi²': 2589988.110336 }, 'm²'],
  speed: ['Speed', { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, 'knots (kn)': 1852 / 3600, 'ft/s': 0.3048, 'Mach (at 20 °C)': 343 }, 'km/h'],
  data: ['Data', { bit: 0.125, 'byte (B)': 1, 'KB (10³)': 1e3, 'MB (10⁶)': 1e6, 'GB (10⁹)': 1e9, 'TB (10¹²)': 1e12, 'PB (10¹⁵)': 1e15, 'KiB (2¹⁰)': 1024, 'MiB (2²⁰)': 1024 ** 2, 'GiB (2³⁰)': 1024 ** 3, 'TiB (2⁴⁰)': 1024 ** 4, 'Kbit': 125, 'Mbit': 125e3, 'Gbit': 125e6 }, 'GB (10⁹)'],
  time: ['Time', { ns: 1e-9, 'µs': 1e-6, ms: 1e-3, second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, 'month (average)': 2629746, 'year (average)': 31556952 }, 'hour'],
  press: ['Pressure', { Pa: 1, hPa: 100, kPa: 1000, MPa: 1e6, bar: 1e5, mbar: 100, psi: 6894.757293168, 'atm': 101325, mmHg: 133.322387415, inHg: 3386.389 }, 'bar'],
  energy: ['Energy', { J: 1, kJ: 1000, MJ: 1e6, Wh: 3600, kWh: 3.6e6, cal: 4.184, kcal: 4184, BTU: 1055.05585262, therm: 105505585.262, eV: 1.602176634e-19 }, 'kWh'],
  power: ['Power', { W: 1, kW: 1000, MW: 1e6, 'hp (mechanical)': 745.69987158227, 'PS (metric hp)': 735.49875, 'BTU/h': 0.29307107 }, 'kW'],
  angle: ['Angle', { degree: 1, radian: 180 / Math.PI, gradian: 0.9, turn: 360, arcminute: 1 / 60, arcsecond: 1 / 3600 }, 'degree'],
  temp: ['Temperature', { 'Celsius (°C)': 0, 'Fahrenheit (°F)': 0, 'Kelvin (K)': 0, 'Rankine (°R)': 0, 'Réaumur (°Ré)': 0 }, 'Celsius (°C)'],
};
const toC = (x, u) => u.startsWith('Celsius') ? x : u.startsWith('Fahrenheit') ? (x - 32) * 5 / 9 : u.startsWith('Kelvin') ? x - 273.15 : u.startsWith('Rankine') ? (x - 491.67) * 5 / 9 : x * 1.25;
const fromC = (c, u) => u.startsWith('Celsius') ? c : u.startsWith('Fahrenheit') ? c * 9 / 5 + 32 : u.startsWith('Kelvin') ? c + 273.15 : u.startsWith('Rankine') ? (c + 273.15) * 9 / 5 : c * 0.8;
const fmtU = x => Math.abs(x) >= 1e12 || (Math.abs(x) < 1e-6 && x !== 0) ? x.toExponential(6).replace(/\.?0+e/, 'e') : fnum(+x.toPrecision(12), 8);
function unitsTool(id, name, desc, cat, ic) {
  T({
    id, cat: 'time', ic, name, desc,
    kw: 'units convert converter length mass weight volume temperature celsius fahrenheit kelvin speed pressure energy power data angle inch pound',
    fields: [
      { k: 'c', t: 'sel', label: 'Quantity', def: cat, opts: Object.entries(U).map(([k, x]) => [k, x[0]]) },
      { k: 'x', t: 'text', label: 'Value', def: cat === 'temp' ? '70' : '1' },
      ...Object.entries(U).map(([k, [, units, def]]) => ({ k: 'u_' + k, t: 'sel', label: 'Unit', def: k === 'temp' && cat === 'temp' ? 'Fahrenheit (°F)' : def, opts: Object.keys(units), show: v => v.c === k })),
    ],
    ex: cat === 'temp' ? [{ n: '100 °C', v: { x: '100', u_temp: 'Celsius (°C)' } }, { n: '0 K', v: { x: '0', u_temp: 'Kelvin (K)' } }] : [{ n: '6 ft', v: { c: 'len', x: '6', u_len: 'foot (ft)' } }, { n: '1 TB in TiB', v: { c: 'data', x: '1', u_data: 'TB (10¹²)' } }],
    run(v) {
      const x = num(v.x, 'value');
      const [label, units] = U[v.c], from = v['u_' + v.c];
      let rows;
      if (v.c === 'temp') {
        const c = toC(x, from);
        if (c < -273.15 - 1e-9) fail('This temperature is below absolute zero (−273.15 °C) and does not exist.');
        rows = Object.keys(units).map(u => [u, fmtU(fromC(c, u))]);
      } else {
        const base = x * units[from];
        rows = Object.entries(units).map(([u, f]) => [u, fmtU(base / f)]);
      }
      return [{ l: `${label}: ${fnum(x)} ${from}`, kv: rows }];
    },
  });
}
unitsTool('units', 'Unit converter', 'Convert length, mass, volume, area, speed, data, time, pressure, energy, power, angle and temperature.', 'len', 'm↔ft');
unitsTool('temperature', 'Temperature converter', 'Convert between Celsius, Fahrenheit, Kelvin, Rankine and Réaumur.', 'temp', '°F');

// ---------- Benchmark ----------
const stats = a => {
  const s = [...a].sort((x, y) => x - y), n = s.length, mean = s.reduce((x, y) => x + y, 0) / n;
  const q = p => { const i = (n - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, n - 1)] - s[lo]) * (i - lo); };
  const sd = n > 1 ? Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, median: q(0.5), min: s[0], max: s[n - 1], sd, p95: q(0.95) };
};
T({
  id: 'benchmark', cat: 'time', ic: 'BM', name: 'Benchmark comparer',
  desc: 'Compare your own measurements: mean, median, spread and the difference between variants.',
  kw: 'benchmark measurement compare mean average median standard deviation statistics performance',
  fields: [
    { k: 's', t: 'area', label: 'Measurements (one series per line: name: values)', rows: 5, def: 'Old: 120 118 125 130 119 122\nNew: 98 101 95 110 97 99\nCache: 45 47 44 90 46 45' },
    { k: 'unit', t: 'text', label: 'Unit', def: 'ms' },
    { k: 'lower', t: 'chk', label: 'Lower is better (e.g. time)', def: true },
  ],
  run(v) {
    const series = lines(v.s).filter(l => l.trim()).map((l, i) => {
      const m = /^\s*([^:]+):(.*)$/.exec(l);
      const name = m ? m[1].trim() : 'Series ' + (i + 1);
      const vals = (m ? m[2] : l).split(/[\s;]+/).filter(Boolean).map(x => num(x, 'measurement'));
      if (!vals.length) fail(`The series “${name}” has no measurements.`);
      return { name, ...stats(vals) };
    });
    if (!series.length) return [{ note: 'Enter at least one series of measurements, for example “A: 12 13 11”.', kind: 'info' }];
    const u = v.unit ? ' ' + v.unit : '';
    const f = x => fnum(x, 3) + u;
    const best = series.reduce((a, b) => (v.lower ? b.median < a.median : b.median > a.median) ? b : a);
    const base = series[0];
    const res = [{ l: 'Statistics', table: { head: ['Series', 'n', 'Mean', 'Median', 'Min', 'Max', 'Std. dev.', 'P95', 'vs. ' + base.name], rows: series.map(s => [s.name, s.n, f(s.mean), f(s.median), f(s.min), f(s.max), f(s.sd), f(s.p95), s === base ? '—' : (s.median >= base.median ? '+' : '') + fnum((s.median - base.median) / base.median * 100, 1) + '%']) } }];
    if (series.length > 1) {
      res.push({ note: `Best (by median): ${best.name}${best !== base ? `, ${fnum(Math.abs(best.median - base.median) / base.median * 100, 1)}% ${v.lower === (best.median < base.median) ? 'better' : 'worse'} than ${base.name}` : ''}.`, kind: 'ok' });
      for (const s of series.slice(1)) {
        if (s.n < 2 || base.n < 2) continue;
        const t = (s.mean - base.mean) / Math.sqrt(s.sd ** 2 / s.n + base.sd ** 2 / base.n || 1e-12);
        res.push({ note: `${s.name} vs ${base.name}: t = ${fnum(t, 2)}. ${Math.abs(t) > 2.5 ? 'The difference is probably real.' : 'The difference could be chance; take more measurements.'}`, kind: Math.abs(t) > 2.5 ? 'info' : 'warn' });
      }
    }
    return res;
  },
});

// ---------- Date calculator ----------
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const D = 86400000;
// nth (1-based) weekday wd of month mo (0-based); n = -1 is the last one.
const nthWeekday = (y, mo, wd, n) => {
  if (n > 0) { const first = new Date(Date.UTC(y, mo, 1)).getUTCDay(); return Date.UTC(y, mo, 1 + ((wd - first + 7) % 7) + (n - 1) * 7); }
  const last = new Date(Date.UTC(y, mo + 1, 0)); return last.getTime() - ((last.getUTCDay() - wd + 7) % 7) * D;
};
export function publicHolidays(y, region = 'us', { goodFriday = false, liberation = 'lustrum' } = {}) {
  const out = new Map();
  const key = t => new Date(t).toISOString().slice(0, 10);
  const add = (t, n) => out.set(key(t), n);
  const weekend = t => [0, 6].includes(new Date(t).getUTCDay());
  if (region === 'us') {
    // Federal holidays; fixed dates on a Saturday are observed on Friday, on a Sunday on Monday.
    const fixed = (mo, d, n) => { const t = Date.UTC(y, mo, d), wd = new Date(t).getUTCDay(); add(wd === 6 ? t - D : wd === 0 ? t + D : t, wd % 6 ? n : n + ' (observed)'); };
    fixed(0, 1, 'New Year’s Day'); add(nthWeekday(y, 0, 1, 3), 'Martin Luther King Jr. Day'); add(nthWeekday(y, 1, 1, 3), 'Washington’s Birthday');
    add(nthWeekday(y, 4, 1, -1), 'Memorial Day'); if (y >= 2021) fixed(5, 19, 'Juneteenth'); fixed(6, 4, 'Independence Day');
    add(nthWeekday(y, 8, 1, 1), 'Labor Day'); add(nthWeekday(y, 9, 1, 2), 'Columbus Day'); fixed(10, 11, 'Veterans Day');
    add(nthWeekday(y, 10, 4, 4), 'Thanksgiving Day'); fixed(11, 25, 'Christmas Day');
  } else if (region === 'uk') {
    // Bank holidays in England and Wales; fixed dates on a weekend move to the next free weekday.
    const e = easter(y);
    const sub = (t, n) => { let s = t, moved = false; while (weekend(s) || out.has(key(s))) { s += D; moved = true; } add(s, moved ? n + ' (substitute day)' : n); };
    sub(Date.UTC(y, 0, 1), 'New Year’s Day'); add(e - 2 * D, 'Good Friday'); add(e + D, 'Easter Monday');
    add(nthWeekday(y, 4, 1, 1), 'Early May bank holiday'); add(nthWeekday(y, 4, 1, -1), 'Spring bank holiday'); add(nthWeekday(y, 7, 1, -1), 'Summer bank holiday');
    sub(Date.UTC(y, 11, 25), 'Christmas Day'); sub(Date.UTC(y, 11, 26), 'Boxing Day');
  } else if (region === 'nl') {
    const e = easter(y);
    add(Date.UTC(y, 0, 1), 'New Year’s Day (Nieuwjaarsdag)');
    if (goodFriday) add(e - 2 * D, 'Good Friday (Goede Vrijdag)');
    add(e, 'Easter Sunday'); add(e + D, 'Easter Monday');
    const kd = Date.UTC(y, 3, 27); add(new Date(kd).getUTCDay() === 0 ? kd - D : kd, 'King’s Day (Koningsdag)');
    if (liberation === 'always' || (liberation === 'lustrum' && y % 5 === 0)) add(Date.UTC(y, 4, 5), 'Liberation Day (Bevrijdingsdag)');
    add(e + 39 * D, 'Ascension Day'); add(e + 49 * D, 'Whit Sunday'); add(e + 50 * D, 'Whit Monday');
    add(Date.UTC(y, 11, 25), 'Christmas Day'); add(Date.UTC(y, 11, 26), 'Boxing Day (Tweede kerstdag)');
  }
  return out;
}
const dayKey = t => new Date(t).toISOString().slice(0, 10);
const isWorkday = (t, hol) => { const d = new Date(t).getUTCDay(); return d !== 0 && d !== 6 && !(hol && holCache(new Date(t).getUTCFullYear(), hol).has(dayKey(t))); };
const hc = new Map();
const holCache = (y, o) => { const k = y + JSON.stringify(o); if (!hc.has(k)) hc.set(k, publicHolidays(y, o.region, o)); return hc.get(k); };
const parseDate = (s, what) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) fail(`Choose a ${what}.`); const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fmtDate = t => { const d = new Date(t); return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
T({
  id: 'datecalc', cat: 'time', ic: '±D', name: 'Date calculator',
  desc: 'The difference between two dates (including business days, with public holidays) and a date plus or minus a number of days.',
  kw: 'date calculate difference days business days working days holidays add subtract weeks months age deadline',
  fields: [
    { k: 'm', t: 'sel', label: 'Calculation', opts: [['diff', 'Difference between two dates'], ['add', 'Date plus or minus']] },
    { k: 'a', t: 'date', label: 'Start date', def: today },
    { k: 'b', t: 'date', label: 'End date', def: () => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), show: v => v.m === 'diff' },
    { k: 'n', t: 'num', label: 'Amount (negative = back)', def: 30, show: v => v.m === 'add' },
    { k: 'unit', t: 'sel', label: 'Unit', opts: [['d', 'days'], ['wd', 'business days'], ['w', 'weeks'], ['mo', 'months'], ['y', 'years']], show: v => v.m === 'add' },
    { k: 'region', t: 'sel', label: 'Public holidays', opts: [['us', 'United States (federal)'], ['uk', 'United Kingdom (England & Wales)'], ['nl', 'Netherlands'], ['', 'None (weekends only)']] },
    { k: 'gf', t: 'chk', label: 'Good Friday is a day off', show: v => v.region === 'nl' },
    { k: 'lib', t: 'sel', label: 'Liberation Day (May 5) off', opts: [['lustrum', 'Once every 5 years (2025, 2030…)'], ['always', 'Every year'], ['never', 'Never']], show: v => v.region === 'nl' },
    { k: 'incl', t: 'chk', label: 'Include the end date', show: v => v.m === 'diff' },
  ],
  run(v) {
    const a = parseDate(v.a, 'start date');
    const hol = v.region ? { region: v.region, goodFriday: v.gf, liberation: v.lib } : null;
    if (v.m === 'add') {
      const n = Math.round(v.n || 0);
      let t = a;
      if (v.unit === 'd') t = a + n * D;
      else if (v.unit === 'w') t = a + n * 7 * D;
      else if (v.unit === 'wd') { let left = Math.abs(n); const s = Math.sign(n) || 1; while (left > 0) { t += s * D; if (isWorkday(t, hol)) left--; } }
      else { const d = new Date(a); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + (v.unit === 'mo' ? n : n * 12)); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); t = d.getTime(); }
      const wk = isoWeek(...new Date(t).toISOString().slice(0, 10).split('-').map(Number));
      const hName = hol && holCache(new Date(t).getUTCFullYear(), hol).get(dayKey(t));
      return [{ l: 'Result', v: fmtDate(t), big: true }, { kv: [['ISO date', dayKey(t)], ['Week number', `week ${wk.week}`], ['Business day', isWorkday(t, hol) ? 'yes' : 'no' + (hName ? ` (${hName})` : '')]] }];
    }
    let b = parseDate(v.b, 'end date');
    const neg = b < a;
    const [s, e] = neg ? [b, a] : [a, b];
    const end = e + (v.incl ? D : 0);
    const days = Math.round((end - s) / D);
    let work = 0;
    const holidays = [];
    for (let t = s; t < end; t += D) { if (isWorkday(t, hol)) work++; else if (hol) { const n = holCache(new Date(t).getUTCFullYear(), hol).get(dayKey(t)); const wd = new Date(t).getUTCDay(); if (n && wd !== 0 && wd !== 6) holidays.push([dayKey(t), n]); } }
    const ds = new Date(s), de = new Date(end - (v.incl ? D : 0));
    let mo = (de.getUTCFullYear() - ds.getUTCFullYear()) * 12 + de.getUTCMonth() - ds.getUTCMonth();
    if (de.getUTCDate() < ds.getUTCDate()) mo--;
    const rest = Math.round((de - Date.UTC(ds.getUTCFullYear(), ds.getUTCMonth() + mo, ds.getUTCDate())) / D);
    return [{ l: 'Difference', v: plural(days, 'day', 'days') + (neg ? ' (the end date is before the start date)' : ''), big: true },
      { kv: [['In weeks', `${plural(Math.floor(days / 7), 'week', 'weeks')} and ${plural(days % 7, 'day', 'days')}`], ['In years, months and days', `${plural(Math.floor(mo / 12), 'year', 'years')}, ${plural(mo % 12, 'month', 'months')} and ${plural(rest, 'day', 'days')}`], ['Business days', int(work) + (hol ? ' (excluding weekends and public holidays)' : ' (excluding weekends)')], ['Weekend days', int(Array.from({ length: days }, (_, i) => new Date(s + i * D).getUTCDay()).filter(d => d === 0 || d === 6).length)], ['In hours', int(days * 24)]] },
      holidays.length ? { l: 'Public holidays in this period (on a weekday)', table: { head: ['Date', 'Holiday'], rows: holidays } } : null];
  },
});

// ---------- Time zones ----------
const CITIES = [['Honolulu', 'Pacific/Honolulu'], ['Anchorage', 'America/Anchorage'], ['Los Angeles', 'America/Los_Angeles'], ['Denver', 'America/Denver'], ['Chicago', 'America/Chicago'], ['New York', 'America/New_York'], ['Toronto', 'America/Toronto'], ['São Paulo', 'America/Sao_Paulo'], ['UTC', 'UTC'], ['London', 'Europe/London'], ['Lisbon', 'Europe/Lisbon'], ['Amsterdam', 'Europe/Amsterdam'], ['Berlin', 'Europe/Berlin'], ['Helsinki', 'Europe/Helsinki'], ['Istanbul', 'Europe/Istanbul'], ['Moscow', 'Europe/Moscow'], ['Lagos', 'Africa/Lagos'], ['Johannesburg', 'Africa/Johannesburg'], ['Dubai', 'Asia/Dubai'], ['Mumbai', 'Asia/Kolkata'], ['Bangkok', 'Asia/Bangkok'], ['Singapore', 'Asia/Singapore'], ['Shanghai', 'Asia/Shanghai'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney'], ['Auckland', 'Pacific/Auckland']];
T({
  id: 'timezone', cat: 'time', ic: 'TZ', name: 'Time zone converter',
  desc: 'Convert a moment to the local time in major cities, including daylight saving time, or compare time zones of your choice.',
  kw: 'time zone timezone convert world clock cities daylight saving time dst utc meeting planner',
  fields: [
    { k: 't', t: 'dt', label: 'Moment (empty = now)' },
    { k: 'tz', t: 'sel', label: 'In time zone', def: localZone, opts: [...new Set([localZone(), 'UTC', 'America/New_York', 'Europe/London', ...zones()])] },
    { k: 'extra', t: 'text', label: 'Extra time zones (comma-separated)', ph: 'e.g. Asia/Manila, America/Phoenix', mono: true },
    { k: 'all', t: 'chk', label: 'Show all cities', def: true },
  ],
  run(v) {
    let ms = Date.now();
    if (v.t) { const [d, tm] = v.t.split('T'); const [y, mo, dd] = d.split('-').map(Number); const [hh, mi, ss = 0] = tm.split(':').map(Number); ms = zonedToUtc(y, mo, dd, hh, mi, ss, 0, v.tz); }
    const mine = parts(ms, v.tz);
    const extra = v.extra.split(',').map(x => x.trim()).filter(Boolean).map(z => { try { parts(0, z); return [z.split('/').pop().replace(/_/g, ' '), z]; } catch { fail(`Unknown time zone “${z}”. Use an IANA name such as Europe/Paris.`); } });
    const list = [...extra, ...(v.all ? CITIES : [])];
    const rows = list.map(([city, z]) => {
      const p = parts(ms, z);
      const dst = p.offset !== Math.min(parts(Date.UTC(mine.y, 0, 15), z).offset, parts(Date.UTC(mine.y, 6, 15), z).offset);
      const dayDiff = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(mine.y, mine.mo - 1, mine.d)) / 86400000);
      const diff = (p.offset - mine.offset) / 60;
      return [city, `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`, `${DAYS[p.wd].slice(0, 3)}, ${MONTHS[p.mo - 1].slice(0, 3)} ${p.d}${dayDiff ? (dayDiff > 0 ? ' (+1 day)' : ' (−1 day)') : ''}`, 'UTC' + offStr(p.offset), (diff >= 0 ? '+' : '') + fnum(diff, 2) + ' h', dst ? 'DST' : '', z];
    });
    return [{ l: `${v.tz}: ${DAYS[mine.wd]}, ${MONTHS[mine.mo - 1]} ${mine.d}, ${mine.y}, ${String(mine.h).padStart(2, '0')}:${String(mine.mi).padStart(2, '0')}`, kv: [['ISO 8601', isoIn(ms, v.tz)], ['UTC', new Date(ms).toISOString()]] },
      rows.length ? { l: 'Elsewhere', table: { head: ['Place', 'Time', 'Date', 'UTC offset', 'vs. you', '', 'Time zone'], rows } } : null];
  },
});

// ---------- POSIX time zone ----------
const RULE = /^(?:J(\d{1,3})|(\d{1,3})|M(\d{1,2})\.(\d)\.(\d))(?:\/([+-]?\d{1,3}(?::\d{2}){0,2}))?$/;
const ORD = ['', 'first', 'second', 'third', 'fourth', 'last'];
const hms = s => { const neg = s.startsWith('-'); const p = s.replace(/^[+-]/, '').split(':').map(Number); const v = (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); return neg ? -v : v; };
const fmtHms = sec => { const neg = sec < 0; sec = Math.abs(sec); return (neg ? '−' : '') + String(Math.floor(sec / 3600)).padStart(2, '0') + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + (sec % 60 ? ':' + String(sec % 60).padStart(2, '0') : ''); };
export function parsePosixTz(s) {
  const m = /^\s*(<[^>]+>|[A-Za-z]{3,})([+-]?\d{1,2}(?::\d{2}){0,2})(?:(<[^>]+>|[A-Za-z]{3,})([+-]?\d{1,2}(?::\d{2}){0,2})?(?:,([^,]+),([^,]+))?)?\s*$/.exec(s);
  if (!m) fail('This is not a valid POSIX time zone. Example: EST5EDT,M3.2.0,M11.1.0 (name, offset, optionally a DST name and rules).');
  const std = { name: m[1].replace(/[<>]/g, ''), off: -hms(m[2]) };
  const out = { std };
  if (m[3]) {
    out.dst = { name: m[3].replace(/[<>]/g, ''), off: m[4] ? -hms(m[4]) : std.off + 3600 };
    const rule = r => {
      const x = RULE.exec(r || '');
      if (!x) fail(`The rule “${r}” cannot be read. Use Mm.w.d (for example M3.5.0), Jn or n, optionally with /time.`);
      const time = x[6] !== undefined ? hms(x[6]) : 7200;
      if (x[3]) { const mo = +x[3], w = +x[4], d = +x[5]; if (mo < 1 || mo > 12 || w < 1 || w > 5 || d > 6) fail(`The rule “${r}” is wrong: month 1–12, week 1–5, day 0–6.`); return { kind: 'M', mo, w, d, time }; }
      return { kind: x[1] ? 'J' : 'n', n: +(x[1] ?? x[2]), time };
    };
    if (!m[5]) fail('Daylight saving time needs two rules, such as ,M3.2.0,M11.1.0.');
    out.start = rule(m[5]); out.end = rule(m[6]);
  }
  return out;
}
const ruleText = r => r.kind === 'M' ? `the ${ORD[r.w]} ${DAYS[r.d]} of ${MONTHS[r.mo - 1]} at ${fmtHms(r.time)} (local time)` : r.kind === 'J' ? `day ${r.n} of the year (excluding February 29) at ${fmtHms(r.time)}` : `day ${r.n} of the year (from 0, including February 29) at ${fmtHms(r.time)}`;
function ruleDate(r, y) {
  if (r.kind === 'M') {
    const first = new Date(Date.UTC(y, r.mo - 1, 1)).getUTCDay();
    let day = 1 + ((r.d - first + 7) % 7) + (r.w - 1) * 7;
    const last = new Date(Date.UTC(y, r.mo, 0)).getUTCDate();
    while (day > last) day -= 7;
    return Date.UTC(y, r.mo - 1, day);
  }
  if (r.kind === 'J') { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return Date.UTC(y, 0, r.n + (leap && r.n >= 60 ? 1 : 0)); }
  return Date.UTC(y, 0, 1 + r.n);
}
// IANA zone to POSIX, derived from this year's transitions.
export function ianaToPosix(tz, year = new Date().getUTCFullYear()) {
  const off = t => parts(t, tz).offset;
  // Abbreviation such as CET or EST; different English locales know different abbreviations.
  const name = (t, o) => {
    for (const loc of ['en-GB', 'en-US', 'en-AU', 'en-IN', 'en-NZ']) {
      try {
        const n = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(t).find(p => p.type === 'timeZoneName')?.value;
        if (n && /^[A-Za-z]{3,5}$/.test(n) && (!/^(GMT|UTC)$/.test(n) || o === 0)) return n;
      } catch { /* try the next locale */ }
    }
    const h = Math.trunc(Math.abs(o) / 60), m = Math.abs(o) % 60;
    return '<' + (o < 0 ? '-' : '+') + String(h).padStart(2, '0') + (m ? String(m).padStart(2, '0') : '') + '>';
  };
  const posOff = o => { const s = -o / 60; const h = Math.trunc(s), m = Math.abs(o % 60); return String(h) + (m ? ':' + String(m).padStart(2, '0') : ''); };
  const t0 = Date.UTC(year, 0, 1), t1 = Date.UTC(year + 1, 0, 1);
  const trans = [];
  let prev = off(t0);
  for (let t = t0 + 86400000; t <= t1; t += 86400000) {
    const o = off(t);
    if (o !== prev) { let lo = t - 86400000, hi = t; while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (off(mid) === prev) lo = mid; else hi = mid; } trans.push({ t: hi, from: prev, to: o }); prev = o; }
  }
  const stdOff = trans.length ? Math.min(...trans.map(x => x.from), ...trans.map(x => x.to)) : off(t0);
  const stdName = name(trans.length ? (trans.find(x => x.to === stdOff)?.t ?? t0) + 3600000 : t0, stdOff);
  if (trans.length !== 2) return `${stdName}${posOff(stdOff)}`;
  const dstOff = Math.max(trans[0].from, trans[0].to);
  const start = trans.find(x => x.to === dstOff), end = trans.find(x => x.to === stdOff);
  const rule = (x, localOff) => {
    const lt = new Date(x.t + localOff * 60000);
    const d = lt.getUTCDate(), mo = lt.getUTCMonth() + 1, wd = lt.getUTCDay();
    const last = new Date(Date.UTC(lt.getUTCFullYear(), mo, 0)).getUTCDate();
    const w = d + 7 > last ? 5 : Math.ceil(d / 7);
    const secs = lt.getUTCHours() * 3600 + lt.getUTCMinutes() * 60;
    return `M${mo}.${w}.${wd}${secs === 7200 ? '' : '/' + fmtHms(secs).replace(/^0(\d)/, '$1').replace(/:00$/, '')}`;
  };
  const dstName = name(start.t + 3600000, dstOff);
  return `${stdName}${posOff(stdOff)}${dstName}${dstOff - stdOff === 60 ? '' : posOff(dstOff)},${rule(start, start.from)},${rule(end, end.from)}`;
}
T({
  id: 'posixtz', cat: 'time', ic: 'TZP', name: 'POSIX time zone converter',
  desc: 'Explain a POSIX time zone string (TZ=…) with offset and DST rules, or create one from an IANA time zone (handy for ESP32 and embedded devices).',
  kw: 'posix time zone tz string est5edt cet-1cest daylight saving rules esp32 embedded iana convert',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['parse', 'Explain a POSIX string'], ['iana', 'IANA time zone → POSIX']] },
    { k: 's', t: 'text', label: 'POSIX time zone', def: 'EST5EDT,M3.2.0,M11.1.0', mono: true, show: v => v.m === 'parse' },
    { k: 'tz', t: 'sel', label: 'IANA time zone', def: 'America/New_York', opts: [...new Set(['America/New_York', 'Europe/London', ...zones()])], show: v => v.m === 'iana' },
  ],
  ex: [{ n: 'Central Europe', v: { m: 'parse', s: 'CET-1CEST,M3.5.0,M10.5.0/3' } }, { n: 'India', v: { m: 'parse', s: '<+0530>-5:30' } }, { n: 'London → POSIX', v: { m: 'iana', tz: 'Europe/London' } }],
  run(v) {
    const s = v.m === 'iana' ? ianaToPosix(v.tz) : v.s;
    const z = parsePosixTz(s);
    const res = [];
    if (v.m === 'iana') res.push({ l: 'POSIX string', v: s, big: true });
    const kv = [['Standard time', `${z.std.name}, UTC${offStr(z.std.off / 60)}`]];
    if (z.dst) {
      kv.push(['Daylight saving time', `${z.dst.name}, UTC${offStr(z.dst.off / 60)}`], ['DST starts', ruleText(z.start)], ['DST ends', ruleText(z.end)]);
      const y = new Date().getUTCFullYear();
      const rows = [y, y + 1].flatMap(yy => [[`${yy}: start`, z.start, z.std.off], [`${yy}: end`, z.end, z.dst.off]].map(([n, r, o]) => {
        const local = ruleDate(r, yy) + r.time * 1000;
        return [n, new Date(local).toISOString().slice(0, 16).replace('T', ' ') + ' local', new Date(local - o * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'];
      }));
      res.push({ l: 'Explanation', kv }, { l: 'Transitions', table: { head: ['When', 'Local time', 'UTC'], rows } });
    } else res.push({ l: 'Explanation', kv: [...kv, ['Daylight saving time', 'none']] });
    res.push({ note: 'Note: POSIX inverts the sign. EST5 means UTC−5 and CET-1 means UTC+1.', kind: 'info' });
    return res;
  },
});
