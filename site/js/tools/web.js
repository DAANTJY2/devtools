import { T, fail } from '../core/registry.js';
import { utf8, fromUtf8, lib, toB64, fromB64, fromB32, toB32, randBytes, parseJSON, plural, int, stripAccents, show } from '../core/util.js';
import { totp, hotp } from '../lib/otp.js';
import { qrMatrix, qrSvg, svgUrl } from '../lib/qr.js';
import { pretty as xmlPretty } from '../lib/xmlfmt.js';

// ---------- URL encoding ----------
T({
  id: 'url', cat: 'web', ic: '%', name: 'URL encode and decode',
  desc: 'Percent-encode text or full URLs, and decode them again.',
  kw: 'url encode decode percent encoding urlencode uri component querystring %20',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Encode'], ['dec', 'Decode']] },
    { k: 's', t: 'area', label: 'Input', def: 'search for: café & bar?', rows: 4 },
    { k: 'how', t: 'sel', label: 'Kind', opts: [['comp', 'Component (encodeURIComponent)'], ['full', 'Full URL (encodeURI)'], ['form', 'Form (space becomes +)']] },
  ],
  ex: [{ n: 'Decode', v: { m: 'dec', s: 'caf%C3%A9%20%26%20bar%3F' } }],
  run(v) {
    if (v.m === 'enc') {
      const out = v.how === 'full' ? encodeURI(v.s) : encodeURIComponent(v.s);
      return [{ l: 'Encoded', v: v.how === 'form' ? out.replace(/%20/g, '+') : out }];
    }
    try { return [{ l: 'Decoded', v: decodeURIComponent(v.how === 'form' ? v.s.replace(/\+/g, ' ') : v.s) }]; } catch {
      fail('This text contains an invalid % sequence. Every % must be followed by two hexadecimal characters, such as %20.');
    }
  },
});

// ---------- HTML entities ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ', para: '¶', middot: '·', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', bull: '•', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', hearts: '♥', check: '✓', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', iexcl: '¡', iquest: '¿', szlig: 'ß', shy: '\u00ad', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwj: '\u200d', zwnj: '\u200c' };
for (const [l, base] of [['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'], ['y', 'y']]) {
  for (const [n, mark] of [['acute', '\u0301'], ['grave', '\u0300'], ['circ', '\u0302'], ['uml', '\u0308']]) {
    const c = (base + mark).normalize('NFC');
    if (c.length === 1) { ENT[l + n] = c; ENT[l.toUpperCase() + n] = c.toUpperCase(); }
  }
}
Object.assign(ENT, { ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', atilde: 'ã', otilde: 'õ' });
const ENT_REV = Object.fromEntries(Object.entries(ENT).filter(([k]) => !['apos'].includes(k)).map(([k, v]) => [v, k]));
export function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e) => {
    if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
    return ENT[e] ?? m;
  });
}
T({
  id: 'html', cat: 'web', ic: '&;', name: 'HTML entities',
  desc: 'Escape characters for HTML, or turn entities back into text.',
  kw: 'html entities escape unescape &amp; &lt; encode',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Text → entities'], ['dec', 'Entities → text']] },
    { k: 's', t: 'area', label: 'Input', def: '<p class="x">Café & “bar”</p>', rows: 4 },
    { k: 'all', t: 'sel', label: 'What to escape', opts: [['min', 'Only & < > " \''], ['named', 'Also non-ASCII, named where possible'], ['num', 'Also non-ASCII, as numbers']], show: v => v.m === 'enc' },
  ],
  ex: [{ n: 'Back to text', v: { m: 'dec', s: '&lt;b&gt;Caf&eacute; &amp; &#x201C;bar&#8221;&lt;/b&gt;' } }],
  run(v) {
    if (v.m === 'dec') return [{ l: 'Text', v: unescapeHtml(v.s) }];
    let out = v.s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (v.all !== 'min') out = [...out].map(c => c.codePointAt(0) < 128 ? c : v.all === 'named' && ENT_REV[c] ? `&${ENT_REV[c]};` : `&#${c.codePointAt(0)};`).join('');
    return [{ l: 'HTML', v: out }];
  },
});

// ---------- URL parser ----------
T({
  id: 'urlparse', cat: 'web', ic: 'URL', name: 'URL parser',
  desc: 'Split a URL into protocol, host, port, path, query parameters and hash.',
  kw: 'url parser parse query parameters host path querystring split',
  fields: [{ k: 's', t: 'text', label: 'URL', def: 'https://user:secret@example.com:8443/path/to/page.html?search=caf%C3%A9&page=2&tag=a&tag=b#results', mono: true, full: true }],
  run(v) {
    let s = v.s.trim(), note = null;
    if (!s) return [{ note: 'Paste a URL.', kind: 'info' }];
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { s = 'https://' + s; note = { note: 'No protocol given; read as https://.', kind: 'info' }; }
    let u;
    try { u = new URL(s); } catch { fail('This is not a valid URL. Check for spaces and invalid characters.'); }
    const def = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' }[u.protocol];
    const params = [...u.searchParams];
    return [note, { l: 'Components', kv: [
      ['Protocol', u.protocol], ['Username', u.username ? decodeURIComponent(u.username) : null], ['Password', u.password ? decodeURIComponent(u.password) : null],
      ['Host', u.hostname], ['Port', u.port || (def ? def + ' (default)' : '')], ['Origin', u.origin !== 'null' ? u.origin : null],
      ['Path', decodeURIComponent(u.pathname)], ['Query', u.search || null], ['Hash', u.hash ? decodeURIComponent(u.hash) : null],
    ] }, params.length ? { l: `Query parameters (${params.length})`, table: { head: ['Name', 'Value (decoded)'], rows: params } } : null];
  },
});

// ---------- Device information ----------
T({
  id: 'device', cat: 'web', ic: 'DEV', name: 'Device information', browser: true,
  desc: 'Screen size, pixel density, language, time zone, user agent and which browser APIs are available.',
  kw: 'device info screen resolution browser user agent viewport dpr api',
  fields: [],
  run() {
    const n = navigator, s = screen, mq = q => matchMedia(q).matches ? 'yes' : 'no';
    const api = [
      ['Web Crypto (crypto.subtle)', !!crypto.subtle], ['Clipboard', !!n.clipboard], ['Service Worker', 'serviceWorker' in n], ['WebGL', (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })()],
      ['WebGPU', 'gpu' in n], ['WebAuthn', 'PublicKeyCredential' in window], ['Geolocation', 'geolocation' in n], ['Notifications', 'Notification' in window],
      ['Web Share', 'share' in n], ['Bluetooth', 'bluetooth' in n], ['USB', 'usb' in n], ['Serial', 'serial' in n], ['Camera/microphone', !!n.mediaDevices?.getUserMedia],
      ['WebAssembly', typeof WebAssembly === 'object'], ['IndexedDB', 'indexedDB' in window],
    ];
    return [
      { l: 'Screen', kv: [['Screen size', `${s.width} × ${s.height}`], ['Available', `${s.availWidth} × ${s.availHeight}`], ['Window (viewport)', `${innerWidth} × ${innerHeight}`],
        ['Pixel density (DPR)', String(devicePixelRatio)], ['Physical pixels', `${Math.round(s.width * devicePixelRatio)} × ${Math.round(s.height * devicePixelRatio)}`], ['Color depth', s.colorDepth + ' bit'], ['Orientation', s.orientation?.type || null]] },
      { l: 'System and browser', kv: [['User agent', n.userAgent], ['Platform', n.userAgentData?.platform || n.platform || null], ['Languages', (n.languages || [n.language]).join(', ')],
        ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone], ['CPU cores', n.hardwareConcurrency ? String(n.hardwareConcurrency) : null], ['Memory (approximate)', n.deviceMemory ? n.deviceMemory + ' GB' : null],
        ['Touch points', String(n.maxTouchPoints ?? 0)], ['Online', n.onLine ? 'yes' : 'no'], ['Cookies enabled', n.cookieEnabled ? 'yes' : 'no'], ['Secure context (HTTPS)', isSecureContext ? 'yes' : 'no'],
        ['Dark mode', mq('(prefers-color-scheme: dark)')], ['Reduced motion', mq('(prefers-reduced-motion: reduce)')], ['High contrast', mq('(prefers-contrast: more)')], ['Pointer', mq('(pointer: coarse)') === 'yes' ? 'coarse (touch)' : 'fine (mouse)']] },
      { l: 'Available APIs', table: { head: ['API', 'Available'], rows: api.map(([k, x]) => [k, x ? 'yes' : 'no']) } },
    ];
  },
});

// ---------- Basic Auth ----------
T({
  id: 'basicauth', cat: 'web', ic: 'BA', name: 'Basic Auth header',
  desc: 'Build an Authorization: Basic … header from a username and password, or decode an existing header.',
  kw: 'basic auth authorization header http user password base64 htaccess curl',
  fields: [
    { k: 'm', t: 'sel', label: 'Direction', opts: [['enc', 'Build'], ['dec', 'Decode']] },
    { k: 'u', t: 'text', label: 'Username', def: 'admin', show: v => v.m === 'enc' },
    { k: 'p', t: 'text', label: 'Password', def: 'secret', show: v => v.m === 'enc' },
    { k: 'h', t: 'text', label: 'Header or Base64', mono: true, def: 'Authorization: Basic YWRtaW46c2VjcmV0', show: v => v.m === 'dec' },
  ],
  run(v) {
    if (v.m === 'dec') {
      const b = v.h.trim().replace(/^authorization:\s*/i, '').replace(/^basic\s+/i, '');
      const t = fromUtf8(fromB64(b));
      const i = t.indexOf(':');
      if (i < 0) fail('After decoding, the colon between username and password is missing; this is not a Basic Auth value.');
      return [{ l: 'Decoded', kv: [['Username', t.slice(0, i)], ['Password', t.slice(i + 1)]] }];
    }
    if (v.u.includes(':')) fail('The username may not contain a colon.');
    const b = toB64(utf8(v.u + ':' + v.p));
    return [{ l: 'Header', v: 'Authorization: Basic ' + b }, { l: 'Value only', v: 'Basic ' + b },
      { l: 'With curl', v: `curl -u '${v.u.replace(/'/g, "'\\''")}:${v.p.replace(/'/g, "'\\''")}' https://…` },
      { note: 'Basic Auth is only encoded, not encrypted. Use it over HTTPS only.', kind: 'warn' }];
  },
});

// ---------- Meta tags ----------
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
T({
  id: 'meta', cat: 'web', ic: '<m>', name: 'Meta tag generator',
  desc: 'HTML head with title, description, Open Graph and Twitter Card.',
  kw: 'meta tags og open graph twitter card seo head social preview',
  fields: [
    { k: 'title', t: 'text', label: 'Title', def: 'DevTools' },
    { k: 'desc', t: 'area', label: 'Description', def: 'Handy tools for sysadmins and developers, entirely in your browser.', rows: 2, mono: false },
    { k: 'url', t: 'text', label: 'Page URL', def: 'https://example.com/' },
    { k: 'img', t: 'text', label: 'Image (URL, 1200 × 630)', def: 'https://example.com/social.png' },
    { k: 'site', t: 'text', label: 'Site name' },
    { k: 'type', t: 'sel', label: 'Type', opts: ['website', 'article', 'profile', 'product'] },
    { k: 'card', t: 'sel', label: 'Twitter Card', opts: [['summary_large_image', 'Large image'], ['summary', 'Summary']] },
    { k: 'tw', t: 'text', label: 'X/Twitter account', ph: '@username' },
    { k: 'color', t: 'color', label: 'Theme color', def: '#2f6fde' },
    { k: 'locale', t: 'text', label: 'Locale', def: 'en_US' },
    { k: 'robots', t: 'sel', label: 'Search engines', opts: [['index, follow', 'Index and follow'], ['noindex, nofollow', 'Do not index'], ['', 'Not specified']] },
  ],
  run(v) {
    const m = (k, val, prop = 'name') => val ? `<meta ${prop}="${k}" content="${attr(val)}">` : null;
    const lines = [
      '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">',
      v.title && `<title>${attr(v.title)}</title>`, m('description', v.desc), m('robots', v.robots), v.url && `<link rel="canonical" href="${attr(v.url)}">`, m('theme-color', v.color),
      '', '<!-- Open Graph -->', m('og:type', v.type, 'property'), m('og:title', v.title, 'property'), m('og:description', v.desc, 'property'), m('og:url', v.url, 'property'),
      m('og:image', v.img, 'property'), m('og:site_name', v.site, 'property'), m('og:locale', v.locale, 'property'),
      '', '<!-- Twitter / X -->', m('twitter:card', v.card), m('twitter:title', v.title), m('twitter:description', v.desc), m('twitter:image', v.img), m('twitter:site', v.tw),
    ].filter(x => x !== null && x !== false);
    const res = [{ l: 'HTML for the <head>', v: lines.join('\n') }];
    if (v.desc.length > 160) res.push({ note: `The description is ${v.desc.length} characters; search engines usually show about 155–160 characters.`, kind: 'warn' });
    if (v.title.length > 60) res.push({ note: `The title is ${v.title.length} characters; above 60 characters it is often truncated.`, kind: 'warn' });
    return res;
  },
});

// ---------- OTP ----------
const newSecret = () => toB32(randBytes(20));
T({
  id: 'totp', cat: 'web', ic: 'OTP', name: 'OTP code generator (TOTP/HOTP)', tick: 1000,
  desc: 'Create a secret (Base32), see the current and next code, and scan the QR code with an authenticator app.',
  kw: 'otp totp hotp 2fa mfa authenticator google authenticator code two-factor secret qr',
  fields: [
    { k: 'secret', t: 'text', label: 'Secret (Base32)', def: newSecret, mono: true, full: true },
    { k: 'mode', t: 'sel', label: 'Type', opts: [['totp', 'TOTP (time)'], ['hotp', 'HOTP (counter)']] },
    { k: 'counter', t: 'num', label: 'Counter', def: 0, min: 0, show: v => v.mode === 'hotp' },
    { k: 'issuer', t: 'text', label: 'Issuer (shown in the app)', def: 'DevTools' },
    { k: 'account', t: 'text', label: 'Account', def: 'user@example.com' },
    { k: 'digits', t: 'sel', label: 'Digits', opts: [['6', '6'], ['8', '8']] },
    { k: 'period', t: 'sel', label: 'Period', opts: [['30', '30 seconds'], ['60', '60 seconds']], show: v => v.mode === 'totp' },
    { k: 'algo', t: 'sel', label: 'Algorithm', opts: [['SHA1', 'SHA-1 (default)'], ['SHA256', 'SHA-256'], ['SHA512', 'SHA-512']] },
  ],
  actions: [{ label: 'New secret', run: (v, ctx) => ctx.set('secret', newSecret()) }],
  async run(v) {
    const key = fromB32(v.secret);
    if (key.length < 10) fail('The secret is too short. Use at least 16 Base32 characters (80 bits), preferably 32.');
    const o = { digits: Number(v.digits), algo: v.algo, period: Number(v.period) };
    const label = encodeURIComponent(v.issuer ? v.issuer + ':' + v.account : v.account);
    const q = new URLSearchParams({ secret: v.secret.replace(/[\s=]/g, '').toUpperCase(), ...(v.issuer ? { issuer: v.issuer } : {}), algorithm: v.algo, digits: v.digits });
    let codes;
    if (v.mode === 'hotp') {
      q.set('counter', String(v.counter || 0));
      codes = [{ l: `Code for counter ${v.counter || 0}`, v: await hotp(key, v.counter || 0, o), big: true }, { l: 'Next counter', v: await hotp(key, (v.counter || 0) + 1, o) }];
    } else {
      q.set('period', v.period);
      const now = Date.now(), left = o.period - Math.floor(now / 1000) % o.period;
      codes = [{ l: `Current code (valid for ${left} s)`, v: await totp(key, now, o), big: true }, { l: 'Next code', v: await totp(key, now + o.period * 1000, o) }, { l: 'Previous code', v: await totp(key, now - o.period * 1000, o) }];
    }
    const uri = `otpauth://${v.mode}/${label}?${q}`;
    return [...codes, { l: 'QR code for your authenticator app', img: svgUrl(qrSvg(await qrMatrix(uri, 'M'), { scale: 5 })), alt: 'QR code containing the OTP secret' }, { l: 'otpauth URI', v: uri }];
  },
});

// ---------- MIME types ----------
const MIME = `aac audio/aac|abw application/x-abiword|apk application/vnd.android.package-archive|arc application/x-freearc|avif image/avif|avi video/x-msvideo|azw application/vnd.amazon.ebook|bin application/octet-stream|bmp image/bmp|bz application/x-bzip|bz2 application/x-bzip2|cda application/x-cdf|csh application/x-csh|css text/css|csv text/csv|deb application/vnd.debian.binary-package|doc application/msword|docx application/vnd.openxmlformats-officedocument.wordprocessingml.document|dmg application/x-apple-diskimage|eot application/vnd.ms-fontobject|eml message/rfc822|epub application/epub+zip|exe application/vnd.microsoft.portable-executable|flac audio/flac|gif image/gif|gz application/gzip|heic image/heic|htm text/html|html text/html|ico image/vnd.microsoft.icon|ics text/calendar|iso application/x-iso9660-image|jar application/java-archive|jpeg image/jpeg|jpg image/jpeg|js text/javascript|json application/json|jsonld application/ld+json|jxl image/jxl|key application/x-iwork-keynote-sffkey|m3u8 application/vnd.apple.mpegurl|m4a audio/mp4|md text/markdown|mid audio/midi|midi audio/midi|mjs text/javascript|mkv video/x-matroska|mov video/quicktime|mp3 audio/mpeg|mp4 video/mp4|mpeg video/mpeg|mpkg application/vnd.apple.installer+xml|msi application/x-msi|odp application/vnd.oasis.opendocument.presentation|ods application/vnd.oasis.opendocument.spreadsheet|odt application/vnd.oasis.opendocument.text|oga audio/ogg|ogg audio/ogg|ogv video/ogg|ogx application/ogg|opus audio/opus|otf font/otf|p12 application/x-pkcs12|pdf application/pdf|pem application/x-pem-file|php application/x-httpd-php|png image/png|ppt application/vnd.ms-powerpoint|pptx application/vnd.openxmlformats-officedocument.presentationml.presentation|ps application/postscript|py text/x-python|rar application/vnd.rar|rpm application/x-rpm|rtf application/rtf|sh application/x-sh|sql application/sql|svg image/svg+xml|swf application/x-shockwave-flash|tar application/x-tar|tgz application/gzip|tif image/tiff|tiff image/tiff|toml application/toml|ts video/mp2t|tsv text/tab-separated-values|ttf font/ttf|txt text/plain|vcf text/vcard|vsd application/vnd.visio|wasm application/wasm|wav audio/wav|weba audio/webm|webm video/webm|webmanifest application/manifest+json|webp image/webp|woff font/woff|woff2 font/woff2|xhtml application/xhtml+xml|xls application/vnd.ms-excel|xlsx application/vnd.openxmlformats-officedocument.spreadsheetml.sheet|xml application/xml|xul application/vnd.mozilla.xul+xml|yaml application/yaml|yml application/yaml|zip application/zip|7z application/x-7z-compressed|crt application/x-x509-ca-cert|cer application/pkix-cert|der application/x-x509-ca-cert|crl application/pkix-crl|p7s application/pkcs7-signature|gpx application/gpx+xml|kml application/vnd.google-earth.kml+xml|ndjson application/x-ndjson|map application/json|3gp video/3gpp|ai application/postscript|psd image/vnd.adobe.photoshop`.split('|').map(x => x.split(' '));
T({
  id: 'mime', cat: 'web', ic: 'MIME', name: 'MIME types',
  desc: 'File extensions and their Content-Type, searchable in both directions.',
  kw: 'mime type content-type extension file type media type',
  fields: [{ k: 'q', t: 'text', label: 'Search by extension, file name or type', ph: 'e.g. docx, photo.webp or image/', mono: true }],
  ex: [{ n: 'report.pdf', v: { q: 'report.pdf' } }, { n: 'video/', v: { q: 'video/' } }],
  run(v) {
    const q = v.q.trim().toLowerCase().replace(/^.*\.(?=[^.]+$)/, '');
    const rows = MIME.filter(([e, t]) => !q || e.includes(q) || t.includes(q)).map(([e, t]) => ['.' + e, t]);
    return rows.length ? [{ l: `${rows.length} of ${MIME.length}`, table: { head: ['Extension', 'MIME type'], rows } }] : [{ note: 'Nothing found for “' + v.q + '”.', kind: 'warn' }];
  },
});

// ---------- JWT decoder ----------
const CLAIMS = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'Token ID', name: 'Name', email: 'Email', scope: 'Permissions (scope)', azp: 'Authorized party', nonce: 'Nonce', sid: 'Session ID', roles: 'Roles', alg: 'Algorithm', typ: 'Type', kid: 'Key ID', cty: 'Content type' };
const fmtTime = s => typeof s === 'number' ? new Date(s * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : String(s);
export function decodeJwt(tok) {
  const t = tok.trim().replace(/^bearer\s+/i, '');
  const p = t.split('.');
  if (p.length === 5) fail('This is an encrypted JWT (JWE, five parts). It cannot be read without the key.');
  if (p.length !== 3) fail(`A JWT consists of three parts separated by dots; this one has ${p.length}.`);
  const part = (x, n) => { try { return JSON.parse(fromUtf8(fromB64(x), true)); } catch { fail(`The ${n} of the JWT is not valid Base64URL-encoded JSON.`); } };
  return { header: part(p[0], 'first part (header)'), payload: part(p[1], 'second part (payload)'), sig: p[2], data: p[0] + '.' + p[1] };
}
T({
  id: 'jwt', cat: 'web', ic: 'JWT', name: 'JWT decoder',
  desc: 'Decode a JSON Web Token: header, claims with dates, expiry status and (optionally) verify the HMAC signature.',
  kw: 'jwt json web token decoder parser read claims bearer exp iat',
  fields: [
    { k: 's', t: 'area', label: 'JWT', rows: 5, def: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
    { k: 'key', t: 'text', label: 'Secret key to verify (optional, HS256/384/512 only)', ph: 'your-256-bit-secret' },
  ],
  ex: [{ n: 'With key', v: { key: 'your-256-bit-secret' } }],
  async run(v) {
    if (!v.s.trim()) return [{ note: 'Paste a JWT.', kind: 'info' }];
    const j = decodeJwt(v.s);
    const now = Date.now() / 1000;
    const rows = Object.entries(j.payload).map(([k, x]) => [k, CLAIMS[k] || '', ['exp', 'nbf', 'iat', 'auth_time'].includes(k) ? fmtTime(x) : show(x)]);
    const res = [{ l: 'Header', kv: Object.entries(j.header).map(([k, x]) => [k + (CLAIMS[k] ? ` (${CLAIMS[k]})` : ''), show(x)]) }, { l: 'Claims', table: { head: ['Claim', 'Meaning', 'Value'], rows } }];
    if (typeof j.payload.exp === 'number') res.push(j.payload.exp < now ? { note: 'This token expired on ' + fmtTime(j.payload.exp) + '.', kind: 'warn' } : { note: 'Valid until ' + fmtTime(j.payload.exp) + '.', kind: 'ok' });
    if (typeof j.payload.nbf === 'number' && j.payload.nbf > now) res.push({ note: 'This token is not valid yet.', kind: 'warn' });
    if (j.header.alg === 'none') res.push({ note: 'Algorithm “none”: this token is not signed and must never be trusted.', kind: 'err' });
    if (v.key) {
      if (!/^HS(256|384|512)$/.test(j.header.alg)) res.push({ note: `Verification is only available for HMAC (HS256/384/512) here; this token uses ${j.header.alg}.`, kind: 'info' });
      else {
        const H = await lib('hashes');
        const mac = H.hmac({ HS256: H.sha256, HS384: H.sha384, HS512: H.sha512 }[j.header.alg], utf8(v.key), utf8(j.data));
        const ok = toB64(mac, true) === j.sig;
        res.push({ note: ok ? 'Signature matches this key.' : 'Signature does not match this key.', kind: ok ? 'ok' : 'err' });
      }
    }
    res.push({ l: 'Payload (JSON)', v: JSON.stringify(j.payload, null, 2) });
    return res;
  },
});

// ---------- Key codes ----------
T({
  id: 'keycode', cat: 'web', ic: '⌨', name: 'Keycode info',
  desc: 'Press a key and see key, code, keyCode, location and the active modifiers.',
  kw: 'keycode key code event javascript keyboard which',
  ui(root, { h }) {
    const big = h('div', { class: 'keybig', 'aria-live': 'polite' }, 'Press a key');
    const out = h('div', { class: 'results' });
    const panel = h('div', { class: 'panel', tabindex: '0' }, big, h('p', { class: 'muted small', style: 'text-align:center;margin:0' }, 'Keys are only read here; nothing is stored.'));
    root.append(panel, out);
    const onKey = e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) return;
      if (e.key !== 'Tab') e.preventDefault();
      big.textContent = e.key === ' ' ? 'Space' : e.key;
      const loc = ['standard', 'left', 'right', 'numpad'][e.location];
      const mods = ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'].filter(m => e[m]).map(m => m.replace('Key', '')).join(' + ') || 'none';
      const kv = [['event.key', JSON.stringify(e.key)], ['event.code', e.code], ['event.keyCode (deprecated)', String(e.keyCode)], ['event.which (deprecated)', String(e.which)], ['event.location', `${e.location} (${loc})`], ['Modifiers', mods], ['Repeat', e.repeat ? 'yes' : 'no']];
      out.replaceChildren();
      import('../core/ui.js').then(({ renderResults }) => renderResults(out, [{ l: 'Last key', kv }]));
    };
    document.addEventListener('keydown', onKey);
    panel.focus();
    return () => document.removeEventListener('keydown', onKey);
  },
});

// ---------- Slugify ----------
const TRANS = { ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', œ: 'oe', Œ: 'OE', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', þ: 'th', ð: 'd', ı: 'i', '&': ' and ', '@': ' at ', '€': ' euro ', '£': ' pound ', '$': ' dollar ', '%': ' percent ', '+': ' plus ' };
export function slugify(s, { sep = '-', lower = true, max = 0, amp = 'and' } = {}) {
  let t = [...s].map(c => c === '&' ? ` ${amp} ` : TRANS[c] ?? c).join('');
  t = stripAccents(t).replace(/[^A-Za-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');
  if (lower) t = t.toLowerCase();
  if (max > 0 && t.length > max) t = t.slice(0, max).replace(new RegExp(`\\${sep}[^\\${sep}]*$`), '') || t.slice(0, max);
  return t;
}
T({
  id: 'slug', cat: 'web', ic: 'SLG', name: 'Slugify',
  desc: 'Create URL-friendly slugs; accents and special characters are converted neatly.',
  kw: 'slug slugify url friendly permalink accents file name',
  fields: [
    { k: 's', t: 'area', label: 'Text (one per line)', def: 'Two crème brûlées & a café au lait: $5!\nStraße in Köln', rows: 3, mono: false },
    { k: 'sep', t: 'sel', label: 'Separator', opts: [['-', 'Hyphen -'], ['_', 'Underscore _'], ['.', 'Period .']] },
    { k: 'amp', t: 'sel', label: '& becomes', opts: [['and', 'and'], ['n', 'n']] },
    { k: 'lower', t: 'chk', label: 'Lowercase', def: true },
    { k: 'max', t: 'num', label: 'Maximum length (0 = none)', def: 0, min: 0 },
  ],
  run(v) { return [{ l: 'Slug', v: v.s.split('\n').map(l => slugify(l, v)).join('\n') }]; },
});

// ---------- WYSIWYG ----------
T({
  id: 'wysiwyg', cat: 'web', ic: 'WYS', name: 'HTML editor (WYSIWYG)',
  desc: 'Format text and copy the HTML, or paste HTML and edit it visually.',
  kw: 'wysiwyg html editor formatting rich text contenteditable',
  ui(root, { h, copy }) {
    const ed = h('div', { class: 'editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Editor' });
    const src = h('textarea', { class: 'mono', rows: 10, spellcheck: 'false', 'aria-label': 'HTML source' });
    let purify;
    import('../core/util.js').then(u => u.lib('purify')).then(m => { purify = m.default; load('<h2>Welcome</h2><p>Type your text here. Make words <strong>bold</strong> or <em>italic</em>.</p><ul><li>A list</li></ul>'); });
    const clean = html => purify ? purify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] }) : '';
    const sync = () => { src.value = clean(ed.innerHTML).replace(/></g, '>\n<'); };
    const load = html => { ed.innerHTML = clean(html); sync(); };
    const cmd = (c, a) => () => { ed.focus(); document.execCommand(c, false, a); sync(); };
    const B = (label, title, fn) => h('button', { class: 'btn small', type: 'button', title, 'aria-label': title, onclick: fn }, label);
    const bar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
      B('B', 'Bold', cmd('bold')), B('I', 'Italic', cmd('italic')), B('U', 'Underline', cmd('underline')), B('S', 'Strikethrough', cmd('strikeThrough')),
      B('H1', 'Heading 1', cmd('formatBlock', 'h1')), B('H2', 'Heading 2', cmd('formatBlock', 'h2')), B('H3', 'Heading 3', cmd('formatBlock', 'h3')), B('¶', 'Paragraph', cmd('formatBlock', 'p')),
      B('• list', 'Bulleted list', cmd('insertUnorderedList')), B('1. list', 'Numbered list', cmd('insertOrderedList')), B('“ ”', 'Quote', cmd('formatBlock', 'blockquote')),
      B('</>', 'Code', cmd('formatBlock', 'pre')), B('Link', 'Add link', () => { const u = prompt('Link address:', 'https://'); if (u && /^(https?:|mailto:)/i.test(u)) cmd('createLink', u)(); }),
      B('Clear', 'Clear formatting', cmd('removeFormat')));
    ed.addEventListener('input', sync);
    root.append(h('div', { class: 'panel' }, bar, ed),
      h('div', { class: 'res', style: 'margin-top:12px' }, h('div', { class: 'res-h' }, h('span', { class: 'res-l' }, 'HTML (edit here and click “Load” to preview)'),
        h('span', { class: 'row' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => load(src.value) }, 'Load'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => copy(src.value) }, 'Copy'))), src));
  },
});

// ---------- User agent ----------
const SAMPLE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
T({
  id: 'useragent', cat: 'web', ic: 'UA', name: 'User agent parser',
  desc: 'Detect the browser, operating system and device type from a user agent string.',
  kw: 'user agent ua parser browser operating system os device',
  fields: [{ k: 's', t: 'area', label: 'User agent', rows: 3, def: () => typeof navigator !== 'undefined' && navigator.userAgent && !/Node/.test(navigator.userAgent) ? navigator.userAgent : SAMPLE_UA }],
  ex: [{ n: 'iPhone', v: { s: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } }, { n: 'Googlebot', v: { s: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }],
  async run(v) {
    const { default: UAParser } = await lib('uaparser');
    const r = new UAParser(v.s.trim()).getResult();
    const j = (...x) => x.filter(Boolean).join(' ') || '(unknown)';
    const res = [{ l: 'Detected', kv: [['Browser', j(r.browser.name, r.browser.version)], ['Engine', j(r.engine.name, r.engine.version)], ['Operating system', j(r.os.name, r.os.version)],
      ['Device', j(r.device.vendor, r.device.model) + (r.device.type ? ` (${{ mobile: 'phone', tablet: 'tablet', smarttv: 'smart TV', console: 'game console', wearable: 'wearable', embedded: 'embedded' }[r.device.type] || r.device.type})` : '')],
      ['CPU', r.cpu.architecture || '(unknown)']] }];
    if (/bot|crawler|spider|slurp/i.test(v.s)) res.push({ note: 'This appears to be a search engine or bot.', kind: 'info' });
    if (/Windows NT 10\.0/.test(v.s)) res.push({ note: 'Windows 10 and 11 both send “Windows NT 10.0”; the user agent alone cannot tell them apart.', kind: 'info' });
    return res;
  },
});

// ---------- HTTP status codes ----------
const HTTP = [
  [100, 'Continue', 'Go ahead and send the request body.'], [101, 'Switching Protocols', 'The server is switching to another protocol, such as WebSocket.'], [103, 'Early Hints', 'Early hints so the client can start preloading resources.'],
  [200, 'OK', 'Success.'], [201, 'Created', 'Success; something new was created.'], [202, 'Accepted', 'Accepted, but not processed yet.'], [203, 'Non-Authoritative Information', 'Success, but the content was modified by a proxy.'],
  [204, 'No Content', 'Success, with no content in the response.'], [205, 'Reset Content', 'Success; reset the form.'], [206, 'Partial Content', 'Part of the content (Range request), for example when resuming downloads.'],
  [207, 'Multi-Status', 'WebDAV: multiple statuses in one response.'], [301, 'Moved Permanently', 'Moved permanently; update your links.'], [302, 'Found', 'Temporarily available elsewhere.'],
  [303, 'See Other', 'See the result at another address (with GET).'], [304, 'Not Modified', 'Not modified; use the cached version.'], [307, 'Temporary Redirect', 'Moved temporarily; repeat with the same method.'],
  [308, 'Permanent Redirect', 'Moved permanently; repeat with the same method.'], [400, 'Bad Request', 'The request is invalid or malformed.'], [401, 'Unauthorized', 'Authentication is required or the credentials are wrong.'],
  [402, 'Payment Required', 'Payment required (rarely used).'], [403, 'Forbidden', 'Access denied, even after logging in.'], [404, 'Not Found', 'Not found.'], [405, 'Method Not Allowed', 'This HTTP method is not allowed here.'],
  [406, 'Not Acceptable', 'No content in a form the client accepts.'], [407, 'Proxy Authentication Required', 'Authentication with the proxy is required.'], [408, 'Request Timeout', 'The request took too long.'],
  [409, 'Conflict', 'Conflict with the current state, for example a concurrent change.'], [410, 'Gone', 'Permanently removed.'], [411, 'Length Required', 'Content-Length is missing.'],
  [412, 'Precondition Failed', 'A precondition (e.g. If-Match) is not met.'], [413, 'Content Too Large', 'The request is too large, for example an oversized upload.'], [414, 'URI Too Long', 'The address is too long.'],
  [415, 'Unsupported Media Type', 'The content format is not supported.'], [416, 'Range Not Satisfiable', 'The requested range does not exist.'], [417, 'Expectation Failed', 'The Expect header cannot be met.'],
  [418, "I'm a teapot", 'A joke from RFC 2324: I am a teapot.'], [421, 'Misdirected Request', 'The request was sent to the wrong server.'], [422, 'Unprocessable Content', 'Well-formed, but the content is invalid (validation error).'],
  [423, 'Locked', 'WebDAV: the resource is locked.'], [424, 'Failed Dependency', 'WebDAV: a previous action failed.'], [425, 'Too Early', 'Too early; risk of replay.'], [426, 'Upgrade Required', 'Switch to another protocol.'],
  [428, 'Precondition Required', 'The request must be conditional.'], [429, 'Too Many Requests', 'Too many requests; wait a moment (rate limit).'], [431, 'Request Header Fields Too Large', 'The headers are too large, often because of too many cookies.'],
  [451, 'Unavailable For Legal Reasons', 'Unavailable for legal reasons.'], [500, 'Internal Server Error', 'An error in the server.'], [501, 'Not Implemented', 'The server does not support this feature.'],
  [502, 'Bad Gateway', 'The proxy received an invalid response from the upstream server.'], [503, 'Service Unavailable', 'Temporarily unavailable, for example due to maintenance or overload.'],
  [504, 'Gateway Timeout', 'The upstream server did not respond in time.'], [505, 'HTTP Version Not Supported', 'This HTTP version is not supported.'], [507, 'Insufficient Storage', 'WebDAV: insufficient storage.'],
  [508, 'Loop Detected', 'WebDAV: infinite loop detected.'], [511, 'Network Authentication Required', 'Network login required, for example a Wi-Fi captive portal.'],
  [520, 'Unknown Error (Cloudflare)', 'Cloudflare: unknown error from the origin server.'], [521, 'Web Server Is Down (Cloudflare)', 'Cloudflare: the origin server refuses the connection.'], [522, 'Connection Timed Out (Cloudflare)', 'Cloudflare: the connection to the origin server timed out.'],
  [524, 'A Timeout Occurred (Cloudflare)', 'Cloudflare: the origin server did not respond within 100 seconds.'], [525, 'SSL Handshake Failed (Cloudflare)', 'Cloudflare: the TLS handshake with the origin server failed.'],
];
const GROUP = { 1: 'Informational', 2: 'Success', 3: 'Redirection', 4: 'Client error', 5: 'Server error' };
T({
  id: 'httpstatus', cat: 'web', ic: '404', name: 'HTTP status codes',
  desc: 'All common HTTP status codes with a plain-English explanation.',
  kw: 'http status code 404 500 301 403 error redirect',
  fields: [{ k: 'q', t: 'text', label: 'Search', ph: 'Code or word, e.g. 4 or timeout' }],
  ex: [{ n: '5xx', v: { q: '5' } }, { n: 'redirect', v: { q: 'moved' } }],
  run(v) {
    const q = v.q.trim().toLowerCase();
    const rows = HTTP.filter(([c, n, d]) => !q || String(c).startsWith(q) || n.toLowerCase().includes(q) || d.toLowerCase().includes(q)).map(([c, n, d]) => [c, n, GROUP[String(c)[0]], d]);
    return rows.length ? [{ l: plural(rows.length, 'code', 'codes'), table: { head: ['Code', 'Name', 'Class', 'Meaning'], rows } }] : [{ note: 'No status code found.', kind: 'warn' }];
  },
});

// ---------- JSON diff ----------
export function jsonDiff(a, b, path = '$', out = []) {
  const ta = Array.isArray(a) ? 'array' : a === null ? 'null' : typeof a, tb = Array.isArray(b) ? 'array' : b === null ? 'null' : typeof b;
  if (ta !== tb) { out.push(['changed', path, show(a), show(b)]); return out; }
  if (ta === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const p = /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`;
      if (!(k in b)) out.push(['removed', p, show(a[k]), '']);
      else if (!(k in a)) out.push(['added', p, '', show(b[k])]);
      else jsonDiff(a[k], b[k], p, out);
    }
  } else if (ta === 'array') {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= b.length) out.push(['removed', `${path}[${i}]`, show(a[i]), '']);
      else if (i >= a.length) out.push(['added', `${path}[${i}]`, '', show(b[i])]);
      else jsonDiff(a[i], b[i], `${path}[${i}]`, out);
    }
  } else if (a !== b) out.push(['changed', path, show(a), show(b)]);
  return out;
}
const sortKeys = o => Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])])) : o;
export async function lineDiffSeg(a, b) {
  const { diffLines } = await lib('diff');
  return diffLines(a, b).map(p => [p.value.replace(/^(?=.)/gm, p.added ? '+ ' : p.removed ? '- ' : '  '), p.added ? 'add' : p.removed ? 'del' : '']);
}
T({
  id: 'jsondiff', cat: 'web', ic: 'J≠', name: 'JSON diff',
  desc: 'Compare two JSON documents with sorted keys and see per path what was added, removed or changed.',
  kw: 'json diff compare difference differences',
  fields: [
    { k: 'a', t: 'area', label: 'Original', rows: 9, def: '{\n  "name": "toolkit",\n  "version": "1.0.0",\n  "ports": [80, 443],\n  "debug": true\n}' },
    { k: 'b', t: 'area', label: 'New', rows: 9, def: '{\n  "name": "toolkit",\n  "version": "2.0.0",\n  "ports": [80, 443, 8080],\n  "owner": "ops"\n}' },
  ],
  async run(v) {
    const a = parseJSON(v.a, 'JSON (original)'), b = parseJSON(v.b, 'JSON (new)');
    const d = jsonDiff(a, b);
    if (!d.length) return [{ note: 'The documents have identical content (key order is ignored).', kind: 'ok' }];
    return [{ note: 'Found ' + plural(d.length, 'difference', 'differences') + '.', kind: 'info' },
      { l: 'Differences by path', table: { head: ['Kind', 'Path', 'Original', 'New'], rows: d } },
      { l: 'Line by line (keys sorted)', seg: await lineDiffSeg(JSON.stringify(sortKeys(a), null, 2) + '\n', JSON.stringify(sortKeys(b), null, 2) + '\n'), copy: false }];
  },
});

// ---------- Safe Links ----------
export function unwrapLink(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase(), q = k => u.searchParams.get(k);
  if (host.endsWith('safelinks.protection.outlook.com') && q('url')) return { url: q('url'), via: 'Microsoft Defender Safe Links' };
  if (host === 'urldefense.proofpoint.com' && u.pathname.startsWith('/v2/') && q('u')) return { url: decodeURIComponent(q('u').replace(/-/g, '%').replace(/_/g, '/')), via: 'Proofpoint URL Defense v2' };
  if (host === 'urldefense.com' && u.pathname.startsWith('/v3/')) {
    const m = /\/v3\/__(.+?)__;([^!]*)!!/.exec(raw);
    if (m) {
      let rep = [];
      try { rep = [...fromUtf8(fromB64(m[2]))]; } catch { /* no replacements */ }
      let i = 0;
      return { url: m[1].replace(/\*/g, () => rep[i++] ?? '*'), via: 'Proofpoint URL Defense v3' };
    }
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === '/url') return { url: q('q') || q('url'), via: 'Google redirect' };
  if (host === 'l.facebook.com' || host === 'lm.facebook.com') return { url: q('u'), via: 'Facebook redirect' };
  if (host === 'out.reddit.com' || host === 'href.li') return { url: q('url') || u.search.slice(1), via: 'Redirect' };
  for (const k of ['url', 'u', 'target', 'redirect', 'redirect_uri', 'dest', 'destination', 'q']) {
    const x = q(k);
    if (x && /^https?:\/\//i.test(x)) return { url: x, via: 'Redirect via parameter “' + k + '”' };
  }
  return null;
}
T({
  id: 'safelink', cat: 'web', ic: 'SL', name: 'Safe Links decoder',
  desc: 'Extract the real URL from an Outlook Safe Link, Proofpoint link or other redirect, for several links at once.',
  kw: 'safelink safe links outlook microsoft defender proofpoint urldefense redirect real url unwrap',
  fields: [{ k: 's', t: 'area', label: 'Link(s) or text containing links', rows: 5, def: 'https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fpage%3Fid%3D42&data=05%7C01%7C%7Cabc&sdata=xyz&reserved=0' }],
  run(v) {
    const links = v.s.match(/https?:\/\/[^\s<>"')]+/g) || [];
    if (!links.length) return [{ note: 'No link found. Paste a full link that starts with http:// or https://.', kind: 'info' }];
    const rows = links.map(l => {
      let cur = l, via = [];
      for (let i = 0; i < 5; i++) { const r = unwrapLink(cur); if (!r?.url) break; cur = r.url; via.push(r.via); }
      return [cur, via.join(' → ') || '(no redirect recognized)'];
    });
    return [{ l: rows.length === 1 ? 'Real URL' : 'Real URLs', v: rows.map(r => r[0]).join('\n') }, { l: 'Details', table: { head: ['Real URL', 'Redirect'], rows } }];
  },
});

// ---------- SAML ----------
T({
  id: 'saml', cat: 'web', ic: 'SAML', name: 'SAML decoder',
  desc: 'Decode a SAMLRequest or SAMLResponse (Base64, optionally deflated) and show the key fields.',
  kw: 'saml decoder samlrequest samlresponse sso single sign-on assertion base64 inflate deflate idp',
  fields: [{ k: 's', t: 'area', label: 'SAML message, parameter or full URL', rows: 6, def: 'fVLLTsMwEPwVy/c8eRxWTaTQClGpQNQGDlyQGy/UkmMHr1Pg7zFpKx5SK/m0M7Pj2d0JiU73UA1+Y5b4NiB59tFpQzACBR+cAStIERjRIYFvYVXdLiCPU+id9ba1mv+SnFYIInReWcPZfFbwZ5Gt8/ZMnuMFZ4/oKCAFD8QAEw04N+SF8aGU5pdRlkZ53mQ5pGl4T5zNwm+VEd/9Cr7xvidIEiX7eGutWyNqGRudEFnOqoPx1BoaOnQrdFvV4sNy8SMV/X9pCJSIljir91GvlJHKvJ5Oud6RCG6apo7q+1XDy3HQMKZy5THDyeh4YO13cxf6z2e11ar9ZNfWdSIM5Jh9FmdjRcnoZaQCdkLpSkqHFHJUWtv3qUPhseDeDciTcuf69wjKLw==' }],
  async run(v) {
    let s = v.s.trim();
    if (!s) return [{ note: 'Paste a SAML message.', kind: 'info' }];
    const m = /SAML(?:Request|Response)=([^&\s]+)/.exec(s);
    if (m) s = decodeURIComponent(m[1]);
    else if (/%[0-9A-F]{2}/i.test(s)) s = decodeURIComponent(s);
    const bytes = fromB64(s);
    let xml = '', how = 'Base64 (HTTP-POST binding)';
    const txt = fromUtf8(bytes);
    if (txt.trimStart().startsWith('<')) xml = txt;
    else {
      const { inflateSync } = await lib('fflate');
      try { xml = fromUtf8(inflateSync(bytes), true); how = 'Base64 + deflate (HTTP-Redirect binding)'; } catch { fail('This does not look like a SAML message: after decoding it is not XML, nor deflate-compressed.'); }
    }
    const X = await lib('xml');
    const p = new X.XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, textNodeName: '#text' });
    let doc;
    try { doc = p.parse(xml); } catch { fail('The decoded content is not valid XML.'); }
    const root = doc.AuthnRequest || doc.Response || doc.LogoutRequest || doc.LogoutResponse || doc.Assertion || {};
    const type = Object.keys(doc).find(k => !k.startsWith('?')) || '?';
    const txtOf = x => x == null ? null : typeof x === 'object' ? (x['#text'] ?? null) : String(x);
    const as = root.Assertion || (type === 'Assertion' ? root : null);
    const cond = as?.Conditions;
    const attrs = [].concat(as?.AttributeStatement?.Attribute || []).map(a => [a['@Name'], [].concat(a.AttributeValue).map(txtOf).join(', ')]);
    return [{ note: 'Decoded as ' + how + '.', kind: 'info' },
      { l: 'Overview', kv: [['Message type', type], ['ID', root['@ID'] || null], ['Issued at', root['@IssueInstant'] || null], ['Destination', root['@Destination'] || null],
        ['Issuer', txtOf(root.Issuer) || txtOf(as?.Issuer)], ['Reply URL (ACS)', root['@AssertionConsumerServiceURL'] || null], ['Status', root.Status?.StatusCode?.['@Value'] || null],
        ['NameID', txtOf(as?.Subject?.NameID)], ['Valid from', cond?.['@NotBefore'] || null], ['Valid until', cond?.['@NotOnOrAfter'] || null], ['Audience', txtOf(cond?.AudienceRestriction?.Audience)],
        ['Signed', /<(\w+:)?Signature[\s>]/.test(xml) ? 'yes (signature present, not verified)' : 'no'], ['Encrypted assertion', /EncryptedAssertion/.test(xml) ? 'yes' : null]] },
      attrs.length ? { l: 'Attributes', table: { head: ['Name', 'Value'], rows: attrs } } : null,
      { l: 'XML', v: xmlPretty(xml) }];
  },
});
