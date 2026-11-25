// Builds a tool's input fields and renders its results. All user content reaches
// the page through textContent or attributes, never through innerHTML.
import { defaults, optValue, optLabel, UserError } from './registry.js';
import { LOCALE } from './util.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

// ---------- icons (24×24 stroke paths) ----------
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const ICONS = {
  crypto: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  convert: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
  web: [circle(12, 12, 10), 'M2 12h20', 'M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'],
  dev: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
  net: ['M9 2h6v6H9z', 'M2 16h6v6H2z', 'M16 16h6v6h-6z', 'M12 8v4', 'M5 16v-4h14v4'],
  media: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', circle(8.5, 8.5, 1.5), 'M21 15l-5-5L5 21'],
  math: ['M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M8 6h8v4H8z', 'M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01'],
  time: [circle(12, 12, 10), 'M12 6v6l4 2'],
  text: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  data: ['M3 5c0-1.7 4-3 9-3s9 1.3 9 3-4 3-9 3-9-1.3-9-3z', 'M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5', 'M3 12c0 1.7 4 3 9 3s9-1.3 9-3'],
  ref: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  search: [circle(11, 11, 7.5), 'M21 21l-4.6-4.6'],
  star: ['M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  copy: ['M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  check: ['M20 6L9 17l-5-5'],
  sun: [circle(12, 12, 4), 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  menu: ['M3 6h18M3 12h18M3 18h18'],
  close: ['M18 6L6 18M6 6l12 12'],
  home: ['M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  lock: ['M5 11h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  reset: ['M3 3v6h6', 'M3.5 15a9 9 0 1 0 2.1-9.4L3 9'],
  play: ['M6 4l14 8-14 8z'],
  chevron: ['M9 18l6-6-6-6'],
  clock: [circle(12, 12, 10), 'M12 6v6l4 2'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  info: [circle(12, 12, 10), 'M12 16v-4M12 8h.01'],
  ok: [circle(12, 12, 10), 'M8 12l3 3 5-6'],
  warn: ['M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4M12 17h.01'],
  err: [circle(12, 12, 10), 'M15 9l-6 6M9 9l6 6'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z'],
};
const SVG = 'http://www.w3.org/2000/svg';
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
  for (const d of ICONS[name] || []) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}

// ---------- copying ----------
let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.replaceChildren(icon('check'), h('span', {}, msg));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
export async function copy(text, what = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Without HTTPS the Clipboard API does not exist; fall back to the old way.
    const ta = h('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) { toast('Copying failed; select the text and press Ctrl+C.'); return false; }
  }
  toast(what);
  return true;
}
const copyBtn = (get, label = 'Copy') => {
  const text = h('span', {}, 'Copy');
  const b = h('button', { class: 'btn small ghost copybtn', type: 'button', 'aria-label': label, onclick: async () => {
    if (!(await copy(get()))) return;
    b.classList.add('done'); b.replaceChildren(icon('check'), text); text.textContent = 'Copied';
    setTimeout(() => { b.classList.remove('done'); b.replaceChildren(icon('copy'), text); text.textContent = 'Copy'; }, 1400);
  } }, icon('copy'), text);
  return b;
};

// ---------- fields ----------
let uid = 0;
function field(f, values, onChange) {
  const id = 'f' + (++uid);
  const label = h('label', { for: id, class: 'lbl' }, f.label || '');
  let input, get, set;
  const common = { id, name: f.k, ...(f.hint ? { 'aria-describedby': id + 'h' } : {}) };
  switch (f.t) {
    case 'area':
      input = h('textarea', { ...common, rows: f.rows || 6, spellcheck: 'false', placeholder: f.ph, class: f.mono === false ? '' : 'mono' });
      get = () => input.value; set = v => { input.value = v ?? ''; };
      break;
    case 'sel':
      input = h('select', common, f.opts.map(o => h('option', { value: optValue(o) }, optLabel(o))));
      get = () => input.value; set = v => { input.value = v; };
      break;
    case 'chk': {
      input = h('input', { ...common, type: 'checkbox', class: 'switch' });
      get = () => input.checked; set = v => { input.checked = !!v; };
      const wrap = h('div', { class: 'fld chk' }, h('label', { for: id }, input, h('span', {}, f.label)));
      return { wrap, input, get, set };
    }
    case 'num':
      input = h('input', { ...common, type: 'number', min: f.min, max: f.max, step: f.step ?? 'any', inputmode: 'decimal', placeholder: f.ph });
      get = () => (input.value === '' ? null : Number(input.value)); set = v => { input.value = v ?? ''; };
      break;
    case 'range': {
      input = h('input', { ...common, type: 'range', min: f.min ?? 0, max: f.max ?? 100, step: f.step ?? 1 });
      const val = h('output', { for: id, class: 'rangeval' });
      get = () => Number(input.value); set = v => { input.value = v; val.textContent = v; };
      input.addEventListener('input', () => { val.textContent = input.value; });
      label.append(' ', val);
      break;
    }
    case 'color': {
      input = h('input', { ...common, type: 'color' });
      get = () => input.value; set = v => { input.value = v; };
      break;
    }
    case 'date': case 'time': case 'dt':
      input = h('input', { ...common, type: f.t === 'dt' ? 'datetime-local' : f.t, step: f.t !== 'date' ? (f.step ?? 1) : undefined });
      get = () => input.value; set = v => { input.value = v ?? ''; };
      break;
    case 'file': {
      input = h('input', { ...common, type: 'file', accept: f.accept, class: 'sr-only' });
      let file = null;
      const name = h('span', { class: 'drop-name' }, 'No file chosen');
      const zone = h('label', { for: id, class: 'drop', tabindex: '-1' },
        icon('upload', 'drop-ic'), h('span', { class: 'drop-t' }, h('b', {}, 'Choose a file'), ' or drag it here'), name);
      const pickFile = fl => { file = fl || null; name.textContent = file ? `${file.name} (${file.size.toLocaleString(LOCALE)} bytes)` : 'No file chosen'; zone.classList.toggle('has', !!file); onChange(f, true); };
      input.addEventListener('change', () => pickFile(input.files[0]));
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); pickFile(e.dataTransfer.files[0]); });
      get = () => file; set = v => { file = v; };
      const wrap = h('div', { class: 'fld full' }, label, input, zone, f.hint && h('div', { class: 'hint', id: id + 'h' }, f.hint));
      return { wrap, input, get, set, file: true };
    }
    default:
      input = h('input', { ...common, type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: f.ph, class: f.mono ? 'mono' : '' });
      get = () => input.value; set = v => { input.value = v ?? ''; };
  }
  // Text fields with a long value or long label take the full width.
  const long = f.t === 'text' && (String(typeof f.def === 'function' ? '' : f.def ?? '').length > 26 || (f.label || '').length > 42 || f.sole);
  const wrap = h('div', { class: 'fld' + (f.t === 'area' || f.full || long ? ' full' : '') }, label, input,
    f.hint && h('div', { class: 'hint', id: id + 'h' }, f.hint));
  return { wrap, input, get, set };
}

// ---------- results ----------
function block(label, body, getText, cls = '') {
  return h('section', { class: 'res' + cls },
    (label || getText) && h('div', { class: 'res-h' }, h('span', { class: 'res-l' }, label || ''), getText && copyBtn(getText, label ? 'Copy ' + label : 'Copy')),
    body);
}

export function renderResults(out, results) {
  out.replaceChildren();
  for (const r of results || []) {
    if (!r) continue;
    if (r.note !== undefined) {
      const kind = r.kind || 'info';
      out.append(h('div', { class: 'note ' + kind, role: kind === 'err' ? 'alert' : undefined }, icon(kind, 'note-ic'), h('span', {}, r.note)));
    } else if (r.table) {
      out.append(block(r.l, table(r.table), () => tsv(r.table)));
    } else if (r.kv) {
      const dl = h('dl', { class: 'kv' });
      for (const [k, v] of r.kv) {
        if (v === undefined || v === null) continue;
        dl.append(h('div', { class: 'kv-row' }, h('dt', {}, k), h('dd', { class: 'copyable', tabindex: '0', title: 'Click to copy', onclick: () => copy(String(v)), onkeydown: e => e.key === 'Enter' && copy(String(v)) }, String(v))));
      }
      out.append(block(r.l, dl, () => r.kv.filter(x => x[1] != null).map(([k, v]) => k + ': ' + v).join('\n')));
    } else if (r.seg) {
      const pre = h('pre', { class: 'out-pre' }, r.seg.map(([t, c]) => c ? h('span', { class: c }, t) : t));
      out.append(block(r.l, pre, r.copy === false ? null : () => r.seg.filter(s => s[1] !== 'del' || r.copyDel).map(s => s[0]).join('')));
    } else if (r.color) {
      out.append(block(r.l, h('div', { class: 'swatch', style: 'background:' + safeCss(r.color) }), null));
    } else if (r.img) {
      out.append(block(r.l, h('div', { class: 'imgbox' }, h('img', { src: r.img, alt: r.alt || r.l || '' })), null));
    } else if (r.html !== undefined) {
      const frame = h('iframe', { class: 'preview', sandbox: '', title: r.l || 'Preview', referrerpolicy: 'no-referrer' });
      frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
        + '<style>body{font:15px/1.6 system-ui,sans-serif;margin:16px;color:#1b1f24;background:#fff}pre,code{background:#f1f3f5;padding:2px 4px;border-radius:4px}pre{padding:10px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:12px;color:#555}</style>'
        + r.html;
      out.append(block(r.l, frame, null));
    } else if (r.css !== undefined) {
      const box = h('div', { class: 'cssprev' + (r.cls ? ' ' + r.cls : '') }, h('div', { class: 'cssprev-el' }, r.text || ''));
      box.firstChild.style.cssText = r.css;
      if (r.wrapCss) box.style.cssText = r.wrapCss;
      out.append(block(r.l, box, null));
    } else if (r.dl) {
      const { name, data, mime } = r.dl;
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      out.append(h('div', { class: 'res dlrow' }, h('a', { class: 'btn', href: url, download: name }, icon('download'), r.l || 'Download ' + name)));
    } else if (r.el) {
      out.append(block(r.l, r.el, null));
    } else if (r.v !== undefined) {
      const text = String(r.v);
      out.append(block(r.l, h('pre', { class: 'out-pre' + (r.wrap === false ? ' nowrap' : '') + (r.big ? ' big' : '') }, text), () => text, r.big ? ' res-big' : ''));
    }
  }
}
const safeCss = c => String(c).replace(/[;{}<>]/g, '');
const tsv = t => [t.head, ...t.rows].filter(Boolean).map(r => r.map(c => String(c ?? '')).join('\t')).join('\n');

function table({ head, rows }) {
  const tb = h('tbody');
  for (const row of rows) {
    const tr = h('tr', {}, row.map(c => h('td', { class: 'copyable', title: 'Click to copy' }, String(c ?? ''))),
      h('td', { class: 'rowcopy' }, h('button', { class: 'btn tiny ghost', type: 'button', 'aria-label': 'Copy row', title: 'Copy row', onclick: () => copy(row.join('\t'), 'Row copied') }, icon('copy'))));
    tb.append(tr);
  }
  tb.addEventListener('click', e => {
    const td = e.target.closest('td.copyable');
    if (td) copy(td.textContent);
  });
  return h('div', { class: 'tablewrap' }, h('table', {},
    head && h('thead', {}, h('tr', {}, head.map(c => h('th', { scope: 'col' }, c)), h('th', { class: 'rowcopy' }, h('span', { class: 'sr-only' }, 'Copy')))), tb));
}

export function errorText(e) {
  if (e instanceof UserError) return e.message;
  console.error(e);
  return 'Something went wrong: ' + (e?.message || e) + '. Check your input or try again.';
}

// ---------- mounting a tool ----------
export function mountTool(tool, root, memory) {
  const out = h('div', { class: 'results', 'aria-live': 'polite' });
  const ctx = { rerun: () => run(), h, copy, toast, icon, renderResults: (r) => renderResults(out, r) };

  if (tool.ui) {
    const cleanup = tool.ui(root, ctx);
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }

  const values = { ...defaults(tool), ...(memory.get(tool.id) || {}) };
  const inputs = {};
  let timer, seq = 0, interval;

  const run = async (force) => {
    if (tool.btn && !force) return;
    const my = ++seq;
    memory.set(tool.id, Object.fromEntries(Object.entries(values).filter(([k]) => !inputs[k]?.file)));
    out.classList.add('busy');
    try {
      const res = await tool.run({ ...values }, ctx);
      if (my === seq) renderResults(out, res);
    } catch (e) {
      if (my === seq) renderResults(out, [{ note: errorText(e), kind: 'err' }]);
    } finally {
      if (my === seq) out.classList.remove('busy');
    }
  };
  // ctx.set('k', v) or ctx.set({ k: v, … }): update fields and rerun.
  ctx.set = (k, v) => {
    for (const [kk, vv] of Object.entries(typeof k === 'object' ? k : { [k]: v })) { values[kk] = vv; inputs[kk]?.set(vv); }
    vis(); run();
  };
  // Only update the field, without rerunning (for example the color picker).
  ctx.sync = (k, v) => { if (values[k] !== v && document.activeElement !== inputs[k]?.input) { values[k] = v; inputs[k]?.set(v); } };
  ctx.values = values;

  const onChange = (f, now) => {
    values[f.k] = inputs[f.k].get();
    vis();
    if (f.on) { f.on(values, ctx); return; }
    clearTimeout(timer);
    if (now) run(); else timer = setTimeout(run, 120);
  };
  const vis = () => { for (const f of tool.fields) if (f.show) inputs[f.k].wrap.hidden = !f.show(values); };

  const form = h('div', { class: 'fields' });
  const sole = tool.fields.filter(f => f.t !== 'chk').length === 1;
  for (const f of tool.fields) {
    const fi = field(sole ? { ...f, sole: true } : f, values, onChange);
    inputs[f.k] = fi;
    fi.set(values[f.k]);
    if (!fi.file) {
      const ev = ['sel', 'chk', 'color', 'range', 'date', 'time', 'dt'].includes(f.t) ? 'change' : 'input';
      fi.input.addEventListener(ev, () => onChange(f, ev === 'change'));
      if (f.t === 'range' || f.t === 'color') fi.input.addEventListener('input', () => onChange(f, false));
    }
    form.append(fi.wrap);
  }
  vis();

  const apply = v => { for (const f of tool.fields) { if (f.k in v) { values[f.k] = v[f.k]; inputs[f.k].set(v[f.k]); } } vis(); run(tool.btn ? true : undefined); };
  const bar = h('div', { class: 'exbar' });
  if (tool.ex.length) {
    bar.append(h('span', { class: 'exbar-l' }, 'Examples'));
    for (const ex of tool.ex) bar.append(h('button', { class: 'chip', type: 'button', onclick: () => apply(ex.v) }, ex.n));
  }
  if (tool.fields.length) bar.append(h('button', { class: 'chip ghost', type: 'button', onclick: () => apply(defaults(tool)), title: 'Reset all fields to their defaults' }, icon('reset'), 'Reset'));

  const actions = h('div', { class: 'actions' });
  if (tool.btn) actions.append(h('button', { class: 'btn primary', type: 'button', onclick: () => run(true) }, icon('play'), tool.btn));
  if (tool.regen) actions.append(h('button', { class: 'btn', type: 'button', onclick: () => run(true) }, icon('reset'), 'Regenerate'));
  for (const a of tool.actions || []) actions.append(h('button', { class: 'btn', type: 'button', onclick: () => a.run(values, ctx) }, a.label));

  const input = h('section', { class: 'panel-in', 'aria-label': 'Input' },
    h('div', { class: 'sect-h' }, h('span', {}, 'Input'), bar.childElementCount ? bar : ''),
    form, actions.childElementCount ? actions : '');
  root.append(tool.fields.length || actions.childElementCount ? input : '', h('div', { class: 'sect-h out-h' }, h('span', {}, 'Output')), out);
  if (tool.btn) renderResults(out, [{ note: 'Click “' + tool.btn + '” to start.', kind: 'info' }]);
  else run();
  if (tool.tick) interval = setInterval(() => run(), tool.tick);
  return () => { clearInterval(interval); clearTimeout(timer); seq++; };
}
