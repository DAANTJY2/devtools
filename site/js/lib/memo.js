// Cheat sheets: searchable tables of commands with explanations.
import { T } from '../core/registry.js';
import { stripAccents } from '../core/util.js';

// sections: { 'Heading': [[command, explanation], …], … }
export function memo({ head = ['Command', 'What it does'], sections, ...def }) {
  const norm = s => stripAccents(String(s).toLowerCase());
  return T({
    ...def,
    fields: [{ k: 'q', t: 'text', label: 'Search', ph: 'Search by command or description' }],
    run(v) {
      const q = norm(v.q.trim());
      const out = [];
      for (const [title, rows] of Object.entries(sections)) {
        const hit = q ? rows.filter(r => r.some(c => norm(c).includes(q)) || norm(title).includes(q)) : rows;
        if (hit.length) out.push({ l: title, table: { head, rows: hit } });
      }
      return out.length ? out : [{ note: 'Nothing found for “' + v.q + '”.', kind: 'warn' }];
    },
  });
}
