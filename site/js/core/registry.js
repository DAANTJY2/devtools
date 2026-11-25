// The registry: each tool is one call to T({...}).
//
// Tool:   { id, cat, ic, name, desc, kw, fields, run(v, ctx), ex, btn, regen, tick, ui, browser }
//   ex     examples: [{ n: 'Name', v: { field: value } }]
//   btn    label for a button; the tool then only runs after a click (heavy actions)
//   regen  shows a "Regenerate" button (new randomness with the same input)
//   tick   rerun every n milliseconds (for example TOTP)
//   actions extra buttons: [{ label, run(v, ctx) }], for example “New secret”
//   ui     ui(el, ctx): custom interface instead of fields and run (browser only)
//   browser true: the tool needs a browser and is not run in Node
//
// Field:  { k, t, label, def, rows, opts, show(v), min, max, step, ph, hint, mono, accept }
//   t      text | area | num | sel | chk | range | color | date | time | dt | file
//   on     on(v, ctx): called on a change instead of rerunning
//
// Result (list of):
//   { l, v }                 text with a copy button (v is a string)
//   { note, kind }           message: info | ok | warn | err
//   { l, table: { head, rows } }   table; click a cell or row to copy it
//   { l, kv: [[key, value]] } key-value list
//   { l, seg: [[text, class]] }    formatted block; text is always escaped
//   { l, color }             color swatch
//   { l, img, alt }          image (data or blob URL)
//   { l, html }              sanitized HTML in a sandboxed iframe
//   { l, css, text }         preview box with inline CSS
//   { l, dl: { name, data, mime } } download button

export const cats = [
  { id: 'crypto', name: 'Crypto & security', ic: 'CR' },
  { id: 'convert', name: 'Converters', ic: 'CV' },
  { id: 'web', name: 'Web', ic: 'WB' },
  { id: 'dev', name: 'Development', ic: 'DV' },
  { id: 'net', name: 'Network', ic: 'NW' },
  { id: 'media', name: 'Images & video', ic: 'IV' },
  { id: 'math', name: 'Math', ic: 'MA' },
  { id: 'time', name: 'Time & measurement', ic: 'TM' },
  { id: 'text', name: 'Text & lists', ic: 'TX' },
  { id: 'data', name: 'Data', ic: 'DT' },
  { id: 'ref', name: 'Reference & cheat sheets', ic: 'RF' },
];

export const tools = [];
export const byId = new Map();

export function T(def) {
  if (!def.id || byId.has(def.id)) throw new Error('Duplicate or empty tool id: ' + def.id);
  if (!cats.some(c => c.id === def.cat)) throw new Error('Unknown category for ' + def.id);
  const tool = { fields: [], kw: '', ex: [], ...def };
  tools.push(tool);
  byId.set(tool.id, tool);
  return tool;
}

// Error meant for the user: the text is shown verbatim.
export class UserError extends Error {}
export function fail(msg) { throw new UserError(msg); }

// Default values of all fields.
export function defaults(tool) {
  const v = {};
  for (const f of tool.fields) {
    if (f.def !== undefined) v[f.k] = typeof f.def === 'function' ? f.def() : f.def;
    else v[f.k] = f.t === 'chk' ? false : f.t === 'num' || f.t === 'range' ? (f.min ?? 0)
      : f.t === 'sel' ? optValue(f.opts[0]) : f.t === 'file' ? null : f.t === 'color' ? '#000000' : '';
  }
  return v;
}
export const optValue = o => Array.isArray(o) ? o[0] : o;
export const optLabel = o => Array.isArray(o) ? o[1] : o;
