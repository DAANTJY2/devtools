// Format and minify XML (and simple HTML) without changing the structure.
import { fail } from '../core/registry.js';

export function tokens(s) {
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<\/?[^\s<>/!?][^<>]*?\/?>|[^<]+|</g;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    const t = m[0];
    if (t === '<') fail('Invalid XML: there is a stray “<” in the text. Use &lt; for a less-than sign.');
    const type = t.startsWith('<!--') ? 'comment' : t.startsWith('<![CDATA[') ? 'cdata' : t.startsWith('<?') ? 'pi' : /^<!DOCTYPE/i.test(t) ? 'doctype'
      : t.startsWith('</') ? 'close' : t.startsWith('<') ? (t.endsWith('/>') ? 'self' : 'open') : 'text';
    out.push({ type, t, name: type === 'open' || type === 'close' || type === 'self' ? /^<\/?([^\s/>]+)/.exec(t)[1] : null });
  }
  return out;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function pretty(s, indent = '  ', { html = false } = {}) {
  const tk = tokens(s.trim());
  let depth = 0;
  const out = [];
  for (let i = 0; i < tk.length; i++) {
    const x = tk[i];
    if (x.type === 'text') {
      const t = x.t.trim();
      if (t) out.push(indent.repeat(depth) + t.replace(/\s+/g, ' '));
      continue;
    }
    if (x.type === 'open' && !(html && VOID.has(x.name.toLowerCase()))) {
      // keep <a>text</a> on one line
      const n = tk[i + 1], c = tk[i + 2];
      if (n && n.type === 'text' && c && c.type === 'close' && c.name === x.name && !n.t.includes('\n')) {
        out.push(indent.repeat(depth) + x.t + n.t.trim() + c.t); i += 2; continue;
      }
      if (n && n.type === 'close' && n.name === x.name) { out.push(indent.repeat(depth) + x.t + n.t); i++; continue; }
      if (html && /^(pre|script|style|textarea)$/i.test(x.name)) {
        let j = i + 1, raw = '';
        while (j < tk.length && !(tk[j].type === 'close' && tk[j].name.toLowerCase() === x.name.toLowerCase())) raw += tk[j++].t;
        out.push(indent.repeat(depth) + x.t + raw + (tk[j]?.t || ''));
        i = j; continue;
      }
      out.push(indent.repeat(depth) + x.t);
      depth++;
      continue;
    }
    if (x.type === 'close') { depth = Math.max(0, depth - 1); out.push(indent.repeat(depth) + x.t); continue; }
    out.push(indent.repeat(depth) + x.t.trim());
  }
  return out.join('\n');
}

export function minify(s, { comments = false } = {}) {
  return tokens(s.trim()).map(x => {
    if (x.type === 'comment') return comments ? x.t : '';
    if (x.type === 'text') return x.t.trim() ? x.t.replace(/\s+/g, ' ') : '';
    return x.t.replace(/\s+/g, ' ').replace(/\s+(\/?>)$/, '$1');
  }).join('');
}
