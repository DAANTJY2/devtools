import { T, fail } from '../core/registry.js';
import { lib, parseJSON, plural, randInt, int, show, lines } from '../core/util.js';
import { parseCron, explain, nextRuns } from '../lib/cron.js';
import { localZone, zones, isoIn, MONTHS } from '../lib/time.js';
import { pretty as xmlPretty, minify as xmlMinify } from '../lib/xmlfmt.js';
import { parseAs, stringifyAs, xmlErr } from './convert.js';
import { memo } from '../lib/memo.js';
import { PORTS } from '../lib/ports.js';

// ---------- Git cheat sheet ----------
memo({
  id: 'gitcmd', cat: 'dev', ic: 'GIT', name: 'Git cheat sheet',
  desc: 'Git commands from the daily flow to undoing mistakes and cleaning up.',
  kw: 'git memo cheatsheet cheat sheet command branch commit rebase reset stash',
  sections: {
    'Getting started': [['git init', 'New repository in the current directory'], ['git clone <url>', 'Copy a repository'], ['git config --global user.name "Name"', 'Set your name'], ['git config --global user.email "you@example.com"', 'Set your email address'], ['git config --global init.defaultBranch main', 'Make main the default branch']],
    'Daily work': [['git status', 'What has changed?'], ['git add <file>', 'Stage a file for commit'], ['git add -p', 'Choose hunk by hunk what to stage'], ['git commit -m "Message"', 'Create a commit'], ['git pull --rebase', 'Fetch and replay your work on top'], ['git push', 'Send to the remote'], ['git push -u origin <branch>', 'Push a new branch for the first time'], ['git diff', 'Show unstaged changes'], ['git diff --staged', 'Show staged changes']],
    'Branches': [['git switch -c <branch>', 'Create a new branch and switch to it'], ['git switch <branch>', 'Switch to a branch'], ['git branch -a', 'List all branches'], ['git branch -d <branch>', 'Delete a merged branch'], ['git merge <branch>', 'Merge a branch into the current one'], ['git rebase main', 'Put your branch on top of main'], ['git rebase -i HEAD~3', 'Rewrite the last three commits (squash, reword)'], ['git cherry-pick <commit>', 'Apply a single commit']],
    'History': [['git log --oneline --graph --all', 'Compact graph of all branches'], ['git log -p <file>', 'History of a file with changes'], ['git blame <file>', 'Who changed which line?'], ['git show <commit>', 'Show one commit'], ['git reflog', 'Everything HEAD did; your rescue after mistakes']],
    'Undoing': [['git restore <file>', 'Discard changes in a file'], ['git restore --staged <file>', 'Unstage a file'], ['git commit --amend', 'Amend the last commit (not yet pushed)'], ['git reset --soft HEAD~1', 'Undo the last commit, keep the changes'], ['git reset --hard HEAD~1', 'Discard the last commit and its changes (careful!)'], ['git revert <commit>', 'New commit that reverts an old one (safe after push)'], ['git push --force-with-lease', 'Safer force push after rewriting']],
    'Stashing': [['git stash', 'Stash changes temporarily'], ['git stash -u', 'Also stash new files'], ['git stash list', 'List stashed changes'], ['git stash pop', 'Restore the latest stash']],
    'Cleaning up': [['git clean -nd', 'Show which untracked files would be removed'], ['git clean -fd', 'Remove untracked files and directories'], ['git fetch --prune', 'Also clean up deleted remote branches locally'], ['git gc', 'Clean up and compact the repository']],
    'Remotes and tags': [['git remote -v', 'List remotes'], ['git remote add origin <url>', 'Add a remote'], ['git tag -a v1.0.0 -m "Version 1.0.0"', 'Create a tag'], ['git push --tags', 'Push tags']],
  },
});

// ---------- Random port ----------
const KNOWN = new Set(PORTS.map(p => p[0]));
T({
  id: 'port', cat: 'dev', ic: 'PRT', name: 'Random port generator', regen: true,
  desc: 'Pick a random port outside the well-known ports, for a new service or container.',
  kw: 'port random free docker service',
  fields: [
    { k: 'min', t: 'num', label: 'From', def: 1024, min: 1, max: 65535 },
    { k: 'max', t: 'num', label: 'Through', def: 49151, min: 1, max: 65535 },
    { k: 'n', t: 'num', label: 'Count', def: 5, min: 1, max: 100 },
  ],
  run(v) {
    const lo = Math.round(v.min), hi = Math.round(v.max), n = Math.round(v.n);
    if (!(lo >= 1 && hi <= 65535 && lo <= hi)) fail('Choose a range between 1 and 65535, with “from” lower than “through”.');
    if (hi - lo + 1 < n * 2) fail('The range is too small for that many ports.');
    const set = new Set();
    for (let i = 0; set.size < n && i < 100000; i++) { const p = lo + randInt(hi - lo + 1); if (!KNOWN.has(p)) set.add(p); }
    return [{ l: n === 1 ? 'Port' : 'Ports', v: [...set].join('\n'), big: n === 1 },
      { note: 'These ports are not in the list of well-known services. Check on your server that they are free with: ss -tulpn | grep :<port>', kind: 'info' }];
  },
});

// ---------- Cron ----------
const DAYOPTS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];
T({
  id: 'cron', cat: 'dev', ic: 'CRN', name: 'Crontab generator',
  desc: 'Build a cron expression from drop-downs or have an existing one explained, with the next runs.',
  kw: 'cron crontab expression schedule explain generator builder next',
  fields: [
    { k: 'mode', t: 'sel', label: 'Mode', opts: [['explain', 'Explain an expression'], ['build', 'Build an expression']] },
    { k: 'expr', t: 'text', label: 'Cron expression', def: '*/15 9-17 * * 1-5', mono: true, show: v => v.mode === 'explain', hint: 'minute hour day month weekday; @daily and a sixth field for seconds also work' },
    { k: 'freq', t: 'sel', label: 'How often', show: v => v.mode === 'build', opts: [['min', 'Every n minutes'], ['hour', 'Every hour'], ['day', 'Every day'], ['week', 'Every week'], ['month', 'Every month'], ['year', 'Every year']] },
    { k: 'every', t: 'sel', label: 'Every … minutes', def: '5', opts: ['1', '2', '5', '10', '15', '20', '30'], show: v => v.mode === 'build' && v.freq === 'min' },
    { k: 'minute', t: 'num', label: 'At minute', def: 0, min: 0, max: 59, show: v => v.mode === 'build' && v.freq === 'hour' },
    { k: 'time', t: 'time', label: 'At', def: '03:00', step: 60, show: v => v.mode === 'build' && ['day', 'week', 'month', 'year'].includes(v.freq) },
    { k: 'dow', t: 'sel', label: 'On', opts: DAYOPTS, show: v => v.mode === 'build' && v.freq === 'week' },
    { k: 'dom', t: 'num', label: 'On day', def: 1, min: 1, max: 31, show: v => v.mode === 'build' && (v.freq === 'month' || v.freq === 'year') },
    { k: 'mon', t: 'sel', label: 'In month', show: v => v.mode === 'build' && v.freq === 'year', opts: MONTHS.map((m, i) => [String(i + 1), m]) },
    { k: 'wd', t: 'chk', label: 'Weekdays only', show: v => v.mode === 'build' && ['min', 'hour', 'day'].includes(v.freq) },
    { k: 'tz', t: 'sel', label: 'Server time zone', def: localZone, opts: [...new Set(['UTC', localZone(), 'America/New_York', 'Europe/London', ...zones()])] },
  ],
  ex: [{ n: 'Every 5 minutes', v: { mode: 'explain', expr: '*/5 * * * *' } }, { n: 'Nightly backup', v: { mode: 'explain', expr: '30 2 * * *' } }, { n: '1st of the month', v: { mode: 'explain', expr: '0 0 1 * *' } }, { n: '@weekly', v: { mode: 'explain', expr: '@weekly' } }],
  run(v) {
    let expr = v.expr;
    if (v.mode === 'build') {
      const [hh, mm] = (v.time || '03:00').split(':').map(Number);
      const wd = v.wd ? '1-5' : '*';
      const dom = Math.round(v.dom || 1);
      expr = { min: `*/${v.every} * * * ${wd}`, hour: `${Math.round(v.minute || 0)} * * * ${wd}`, day: `${mm} ${hh} * * ${wd}`, week: `${mm} ${hh} * * ${v.dow}`, month: `${mm} ${hh} ${dom} * *`, year: `${mm} ${hh} ${dom} ${v.mon} *` }[v.freq];
    }
    const c = parseCron(expr);
    const runs = nextRuns(c, Date.now(), 10, v.tz);
    const res = [];
    if (v.mode === 'build') res.push({ l: 'Cron expression', v: expr, big: true });
    res.push({ note: explain(c), kind: 'ok' });
    if (!c.reboot) {
      res.push({ l: 'Fields', table: { head: ['Field', 'Value', 'Means'], rows: [['Minute', c.mi.src, [...c.mi.set].join(',')], ['Hour', c.h.src, [...c.h.set].join(',')], ['Day of month', c.dom.src, c.dom.star ? 'every' : [...c.dom.set].join(',')], ['Month', c.mon.src, c.mon.star ? 'every' : [...c.mon.set].join(',')], ['Day of week', c.dow.src, c.dow.star ? 'every' : [...c.dow.set].join(',') + ' (0 = Sunday)']] } });
      res.push(runs.length ? { l: `Next runs (${v.tz})`, table: { head: ['#', 'Time'], rows: runs.map((t, i) => [i + 1, isoIn(t, v.tz).replace('T', ' ')]) } } : { note: 'This expression will never run in the coming years (for example February 31).', kind: 'warn' });
      if (!c.dom.star && !c.dow.star) res.push({ note: 'Note: when both day of month and day of week are set, cron runs when either one matches (not both).', kind: 'warn' });
    }
    return res;
  },
});

// ---------- JSON ----------
const sortDeep = o => Array.isArray(o) ? o.map(sortDeep) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b)).map(k => [k, sortDeep(o[k])])) : o;
const SAMPLE_JSON = '{"name":"toolkit","version":"2.0.0","tools":[{"id":"subnet","category":"network"},{"id":"jwt","category":"web"}],"active":true,"owner":null}';
function jsonTool(id, name, desc, mode) {
  T({
    id, cat: 'dev', ic: mode === 'min' ? '{-}' : '{ }', name, desc,
    kw: 'json prettify format beautify minify validate validator sort lint',
    fields: [
      { k: 's', t: 'area', label: 'JSON', def: mode === 'min' ? JSON.stringify(JSON.parse(SAMPLE_JSON), null, 2) : SAMPLE_JSON, rows: 10 },
      { k: 'm', t: 'sel', label: 'Action', def: mode, opts: [['pretty', 'Prettify'], ['min', 'Minify'], ['check', 'Validate only']] },
      { k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']], show: v => v.m === 'pretty' },
      { k: 'sort', t: 'chk', label: 'Sort keys' },
    ],
    ex: [{ n: 'Error', err: true, v: { s: '{"a": 1, "b": [1, 2,], }' } }],
    run(v) {
      let o = parseJSON(v.s);
      if (v.sort) o = sortDeep(o);
      if (v.m === 'check') return [{ note: 'Valid JSON.', kind: 'ok' }];
      const out = v.m === 'min' ? JSON.stringify(o) : JSON.stringify(o, null, v.indent === 'tab' ? '\t' : Number(v.indent));
      return [{ l: v.m === 'min' ? `Minified (${int(out.length)} characters, was ${int(v.s.length)})` : 'Formatted', v: out }];
    },
  });
}
jsonTool('json', 'JSON prettify and validate', 'Prettify, minify, sort and validate JSON, with clear error messages.', 'pretty');
jsonTool('jsonmin', 'JSON minify', 'Remove all unnecessary whitespace and line breaks from JSON.', 'min');

// ---------- CSV ----------
export function parseCsv(s, delim) {
  if (!delim) {
    const first = s.split(/\r?\n/)[0];
    delim = [',', ';', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows = [];
  let row = [], cell = '', q = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
    i++;
  }
  if (q) fail('A quote in the CSV is never closed.');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { rows: rows.filter(r => !(r.length === 1 && r[0] === '')), delim };
}
const csvCell = (x, d) => { const s = x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x); return /["\n\r]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const flatten = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? p + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v; } return out; };
T({
  id: 'csvjson', cat: 'dev', ic: 'CSV', name: 'JSON to CSV and back',
  desc: 'Convert a JSON list to CSV, or CSV to JSON objects. Nested objects become columns like a.b.',
  kw: 'json csv converter convert excel spreadsheet table comma semicolon',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['j2c', 'JSON → CSV'], ['c2j', 'CSV → JSON']] },
    { k: 's', t: 'area', label: 'Input', rows: 9, def: '[\n  {"name": "Alice", "city": "Boston", "age": 34},\n  {"name": "Bob", "city": "Leeds", "age": 28, "address": {"street": "1 High Street"}}\n]' },
    { k: 'd', t: 'sel', label: 'Delimiter', opts: [['', 'Automatic / comma'], [',', 'Comma'], [';', 'Semicolon'], ['\t', 'Tab'], ['|', 'Pipe']] },
    { k: 'head', t: 'chk', label: 'First row is a header', def: true, show: v => v.m === 'c2j' },
    { k: 'typed', t: 'chk', label: 'Detect numbers and true/false', def: true, show: v => v.m === 'c2j' },
  ],
  ex: [{ n: 'CSV → JSON', v: { m: 'c2j', s: 'name,city,age\nAlice,Boston,34\n"Smith, Bob",Leeds,28', d: '' } }],
  run(v) {
    if (v.m === 'j2c') {
      let data = parseJSON(v.s);
      if (!Array.isArray(data)) data = [data];
      if (!data.every(x => x && typeof x === 'object')) fail('Use a JSON list of objects, such as [{"a": 1}, {"a": 2}].');
      const flat = data.map(x => flatten(x));
      const cols = [...new Set(flat.flatMap(Object.keys))];
      const d = v.d || ',';
      const csv = [cols.map(c => csvCell(c, d)).join(d), ...flat.map(r => cols.map(c => csvCell(r[c], d)).join(d))].join('\n');
      return [{ l: `CSV (${plural(flat.length, 'row', 'rows')}, ${plural(cols.length, 'column', 'columns')})`, v: csv }, { l: 'Download', dl: { name: 'export.csv', data: '\ufeff' + csv, mime: 'text/csv' } }];
    }
    const { rows, delim } = parseCsv(v.s, v.d);
    if (!rows.length) fail('No CSV data found.');
    const conv = x => !v.typed ? x : /^-?\d+([.]\d+)?$/.test(x) ? Number(x) : x === 'true' ? true : x === 'false' ? false : x === '' ? null : x;
    const head = v.head ? rows[0] : rows[0].map((_, i) => 'column' + (i + 1));
    const out = (v.head ? rows.slice(1) : rows).map(r => Object.fromEntries(head.map((h, i) => [h, conv(r[i] ?? '')])));
    return [{ note: `Delimiter: ${{ ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }[delim]}; ${plural(out.length, 'row', 'rows')}.`, kind: 'info' }, { l: 'JSON', v: JSON.stringify(out, null, 2) }];
  },
});

// ---------- SQL ----------
T({
  id: 'sql', cat: 'dev', ic: 'SQL', name: 'SQL formatter',
  desc: 'Make SQL queries readable with line breaks and uppercase keywords, for many SQL dialects.',
  kw: 'sql formatter prettify beautify format query mysql postgresql tsql sqlite',
  fields: [
    { k: 's', t: 'area', label: 'SQL', rows: 8, def: "select u.id, u.name, count(o.id) as total from users u left join orders o on o.user_id = u.id where u.active = 1 and o.created >= '2026-01-01' group by u.id, u.name having count(o.id) > 5 order by total desc limit 10;" },
    { k: 'lang', t: 'sel', label: 'Dialect', opts: [['sql', 'Standard SQL'], ['postgresql', 'PostgreSQL'], ['mysql', 'MySQL'], ['mariadb', 'MariaDB'], ['tsql', 'SQL Server (T-SQL)'], ['sqlite', 'SQLite'], ['plsql', 'Oracle PL/SQL'], ['bigquery', 'BigQuery']] },
    { k: 'kc', t: 'sel', label: 'Keywords', opts: [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['preserve', 'As entered']] },
    { k: 'tab', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces']] },
  ],
  async run(v) {
    const { format } = await lib('sqlformat');
    try { return [{ l: 'Formatted', v: format(v.s, { language: v.lang, keywordCase: v.kc, tabWidth: Number(v.tab), linesBetweenQueries: 2 }) }]; } catch (e) {
      fail('This SQL could not be parsed' + (/line (\d+)/.test(e.message) ? ' (around line ' + e.message.match(/line (\d+)/)[1] + ')' : '') + '. Check parentheses and quotes, or choose a different dialect.');
    }
  },
});

// ---------- chmod ----------
const WHO = [['u', 'Owner'], ['g', 'Group'], ['o', 'Others']];
const PERM = [['r', 'read', 4], ['w', 'write', 2], ['x', 'execute', 1]];
const chmodFields = WHO.flatMap(([w, wl]) => PERM.map(([p, pl]) => ({ k: w + p, t: 'chk', label: `${wl}: ${pl}`, on: (v, ctx) => ctx.set('oct', toOct(v)) })));
const toOct = v => (v.suid ? 4 : 0) + (v.sgid ? 2 : 0) + (v.sticky ? 1 : 0) + WHO.map(([w]) => PERM.reduce((a, [p, , n]) => a + (v[w + p] ? n : 0), 0)).join('');
const fromOct = s => {
  const d = s.trim().replace(/^0o?/, '').padStart(3, '0');
  if (!/^[0-7]{3,4}$/.test(d)) fail('An octal mode has 3 or 4 digits from 0 to 7, for example 755 or 2775.');
  const four = d.padStart(4, '0');
  const v = { suid: !!(+four[0] & 4), sgid: !!(+four[0] & 2), sticky: !!(+four[0] & 1) };
  WHO.forEach(([w], i) => PERM.forEach(([p, , n]) => { v[w + p] = !!(+four[i + 1] & n); }));
  return v;
};
T({
  id: 'chmod', cat: 'dev', ic: '755', name: 'Chmod calculator',
  desc: 'Calculate Linux file permissions: tick the permissions or enter an octal value.',
  kw: 'chmod permissions linux unix octal 755 644 rwx setuid sticky',
  fields: [
    { k: 'oct', t: 'text', label: 'Octal', def: '755', mono: true, on: (v, ctx) => { try { ctx.set(fromOct(v.oct)); } catch { ctx.rerun(); } } },
    ...chmodFields.map((f, i) => ({ ...f, def: [true, true, true, true, false, true, true, false, true][i] })),
    { k: 'suid', t: 'chk', label: 'setuid', on: (v, ctx) => ctx.set('oct', toOct(v)) },
    { k: 'sgid', t: 'chk', label: 'setgid', on: (v, ctx) => ctx.set('oct', toOct(v)) },
    { k: 'sticky', t: 'chk', label: 'sticky bit', on: (v, ctx) => ctx.set('oct', toOct(v)) },
    { k: 'file', t: 'text', label: 'File or directory', def: 'script.sh' },
  ],
  ex: [{ n: '644', v: { oct: '644', ...fromOct('644') } }, { n: '600 (keys)', v: { oct: '600', ...fromOct('600') } }, { n: '1777 (/tmp)', v: { oct: '1777', ...fromOct('1777') } }],
  run(v) {
    const p = fromOct(v.oct);
    const sym = WHO.map(([w], i) => PERM.map(([c], j) => {
      const on = p[w + c];
      if (j === 2) { const special = [p.suid, p.sgid, p.sticky][i]; if (special) return on ? (i === 2 ? 't' : 's') : (i === 2 ? 'T' : 'S'); }
      return on ? c : '-';
    }).join('')).join('');
    const oct = toOct(p).replace(/^0(?=\d{3}$)/, '');
    const words = WHO.map(([w, wl]) => `${wl}: ${PERM.filter(([c]) => p[w + c]).map(x => x[1]).join(', ') || 'nothing'}`);
    const res = [{ l: 'Result', kv: [['Octal', oct], ['Symbolic', sym], ['As shown by ls -l', '-' + sym], ['Command', `chmod ${oct} ${v.file}`], ['Symbolic command', `chmod ${WHO.map(([w]) => w + '=' + PERM.filter(([c]) => p[w + c]).map(x => x[0]).join('')).join(',')} ${v.file}`], ['Matching umask', (0o777 & ~parseInt(oct.slice(-3), 8)).toString(8).padStart(3, '0')]] },
      { note: words.join('. ') + '.', kind: 'info' }];
    if (p.ow) res.push({ note: 'Everyone can write. That is rarely intended, except for shared directories with the sticky bit.', kind: 'warn' });
    if (p.suid) res.push({ note: 'setuid: the program runs with the owner’s permissions. Use it sparingly.', kind: 'warn' });
    return res;
  },
});

// ---------- docker run to compose ----------
export function shellSplit(s) {
  const out = [];
  let cur = '', q = null, has = false;
  const t = s.replace(/\\\r?\n/g, ' ');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && /["\\$`]/.test(t[i + 1])) cur += t[++i]; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (c === '\\') { cur += t[++i] ?? ''; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += c;
  }
  if (q) fail('A quote in the command is never closed.');
  if (cur || has) out.push(cur);
  return out;
}
const FLAGS = {
  '-d': 0, '--detach': 0, '--rm': 0, '-i': 0, '-t': 0, '-it': 0, '-ti': 0, '--interactive': 0, '--tty': 0, '--privileged': 0, '--init': 0, '--read-only': 0,
};
export function dockerRunToCompose(cmd) {
  let a = shellSplit(cmd.trim());
  if (a[0] === 'sudo') a.shift();
  if (a[0] === 'docker' || a[0] === 'podman') a.shift();
  if (a[0] === 'container') a.shift();
  if (a[0] !== 'run') fail('The command must start with “docker run”.');
  a.shift();
  const svc = {}, notes = [], unknown = [];
  const push = (k, v) => { (svc[k] ??= []).push(v); };
  let i = 0;
  const next = (flag, inline) => inline ?? a[++i] ?? fail(`${flag} is missing a value.`);
  while (i < a.length && a[i].startsWith('-')) {
    let [flag, inline] = a[i].startsWith('--') && a[i].includes('=') ? [a[i].slice(0, a[i].indexOf('=')), a[i].slice(a[i].indexOf('=') + 1)] : [a[i], undefined];
    // combined short options such as -dit or -p8080:80
    if (/^-[a-z]{2,}$/.test(flag) && !(flag in FLAGS)) { const letters = flag.slice(1).split(''); if (letters.every(l => 'dit'.includes(l))) { letters.forEach(l => { if (l === 'i') svc.stdin_open = true; if (l === 't') svc.tty = true; }); i++; continue; } }
    if (/^-[pveluwm]./.test(flag) && !flag.startsWith('--')) { inline = flag.slice(2); flag = flag.slice(0, 2); }
    switch (flag) {
      case '-d': case '--detach': break;
      case '--rm': notes.push('--rm has no Compose equivalent; use “docker compose run --rm” for one-off containers.'); break;
      case '-i': case '--interactive': svc.stdin_open = true; break;
      case '-t': case '--tty': svc.tty = true; break;
      case '-it': case '-ti': svc.stdin_open = true; svc.tty = true; break;
      case '--name': svc.container_name = next(flag, inline); break;
      case '-p': case '--publish': push('ports', next(flag, inline)); break;
      case '-P': case '--publish-all': notes.push('-P (publish all ports) does not exist in Compose; list the ports explicitly under ports.'); break;
      case '--expose': push('expose', next(flag, inline)); break;
      case '-v': case '--volume': push('volumes', next(flag, inline)); break;
      case '--mount': { const m = Object.fromEntries(next(flag, inline).split(',').map(x => x.split('='))); push('volumes', { type: m.type || 'volume', source: m.source || m.src, target: m.target || m.destination || m.dst, ...(m.readonly !== undefined || m.ro !== undefined ? { read_only: true } : {}) }); break; }
      case '--tmpfs': push('tmpfs', next(flag, inline)); break;
      case '-e': case '--env': push('environment', next(flag, inline)); break;
      case '--env-file': push('env_file', next(flag, inline)); break;
      case '--restart': svc.restart = next(flag, inline); break;
      case '--network': case '--net': { const n = next(flag, inline); if (n === 'host' || n === 'none' || n.startsWith('container:')) svc.network_mode = n; else push('networks', n); break; }
      case '--network-alias': notes.push('--network-alias: put the alias under networks.<name>.aliases.'); next(flag, inline); break;
      case '-h': case '--hostname': svc.hostname = next(flag, inline); break;
      case '-w': case '--workdir': svc.working_dir = next(flag, inline); break;
      case '-u': case '--user': svc.user = next(flag, inline); break;
      case '--entrypoint': svc.entrypoint = next(flag, inline); break;
      case '-l': case '--label': push('labels', next(flag, inline)); break;
      case '--cap-add': push('cap_add', next(flag, inline)); break;
      case '--cap-drop': push('cap_drop', next(flag, inline)); break;
      case '--device': push('devices', next(flag, inline)); break;
      case '--privileged': svc.privileged = true; break;
      case '--init': svc.init = true; break;
      case '--read-only': svc.read_only = true; break;
      case '--add-host': push('extra_hosts', next(flag, inline)); break;
      case '--dns': push('dns', next(flag, inline)); break;
      case '--dns-search': push('dns_search', next(flag, inline)); break;
      case '-m': case '--memory': svc.mem_limit = next(flag, inline); break;
      case '--memory-reservation': svc.mem_reservation = next(flag, inline); break;
      case '--cpus': svc.cpus = Number(next(flag, inline)); break;
      case '--cpu-shares': svc.cpu_shares = Number(next(flag, inline)); break;
      case '--shm-size': svc.shm_size = next(flag, inline); break;
      case '--pid': svc.pid = next(flag, inline); break;
      case '--ipc': svc.ipc = next(flag, inline); break;
      case '--platform': svc.platform = next(flag, inline); break;
      case '--pull': svc.pull_policy = next(flag, inline); break;
      case '--stop-signal': svc.stop_signal = next(flag, inline); break;
      case '--stop-timeout': svc.stop_grace_period = next(flag, inline) + 's'; break;
      case '--security-opt': push('security_opt', next(flag, inline)); break;
      case '--sysctl': { const [k, val] = next(flag, inline).split('='); (svc.sysctls ??= {})[k] = val; break; }
      case '--ulimit': { const [k, val] = next(flag, inline).split('='); const [s, h] = val.split(':'); (svc.ulimits ??= {})[k] = h ? { soft: Number(s), hard: Number(h) } : Number(s); break; }
      case '--log-driver': (svc.logging ??= {}).driver = next(flag, inline); break;
      case '--log-opt': { const [k, val] = next(flag, inline).split('='); ((svc.logging ??= {}).options ??= {})[k] = val; break; }
      case '--gpus': { const g = next(flag, inline); svc.deploy = { resources: { reservations: { devices: [{ driver: 'nvidia', count: g === 'all' ? 'all' : Number(g.replace(/\D/g, '')) || 1, capabilities: ['gpu'] }] } } }; break; }
      case '--health-cmd': (svc.healthcheck ??= {}).test = ['CMD-SHELL', next(flag, inline)]; break;
      case '--health-interval': (svc.healthcheck ??= {}).interval = next(flag, inline); break;
      case '--health-timeout': (svc.healthcheck ??= {}).timeout = next(flag, inline); break;
      case '--health-retries': (svc.healthcheck ??= {}).retries = Number(next(flag, inline)); break;
      case '--health-start-period': (svc.healthcheck ??= {}).start_period = next(flag, inline); break;
      case '--group-add': push('group_add', next(flag, inline)); break;
      default: unknown.push(flag); if (inline === undefined && a[i + 1] && !a[i + 1].startsWith('-') && i + 2 < a.length) i++;
    }
    i++;
  }
  const image = a[i];
  if (!image) fail('The command contains no image, for example nginx:alpine.');
  const command = a.slice(i + 1);
  const name = svc.container_name || image.split('/').pop().split(':')[0].replace(/[^a-z0-9_-]/gi, '') || 'app';
  const out = { image, ...svc };
  if (command.length) out.command = command.length === 1 ? command[0] : command;
  const doc = { services: { [name]: out } };
  const named = (svc.volumes || []).map(x => typeof x === 'string' ? x.split(':')[0] : x.source).filter(s => s && !/^[./~$]/.test(s));
  if (named.length) doc.volumes = Object.fromEntries(named.map(n => [n, {}]));
  if (svc.networks) doc.networks = Object.fromEntries(svc.networks.map(n => [n, { external: true }]));
  return { doc, notes, unknown };
}
T({
  id: 'dockercompose', cat: 'dev', ic: 'DC', name: 'Docker run to Compose',
  desc: 'Convert a docker run command to a docker-compose.yml.',
  kw: 'docker run compose docker-compose yml yaml converter container convert',
  fields: [{ k: 's', t: 'area', label: 'docker run command', rows: 6, def: 'docker run -d --name jellyfin \\\n  -p 8096:8096 \\\n  -v jellyfin-config:/config \\\n  -v /mnt/media:/media:ro \\\n  -e TZ=America/New_York \\\n  --restart unless-stopped \\\n  jellyfin/jellyfin:latest' }],
  async run(v) {
    const { doc, notes, unknown } = dockerRunToCompose(v.s);
    const Y = await lib('yaml');
    // Always quote ports: YAML 1.1 would otherwise read 22:22 as a (sexagesimal) number.
    const yml = Y.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' }).replace(/^(\s+- )([\d.:[\]/a-z-]*\d:\d[\d/a-z-]*)$/gm, '$1"$2"');
    return [{ l: 'docker-compose.yml', v: yml },
      ...notes.map(n => ({ note: n, kind: 'info' })),
      unknown.length ? { note: 'Not converted (add these yourself): ' + unknown.join(', '), kind: 'warn' } : null];
  },
});

// ---------- XML ----------
T({
  id: 'xml', cat: 'dev', ic: '</>', name: 'XML formatter',
  desc: 'Validate XML and make it readable, or minify it.',
  kw: 'xml formatter prettify beautify validate validator minify format',
  fields: [
    { k: 's', t: 'area', label: 'XML', rows: 10, def: '<?xml version="1.0"?><config><server host="0.0.0.0" port="8080"/><users><user role="admin">alice</user><user>bob</user></users><!-- comment --></config>' },
    { k: 'm', t: 'sel', label: 'Action', opts: [['pretty', 'Prettify'], ['min', 'Minify']] },
    { k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']], show: v => v.m === 'pretty' },
    { k: 'keepc', t: 'chk', label: 'Keep comments', def: true, show: v => v.m === 'min' },
  ],
  ex: [{ n: 'Error', err: true, v: { s: '<a><b>text</c></a>' } }],
  async run(v) {
    const X = await lib('xml');
    const ok = X.XMLValidator.validate(v.s);
    if (ok !== true) fail(`Invalid XML at line ${ok.err.line}, column ${ok.err.col}: ${xmlErr(ok.err)}.`);
    if (v.m === 'min') return [{ l: 'Minified', v: xmlMinify(v.s, { comments: v.keepc }) }];
    return [{ note: 'Valid XML.', kind: 'ok' }, { l: 'Formatted', v: xmlPretty(v.s, v.indent === 'tab' ? '\t' : ' '.repeat(Number(v.indent))) }];
  },
});

// ---------- YAML ----------
T({
  id: 'yaml', cat: 'dev', ic: 'YML', name: 'YAML validator and formatter',
  desc: 'Validate YAML, reformat it cleanly and optionally sort the keys. Configurable indentation.',
  kw: 'yaml yml validator viewer formatter format lint indentation docker compose kubernetes',
  fields: [
    { k: 's', t: 'area', label: 'YAML', rows: 12, def: 'services:\n   web:\n     image: nginx\n     ports: ["80:80", "443:443"]\n     environment: {TZ: America/New_York, DEBUG: "false"}\n' },
    { k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces']] },
    { k: 'sort', t: 'chk', label: 'Sort keys' },
  ],
  ex: [{ n: 'Error', err: true, v: { s: 'a: 1\n  b: 2\nc: [1, 2' } }],
  async run(v) {
    const o = await parseAs('yaml', v.s);
    return [{ note: 'Valid YAML.', kind: 'ok' }, { l: 'Formatted', v: await stringifyAs('yaml', o, v) }];
  },
});

// ---------- Email normalizer ----------
export function normalizeEmail(e, { plus = true, dots = true } = {}) {
  const m = /^\s*([^@\s]+)@([^@\s]+)\s*$/.exec(e);
  if (!m) return null;
  let [, local, domain] = m;
  domain = domain.toLowerCase().replace(/\.$/, '');
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const gmail = domain === 'gmail.com';
  const plusDomains = gmail || /^(outlook|hotmail|live|msn)\.[a-z.]+$|^(icloud|me|mac)\.com$|^(proton\.me|protonmail\.com|fastmail\.com|yahoo\.[a-z.]+)$/.test(domain);
  if (plus && (plusDomains || plus === 'all')) local = local.replace(/[+].*$/, '');
  if (domain.startsWith('yahoo.') && plus) local = local.replace(/-.*$/, '');
  if (dots && gmail) local = local.replace(/\./g, '');
  return local.toLowerCase() + '@' + domain;
}
T({
  id: 'emailnorm', cat: 'dev', ic: '@', name: 'Email normalizer',
  desc: 'Strip dots and plus tags and lowercase addresses, to detect duplicate sign-ups.',
  kw: 'email normalize gmail plus alias dots duplicate',
  fields: [
    { k: 's', t: 'area', label: 'Email addresses (one per line)', rows: 6, def: 'John.Smith+newsletter@Gmail.com\nj.o.h.n.smith@googlemail.com\nJane+work@outlook.com\ninfo@Example.COM' },
    { k: 'plus', t: 'sel', label: 'Strip plus tags', opts: [['known', 'Only for known providers'], ['all', 'For all domains'], ['', 'Never']] },
    { k: 'dots', t: 'chk', label: 'Strip dots for Gmail', def: true },
    { k: 'uniq', t: 'chk', label: 'Merge duplicates', def: true },
  ],
  run(v) {
    const rows = [], bad = [];
    for (const l of lines(v.s).filter(x => x.trim())) {
      const n = normalizeEmail(l, { plus: v.plus === 'all' ? 'all' : !!v.plus, dots: v.dots });
      if (n) rows.push([l.trim(), n]); else bad.push(l.trim());
    }
    const out = v.uniq ? [...new Set(rows.map(r => r[1]))] : rows.map(r => r[1]);
    return [{ l: `Normalized (${out.length})`, v: out.join('\n') }, { l: 'Per address', table: { head: ['Original', 'Normalized'], rows } },
      bad.length ? { note: 'Not a valid email address: ' + bad.join(', '), kind: 'warn' } : null];
  },
});

// ---------- Regex ----------
T({
  id: 'regex', cat: 'dev', ic: '.*', name: 'Regex tester',
  desc: 'Test regular expressions with highlighted matches, groups and replacement (JavaScript regex).',
  kw: 'regex regexp regular expression test tester match groups replace',
  fields: [
    { k: 're', t: 'text', label: 'Regular expression', def: '(\\d{4})-(\\d{2})-(\\d{2})', mono: true },
    { k: 'flags', t: 'text', label: 'Flags', def: 'g', mono: true, hint: 'g all matches, i case-insensitive, m multiline, s dot matches newline, u unicode' },
    { k: 's', t: 'area', label: 'Test text', rows: 6, def: 'Scheduled for 2026-10-22, then for 2026-11-05.\nInvalid: 26-10-22.' },
    { k: 'rep', t: 'text', label: 'Replace with (optional)', mono: true, ph: '$2/$3/$1', hint: '$1, $2 … for groups, $<name> for named groups, $& for the whole match' },
  ],
  ex: [{ n: 'Email', v: { re: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', flags: 'gi', s: 'Mail john@example.com or info@company.co.uk.' } }, { n: 'Named groups', v: { re: '(?<year>\\d{4})-(?<month>\\d{2})', flags: 'g', rep: '$<month>/$<year>' } }],
  run(v) {
    if (!v.re) return [{ note: 'Enter a regular expression.', kind: 'info' }];
    if (/[^dgimsuyv]/.test(v.flags)) fail('Unknown flag. Use only d, g, i, m, s, u, v or y.');
    let re;
    try { re = new RegExp(v.re, v.flags.includes('g') ? v.flags : v.flags + 'g'); } catch (e) {
      fail('Invalid regular expression: ' + e.message.replace(/^Invalid regular expression: /, '').replace(/^\/.*\/[a-z]*: /, '') + '. Watch out for parentheses and escapes such as \\. and \\(.');
    }
    if (v.s.length > 200000) fail('The test text is too long (maximum 200,000 characters).');
    const matches = [], seg = [];
    let last = 0, m, guard = 0;
    while ((m = re.exec(v.s)) && guard++ < 10000) {
      if (m[0] === '') { re.lastIndex++; if (!v.flags.includes('g')) break; continue; }
      matches.push(m);
      seg.push([v.s.slice(last, m.index), ''], [m[0], 'mark']);
      last = m.index + m[0].length;
      if (!v.flags.includes('g')) break;
    }
    seg.push([v.s.slice(last), '']);
    const res = [{ note: matches.length ? plural(matches.length, 'match', 'matches') + '.' : 'No matches.', kind: matches.length ? 'ok' : 'warn' }, { l: 'Matches highlighted', seg, copy: false }];
    if (matches.length) {
      const names = Object.keys(matches[0].groups || {});
      const n = matches[0].length - 1;
      res.push({ l: 'Matches and groups', table: { head: ['#', 'Index', 'Match', ...Array.from({ length: n }, (_, i) => names[i] ? `${i + 1} (${names[i]})` : 'Group ' + (i + 1))], rows: matches.map((x, i) => [i + 1, x.index, x[0], ...x.slice(1).map(g => g ?? '(empty)')]) } });
    }
    if (v.rep) res.push({ l: 'After replacement', v: v.s.replace(new RegExp(v.re, v.flags), v.rep) });
    return res;
  },
});

// ---------- Regex cheat sheet ----------
memo({
  id: 'regexcheat', cat: 'dev', ic: 're?', name: 'Regex cheat sheet', head: ['Pattern', 'Meaning'],
  desc: 'Characters, classes, groups, quantifiers and lookarounds for regular expressions.',
  kw: 'regex regexp cheatsheet cheat sheet memo lookahead groups classes',
  sections: {
    'Characters and classes': [['.', 'Any character except a newline (with s, newlines too)'], ['\\d / \\D', 'Digit / non-digit'], ['\\w / \\W', 'Word character (a–z, A–Z, 0–9, _) / not'], ['\\s / \\S', 'Whitespace / non-whitespace'], ['[abc]', 'One of a, b or c'], ['[^abc]', 'Anything except a, b or c'], ['[a-z0-9]', 'Range'], ['\\p{L}', 'Any letter, including accented ones (flag u)'], ['\\t \\n \\r', 'Tab, newline, carriage return'], ['\\.', 'A literal dot (escaped)']],
    'Anchors': [['^', 'Start of the text (with m: start of the line)'], ['$', 'End of the text (with m: end of the line)'], ['\\b', 'Word boundary'], ['\\B', 'Not a word boundary']],
    'Quantifiers': [['*', '0 or more'], ['+', '1 or more'], ['?', '0 or 1 (optional)'], ['{3}', 'Exactly 3'], ['{2,}', '2 or more'], ['{2,5}', '2 through 5'], ['*? +? ??', 'As few as possible (lazy)']],
    'Groups': [['(abc)', 'Capturing group; reuse with $1'], ['(?:abc)', 'Non-capturing group'], ['(?<name>abc)', 'Named group; $<name>'], ['a|b', 'a or b'], ['\\1', 'Backreference to group 1'], ['\\k<name>', 'Backreference to a named group']],
    'Lookarounds': [['(?=abc)', 'Followed by abc (positive lookahead)'], ['(?!abc)', 'Not followed by abc'], ['(?<=abc)', 'Preceded by abc (lookbehind)'], ['(?<!abc)', 'Not preceded by abc']],
    'Flags': [['g', 'All matches (global)'], ['i', 'Case-insensitive'], ['m', '^ and $ per line'], ['s', 'Dot also matches newlines'], ['u', 'Unicode, needed for \\p{…} and emoji'], ['y', 'Sticky: only from lastIndex']],
    'Examples': [['^\\d{5}(-\\d{4})?$', 'US ZIP code (12345 or 12345-6789)'], ['^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$', 'UK postcode (with flag i)'], ['^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$', 'Email address (simple)'], ['^(\\d{1,3}\\.){3}\\d{1,3}$', 'IPv4 shape (no range check)'], ['^#?([0-9a-f]{3}|[0-9a-f]{6})$', 'HEX color (with flag i)'], ['^\\d{4}-\\d{2}-\\d{2}$', 'Date YYYY-MM-DD'], ['^\\+?1?[ -]?\\(?\\d{3}\\)?[ -]?\\d{3}-?\\d{4}$', 'US phone number']],
  },
});
