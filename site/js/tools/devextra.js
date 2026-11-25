import { T, fail } from '../core/registry.js';
import { lib, parseJSON, plural, fnum, show, lines } from '../core/util.js';
import * as C from '../lib/color.js';
import { parseAs } from './convert.js';

// ---------- Query string and JSON ----------
export function qsToObj(qs, typed) {
  const out = {};
  const conv = x => !typed ? x : /^-?\d+(\.\d+)?$/.test(x) && !/^0\d/.test(x) ? Number(x) : x === 'true' ? true : x === 'false' ? false : x === 'null' ? null : x;
  for (const [rawK, rawV] of new URLSearchParams(qs.trim().replace(/^.*?\?/, '').replace(/#.*$/, ''))) {
    const keys = rawK.replace(/\]/g, '').split('[');
    let cur = out;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      if (k === '') {
        if (!Array.isArray(cur.__arr)) cur.__arr = [];
      }
      if (last) {
        if (k === '') cur.__arr.push(conv(rawV));
        else if (k in cur) cur[k] = [].concat(cur[k], conv(rawV));
        else cur[k] = conv(rawV);
      } else {
        if (k === '') { const o = {}; cur.__arr.push(o); cur = o; }
        else { cur[k] ??= {}; if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = { '': cur[k] }; cur = cur[k]; }
      }
    });
  }
  const fix = o => { if (o && typeof o === 'object') { if (Array.isArray(o)) return o.map(fix); if ('__arr' in o && Object.keys(o).length === 1) return fix(o.__arr); for (const k of Object.keys(o)) o[k] = fix(o[k]); } return o; };
  return fix(out);
}
export function objToQs(o, arr = 'brackets') {
  const parts = [];
  const walk = (v, key) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, arr === 'repeat' ? key : arr === 'index' ? `${key}[${i}]` : `${key}[]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}[${k}]` : k);
    else parts.push(encodeURIComponent(key).replace(/%5B/g, '[').replace(/%5D/g, ']') + '=' + encodeURIComponent(v ?? ''));
  };
  walk(o, '');
  return parts.join('&');
}
T({
  id: 'querystring', cat: 'dev', ic: '?=', name: 'Query string to JSON',
  desc: 'Convert a query string to JSON and JSON to a query string, including nested keys such as a[b]=1.',
  kw: 'querystring query string json url parameters convert urlsearchparams',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['q2j', 'Query string → JSON'], ['j2q', 'JSON → query string']] },
    { k: 's', t: 'area', label: 'Input', rows: 5, def: '?search=caf%C3%A9&page=2&tags[]=web&tags[]=dev&filter[status]=active&filter[min]=10' },
    { k: 'typed', t: 'chk', label: 'Detect numbers and true/false', def: true, show: v => v.m === 'q2j' },
    { k: 'arr', t: 'sel', label: 'Lists as', opts: [['brackets', 'a[]=1&a[]=2'], ['repeat', 'a=1&a=2'], ['index', 'a[0]=1&a[1]=2']], show: v => v.m === 'j2q' },
  ],
  ex: [{ n: 'JSON → query', v: { m: 'j2q', s: '{"search": "café", "page": 2, "tags": ["web", "dev"]}' } }],
  run(v) {
    if (v.m === 'q2j') return [{ l: 'JSON', v: JSON.stringify(qsToObj(v.s, v.typed), null, 2) }];
    const o = parseJSON(v.s);
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail('Use a JSON object, for example {"a": 1}.');
    const q = objToQs(o, v.arr);
    return [{ l: 'Query string', v: q }, { l: 'With question mark', v: '?' + q }];
  },
});

// ---------- Reverse proxy ----------
T({
  id: 'nginx', cat: 'dev', ic: 'RP', name: 'Reverse proxy config',
  desc: 'Generate an nginx server block and the matching Caddyfile for a reverse proxy.',
  kw: 'nginx caddy reverse proxy proxy_pass server block caddyfile https lets encrypt websocket configuration',
  fields: [
    { k: 'domain', t: 'text', label: 'Domain name', def: 'app.example.com' },
    { k: 'up', t: 'text', label: 'Upstream service (host:port)', def: '127.0.0.1:8080', mono: true },
    { k: 'https', t: 'chk', label: 'HTTPS (Let’s Encrypt certificate)', def: true },
    { k: 'redirect', t: 'chk', label: 'Redirect HTTP to HTTPS', def: true, show: v => v.https },
    { k: 'hsts', t: 'chk', label: 'HSTS header', show: v => v.https },
    { k: 'ws', t: 'chk', label: 'Pass WebSockets through', def: true },
    { k: 'upssl', t: 'chk', label: 'Upstream uses HTTPS itself' },
    { k: 'body', t: 'text', label: 'Maximum upload size', def: '100M' },
    { k: 'ipallow', t: 'text', label: 'Only allow access from (optional, CIDR, comma-separated)', ph: '192.168.1.0/24' },
  ],
  run(v) {
    const d = v.domain.trim(), up = v.up.trim().replace(/^https?:\/\//, '');
    if (!/^[\w.*-]+$/.test(d)) fail('Enter a valid domain name, for example app.example.com.');
    if (!/^[\w.[\]:-]+:\d+$/.test(up)) fail('Enter the service as host:port, for example 127.0.0.1:8080 or jellyfin:8096.');
    const scheme = v.upssl ? 'https' : 'http';
    const allow = v.ipallow.split(/[\s,]+/).filter(Boolean);
    const loc = [
      `        proxy_pass ${scheme}://${up};`, '        proxy_set_header Host $host;', '        proxy_set_header X-Real-IP $remote_addr;',
      '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '        proxy_set_header X-Forwarded-Proto $scheme;',
      ...(v.ws ? ['        proxy_http_version 1.1;', '        proxy_set_header Upgrade $http_upgrade;', '        proxy_set_header Connection $connection_upgrade;'] : []),
      ...(v.upssl ? ['        proxy_ssl_server_name on;'] : []),
      '        proxy_read_timeout 300s;',
    ];
    const acl = allow.length ? [...allow.map(a => `    allow ${a};`), '    deny all;', ''] : [];
    let ng = v.ws ? 'map $http_upgrade $connection_upgrade {\n    default upgrade;\n    \'\'      close;\n}\n\n' : '';
    if (v.https) {
      if (v.redirect) ng += `server {\n    listen 80;\n    listen [::]:80;\n    server_name ${d};\n    return 301 https://$host$request_uri;\n}\n\n`;
      ng += `server {\n    listen 443 ssl;\n    listen [::]:443 ssl;\n    http2 on;\n    server_name ${d};\n\n    ssl_certificate /etc/letsencrypt/live/${d}/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/${d}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n`
        + (v.hsts ? '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n' : '') + `\n    client_max_body_size ${v.body};\n\n${acl.join('\n')}    location / {\n${loc.join('\n')}\n    }\n}\n`;
    } else {
      ng += `server {\n    listen 80;\n    listen [::]:80;\n    server_name ${d};\n    client_max_body_size ${v.body};\n\n${acl.join('\n')}    location / {\n${loc.join('\n')}\n    }\n}\n`;
    }
    const caddy = `${v.https ? '' : 'http://'}${d} {\n`
      + (allow.length ? `    @blocked not remote_ip ${allow.join(' ')}\n    respond @blocked 403\n\n` : '')
      + (v.hsts && v.https ? '    header Strict-Transport-Security "max-age=31536000; includeSubDomains"\n' : '')
      + `    request_body {\n        max_size ${v.body.replace(/M$/i, 'MB').replace(/G$/i, 'GB')}\n    }\n    reverse_proxy ${scheme}://${up}` + (v.upssl ? ' {\n        transport http {\n            tls_insecure_skip_verify\n        }\n    }' : '') + '\n}\n';
    return [{ l: `nginx: /etc/nginx/sites-available/${d}`, v: ng },
      v.https ? { l: 'Request and enable the certificate (nginx)', v: `sudo ln -s /etc/nginx/sites-available/${d} /etc/nginx/sites-enabled/\nsudo certbot certonly --nginx -d ${d}\nsudo nginx -t && sudo systemctl reload nginx` } : null,
      { l: 'Caddyfile (handles HTTPS itself)', v: caddy },
      v.upssl ? { note: 'tls_insecure_skip_verify disables certificate verification towards the upstream. Only use it on a trusted network.', kind: 'warn' } : null];
  },
});

// ---------- systemd ----------
T({
  id: 'systemd', cat: 'dev', ic: 'SVC', name: 'Systemd unit generator',
  desc: 'Create a .service file (and optionally a .timer) for your own service, including the install commands.',
  kw: 'systemd service unit daemon timer linux systemctl autostart',
  fields: [
    { k: 'name', t: 'text', label: 'Service name', def: 'my-app' },
    { k: 'desc', t: 'text', label: 'Description', def: 'My own application' },
    { k: 'exec', t: 'text', label: 'Command (ExecStart)', def: '/opt/my-app/bin/server --port 8080', mono: true },
    { k: 'dir', t: 'text', label: 'Working directory', def: '/opt/my-app', mono: true },
    { k: 'user', t: 'text', label: 'User', def: 'myapp' },
    { k: 'type', t: 'sel', label: 'Type', opts: [['simple', 'simple (default)'], ['exec', 'exec'], ['forking', 'forking (daemonizes)'], ['oneshot', 'oneshot (one-off task)'], ['notify', 'notify']] },
    { k: 'restart', t: 'sel', label: 'Restart', opts: [['on-failure', 'On failure'], ['always', 'Always'], ['no', 'Never']] },
    { k: 'env', t: 'area', label: 'Environment variables (KEY=value per line)', rows: 3, def: 'NODE_ENV=production\nTZ=America/New_York' },
    { k: 'net', t: 'chk', label: 'Wait for network', def: true },
    { k: 'harden', t: 'chk', label: 'Harden security (sandbox)', def: true },
    { k: 'timer', t: 'text', label: 'Run periodically (OnCalendar, optional)', ph: 'e.g. daily or *-*-* 03:00:00', mono: true },
  ],
  run(v) {
    const n = v.name.trim().replace(/\.service$/, '');
    if (!/^[\w@.-]+$/.test(n)) fail('Use only letters, digits, dots, hyphens and @ in the name.');
    if (!v.exec.trim().startsWith('/')) fail('ExecStart must start with an absolute path, for example /usr/bin/python3 or /opt/app/start.sh.');
    const timer = v.timer.trim();
    const type = timer ? 'oneshot' : v.type;
    const env = lines(v.env).filter(l => l.trim()).map(l => { if (!/^\w+=/.test(l.trim())) fail(`“${l}” is not a valid variable; use KEY=value.`); return `Environment="${l.trim().replace(/"/g, '\\"')}"`; });
    const keepRestart = type !== 'oneshot' && v.restart !== 'no';
    const unit = ['[Unit]', `Description=${v.desc}`, ...(v.net ? ['After=network-online.target', 'Wants=network-online.target'] : []), '',
      '[Service]', `Type=${type}`, ...(v.user ? [`User=${v.user}`, `Group=${v.user}`] : []), ...(v.dir ? [`WorkingDirectory=${v.dir}`] : []), ...env, `ExecStart=${v.exec.trim()}`,
      ...(keepRestart ? [`Restart=${v.restart}`, 'RestartSec=5'] : []),
      ...(v.harden ? ['', '# Hardening', 'NoNewPrivileges=true', 'PrivateTmp=true', 'ProtectSystem=strict', 'ProtectHome=true', ...(v.dir ? [`ReadWritePaths=${v.dir}`] : []), 'ProtectKernelTunables=true', 'ProtectKernelModules=true', 'ProtectControlGroups=true', 'RestrictSUIDSGID=true', 'LockPersonality=true'] : []),
      ...(timer ? [] : ['', '[Install]', 'WantedBy=multi-user.target'])];
    const res = [{ l: `/etc/systemd/system/${n}.service`, v: unit.join('\n') + '\n' }];
    if (timer) res.push({ l: `/etc/systemd/system/${n}.timer`, v: `[Unit]\nDescription=${v.desc} (schedule)\n\n[Timer]\nOnCalendar=${timer}\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n` });
    const user = v.user && v.user !== 'root' ? `sudo useradd --system --no-create-home --shell /usr/sbin/nologin ${v.user}   # if the user does not exist yet\n` : '';
    res.push({ l: 'Install', v: `${user}sudo systemctl daemon-reload\nsudo systemctl enable --now ${n}.${timer ? 'timer' : 'service'}\nsystemctl status ${n}.service\njournalctl -u ${n}.service -f` });
    if (timer) res.push({ note: 'Check the schedule with: systemd-analyze calendar "' + timer + '"', kind: 'info' });
    return res;
  },
});

// ---------- JSON to TypeScript ----------
const tsName = s => (s.replace(/[^\w]+(.)/g, (m, c) => c.toUpperCase()).replace(/^\W+/, '').replace(/^./, c => c.toUpperCase()) || 'Item').replace(/^\d/, '_$&');
const keyName = k => /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
export function jsonToTs(data, root = 'Root', { style = 'interface', optionalNull = false } = {}) {
  const defs = new Map();
  const typeOf = (v, name) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) {
      if (!v.length) return 'unknown[]';
      const objs = v.filter(x => x && typeof x === 'object' && !Array.isArray(x));
      const types = new Set(v.filter(x => !(x && typeof x === 'object' && !Array.isArray(x))).map(x => typeOf(x, name)));
      if (objs.length) types.add(objType(objs, singular(name)));
      const t = [...types].join(' | ');
      return types.size > 1 ? `(${t})[]` : t + '[]';
    }
    if (typeof v === 'object') return objType([v], name);
    return typeof v;
  };
  const objType = (objs, name) => {
    const keys = [...new Set(objs.flatMap(Object.keys))];
    const fields = keys.map(k => {
      const present = objs.filter(o => k in o);
      const ts = [...new Set(present.map(o => typeOf(o[k], tsName(name) + tsName(k))))];
      const optional = present.length < objs.length || (optionalNull && ts.includes('null') && ts.length > 1);
      return `  ${keyName(k)}${optional ? '?' : ''}: ${ts.join(' | ')};`;
    });
    let n = tsName(name), i = 2;
    const body = fields.join('\n');
    for (const [k, b] of defs) if (b === body) return k;
    while (defs.has(n)) n = tsName(name) + i++;
    defs.set(n, body);
    return n;
  };
  const singular = n => n.replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
  const top = typeOf(data, root);
  const out = [...defs].reverse().map(([n, b]) => style === 'type' ? `export type ${n} = {\n${b}\n};` : `export interface ${n} {\n${b}\n}`);
  if (!defs.has(tsName(root))) out.push(`export type ${tsName(root)} = ${top};`);
  return out.join('\n\n');
}
T({
  id: 'jsonts', cat: 'dev', ic: 'TS', name: 'JSON to TypeScript',
  desc: 'Generate TypeScript interfaces from a JSON sample, with optional fields and nested types.',
  kw: 'json typescript interface type generate ts types',
  fields: [
    { k: 's', t: 'area', label: 'JSON', rows: 10, def: '{\n  "id": 42,\n  "name": "Alice",\n  "active": true,\n  "roles": ["admin", "dev"],\n  "address": { "street": "1 Main Street", "city": "Boston" },\n  "orders": [\n    { "id": 1, "amount": 19.95 },\n    { "id": 2, "amount": 5, "couponCode": "WELCOME" }\n  ]\n}' },
    { k: 'root', t: 'text', label: 'Root type name', def: 'User' },
    { k: 'style', t: 'sel', label: 'Style', opts: [['interface', 'interface'], ['type', 'type']] },
  ],
  run(v) { return [{ l: 'TypeScript', v: jsonToTs(parseJSON(v.s), v.root || 'Root', v) }]; },
});

// ---------- JSON path ----------
export function parsePath(p) {
  const s = p.trim().replace(/^\$/, '');
  const out = [];
  const re = /\.?([A-Za-z_$][\w$-]*)|\[(\d+|\*|-\d+)\]|\[(["'])(.*?)\3\]|\.(\*)/gy;
  let m, last = 0;
  while (last < s.length && (m = re.exec(s))) {
    out.push(m[1] ?? m[4] ?? (m[2] === '*' || m[5] ? '*' : Number(m[2])));
    last = re.lastIndex;
  }
  if (last < s.length) fail(`The path cannot be read from “${s.slice(last)}” onwards. Use for example a.b[0].c, $.items[*].name or ["key with space"].`);
  return out;
}
export function getPath(data, path) {
  let cur = [data];
  for (const k of path) {
    const next = [];
    for (const c of cur) {
      if (k === '*') { if (c && typeof c === 'object') next.push(...Object.values(c)); }
      else if (typeof k === 'number' && Array.isArray(c)) { const i = k < 0 ? c.length + k : k; if (i in c) next.push(c[i]); }
      else if (c && typeof c === 'object' && Object.prototype.hasOwnProperty.call(c, k)) next.push(c[k]);
    }
    cur = next;
  }
  return cur;
}
export function allPaths(data, base = '$', out = []) {
  if (data && typeof data === 'object') {
    const entries = Array.isArray(data) ? data.map((x, i) => [`[${i}]`, x]) : Object.entries(data).map(([k, x]) => [/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : `[${JSON.stringify(k)}]`, x]);
    if (!entries.length) out.push([base, Array.isArray(data) ? '[]' : '{}']);
    for (const [k, x] of entries) allPaths(x, base + k, out);
  } else out.push([base, show(data)]);
  return out;
}
T({
  id: 'jsonpath', cat: 'dev', ic: '$.', name: 'JSON path finder',
  desc: 'Get a value with a path such as a.b[0].c or $.items[*].name, and see every path in your JSON.',
  kw: 'json path jsonpath find query jq value lookup key',
  fields: [
    { k: 's', t: 'area', label: 'JSON', rows: 9, def: '{\n  "store": {\n    "books": [\n      { "title": "Nineteen Eighty-Four", "price": 12.5 },\n      { "title": "Brave New World", "price": 9.99 }\n    ],\n    "open": true\n  }\n}' },
    { k: 'p', t: 'text', label: 'Path', def: '$.store.books[*].title', mono: true },
  ],
  ex: [{ n: 'Last book', v: { p: 'store.books[-1]' } }, { n: 'All prices', v: { p: '$.store.books[*].price' } }],
  run(v) {
    const data = parseJSON(v.s);
    const res = [];
    if (v.p.trim()) {
      const r = getPath(data, parsePath(v.p));
      res.push(r.length ? { l: r.length === 1 ? 'Value' : `${r.length} values`, v: JSON.stringify(r.length === 1 ? r[0] : r, null, 2) } : { note: 'Nothing found at this path.', kind: 'warn' });
    }
    const paths = allPaths(data);
    res.push({ l: `All paths (${paths.length})`, table: { head: ['Path', 'Value'], rows: paths.slice(0, 2000) } });
    return res;
  },
});

// ---------- CSS ----------
export function cssMinify(s) {
  return s.replace(/\/\*(?!!)[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>+~])\s*/g, '$1').replace(/;}/g, '}').replace(/\s*!important/g, '!important')
    .replace(/(^|[^\w-])0(px|em|rem|%|pt|vh|vw)(?=[\s;,)}]|$)/g, '$10').replace(/:0 0 0 0(?=[;}])/g, ':0').trim()
    .replace(/(url\([^)]*\))/g, m => m); // url() stays as it is
}
T({
  id: 'css', cat: 'dev', ic: 'CSS', name: 'CSS minifier and beautifier',
  desc: 'Minify CSS for production or make it readable again.',
  kw: 'css minify minifier beautify beautifier format compress stylesheet',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['min', 'Minify'], ['pretty', 'Beautify']] },
    { k: 's', t: 'area', label: 'CSS', rows: 10, def: '/* Buttons */\n.button {\n  padding: 8px 16px;\n  margin: 0px 0px 0px 0px;\n  color: #ffffff;\n  background: var(--accent) !important;\n}\n\n.button:hover , .button:focus { opacity : 0.9 ; }\n@media (max-width: 600px) { .button { width: 100% } }' },
  ],
  async run(v) {
    if (v.m === 'min') { const out = cssMinify(v.s); return [{ l: `Minified (${out.length} characters, was ${v.s.length}; ${fnum(100 - out.length / Math.max(1, v.s.length) * 100, 0)}% smaller)`, v: out }]; }
    const B = await lib('beautify');
    return [{ l: 'Formatted', v: B.css(v.s, { indent_size: 2, newline_between_rules: true }) }];
  },
});

// ---------- Gradient ----------
T({
  id: 'gradient', cat: 'dev', ic: 'GRD', name: 'CSS gradient generator',
  desc: 'Compose a linear, radial or conic gradient with a live preview and copy the CSS.',
  kw: 'css gradient linear radial conic background',
  fields: [
    { k: 'type', t: 'sel', label: 'Type', opts: [['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']] },
    { k: 'angle', t: 'range', label: 'Angle (degrees)', def: 135, min: 0, max: 360, show: v => v.type !== 'radial' },
    { k: 'shape', t: 'sel', label: 'Shape', opts: [['circle', 'Circle'], ['ellipse', 'Ellipse']], show: v => v.type === 'radial' },
    { k: 'pos', t: 'sel', label: 'Center', opts: [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right'], ['top left', 'Top left'], ['bottom right', 'Bottom right']], show: v => v.type !== 'linear' },
    { k: 'stops', t: 'area', label: 'Colors (one per line, optionally with a position)', rows: 4, def: '#2f6fde 0%\n#a3367a 50%\n#f3c162 100%', mono: true },
    { k: 'space', t: 'sel', label: 'Interpolate in', opts: [['', 'sRGB (default)'], ['oklab', 'OKLab (smoother)'], ['oklch', 'OKLCH']] },
    { k: 'rep', t: 'chk', label: 'Repeating' },
  ],
  ex: [{ n: 'Sunset', v: { type: 'linear', angle: 180, stops: '#ff7e5f\n#feb47b' } }, { n: 'Conic', v: { type: 'conic', stops: 'red\nyellow\nlime\naqua\nblue\nmagenta\nred' } }],
  run(v) {
    const stops = lines(v.stops).map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^(.+?)(\s+-?[\d.]+(%|px|deg)?(\s+-?[\d.]+(%|px|deg)?)?)?$/.exec(l);
      const c = C.parse(m[1]);
      return C.hex(c) + (m[2] || '');
    });
    if (stops.length < 2) fail('A gradient needs at least two colors.');
    const sp = v.space ? ` in ${v.space}` : '';
    const head = v.type === 'linear' ? `${v.angle}deg${sp}` : v.type === 'radial' ? `${v.shape} at ${v.pos}${sp}` : `from ${v.angle}deg at ${v.pos}${sp}`;
    const fn = (v.rep ? 'repeating-' : '') + v.type + '-gradient';
    const css = `${fn}(${head}, ${stops.join(', ')})`;
    return [{ l: 'Preview', css: `background:${css};width:100%;min-height:220px`, cls: 'full' }, { l: 'CSS', v: `background: ${css};` },
      { l: 'With a fallback for older browsers', v: `background: ${stops[0].split(' ')[0]};\nbackground: ${css};` }];
  },
});

// ---------- Box shadow ----------
T({
  id: 'shadow', cat: 'dev', ic: 'SHD', name: 'Box shadow generator',
  desc: 'Compose a shadow with a live preview, optionally layered for a softer effect.',
  kw: 'box-shadow shadow css generator',
  fields: [
    { k: 'x', t: 'range', label: 'Horizontal (px)', def: 0, min: -50, max: 50 },
    { k: 'y', t: 'range', label: 'Vertical (px)', def: 8, min: -50, max: 50 },
    { k: 'blur', t: 'range', label: 'Blur (px)', def: 24, min: 0, max: 100 },
    { k: 'spread', t: 'range', label: 'Spread (px)', def: -4, min: -50, max: 50 },
    { k: 'color', t: 'color', label: 'Color', def: '#000000' },
    { k: 'op', t: 'range', label: 'Opacity (%)', def: 20, min: 0, max: 100 },
    { k: 'inset', t: 'chk', label: 'Inner shadow (inset)' },
    { k: 'layers', t: 'range', label: 'Layers (softer)', def: 1, min: 1, max: 5 },
  ],
  run(v) {
    const c = C.parse(v.color);
    const rgba = a => `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)} / ${+(a).toFixed(3)})`;
    const n = v.layers;
    const parts = Array.from({ length: n }, (_, i) => {
      const f = n === 1 ? 1 : 2 ** (i + 1) / 2 ** n;
      return `${v.inset ? 'inset ' : ''}${Math.round(v.x * f)}px ${Math.round(v.y * f)}px ${Math.round(v.blur * f)}px ${Math.round(v.spread * f)}px ${rgba(v.op / 100 / (n === 1 ? 1 : n / 1.5))}`;
    });
    const css = parts.join(',\n    ');
    return [{ l: 'Preview', css: `box-shadow:${parts.join(',')};background:#fff`, text: 'Preview', wrapCss: 'background:#f1f3f5' }, { l: 'CSS', v: `box-shadow: ${css};` }];
  },
});

// ---------- px and rem ----------
T({
  id: 'pxrem', cat: 'dev', ic: 'REM', name: 'px ⇄ rem and fluid clamp()',
  desc: 'Convert pixels to rem and build a fluid clamp() value for typography.',
  kw: 'px rem em convert clamp fluid typography font size css responsive',
  fields: [
    { k: 'base', t: 'num', label: 'Base size (px)', def: 16, min: 1 },
    { k: 'vals', t: 'text', label: 'Values (px or rem, separated by spaces)', def: '12 14 16 18 24 32 1.5rem', mono: true },
    { k: 'minFs', t: 'num', label: 'clamp: smallest font size (px)', def: 18 },
    { k: 'maxFs', t: 'num', label: 'clamp: largest font size (px)', def: 32 },
    { k: 'minVw', t: 'num', label: 'clamp: from viewport width (px)', def: 375 },
    { k: 'maxVw', t: 'num', label: 'clamp: to viewport width (px)', def: 1280 },
  ],
  run(v) {
    const b = v.base;
    if (!(b > 0)) fail('The base size must be greater than 0.');
    const rows = v.vals.split(/[\s,]+/).filter(Boolean).map(t => {
      const m = /^(-?[\d.]+)(px|rem|em)?$/i.exec(t);
      if (!m) fail(`“${t}” is not a valid value; use for example 16 or 1.5rem.`);
      const px = /r?em/i.test(m[2] || '') ? +m[1] * b : +m[1];
      return [`${+px.toFixed(3)}px`, `${+(px / b).toFixed(4)}rem`];
    });
    const res = [{ l: 'Converted', table: { head: ['px', 'rem'], rows } }];
    const { minFs, maxFs, minVw, maxVw } = v;
    if ([minFs, maxFs, minVw, maxVw].every(x => typeof x === 'number')) {
      if (maxVw <= minVw) fail('“To viewport width” must be greater than “from viewport width”.');
      const slope = (maxFs - minFs) / (maxVw - minVw);
      const inter = minFs - slope * minVw;
      const r = x => +(x / b).toFixed(4);
      const clamp = `clamp(${r(Math.min(minFs, maxFs))}rem, ${r(inter)}rem + ${+(slope * 100).toFixed(4)}vw, ${r(Math.max(minFs, maxFs))}rem)`;
      res.push({ l: 'Fluid value', v: `font-size: ${clamp};` }, { note: `${minFs}px at ${minVw}px wide, growing to ${maxFs}px at ${maxVw}px. Because the base is in rem, it scales with the user’s font size.`, kind: 'info' });
    }
    return res;
  },
});

// ---------- Semver ----------
export function parseSemver(s) {
  const m = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?\s*$/.exec(s);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [], build: m[5] || '', raw: s.trim() };
}
export function cmpSemver(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x < +y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
const fmtSv = v => `${v.major}.${v.minor}.${v.patch}${v.pre.length ? '-' + v.pre.join('.') : ''}`;
// npm ranges: ^, ~, >=, <, x, hyphen and ||
export function satisfies(ver, range) {
  const v = typeof ver === 'string' ? parseSemver(ver) : ver;
  const partial = s => { const m = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(s); if (!m) fail(`“${s}” is not a valid version range.`); const n = x => x === undefined || /[xX*]/.test(x) ? null : +x; return { major: n(m[1]), minor: n(m[2]), patch: n(m[3]), pre: m[4] ? m[4].split('.') : [] }; };
  const full = p => ({ major: p.major ?? 0, minor: p.minor ?? 0, patch: p.patch ?? 0, pre: p.pre });
  const comparators = set => {
    const out = [];
    const toks = set.trim().replace(/\s*-\s+/g, ' - ').replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      if (toks[i + 1] === '-') { const lo = partial(t), hi = partial(toks[i + 2]); out.push(['>=', full(lo)]); out.push(hi.patch === null ? ['<', full(hi.minor === null ? { major: hi.major + 1 } : { major: hi.major, minor: hi.minor + 1 })] : ['<=', full(hi)]); i += 2; continue; }
      const m = /^(>=|<=|>|<|=|\^|~)?(.*)$/.exec(t);
      const op = m[1] || '', p = partial(m[2]);
      if (op === '^') { const lo = full(p); out.push(['>=', lo]); out.push(['<', p.major > 0 || p.minor === null ? { major: lo.major + 1, minor: 0, patch: 0, pre: [] } : p.minor > 0 || p.patch === null ? { major: 0, minor: lo.minor + 1, patch: 0, pre: [] } : { major: 0, minor: 0, patch: lo.patch + 1, pre: [] }]); }
      else if (op === '~') { const lo = full(p); out.push(['>=', lo]); out.push(['<', p.minor === null ? { major: lo.major + 1, minor: 0, patch: 0, pre: [] } : { major: lo.major, minor: lo.minor + 1, patch: 0, pre: [] }]); }
      else if (!op || op === '=') {
        if (p.major === null) continue;
        if (p.minor === null) { out.push(['>=', full(p)], ['<', { major: p.major + 1, minor: 0, patch: 0, pre: [] }]); }
        else if (p.patch === null) { out.push(['>=', full(p)], ['<', { major: p.major, minor: p.minor + 1, patch: 0, pre: [] }]); }
        else out.push(['=', full(p)]);
      } else out.push([op, full(p)]);
    }
    return out;
  };
  return range.split('||').some(set => {
    const cs = comparators(set);
    if (v.pre.length && !cs.some(([, c]) => c.pre.length && c.major === v.major && c.minor === v.minor && c.patch === v.patch)) return false;
    return cs.every(([op, c]) => { const r = cmpSemver(v, c); return op === '>=' ? r >= 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : op === '<' ? r < 0 : r === 0; });
  });
}
T({
  id: 'semver', cat: 'dev', ic: 'SEM', name: 'Semver comparator',
  desc: 'Compare and sort versions according to Semantic Versioning, test ranges such as ^1.2 and compute the next release.',
  kw: 'semver semantic versioning version compare sort range npm caret tilde release',
  fields: [
    { k: 's', t: 'area', label: 'Versions (one per line)', rows: 6, def: '1.10.0\n1.2.3\n1.2.3-beta.2\n1.2.3-beta.10\n2.0.0-rc.1\n1.2.3-alpha\n0.9.12' },
    { k: 'range', t: 'text', label: 'Test a range (optional)', def: '^1.2.0', mono: true, hint: 'For example ^1.2.0, ~1.2, >=1.0.0 <2.0.0, 1.x or 1.0.0 - 1.5.0' },
    { k: 'bump', t: 'text', label: 'Compute the next release for', def: '1.2.3', mono: true },
  ],
  run(v) {
    const vers = lines(v.s).map(x => x.trim()).filter(Boolean);
    const bad = vers.filter(x => !parseSemver(x));
    const ok = vers.map(parseSemver).filter(Boolean).sort(cmpSemver);
    const res = [];
    if (ok.length) res.push({ l: 'Sorted (old → new)', table: { head: ['#', 'Version', ...(v.range.trim() ? ['Satisfies ' + v.range.trim()] : [])], rows: ok.map((x, i) => [i + 1, x.raw, ...(v.range.trim() ? [satisfies(x, v.range) ? '✓ yes' : '✗ no'] : [])]) } });
    if (bad.length) res.push({ note: 'Not a valid semver version: ' + bad.join(', ') + '. A version has the form MAJOR.MINOR.PATCH, such as 1.2.3.', kind: 'warn' });
    if (v.bump.trim()) {
      const b = parseSemver(v.bump);
      if (!b) fail('“' + v.bump + '” is not a valid version to bump.');
      const pre = b.pre.length ? (/^\d+$/.test(b.pre.at(-1)) ? [...b.pre.slice(0, -1), String(+b.pre.at(-1) + 1)] : [...b.pre, '0']) : ['0'];
      res.push({ l: 'Next version', kv: [['Patch (bug fix)', b.pre.length ? fmtSv({ ...b, pre: [] }) : fmtSv({ ...b, patch: b.patch + 1, pre: [] })], ['Minor (new features)', fmtSv({ ...b, minor: b.minor + 1, patch: 0, pre: [] })], ['Major (breaking change)', fmtSv({ ...b, major: b.major + 1, minor: 0, patch: 0, pre: [] })], ['Prerelease', fmtSv({ ...(b.pre.length ? b : { ...b, patch: b.patch + 1 }), pre })]] });
    }
    return res;
  },
});

// ---------- String escaping ----------
const ESC = {
  json: [s => JSON.stringify(s).slice(1, -1), s => { try { return JSON.parse('"' + s.replace(/(?<!\\)"/g, '\\"') + '"'); } catch { fail('This text contains an invalid JSON escape, such as a stray backslash.'); } }],
  js: [s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
    s => s.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|x[0-9a-f]{2}|.)/gis, (m, e) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }[e] ?? (/^u\{/i.test(e) ? String.fromCodePoint(parseInt(e.slice(2, -1), 16)) : /^u/i.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16)) : /^x/i.test(e) ? String.fromCharCode(parseInt(e.slice(1), 16)) : e)))],
  regex: [s => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'), s => s.replace(/\\(.)/g, '$1')],
  shell: [s => "'" + s.replace(/'/g, "'\\''") + "'", s => { const t = s.trim(); return t.startsWith("'") ? t.slice(1, -1).replace(/'\\''/g, "'") : t.startsWith('"') ? t.slice(1, -1).replace(/\\(["\\$`])/g, '$1') : t.replace(/\\(.)/g, '$1'); }],
  ps: [s => "'" + s.replace(/'/g, "''") + "'", s => s.trim().replace(/^'|'$/g, '').replace(/''/g, "'")],
  sql: [s => "'" + s.replace(/'/g, "''") + "'", s => s.trim().replace(/^'|'$/g, '').replace(/''/g, "'")],
  csv: [s => /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s, s => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"')],
  xml: [s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'), s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')],
};
T({
  id: 'escape', cat: 'dev', ic: '\\"', name: 'String escaper',
  desc: 'Escape or unescape text for JSON, JavaScript, regular expressions, shell, PowerShell, SQL, CSV and XML.',
  kw: 'escape unescape string json javascript regex shell bash powershell sql csv xml quotes',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Escape'], ['dec', 'Unescape']] },
    { k: 'lang', t: 'sel', label: 'For', opts: [['json', 'JSON string'], ['js', 'JavaScript string'], ['regex', 'Regular expression'], ['shell', 'Shell (bash, sh)'], ['ps', 'PowerShell'], ['sql', 'SQL'], ['csv', 'CSV field'], ['xml', 'XML']] },
    { k: 's', t: 'area', label: 'Input', rows: 5, def: 'It\'s "nice" weather\ntoday, right? C:\\temp\\file.txt' },
  ],
  run(v) { const [e, d] = ESC[v.lang]; return [{ l: v.m === 'enc' ? 'Escaped' : 'Unescaped', v: (v.m === 'enc' ? e : d)(v.s) }]; },
});

// ---------- HTML formatter ----------
export function htmlMinify(s, { comments = false } = {}) {
  const keep = [];
  let t = s.replace(/<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi, m => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  if (!comments) t = t.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  t = t.replace(/\s+/g, ' ').replace(/>\s+</g, '><').replace(/\s+(\/?>)/g, '$1').trim();
  return t.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[i]);
}
T({
  id: 'htmlfmt', cat: 'dev', ic: 'HTM', name: 'HTML formatter and minifier',
  desc: 'Make HTML readable with clean indentation, or minify it by removing whitespace and comments.',
  kw: 'html formatter beautify prettify minify compress format',
  fields: [
    { k: 'm', t: 'sel', label: 'Action', opts: [['pretty', 'Format'], ['min', 'Minify']] },
    { k: 's', t: 'area', label: 'HTML', rows: 10, def: '<!doctype html><html lang="en"><head><title>Test</title></head><body><!-- header --><header><h1>Welcome</h1><nav><a href="/">Home</a> <a href="/about">About</a></nav></header><main><p>This is <b>bold</b> and <i>italic</i>.</p><pre>  keep\n  indentation</pre></main></body></html>' },
    { k: 'indent', t: 'sel', label: 'Indentation', opts: [['2', '2 spaces'], ['4', '4 spaces']], show: v => v.m === 'pretty' },
    { k: 'keepc', t: 'chk', label: 'Keep comments', show: v => v.m === 'min' },
  ],
  async run(v) {
    if (v.m === 'min') { const out = htmlMinify(v.s, { comments: v.keepc }); return [{ l: `Minified (${out.length} characters, was ${v.s.length})`, v: out }]; }
    const B = await lib('beautify');
    return [{ l: 'Formatted', v: B.html(v.s, { indent_size: Number(v.indent), wrap_line_length: 0, inline: ['a', 'b', 'i', 'em', 'strong', 'span', 'code', 'small', 'abbr'], extra_liners: [] }) }];
  },
});

// ---------- .env from Compose ----------
T({
  id: 'envcompose', cat: 'dev', ic: 'ENV', name: '.env from Docker Compose',
  desc: 'Extract all environment variables and ${VAR} references from a Compose file and turn them into a .env file.',
  kw: 'docker compose env .env environment variables extract',
  fields: [
    { k: 's', t: 'area', label: 'docker-compose.yml', rows: 12, def: 'services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: ${DB_PASSWORD:-secret}\n      POSTGRES_DB: app\n  web:\n    image: ghcr.io/example/app:${APP_VERSION:-latest}\n    environment:\n      - DATABASE_URL=postgres://app:${DB_PASSWORD}@db/app\n      - TZ=America/New_York\n    ports:\n      - "${WEB_PORT:-8080}:80"\n' },
    { k: 'prefix', t: 'chk', label: 'Prefix with the service name on conflicts', def: true },
  ],
  async run(v) {
    const doc = await parseAs('yaml', v.s);
    if (!doc?.services) fail('This file has no “services:”. Paste a docker-compose.yml.');
    const refs = new Map();
    for (const m of v.s.matchAll(/\$\{([A-Za-z_]\w*)(?::?([-?])([^}]*))?\}|\$([A-Za-z_]\w*)/g)) {
      const name = m[1] || m[4];
      if (!refs.has(name) || (m[2] === '-' && !refs.get(name))) refs.set(name, m[2] === '-' ? m[3] : refs.get(name) || '');
    }
    const env = [], seen = new Map();
    for (const [svc, def] of Object.entries(doc.services)) {
      const e = def?.environment;
      const pairs = Array.isArray(e) ? e.map(x => { const s = String(x); const i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; }) : Object.entries(e || {}).map(([k, x]) => [k, x === null ? '' : String(x)]);
      for (const [k, x] of pairs) {
        if (/\$\{?\w/.test(x)) continue;
        const key = seen.has(k) && seen.get(k) !== x && v.prefix ? svc.toUpperCase().replace(/\W/g, '_') + '_' + k : k;
        seen.set(k, x);
        env.push([key, x, svc]);
      }
    }
    const q = x => /[\s#"'$]/.test(x) ? '"' + x.replace(/(["\\$])/g, '\\$1') + '"' : x;
    const out = [];
    if (refs.size) out.push('# Variables referenced by the Compose file', ...[...refs].map(([k, d]) => `${k}=${q(d ?? '')}`));
    const rest = env.filter(([k]) => !refs.has(k));
    if (rest.length) out.push('', '# Fixed values from environment:', ...rest.map(([k, x, s]) => `${k}=${q(x)}  # ${s}`));
    return [{ l: '.env', v: out.join('\n').trim() + '\n' },
      refs.size ? { l: 'References', table: { head: ['Variable', 'Default value'], rows: [...refs].map(([k, d]) => [k, d || '(none)']) } } : null,
      { note: 'To route the fixed values through .env as well, replace them in the Compose file with ${NAME}. Do not commit .env to Git if it contains passwords.', kind: 'info' }];
  },
});

// ---------- rsync ----------
const RSYNC = [['a', '-a', 'archive: recursive, with permissions, times, owner and symlinks', true], ['v', '-v', 'show what is happening', true], ['z', '-z', 'compress during transfer'], ['h', '-h', 'human-readable numbers', true],
  ['P', '--info=progress2', 'overall progress', true], ['partial', '--partial', 'keep partially transferred files to resume'], ['del', '--delete', 'delete files that are not in the source'],
  ['n', '--dry-run', 'dry run: change nothing'], ['c', '--checksum', 'compare by content instead of time and size'], ['H', '-H', 'preserve hard links'], ['A', '-A', 'preserve ACLs'], ['X', '-X', 'preserve extended attributes'], ['num', '--numeric-ids', 'do not map user and group IDs']];
T({
  id: 'rsync', cat: 'dev', ic: 'RSY', name: 'Rsync command builder',
  desc: 'Build an rsync command for copies or backups, locally or over SSH, with an explanation of every option.',
  kw: 'rsync backup copy sync synchronize ssh command generator',
  fields: [
    { k: 'src', t: 'text', label: 'Source', def: '/home/alice/documents/', mono: true },
    { k: 'dst', t: 'text', label: 'Destination', def: '/mnt/backup/documents/', mono: true },
    { k: 'remote', t: 'sel', label: 'Remote machine', opts: [['', 'None (local)'], ['dst', 'Destination is on a server'], ['src', 'Source is on a server']] },
    { k: 'host', t: 'text', label: 'Server (user@host)', def: 'backup@nas.lan', show: v => !!v.remote },
    { k: 'port', t: 'num', label: 'SSH port', def: 22, show: v => !!v.remote },
    ...RSYNC.map(([k, , label, def]) => ({ k, t: 'chk', label: label[0].toUpperCase() + label.slice(1), def: !!def })),
    { k: 'ex', t: 'text', label: 'Exclude (comma-separated)', def: '.cache, node_modules, *.tmp', mono: true },
    { k: 'bw', t: 'text', label: 'Bandwidth limit (e.g. 10M)', mono: true },
  ],
  run(v) {
    if (!v.src.trim() || !v.dst.trim()) fail('Enter a source and a destination.');
    const q = s => /^[\w@%+=:,./~-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
    const shortF = RSYNC.filter(([k, f]) => v[k] && /^-[a-zA-Z]$/.test(f)).map(x => x[1][1]).join('');
    const longF = RSYNC.filter(([k, f]) => v[k] && !/^-[a-zA-Z]$/.test(f)).map(x => x[1]);
    const args = ['rsync', shortF && '-' + shortF, ...longF];
    for (const e of v.ex.split(',').map(x => x.trim()).filter(Boolean)) args.push(`--exclude=${q(e)}`);
    if (v.bw.trim()) args.push(`--bwlimit=${v.bw.trim()}`);
    if (v.remote && v.port && v.port !== 22) args.push(`-e ${q('ssh -p ' + v.port)}`);
    const src = (v.remote === 'src' ? v.host + ':' : '') + v.src.trim(), dst = (v.remote === 'dst' ? v.host + ':' : '') + v.dst.trim();
    args.push(q(src), q(dst));
    const res = [{ l: 'Command', v: args.filter(Boolean).join(' ') },
      { l: 'Explanation', table: { head: ['Option', 'Meaning'], rows: RSYNC.filter(([k]) => v[k]).map(([, f, l]) => [f, l]) } }];
    if (!v.src.trim().endsWith('/')) res.push({ note: 'The source does not end with /: rsync then copies the directory itself into the destination (dest/dir/…). With a trailing / it copies only the contents.', kind: 'info' });
    if (v.del && !v.n) res.push({ note: 'With --delete, files in the destination that are not in the source disappear. Run with --dry-run first.', kind: 'warn' });
    return res;
  },
});

// ---------- fstab ----------
const FS = {
  ext4: ['defaults', 0, 2], xfs: ['defaults', 0, 2], btrfs: ['defaults', 0, 0], vfat: ['defaults,umask=0022', 0, 2], exfat: ['defaults,umask=0022', 0, 0], ntfs3: ['defaults', 0, 0],
  nfs: ['defaults', 0, 0], cifs: ['credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8', 0, 0], tmpfs: ['defaults,size=1G,mode=1777', 0, 0], swap: ['sw', 0, 0],
};
T({
  id: 'fstab', cat: 'dev', ic: 'FST', name: 'Fstab entry generator',
  desc: 'Create an /etc/fstab line for disks, NFS, SMB/CIFS, tmpfs or swap, with an explanation and test commands.',
  kw: 'fstab mount disk nfs cifs smb samba uuid linux automount',
  fields: [
    { k: 'type', t: 'sel', label: 'File system', opts: [['ext4', 'ext4'], ['xfs', 'XFS'], ['btrfs', 'Btrfs'], ['vfat', 'FAT32 (vfat)'], ['exfat', 'exFAT'], ['ntfs3', 'NTFS (ntfs3)'], ['nfs', 'NFS'], ['cifs', 'SMB/CIFS (Windows share)'], ['tmpfs', 'tmpfs (in memory)'], ['swap', 'Swap']] },
    { k: 'dev', t: 'text', label: 'Device', def: 'UUID=1234abcd-12ab-34cd-56ef-1234567890ab', mono: true, hint: 'UUID=… (see blkid), //server/share or server:/export', show: v => v.type !== 'tmpfs' },
    { k: 'mp', t: 'text', label: 'Mount point', def: '/mnt/data', mono: true, show: v => v.type !== 'swap' },
    { k: 'opts', t: 'text', label: 'Extra options (comma-separated)', mono: true },
    { k: 'nofail', t: 'chk', label: 'nofail: keep booting if the disk is missing', def: true },
    { k: 'noatime', t: 'chk', label: 'noatime: do not record access times (faster)', show: v => !['swap', 'nfs', 'cifs', 'tmpfs'].includes(v.type) },
    { k: 'auto', t: 'chk', label: 'Mount on first access (x-systemd.automount)', show: v => v.type === 'nfs' || v.type === 'cifs' },
    { k: 'ro', t: 'chk', label: 'Read-only (ro)' },
  ],
  ex: [{ n: 'NFS share', v: { type: 'nfs', dev: 'nas.lan:/volume1/media', mp: '/mnt/media', auto: true } }, { n: 'Windows share', v: { type: 'cifs', dev: '//nas.lan/backup', mp: '/mnt/backup', auto: true } }],
  run(v) {
    const [base, dump, pass] = FS[v.type];
    const o = [...base.split(','), ...v.opts.split(',').map(x => x.trim()).filter(Boolean)];
    if (v.nofail && v.type !== 'swap') o.push('nofail');
    if (v.noatime && !['swap', 'nfs', 'cifs', 'tmpfs'].includes(v.type)) o.push('noatime');
    if (v.ro) o.push('ro');
    if ((v.type === 'nfs' || v.type === 'cifs')) { o.push('_netdev'); if (v.auto) o.push('x-systemd.automount', 'x-systemd.idle-timeout=600'); }
    const opts = [...new Set(o)].filter((x, i, a) => !(x === 'defaults' && a.length > 1));
    const dev = v.type === 'tmpfs' ? 'tmpfs' : v.dev.trim();
    const mp = v.type === 'swap' ? 'none' : v.mp.trim();
    if (!dev) fail('Enter the device.');
    if (v.type !== 'swap' && !mp.startsWith('/')) fail('The mount point must be an absolute path, such as /mnt/data.');
    if (v.type === 'cifs' && !dev.startsWith('//')) fail('Write an SMB share as //server/share.');
    if (v.type === 'nfs' && !/^[^:]+:\//.test(dev)) fail('Write an NFS export as server:/path.');
    const line = [dev, mp, v.type, opts.join(',') || 'defaults', dump, v.ro ? 0 : pass].join('\t');
    const res = [{ l: 'Line for /etc/fstab', v: line }, { l: 'Test without rebooting', v: (v.type === 'swap' ? 'sudo swapon -a\nswapon --show' : `sudo mkdir -p ${mp}\nsudo systemctl daemon-reload\nsudo mount -a\nfindmnt ${mp}`) },
      { l: 'Columns', kv: [['Device', dev], ['Mount point', mp], ['Type', v.type], ['Options', opts.join(',')], ['dump', String(dump) + ' (backup with dump; almost always 0)'], ['pass', String(v.ro ? 0 : pass) + ' (fsck order at boot; 0 = do not check)']] }];
    if (v.type === 'cifs') res.push({ l: '/etc/smb-credentials (chmod 600)', v: 'username=user\npassword=password\ndomain=WORKGROUP' });
    if (!/^(UUID|LABEL|PARTUUID)=/.test(dev) && /^\/dev\//.test(dev)) res.push({ note: 'Prefer UUID=… over /dev/sdX; device names can change. Look up the UUID with: sudo blkid', kind: 'warn' });
    return res;
  },
});
