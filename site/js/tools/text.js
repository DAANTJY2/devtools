import { T, fail } from '../core/registry.js';
import { utf8, lib, dataFile, int, fnum, plural, lines, randInt, shuffle, stripAccents, parseJSON, LOCALE } from '../core/util.js';
import { pretty as xmlPretty } from '../lib/xmlfmt.js';

// ---------- Lorem ipsum ----------
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum praesent elementum facilisis leo vel fringilla tristique senectus netus malesuada fames ac turpis egestas integer feugiat scelerisque varius morbi nunc faucibus a pellentesque habitant vitae purus gravida quis blandit cursus risus at ultrices mi tempus imperdiet nulla posuere sollicitudin aliquam vulputate dignissim suspendisse'.split(' ');
const sentence = () => { const n = 6 + randInt(10); const w = Array.from({ length: n }, () => LOREM[randInt(LOREM.length)]); w[0] = w[0][0].toUpperCase() + w[0].slice(1); if (n > 8 && randInt(2)) w[randInt(n - 3) + 1] += ','; return w.join(' ') + '.'; };
const paragraph = () => Array.from({ length: 3 + randInt(4) }, sentence).join(' ');
T({
  id: 'lorem', cat: 'text', ic: 'Lor', name: 'Lorem ipsum generator', regen: true,
  desc: 'Placeholder text in paragraphs, sentences or words, optionally as HTML.',
  kw: 'lorem ipsum dummy text filler placeholder text',
  fields: [
    { k: 'n', t: 'num', label: 'Count', def: 3, min: 1, max: 500 },
    { k: 'u', t: 'sel', label: 'Unit', opts: [['p', 'Paragraphs'], ['s', 'Sentences'], ['w', 'Words']] },
    { k: 'start', t: 'chk', label: 'Start with “Lorem ipsum dolor sit amet”', def: true },
    { k: 'html', t: 'chk', label: 'As HTML (<p>)' },
  ],
  run(v) {
    const n = Math.round(v.n);
    if (!(n >= 1 && n <= 5000)) fail('Choose a count between 1 and 5000.');
    let parts = v.u === 'p' ? Array.from({ length: n }, paragraph) : v.u === 's' ? Array.from({ length: n }, sentence) : [Array.from({ length: n }, () => LOREM[randInt(LOREM.length)]).join(' ')];
    if (v.start) {
      const intro = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
      if (v.u === 'w') parts[0] = ('lorem ipsum dolor sit amet ' + parts[0]).split(' ').slice(0, n).join(' ');
      else if (v.u === 's') parts[0] = intro;
      else parts[0] = intro + ' ' + parts[0];
    }
    const out = v.u === 'p' ? (v.html ? parts.map(p => `<p>${p}</p>`).join('\n') : parts.join('\n\n')) : v.html ? `<p>${parts.join(' ')}</p>` : parts.join(' ');
    return [{ l: 'Text', v: out }];
  },
});

// ---------- Text statistics ----------
const STOP = new Set('the a an and or but of to is in it its that this for on with as are be was were by at from not no have has had he she they we you i his her their our your what which who will would can could should do does did so if then than there here been also into about more some any all just'.split(' '));
// English syllable estimate: vowel groups, minus a silent final e.
const syllables = w => { const t = stripAccents(w.toLowerCase()).replace(/[^a-z]/g, ''); if (!t) return 1; if (t.length <= 3) return 1; const n = (t.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) || []).length; return Math.max(1, n); };
T({
  id: 'textstats', cat: 'text', ic: '#W', name: 'Text statistics',
  desc: 'Count characters, words, sentences and lines; see reading time, readability and the most frequent words.',
  kw: 'text statistics word count character count reading time readability sentences flesch',
  fields: [{ k: 's', t: 'area', label: 'Text', rows: 8, mono: false, def: 'This is a sample text. Paste your own text here to see how many words, characters and sentences it contains.\n\nReading time is estimated at 230 words per minute. You can also see which words appear most often.' }],
  run(v) {
    const s = v.s;
    const words = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
    const sentences = (s.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || []).filter(x => /\p{L}/u.test(x));
    const paras = s.split(/\n\s*\n/).filter(x => x.trim());
    const freq = new Map();
    for (const w of words) { const k = w.toLowerCase(); if (!STOP.has(k) && k.length > 1) freq.set(k, (freq.get(k) || 0) + 1); }
    const top = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15);
    const syl = words.reduce((a, w) => a + syllables(w), 0);
    const wps = words.length / Math.max(1, sentences.length), spw = syl / Math.max(1, words.length);
    const fre = words.length && sentences.length ? 206.835 - 1.015 * wps - 84.6 * spw : null;
    const grade = words.length && sentences.length ? 0.39 * wps + 11.8 * spw - 15.59 : null;
    const level = fre === null ? null : fre >= 80 ? 'very easy' : fre >= 60 ? 'easy' : fre >= 50 ? 'fairly difficult' : fre >= 30 ? 'difficult' : 'very difficult';
    const longest = words.reduce((a, w) => w.length > a.length ? w : a, '');
    return [{ l: 'Counts', kv: [
      ['Words', int(words.length)], ['Characters', int([...s].length)], ['Characters without spaces', int([...s.replace(/\s/g, '')].length)], ['Sentences', int(sentences.length)],
      ['Paragraphs', int(paras.length)], ['Lines', int(s ? s.split('\n').length : 0)], ['Bytes (UTF-8)', int(utf8(s).length)], ['Unique words', int(new Set(words.map(w => w.toLowerCase())).size)],
      ['Average word length', words.length ? fnum(words.reduce((a, w) => a + w.length, 0) / words.length, 1) + ' characters' : '—'], ['Average sentence length', sentences.length ? fnum(wps, 1) + ' words' : '—'],
      ['Longest word', longest || '—'], ['Reading time (230 wpm)', words.length ? Math.max(1, Math.round(words.length / 230)) + ' min' : '—'], ['Speaking time (130 wpm)', words.length ? Math.max(1, Math.round(words.length / 130)) + ' min' : '—'],
      ['Flesch Reading Ease', fre === null ? '—' : `${fnum(fre, 0)} (${level})`], ['Flesch-Kincaid grade level', grade === null ? '—' : fnum(Math.max(0, grade), 1)],
    ] }, top.length ? { l: 'Most frequent words (without common function words)', table: { head: ['Word', 'Count'], rows: top } } : null];
  },
});

// ---------- Emoji ----------
const GROUPS = ['Smileys & emotion', 'People & body', '', 'Animals & nature', 'Food & drink', 'Travel & places', 'Activities', 'Objects', 'Symbols', 'Flags'];
T({
  id: 'emoji', cat: 'text', ic: '😀', name: 'Emoji picker',
  desc: 'Search emoji by name or keyword and copy them with one click.',
  kw: 'emoji emoticon smiley search copy picker icon',
  ui(root, { h, copy }) {
    const q = h('input', { type: 'search', placeholder: 'Search, e.g. heart, laugh, cat or flag', 'aria-label': 'Search emoji', style: 'flex:1;min-width:180px' });
    const grp = h('select', { 'aria-label': 'Group', style: 'width:auto' }, h('option', { value: '' }, 'All groups'), GROUPS.map((g, i) => g ? h('option', { value: i }, g) : null));
    const grid = h('div', { class: 'emoji-grid', role: 'list' });
    const info = h('p', { class: 'muted small', role: 'status' }, 'Loading…');
    let data = [], recent = [];
    try { recent = JSON.parse(localStorage.getItem('itk.emoji') || '[]'); } catch { recent = []; }
    const recentBox = h('div', { class: 'row', 'aria-label': 'Recently copied' });
    const pick = e => { copy(e[0], `${e[0]} copied`); recent = [e, ...recent.filter(x => x[0] !== e[0])].slice(0, 16); try { localStorage.setItem('itk.emoji', JSON.stringify(recent)); } catch { /* not stored */ } drawRecent(); };
    const btn = e => h('button', { type: 'button', title: e[1], 'aria-label': e[1], role: 'listitem', onclick: () => pick(e) }, e[0]);
    const drawRecent = () => recentBox.replaceChildren(...(recent.length ? [h('span', { class: 'muted small' }, 'Recent:'), ...recent.map(e => h('button', { class: 'chip', type: 'button', title: e[1], onclick: () => pick(e) }, e[0]))] : []));
    const norm = s => stripAccents(s.toLowerCase());
    const draw = () => {
      const words = norm(q.value).split(/\s+/).filter(Boolean), g = grp.value;
      const hits = data.filter(e => (!g || String(e[3]) === g) && words.every(w => norm(e[1] + ' ' + e[2]).includes(w)));
      grid.replaceChildren(...hits.slice(0, 600).map(btn));
      info.textContent = hits.length ? `${hits.length} emoji${hits.length > 600 ? ' (first 600 shown)' : ''}. Click to copy.` : 'No emoji found.';
    };
    q.addEventListener('input', draw); grp.addEventListener('change', draw);
    dataFile('emoji.json').then(t => { data = JSON.parse(t); draw(); }).catch(() => { info.textContent = 'The emoji list could not be loaded.'; });
    drawRecent();
    root.append(h('div', { class: 'panel' }, h('div', { class: 'row' }, q, grp), recentBox, info, grid));
    q.focus();
  },
});

// ---------- Obfuscate ----------
T({
  id: 'obfuscate', cat: 'text', ic: '***', name: 'String obfuscator',
  desc: 'Obfuscate sensitive text such as keys, passwords or email addresses by replacing characters.',
  kw: 'obfuscate mask redact censor key password hide asterisks',
  fields: [
    { k: 's', t: 'area', label: 'Text (one item per line)', rows: 4, def: 'sk_live_51HxYzABCDEFghijklmnop\njohn.smith@example.com\nGB82 WEST 1234 5698 7654 32' },
    { k: 'first', t: 'num', label: 'Leading characters visible', def: 4, min: 0 },
    { k: 'last', t: 'num', label: 'Trailing characters visible', def: 4, min: 0 },
    { k: 'ch', t: 'text', label: 'Replacement character', def: '*' },
    { k: 'keep', t: 'chk', label: 'Keep spaces, @ and dots', def: true },
    { k: 'fixed', t: 'chk', label: 'Fixed length (also hides the length)' },
  ],
  run(v) {
    const ch = [...v.ch][0] || '*';
    const out = lines(v.s).map(l => {
      const c = [...l], f = Math.round(v.first || 0), la = Math.round(v.last || 0);
      if (c.length <= f + la) return ch.repeat(c.length);
      if (v.fixed) return c.slice(0, f).join('') + ch.repeat(8) + c.slice(c.length - la).join('');
      return c.map((x, i) => i < f || i >= c.length - la || (v.keep && /[\s@.]/.test(x)) ? x : ch).join('');
    });
    return [{ l: 'Obfuscated', v: out.join('\n') }, { note: 'This only hides text for display; it is not encryption.', kind: 'info' }];
  },
});

// ---------- Diff ----------
async function normalizeFor(kind, s) {
  if (kind === 'json') { const sort = o => Array.isArray(o) ? o.map(sort) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sort(o[k])])) : o; return JSON.stringify(sort(parseJSON(s)), null, 2) + '\n'; }
  if (kind === 'xml') {
    const X = await lib('xml');
    const ok = X.XMLValidator.validate(s);
    if (ok !== true) fail(`Invalid XML at line ${ok.err.line}: ${ok.err.msg}`);
    return xmlPretty(s) + '\n';
  }
  if (kind === 'md') return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/^(\s*)[*+](\s)/gm, '$1-$2').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return s.endsWith('\n') ? s : s + '\n';
}
T({
  id: 'diff', cat: 'text', ic: '±', name: 'Text diff',
  desc: 'Compare two texts line by line, word by word or character by character. Also for XML, Markdown and JSON, with normalized formatting.',
  kw: 'diff compare difference text xml diff markdown diff json lines words changes',
  fields: [
    { k: 'a', t: 'area', label: 'Original', rows: 8, def: 'The server runs on port 8080.\nBackups are made every night.\nContact: ops@example.com' },
    { k: 'b', t: 'area', label: 'New', rows: 8, def: 'The server runs on port 8443.\nBackups are made every night.\nLogs are kept for 30 days.\nContact: ops@example.com' },
    { k: 'kind', t: 'sel', label: 'Content', opts: [['text', 'Text'], ['xml', 'XML (normalize formatting)'], ['md', 'Markdown (normalize formatting)'], ['json', 'JSON (sort keys)']] },
    { k: 'by', t: 'sel', label: 'Compare by', opts: [['line', 'Line'], ['word', 'Word'], ['char', 'Character']] },
    { k: 'ws', t: 'chk', label: 'Ignore whitespace' },
    { k: 'ic', t: 'chk', label: 'Ignore case' },
  ],
  ex: [{ n: 'XML', v: { kind: 'xml', a: '<a><b>1</b><c>2</c></a>', b: '<a>\n  <b>1</b>\n  <c>3</c>\n</a>' } }, { n: 'Markdown', v: { kind: 'md', by: 'word', a: '# Title\n\n* point one\n* point two', b: '# Title\n\n- point one\n- point 2\n- point three' } }],
  async run(v) {
    const D = await lib('diff');
    const a = await normalizeFor(v.kind, v.a), b = await normalizeFor(v.kind, v.b);
    const opts = { ignoreWhitespace: v.ws, ignoreCase: v.ic };
    const parts = v.by === 'char' ? D.diffChars(a, b, opts) : v.by === 'word' ? D.diffWords(a, b, opts) : D.diffLines(a, b, { ...opts, newlineIsToken: false });
    const add = parts.filter(p => p.added).reduce((n, p) => n + (v.by === 'line' ? p.count : 1), 0), del = parts.filter(p => p.removed).reduce((n, p) => n + (v.by === 'line' ? p.count : 1), 0);
    if (!add && !del) return [{ note: 'No differences' + (v.kind !== 'text' ? ' (after normalizing the formatting)' : '') + '.', kind: 'ok' }];
    const seg = v.by === 'line' ? parts.map(p => [p.value.replace(/^(?=.)/gm, p.added ? '+ ' : p.removed ? '- ' : '  '), p.added ? 'add' : p.removed ? 'del' : '']) : parts.map(p => [p.value, p.added ? 'add' : p.removed ? 'del' : '']);
    const unit = { line: ['line', 'lines'], word: ['change', 'changes'], char: ['change', 'changes'] }[v.by];
    return [{ note: `${plural(add, unit[0], unit[1])} added, ${plural(del, unit[0], unit[1])} removed.`, kind: 'info' }, { l: 'Differences', seg },
      { l: 'As unified diff', v: parts.map(p => p.value.replace(/\n$/, '').split('\n').map(l => (p.added ? '+' : p.removed ? '-' : ' ') + l).join('\n')).join('\n') }];
  },
});

// ---------- Numeronym ----------
T({
  id: 'numeronym', cat: 'text', ic: 'i18n', name: 'Numeronym generator',
  desc: 'Turn a word into a numeronym such as i18n (internationalization) or k8s (kubernetes).',
  kw: 'numeronym i18n l10n k8s a11y abbreviation',
  fields: [
    { k: 's', t: 'area', label: 'Words (one per line or separated by spaces)', rows: 3, def: 'internationalization localization kubernetes accessibility' },
    { k: 'min', t: 'num', label: 'Only words of at least (characters)', def: 4, min: 3 },
  ],
  run(v) {
    const rows = v.s.split(/\s+/).filter(Boolean).map(w => { const c = [...w]; return [w, c.length >= (v.min || 4) ? c[0] + (c.length - 2) + c[c.length - 1] : w]; });
    return [{ l: 'Numeronyms', v: rows.map(r => r[1]).join(' ') }, { l: 'Per word', table: { head: ['Word', 'Numeronym'], rows } }];
  },
});

// ---------- ASCII art ----------
T({
  id: 'asciiart', cat: 'text', ic: 'ART', name: 'ASCII art text generator',
  desc: 'Turn text into large letters made of ASCII characters, in several fonts (figlet).',
  kw: 'ascii art figlet banner large letters text motd',
  fields: [
    { k: 's', t: 'text', label: 'Text', def: 'Toolkit' },
    { k: 'font', t: 'sel', label: 'Font', def: 'Standard', opts: ['Standard', 'Slant', 'Big', 'Small', 'Banner', 'Block', 'Shadow', 'Doom', 'Mini', 'ANSI Shadow'] },
    { k: 'all', t: 'chk', label: 'Show all fonts' },
  ],
  async run(v) {
    if (!v.s) return [{ note: 'Type some text.', kind: 'info' }];
    if (v.s.length > 60) fail('Use at most 60 characters; otherwise it gets too wide.');
    const { default: figlet, fontNames } = await lib('figlet');
    const t = stripAccents(v.s);
    const make = f => figlet.textSync(t, { font: f }).replace(/\s+$/gm, '');
    if (v.all) return fontNames.map(f => ({ l: f, v: make(f), wrap: false }));
    const res = [{ l: v.font, v: make(v.font), wrap: false }];
    if (t !== v.s) res.push({ note: 'Accents were dropped; the fonts only know plain letters.', kind: 'info' });
    return res;
  },
});

// ---------- Sort lines ----------
T({
  id: 'sortlines', cat: 'text', ic: 'A→Z', name: 'Sort and clean lines',
  desc: 'Sort, deduplicate, reverse and shuffle lines; remove empty lines and surrounding spaces.',
  kw: 'lines sort deduplicate remove duplicates uniq reverse shuffle empty lines trim',
  fields: [
    { k: 's', t: 'area', label: 'Lines', rows: 8, def: 'pear\nApple\nbanana\n\napple\n  kiwi  \nbanana\nitem10\nitem9' },
    { k: 'sort', t: 'sel', label: 'Sort', opts: [['az', 'A → Z (natural)'], ['za', 'Z → A'], ['len', 'By length'], ['none', 'Do not sort'], ['rev', 'Reverse order'], ['shuffle', 'Shuffle']] },
    { k: 'uniq', t: 'chk', label: 'Remove duplicates', def: true },
    { k: 'ci', t: 'chk', label: 'Ignore case', def: true },
    { k: 'trim', t: 'chk', label: 'Trim leading and trailing spaces', def: true },
    { k: 'empty', t: 'chk', label: 'Remove empty lines', def: true },
    { k: 'count', t: 'chk', label: 'Show occurrence counts' },
  ],
  run(v) {
    let ls = lines(v.s);
    if (v.trim) ls = ls.map(l => l.trim());
    if (v.empty) ls = ls.filter(l => l !== '');
    const key = l => v.ci ? l.toLowerCase() : l;
    const counts = new Map();
    for (const l of ls) counts.set(key(l), (counts.get(key(l)) || 0) + 1);
    if (v.uniq) { const seen = new Set(); ls = ls.filter(l => !seen.has(key(l)) && seen.add(key(l))); }
    const coll = new Intl.Collator(LOCALE, { numeric: true, sensitivity: v.ci ? 'base' : 'variant' });
    if (v.sort === 'az') ls.sort(coll.compare);
    else if (v.sort === 'za') ls.sort((a, b) => coll.compare(b, a));
    else if (v.sort === 'len') ls.sort((a, b) => a.length - b.length || coll.compare(a, b));
    else if (v.sort === 'rev') ls.reverse();
    else if (v.sort === 'shuffle') ls = shuffle(ls);
    const before = lines(v.s).length;
    return [{ l: `${plural(ls.length, 'line', 'lines')} (was ${before})`, v: v.count ? ls.map(l => `${counts.get(key(l))}\t${l}`).join('\n') : ls.join('\n') }];
  },
});

// ---------- Find and replace ----------
T({
  id: 'replace', cat: 'text', ic: 'S/R', name: 'Find and replace',
  desc: 'Replace text, optionally with a regular expression, and see how many replacements were made.',
  kw: 'find replace search regex regular expression text sed',
  fields: [
    { k: 's', t: 'area', label: 'Text', rows: 7, def: 'server1.old.local\nserver2.old.local\ndatabase.old.local' },
    { k: 'f', t: 'text', label: 'Find', def: '.old.local', mono: true },
    { k: 'r', t: 'text', label: 'Replace with', def: '.new.lan', mono: true, hint: 'With a regular expression: $1, $2 … for groups. \\n becomes a new line.' },
    { k: 're', t: 'chk', label: 'Regular expression' },
    { k: 'ci', t: 'chk', label: 'Ignore case' },
    { k: 'word', t: 'chk', label: 'Whole words only' },
  ],
  ex: [{ n: 'Regex', v: { re: true, f: '^(\\w+)\\.old\\.local$', r: '$1.new.lan', s: 'server1.old.local\nserver2.old.local' } }],
  run(v) {
    if (!v.f) return [{ l: 'Text', v: v.s }];
    let src = v.re ? v.f : v.f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (v.word) src = `\\b(?:${src})\\b`;
    let re;
    try { re = new RegExp(src, 'g' + (v.ci ? 'i' : '') + (v.re ? 'mu' : 'u')); } catch (e) { fail('Invalid regular expression: ' + e.message.replace(/^Invalid regular expression: \/.*\/\w*: /, '') + '.'); }
    const n = (v.s.match(re) || []).length;
    const rep = v.r.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const out = v.re ? v.s.replace(re, rep) : v.s.replace(re, () => rep);
    return [{ note: n ? `Replaced ${plural(n, 'time', 'times')}.` : 'Nothing found to replace.', kind: n ? 'ok' : 'warn' }, { l: 'Result', v: out }];
  },
});

// ---------- Compare lists ----------
T({
  id: 'listcompare', cat: 'text', ic: 'A∩B', name: 'List comparer',
  desc: 'Find the overlap and differences between two lists: A ∩ B, A ∪ B, only in A and only in B.',
  kw: 'lists compare overlap difference intersection union set compare',
  fields: [
    { k: 'a', t: 'area', label: 'List A', rows: 7, def: 'alice\nbob\ncarol\ndave' },
    { k: 'b', t: 'area', label: 'List B', rows: 7, def: 'bob\ndave\neve\nfrank' },
    { k: 'ci', t: 'chk', label: 'Ignore case', def: true },
    { k: 'split', t: 'chk', label: 'Also split on commas and spaces' },
  ],
  run(v) {
    const parse = s => s.split(v.split ? /[\s,;]+/ : /\r?\n/).map(x => x.trim()).filter(Boolean);
    const A = parse(v.a), B = parse(v.b);
    const k = x => v.ci ? x.toLowerCase() : x;
    const setB = new Set(B.map(k)), setA = new Set(A.map(k));
    const uniq = arr => { const s = new Set(); return arr.filter(x => !s.has(k(x)) && s.add(k(x))); };
    const both = uniq(A.filter(x => setB.has(k(x)))), onlyA = uniq(A.filter(x => !setB.has(k(x)))), onlyB = uniq(B.filter(x => !setA.has(k(x)))), all = uniq([...A, ...B]);
    const blk = (l, arr) => ({ l: `${l} (${arr.length})`, v: arr.join('\n') || '(empty)' });
    return [blk('In both (A ∩ B)', both), blk('Only in A (A − B)', onlyA), blk('Only in B (B − A)', onlyB), blk('Combined (A ∪ B)', all), blk('In one, but not both', [...onlyA, ...onlyB])];
  },
});

// ---------- Join lines ----------
T({
  id: 'joinlines', cat: 'text', ic: '⏎→,', name: 'Join and split lines',
  desc: 'Join lines into one line with a separator of your choice, or split a line back up.',
  kw: 'lines join split separator single line',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['join', 'Join'], ['split', 'Split into lines']] },
    { k: 's', t: 'area', label: 'Text', rows: 6, def: 'first line\nsecond line\n\nthird line' },
    { k: 'sep', t: 'text', label: 'Separator', def: ', ', mono: true, hint: 'Use \\t for a tab and \\n for a new line.' },
    { k: 'empty', t: 'chk', label: 'Skip empty lines', def: true },
    { k: 'trim', t: 'chk', label: 'Trim spaces', def: true },
  ],
  run(v) {
    const sep = v.sep.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    if (v.m === 'split') {
      if (!sep) fail('Enter a separator to split on.');
      let parts = v.s.split(sep);
      if (v.trim) parts = parts.map(x => x.trim());
      if (v.empty) parts = parts.filter(Boolean);
      return [{ l: plural(parts.length, 'line', 'lines'), v: parts.join('\n') }];
    }
    let ls = lines(v.s);
    if (v.trim) ls = ls.map(x => x.trim());
    if (v.empty) ls = ls.filter(Boolean);
    return [{ l: `Joined (${plural(ls.length, 'line', 'lines')})`, v: ls.join(sep) }];
  },
});

// ---------- AI tokens ----------
T({
  id: 'tokens', cat: 'text', ic: 'TOK', name: 'AI token estimator',
  desc: 'Estimate how many tokens a text costs with language models. This is an approximation, not an exact count.',
  kw: 'tokens tokenizer ai llm gpt estimate count context prompt cost',
  fields: [{ k: 's', t: 'area', label: 'Text', rows: 8, mono: false, def: 'Write a short summary of the text below in three bullet points, in plain English.' }],
  run(v) {
    const s = v.s;
    if (!s) return [{ note: 'Paste some text.', kind: 'info' }];
    const chars = [...s].length;
    const words = (s.match(/[\p{L}\p{N}]+/gu) || []);
    const punct = (s.match(/[^\p{L}\p{N}\s]/gu) || []).length;
    const cjk = (s.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
    // Long words are split into chunks of roughly 4 characters; non-ASCII words into smaller ones.
    const byWords = words.reduce((n, w) => n + Math.max(1, Math.ceil(w.length / (/^[a-z]+$/i.test(w) ? 4.2 : 3))), 0) + punct + cjk;
    const byChars = chars / 3.8;
    const est = Math.round((byWords * 0.6 + byChars * 0.4));
    return [{ l: 'Estimated tokens', v: '≈ ' + int(est), big: true },
      { kv: [['Range', `${int(Math.round(est * 0.8))} to ${int(Math.round(est * 1.25))}`], ['Characters', int(chars)], ['Words', int(words.length)], ['Characters per token (estimated)', fnum(chars / Math.max(est, 1), 1)]] },
      { note: 'Every model has its own tokenizer. Non-English text usually costs more tokens than English; so do code and numbers. Use the provider’s token-counting API for an exact count.', kind: 'info' }];
  },
});
