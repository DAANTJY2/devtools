import { T, fail } from '../core/registry.js';
import { int, fnum, plural, randBytes, toHex, dataFile, lines, num, duration, bytesHuman, LOCALE } from '../core/util.js';
import * as N from '../lib/net.js';
import { PORTS } from '../lib/ports.js';

// ---------- Subnet calculator ----------
T({
  id: 'subnet', cat: 'net', ic: '/24', name: 'IPv4 subnet calculator',
  desc: 'Network, broadcast, host range, mask and wildcard from an IP address with a prefix or mask.',
  kw: 'subnet calculator ipv4 cidr netmask mask broadcast network hosts wildcard prefix',
  fields: [{ k: 's', t: 'text', label: 'IP address with prefix or mask', def: '192.168.1.130/26', mono: true, hint: 'For example 10.0.0.5/8 or 172.16.4.1 255.255.252.0' }],
  ex: [{ n: '/31', v: { s: '10.0.0.0/31' } }, { n: 'With mask', v: { s: '172.16.4.1 255.255.252.0' } }, { n: '/16', v: { s: '10.20.30.40/16' } }],
  run(v) {
    const { addr, prefix } = N.parseCidr4(v.s, 24);
    const i = N.v4info(addr, prefix);
    const rev = prefix >= 24 ? v4rev(i.net, 3) : prefix >= 16 ? v4rev(i.net, 2) : v4rev(i.net, 1);
    const res = [{ l: 'Subnet', kv: [
      ['Network', `${N.v4str(i.net)}/${prefix}`], ['Subnet mask', N.v4str(i.mask)], ['Wildcard mask', N.v4str(i.wildcard)],
      ['First host', N.v4str(i.first)], ['Last host', N.v4str(i.last)], ['Broadcast', prefix >= 31 ? '(none; /31 and /32 have no broadcast)' : N.v4str(i.bc)],
      ['Usable hosts', int(i.hosts)], ['Total addresses', int(i.size)], ['Address type', N.v4type(addr)], ['Class (historical)', N.v4class(addr)],
      ['Reverse DNS zone', rev], ['Previous subnet', i.net > 0 ? `${N.v4str((i.net - i.size) >>> 0)}/${prefix}` : '—'], ['Next subnet', i.bc < 0xffffffff ? `${N.v4str(i.bc + 1)}/${prefix}` : '—'],
    ] }, { l: 'Binary', kv: [['Address', N.bin32(addr)], ['Mask', N.bin32(i.mask)], ['Network', N.bin32(i.net)]] }];
    if (addr === i.net && prefix < 31) res.unshift({ note: 'This is the network address itself; it cannot be assigned to a device.', kind: 'info' });
    else if (addr === i.bc && prefix < 31) res.unshift({ note: 'This is the broadcast address; it cannot be assigned to a device.', kind: 'warn' });
    if (prefix === 31) res.push({ note: '/31 is used for point-to-point links (RFC 3021): both addresses are usable.', kind: 'info' });
    return res;
  },
});
const v4rev = (n, octets) => N.v4str(n).split('.').slice(0, octets).reverse().join('.') + '.in-addr.arpa';

// ---------- IPv4 address converter ----------
export function anyIPv4(s) {
  const t = s.trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(t)) return N.parseIPv4(t);
  if (/^0x[0-9a-f]{1,8}$/i.test(t)) return parseInt(t, 16) >>> 0;
  if (/^0b[01]{1,32}$/i.test(t)) return parseInt(t.slice(2), 2) >>> 0;
  if (/^[01]{8}\.[01]{8}\.[01]{8}\.[01]{8}$/.test(t)) return parseInt(t.replace(/\./g, ''), 2) >>> 0;
  if (/^\d+$/.test(t)) { const n = Number(t); if (n > 0xffffffff) fail('An IPv4 address as a number is at most 4,294,967,295.'); return n; }
  if (/^::ffff:/i.test(t)) { const n = N.parseIPv6(t); return Number(n & 0xffffffffn); }
  fail('Use an IPv4 address (192.168.1.1), an integer (3232235777), hex (0xC0A80101) or binary.');
}
T({
  id: 'ipconv', cat: 'net', ic: 'IP#', name: 'IPv4 address converter',
  desc: 'Convert an IPv4 address to decimal, hex, binary, octal and IPv4-mapped IPv6, or an integer back to an IPv4 address.',
  kw: 'ipv4 convert converter decimal integer hex binary ipv6 mapped long',
  fields: [{ k: 's', t: 'text', label: 'IPv4 address or number', def: '192.168.1.1', mono: true }],
  ex: [{ n: 'Number → IP', v: { s: '3232235777' } }, { n: 'Hex', v: { s: '0x0A000001' } }],
  run(v) {
    const n = anyIPv4(v.s);
    const o = N.v4str(n).split('.').map(Number);
    return [{ l: 'Converted', kv: [['IPv4', N.v4str(n)], ['Decimal (integer)', String(n)], ['Hexadecimal', '0x' + n.toString(16).toUpperCase().padStart(8, '0')], ['Dotted hex', o.map(x => x.toString(16).toUpperCase().padStart(2, '0')).join('.')],
      ['Binary', N.bin32(n)], ['Octal per octet', o.map(x => '0' + x.toString(8)).join('.')], ['IPv4-mapped IPv6', '::ffff:' + N.v4str(n)], ['IPv4-mapped IPv6 (hex)', `::ffff:${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`],
      ['6to4 prefix', `2002:${(n >>> 16).toString(16).padStart(4, '0')}:${(n & 0xffff).toString(16).padStart(4, '0')}::/48`], ['Reverse DNS', o.reverse().join('.') + '.in-addr.arpa'], ['Type', N.v4type(n)]] }];
  },
});

// ---------- Range to CIDR ----------
T({
  id: 'iprange', cat: 'net', ic: 'A-B', name: 'IP range to CIDR',
  desc: 'Convert a start and end address to the smallest list of CIDR blocks, for IPv4 and IPv6.',
  kw: 'ip range cidr expander blocks summarize firewall ipv4 ipv6',
  fields: [
    { k: 'a', t: 'text', label: 'Start address', def: '192.168.1.10', mono: true },
    { k: 'b', t: 'text', label: 'End address', def: '192.168.1.100', mono: true },
  ],
  ex: [{ n: 'IPv6', v: { a: '2001:db8::', b: '2001:db8::ff' } }, { n: 'Whole /16', v: { a: '10.1.0.0', b: '10.1.255.255' } }],
  run(v) {
    const six = v.a.includes(':');
    const [a, b] = six ? [N.parseIPv6(v.a), N.parseIPv6(v.b)] : [N.parseIPv4(v.a), N.parseIPv4(v.b)];
    const blocks = N.rangeToCidrs(a, b, six ? 128 : 32);
    const fmt = x => six ? N.v6str(x) : N.v4str(Number(x));
    const total = BigInt(b) - BigInt(a) + 1n;
    return [{ l: `${plural(blocks.length, 'CIDR block', 'CIDR blocks')}, ${total.toLocaleString(LOCALE)} addresses`, v: blocks.map(([s, p]) => `${fmt(s)}/${p}`).join('\n') },
      { l: 'Per block', table: { head: ['Block', 'From', 'Through', 'Addresses'], rows: blocks.map(([s, p]) => { const n = 1n << BigInt((six ? 128 : 32) - p); return [`${fmt(s)}/${p}`, fmt(s), fmt(s + n - 1n), n.toLocaleString(LOCALE)]; }) } }];
  },
});

// ---------- MAC ----------
export function parseMac(s) {
  const h = s.trim().replace(/[\s:.-]/g, '');
  if (!/^[0-9a-f]{12}$/i.test(h)) fail(`“${s.trim()}” is not a valid MAC address: that is 12 hexadecimal characters, such as 00:1A:2B:3C:4D:5E.`);
  return h.toUpperCase();
}
const macFormats = h => [['With colons', h.match(/../g).join(':')], ['With hyphens (Windows)', h.match(/../g).join('-')], ['Cisco', h.toLowerCase().match(/..../g).join('.')], ['No separator', h], ['Lowercase', h.toLowerCase().match(/../g).join(':')]];
const macBits = h => { const b = parseInt(h.slice(0, 2), 16); return [['Type', b & 1 ? 'Multicast' : 'Unicast'], ['Administration', b & 2 ? 'Locally administered (random or set manually)' : 'Globally unique (assigned by the manufacturer)']]; };
let ouiMap;
async function oui() {
  if (!ouiMap) { ouiMap = new Map(); for (const l of (await dataFile('oui.txt')).split('\n')) { const i = l.indexOf('\t'); ouiMap.set(l.slice(0, i), l.slice(i + 1)); } }
  return ouiMap;
}
T({
  id: 'maclookup', cat: 'net', ic: 'OUI', name: 'MAC address lookup',
  desc: 'Look up the manufacturer of a network card in the built-in IEEE OUI list, for several addresses at once.',
  kw: 'mac address oui manufacturer vendor lookup network card ieee',
  fields: [{ k: 's', t: 'area', label: 'MAC addresses (one per line)', rows: 4, def: '00:1A:11:12:34:56\nB8:27:EB:00:11:22\nDC:A6:32:12:34:56\n02:42:ac:11:00:02' }],
  async run(v) {
    const map = await oui();
    const rows = [];
    for (const l of lines(v.s).filter(x => x.trim())) {
      let h;
      try { h = parseMac(l); } catch (e) { rows.push([l.trim(), '(invalid MAC address)', '']); continue; }
      const b = parseInt(h.slice(0, 2), 16);
      rows.push([h.match(/../g).join(':'), map.get(h.slice(0, 6)) || (b & 2 ? '(locally administered: no manufacturer; often a VM, container or a phone’s private address)' : '(unknown)'), b & 1 ? 'multicast' : b & 2 ? 'local' : 'unique']);
    }
    return [{ l: 'Manufacturers', table: { head: ['MAC address', 'Manufacturer', 'Type'], rows } }, { note: `List of ${int(map.size)} IEEE OUI prefixes, built into this site.`, kind: 'info' }];
  },
});
T({
  id: 'mac', cat: 'net', ic: 'MAC', name: 'MAC address formatter and generator', regen: true,
  desc: 'Write a MAC address in every notation, or generate random, locally administered MAC addresses.',
  kw: 'mac address generator formatter format random cisco notation locally administered',
  fields: [
    { k: 's', t: 'text', label: 'MAC address to format (optional)', def: '001a2b3c4d5e', mono: true },
    { k: 'n', t: 'num', label: 'Number of random addresses', def: 5, min: 0, max: 100 },
    { k: 'pre', t: 'text', label: 'Prefix (optional)', mono: true, ph: 'e.g. 02:42' },
    { k: 'sep', t: 'sel', label: 'Notation', opts: [[':', '00:11:22:33:44:55'], ['-', '00-11-22-33-44-55'], ['.', '0011.2233.4455'], ['', '001122334455']] },
    { k: 'up', t: 'chk', label: 'Uppercase', def: true },
  ],
  run(v) {
    const res = [];
    if (v.s.trim()) { const h = parseMac(v.s); res.push({ l: 'Notations', kv: [...macFormats(h), ...macBits(h)] }); }
    const n = Math.round(v.n || 0);
    if (n > 0) {
      const pre = v.pre.replace(/[\s:.-]/g, '');
      if (!/^[0-9a-f]{0,10}$/i.test(pre)) fail('The prefix may contain only hexadecimal characters (at most 10).');
      const list = Array.from({ length: n }, () => {
        let h = (pre + toHex(randBytes(6))).slice(0, 12);
        if (!pre || pre.length < 2) { const b = (parseInt(h.slice(0, 2), 16) & 0xfc) | 0x02; h = b.toString(16).padStart(2, '0') + h.slice(2); }
        h = v.up ? h.toUpperCase() : h.toLowerCase();
        return v.sep === '.' ? h.match(/..../g).join('.') : h.match(/../g).join(v.sep);
      });
      res.push({ l: 'Random', v: list.join('\n') }, { note: pre.length >= 2 ? 'With your own prefix, you decide whether the address is locally administered.' : 'These addresses are locally administered and unicast (second character 2, 6, A or E) and do not collide with manufacturer addresses.', kind: 'info' });
    }
    return res.length ? res : [{ note: 'Enter a MAC address or choose how many to generate.', kind: 'info' }];
  },
});

// ---------- IPv6 ULA ----------
T({
  id: 'ula', cat: 'net', ic: 'ULA', name: 'IPv6 ULA generator', regen: true,
  desc: 'Generate a random private IPv6 prefix (fd00::/8, /48) according to RFC 4193.',
  kw: 'ipv6 ula unique local address private prefix fd00 rfc 4193 generator',
  fields: [{ k: 'sub', t: 'num', label: 'Number of sample /64 subnets', def: 4, min: 1, max: 64 }],
  run(v) {
    const id = randBytes(5);
    const g = [0xfd00 | id[0], (id[1] << 8) | id[2], (id[3] << 8) | id[4]].map(x => x.toString(16).padStart(4, '0'));
    const p = g.join(':');
    const n = Math.min(64, Math.max(1, Math.round(v.sub)));
    return [{ l: 'ULA prefix (/48)', v: `${p}::/48`, big: true }, { l: 'Sample /64 subnets', table: { head: ['Subnet', 'For example'], rows: Array.from({ length: n }, (_, i) => [`${p}:${i.toString(16)}::/64`, ['LAN', 'Servers', 'IoT', 'Guests', 'Management', 'DMZ'][i] || 'VLAN ' + (i + 1)]) } },
      { kv: [['Global ID (40 bits)', toHex(id)], ['Number of /64 subnets', '65,536']] }, { note: 'ULA addresses are for internal use only and are not routed on the internet, just like 192.168.x.x in IPv4.', kind: 'info' }];
  },
});

// ---------- VLSM ----------
T({
  id: 'subnetsplit', cat: 'net', ic: 'VLSM', name: 'Subnet splitter (VLSM)',
  desc: 'Split a network into equal subnets, or allocate it based on the number of hosts each subnet needs.',
  kw: 'vlsm subnet split subnetting divide allocate hosts network planning',
  fields: [
    { k: 'net', t: 'text', label: 'Network', def: '192.168.10.0/24', mono: true },
    { k: 'mode', t: 'sel', label: 'Split', opts: [['hosts', 'By hosts per subnet (VLSM)'], ['count', 'Into a number of equal subnets'], ['prefix', 'To a new prefix length']] },
    { k: 'hosts', t: 'area', label: 'Subnets (name: number of hosts)', rows: 5, def: 'Office: 100\nServers: 50\nGuest Wi-Fi: 25\nManagement: 10\nUplink: 2', show: v => v.mode === 'hosts' },
    { k: 'count', t: 'num', label: 'Number of subnets', def: 4, min: 1, show: v => v.mode === 'count' },
    { k: 'prefix', t: 'num', label: 'New prefix', def: 26, min: 1, max: 32, show: v => v.mode === 'prefix' },
  ],
  run(v) {
    const { addr, prefix } = N.parseCidr4(v.net, 24);
    const base = N.v4info(addr, prefix);
    const row = (name, net, p, need) => { const i = N.v4info(net, p); return [name, `${N.v4str(net)}/${p}`, N.v4str(i.mask), `${N.v4str(i.first)} – ${N.v4str(i.last)}`, p >= 31 ? '—' : N.v4str(i.bc), int(i.hosts), need ?? '']; };
    const head = ['Name', 'Subnet', 'Mask', 'Host range', 'Broadcast', 'Hosts', 'Needed'];
    if (v.mode === 'hosts') {
      const wants = lines(v.hosts).filter(l => l.trim()).map((l, i) => {
        const m = /^(.*?)[:=\s]\s*(\d+)\s*$/.exec(l.trim()) || [null, '', l.trim()];
        const n = Number(m[2]);
        if (!Number.isInteger(n) || n < 1) fail(`Line “${l.trim()}”: enter a number of hosts, for example “Office: 100”.`);
        return { name: m[1].trim() || 'Subnet ' + (i + 1), n };
      }).sort((a, b) => b.n - a.n);
      let cur = base.net;
      const rows = [];
      for (const w of wants) {
        let p = 32; while (p > 0 && (p >= 31 ? 2 ** (32 - p) : 2 ** (32 - p) - 2) < w.n) p--;
        const size = 2 ** (32 - p);
        cur = Math.ceil(cur / size) * size;
        if (cur + size - 1 > base.bc) fail(`There is not enough room in ${N.v4str(base.net)}/${prefix} for “${w.name}” (${w.n} hosts). Choose a larger network.`);
        rows.push(row(w.name, cur, p, w.n));
        cur += size;
      }
      const used = cur - base.net;
      return [{ l: 'Allocation', table: { head, rows } }, { note: `${int(used)} of ${int(base.size)} addresses allocated (${fnum(used / base.size * 100, 1)}%). Free from ${cur <= base.bc ? N.v4str(cur) : '—'}.`, kind: 'info' }];
    }
    let p = v.mode === 'count' ? prefix + Math.ceil(Math.log2(Math.max(1, Math.round(v.count)))) : Math.round(v.prefix);
    if (p < prefix) fail(`The new prefix must be at least /${prefix} (the same size as or smaller than the network).`);
    if (p > 32) fail('That many subnets do not fit in this network.');
    const n = 2 ** (p - prefix);
    if (n > 4096) fail(`That is ${int(n)} subnets; choose fewer (at most 4096).`);
    const size = 2 ** (32 - p);
    const rows = Array.from({ length: n }, (_, i) => row('Subnet ' + (i + 1), base.net + i * size, p));
    return [{ note: `${plural(n, 'subnet', 'subnets')} of /${p} with ${int(p >= 31 ? size : size - 2)} hosts each.`, kind: 'info' }, { l: 'Subnets', table: { head: head.slice(0, 6), rows: rows.map(r => r.slice(0, 6)) } }];
  },
});

// ---------- Is this IP in a subnet ----------
const parseAny = s => s.includes(':') ? { six: true, ...N.parseCidr6(s) } : { six: false, ...(() => { const c = N.parseCidr4(s); return { addr: BigInt(c.addr), prefix: c.prefix }; })() };
T({
  id: 'ipincidr', cat: 'net', ic: '∈', name: 'IP in subnet checker',
  desc: 'Check which IP addresses fall within which CIDR blocks; handy for firewall rules and ACLs. IPv6 too.',
  kw: 'ip in subnet cidr contains match firewall acl allowlist ipv4 ipv6 check',
  fields: [
    { k: 'ips', t: 'area', label: 'IP addresses (one per line)', rows: 5, def: '192.168.1.42\n10.0.5.7\n8.8.8.8\n2001:db8::1' },
    { k: 'nets', t: 'area', label: 'Subnets (one per line)', rows: 5, def: '192.168.0.0/16\n10.0.0.0/8\n2001:db8::/32' },
  ],
  run(v) {
    const nets = lines(v.nets).map(x => x.trim()).filter(Boolean).map(s => ({ s, ...parseAny(s) }));
    const rows = lines(v.ips).map(x => x.trim()).filter(Boolean).map(ip => {
      const a = parseAny(ip.split('/')[0]);
      const hits = nets.filter(n => n.six === a.six && (a.addr & (n.six ? N.v6mask(n.prefix) : BigInt(N.maskOf(n.prefix)))) === (n.addr & (n.six ? N.v6mask(n.prefix) : BigInt(N.maskOf(n.prefix)))));
      return [ip, hits.length ? '✓ yes' : '✗ no', hits.map(h => h.s).join(', ')];
    });
    return [{ l: 'Result', table: { head: ['IP address', 'Inside', 'In subnet(s)'], rows } }];
  },
});

// ---------- IPv6 ----------
T({
  id: 'ipv6', cat: 'net', ic: 'v6', name: 'IPv6 address inspector',
  desc: 'Compress or expand IPv6 addresses, determine the type and compute the network range.',
  kw: 'ipv6 address compress expand prefix range type link-local ula reverse dns',
  fields: [{ k: 's', t: 'text', label: 'IPv6 address (optionally with prefix)', def: '2001:0db8:0000:0000:0000:ff00:0042:8329/64', mono: true }],
  ex: [{ n: 'Link-local', v: { s: 'fe80::1ff:fe23:4567:890a%eth0' } }, { n: 'IPv4-mapped', v: { s: '::ffff:192.168.1.1' } }],
  run(v) {
    const { addr, prefix } = N.parseCidr6(v.s);
    const mask = N.v6mask(prefix), net = addr & mask, last = net | (((1n << 128n) - 1n) ^ mask);
    const full = N.v6full(addr);
    const res = [{ l: 'Address', kv: [['Compressed (RFC 5952)', N.v6str(addr)], ['Expanded', full], ['Type', N.v6type(addr)], ['Reverse DNS', full.replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa']] }];
    if (prefix < 128) res.push({ l: `Network /${prefix}`, kv: [['Network', `${N.v6str(net)}/${prefix}`], ['First address', N.v6str(net)], ['Last address', N.v6str(last)], ['Number of addresses', prefix >= 64 ? (1n << BigInt(128 - prefix)).toLocaleString(LOCALE) : `2^${128 - prefix}`], ['Number of /64 subnets', prefix <= 64 ? (1n << BigInt(64 - prefix)).toLocaleString(LOCALE) : '—']] });
    if (N.v6type(addr) === 'IPv4-mapped') res.push({ note: 'Contains the IPv4 address ' + N.v4str(Number(addr & 0xffffffffn)) + '.', kind: 'info' });
    const g = N.v6groups(addr);
    if ((g[5] & 0xff) === 0xff && (g[6] >> 8) === 0xfe) {
      const mac = [g[4] >> 8 ^ 2, g[4] & 255, g[5] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].map(x => x.toString(16).padStart(2, '0')).join(':');
      res.push({ note: 'The interface ID is derived from a MAC address (EUI-64): ' + mac + '.', kind: 'info' });
    }
    return res;
  },
});

// ---------- Ports ----------
T({
  id: 'ports', cat: 'net', ic: ':80', name: 'Port numbers',
  desc: 'Searchable list of commonly used TCP and UDP ports.',
  kw: 'port numbers tcp udp list services firewall 22 80 443',
  fields: [{ k: 'q', t: 'text', label: 'Search by number or service', ph: 'e.g. 3306 or ssh' }],
  ex: [{ n: 'Databases', v: { q: 'database' } }, { n: 'VPN', v: { q: 'vpn' } }],
  run(v) {
    const q = v.q.trim().toLowerCase();
    const rows = PORTS.filter(r => !q || (/^\d+$/.test(q) ? String(r[0]).startsWith(q) : r.slice(1).some(c => c.toLowerCase().includes(q))));
    return rows.length ? [{ l: plural(rows.length, 'port', 'ports'), table: { head: ['Port', 'Protocol', 'Service', 'Description'], rows } }] : [{ note: 'Nothing found. This list only contains commonly used ports.', kind: 'warn' }];
  },
});

// ---------- DNS record types ----------
const DNS = [
  ['A', 'IPv4 address of a name', 'www  IN A  203.0.113.10'], ['AAAA', 'IPv6 address of a name', 'www  IN AAAA  2001:db8::10'],
  ['CNAME', 'Alias to another name (not on the bare domain)', 'blog  IN CNAME  sites.example.net.'], ['MX', 'Mail server for the domain, with priority (lower = first)', '@  IN MX 10 mail.example.com.'],
  ['TXT', 'Free text: SPF, DKIM, DMARC, domain verification', '@  IN TXT "v=spf1 mx -all"'], ['NS', 'Name servers of the domain', '@  IN NS  ns1.provider.com.'],
  ['SOA', 'Start of Authority: administrative data and serial number of the zone', '@  IN SOA ns1.provider.com. hostmaster.example.com. 2026102201 3600 900 1209600 300'],
  ['PTR', 'Reverse: IP address to name (in in-addr.arpa or ip6.arpa)', '10.113.0.203.in-addr.arpa.  IN PTR  www.example.com.'],
  ['SRV', 'Where a service runs: priority, weight, port, host', '_sip._tcp  IN SRV 10 60 5060 sip.example.com.'],
  ['CAA', 'Which certificate authorities may issue certificates', '@  IN CAA 0 issue "letsencrypt.org"'], ['DS', 'DNSSEC: key fingerprint, stored at the parent domain', 'example.com.  IN DS 12345 13 2 abcd…'],
  ['DNSKEY', 'DNSSEC: public key of the zone', '@  IN DNSKEY 257 3 13 base64…'], ['RRSIG', 'DNSSEC: signature over a set of records', '(automatic)'], ['NSEC / NSEC3', 'DNSSEC: proof that a name does not exist', '(automatic)'],
  ['TLSA', 'DANE: bind a certificate to a service', '_25._tcp.mail  IN TLSA 3 1 1 abcd…'], ['SSHFP', 'Fingerprint of SSH host keys', 'server  IN SSHFP 4 2 abcd…'],
  ['HTTPS / SVCB', 'Service parameters for HTTPS: ALPN, ports, ECH', '@  IN HTTPS 1 . alpn="h3,h2"'], ['NAPTR', 'Rewrite rules, e.g. for VoIP (ENUM)', '(specialized)'],
  ['ALIAS / ANAME', 'Non-standard: CNAME-like on the bare domain (provider-specific)', '@  ALIAS  example.netlify.app.'], ['LOC', 'Geographic location', '(rarely used)'], ['HINFO', 'Hardware and operating system (rare)', '(rarely used)'],
];
T({
  id: 'dnstypes', cat: 'net', ic: 'DNS', name: 'DNS record types',
  desc: 'Overview of DNS record types with explanations and examples.',
  kw: 'dns record types a aaaa cname mx txt ns soa ptr srv caa dnssec overview',
  fields: [{ k: 'q', t: 'text', label: 'Search', ph: 'e.g. mail or dnssec' }],
  run(v) {
    const q = v.q.trim().toLowerCase();
    const rows = DNS.filter(r => !q || r.some(c => c.toLowerCase().includes(q)));
    return rows.length ? [{ l: plural(rows.length, 'type', 'types'), table: { head: ['Type', 'Purpose', 'Example (zone file)'], rows } }] : [{ note: 'Nothing found.', kind: 'warn' }];
  },
});

// ---------- CIDR table ----------
T({
  id: 'cidrtable', cat: 'net', ic: 'CIDR', name: 'CIDR table',
  desc: 'Every prefix length from /0 to /32 with mask, wildcard and number of hosts.',
  kw: 'cidr table prefix mask subnet mask wildcard hosts overview cheat sheet',
  fields: [{ k: 'from', t: 'num', label: 'From prefix', def: 0, min: 0, max: 32 }],
  run(v) {
    const from = Math.max(0, Math.min(32, Math.round(v.from || 0)));
    const rows = [];
    for (let p = from; p <= 32; p++) { const m = N.maskOf(p), size = 2 ** (32 - p); rows.push(['/' + p, N.v4str(m), N.v4str((~m) >>> 0), int(size), int(p >= 31 ? size : size - 2), p >= 24 ? '1/' + 2 ** (p - 24) + ' of a /24' : int(2 ** (24 - p)) + ' × /24']); }
    return [{ l: 'IPv4 prefixes', table: { head: ['Prefix', 'Mask', 'Wildcard', 'Addresses', 'Hosts', 'Size'], rows } }];
  },
});

// ---------- Bandwidth ----------
const SIZE = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
const SPEED = { 'kbit/s': 1e3, 'Mbit/s': 1e6, 'Gbit/s': 1e9, 'KB/s': 8e3, 'MB/s': 8e6, 'GB/s': 8e9 };
T({
  id: 'bandwidth', cat: 'net', ic: 'Mb/s', name: 'Transfer time and bandwidth',
  desc: 'How long does transferring data take at a given speed, including protocol overhead? Or which speed do you need?',
  kw: 'bandwidth download time upload time speed mbit mbps transfer duration calculate',
  fields: [
    { k: 'm', t: 'sel', label: 'Calculate', opts: [['time', 'How long does it take?'], ['speed', 'Which speed is needed?'], ['size', 'How much data in a given time?']] },
    { k: 'size', t: 'text', label: 'Amount of data', def: '50', show: v => v.m !== 'size' },
    { k: 'su', t: 'sel', label: 'Unit', def: 'GB', opts: Object.keys(SIZE), show: v => v.m !== 'size' },
    { k: 'speed', t: 'text', label: 'Speed', def: '500', show: v => v.m !== 'speed' },
    { k: 'spu', t: 'sel', label: 'Unit', def: 'Mbit/s', opts: Object.keys(SPEED), show: v => v.m !== 'speed' },
    { k: 'time', t: 'text', label: 'Time (hh:mm:ss or seconds)', def: '01:00:00', show: v => v.m !== 'time' },
    { k: 'oh', t: 'range', label: 'Overhead (%)', def: 7, min: 0, max: 30, hint: 'TCP/IP and Ethernet together cost about 5 to 8%; Wi-Fi and VPNs more.' },
  ],
  ex: [{ n: '4K movie over 100 Mbit', v: { m: 'time', size: '25', su: 'GB', speed: '100', spu: 'Mbit/s' } }, { n: 'Nightly backup', v: { m: 'speed', size: '2', su: 'TB', time: '08:00:00' } }],
  run(v) {
    const eff = 1 - v.oh / 100;
    const secs = () => { const t = v.time.trim(); if (/^\d+(:\d{1,2}){1,2}$/.test(t)) return t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0); return num(t, 'time'); };
    if (v.m === 'time') {
      const bits = num(v.size, 'amount') * SIZE[v.su] * 8, bps = num(v.speed, 'speed') * SPEED[v.spu] * eff;
      if (!(bps > 0)) fail('The speed must be greater than 0.');
      const s = bits / bps;
      return [{ l: 'Duration', v: duration(s), big: true }, { kv: [['In seconds', fnum(s, 1)], ['Effective speed', fnum(bps / 8e6, 2) + ' MB/s']] }];
    }
    if (v.m === 'speed') {
      const bits = num(v.size, 'amount') * SIZE[v.su] * 8, s = secs();
      if (!(s > 0)) fail('The time must be greater than 0.');
      const need = bits / s / eff;
      return [{ l: 'Required speed', v: need >= 1e9 ? fnum(need / 1e9, 2) + ' Gbit/s' : fnum(need / 1e6, 1) + ' Mbit/s', big: true }, { kv: [['In MB/s', fnum(need / 8e6, 2) + ' MB/s']] }];
    }
    const bps = num(v.speed, 'speed') * SPEED[v.spu] * eff, s = secs();
    return [{ l: 'Amount of data', v: bytesHuman(bps * s / 8), big: true }];
  },
});

// ---------- SPF ----------
T({
  id: 'spf', cat: 'net', ic: 'SPF', name: 'SPF record generator',
  desc: 'Build an SPF TXT record or check an existing one, including the 10 DNS lookup limit.',
  kw: 'spf record txt email mail dns sender policy framework include lookups build check',
  fields: [
    { k: 'm', t: 'sel', label: 'Mode', opts: [['build', 'Build'], ['check', 'Check an existing record']] },
    { k: 'mx', t: 'chk', label: 'The domain’s MX servers may send mail', def: true, show: v => v.m === 'build' },
    { k: 'a', t: 'chk', label: 'The A record (web server) may send mail', show: v => v.m === 'build' },
    { k: 'inc', t: 'area', label: 'Includes (one per line)', rows: 3, def: 'spf.protection.outlook.com', show: v => v.m === 'build', hint: 'For example _spf.google.com, spf.protection.outlook.com, servers.mcsv.net' },
    { k: 'ip', t: 'area', label: 'IP addresses or subnets (one per line)', rows: 2, def: '203.0.113.10', show: v => v.m === 'build' },
    { k: 'all', t: 'sel', label: 'Other senders', opts: [['-all', '-all: reject (recommended once everything is correct)'], ['~all', '~all: soft fail (mark)'], ['?all', '?all: neutral'], ['+all', '+all: allow everything (never do this)']], show: v => v.m === 'build' },
    { k: 'rec', t: 'area', label: 'SPF record', rows: 3, def: 'v=spf1 mx include:_spf.google.com include:spf.protection.outlook.com ip4:203.0.113.0/24 ~all', show: v => v.m === 'check' },
  ],
  run(v) {
    let rec;
    if (v.m === 'build') {
      const parts = ['v=spf1'];
      if (v.mx) parts.push('mx');
      if (v.a) parts.push('a');
      for (const ip of lines(v.ip).map(x => x.trim()).filter(Boolean)) { if (ip.includes(':')) { N.parseCidr6(ip); parts.push('ip6:' + ip); } else { N.parseCidr4(ip); parts.push('ip4:' + ip); } }
      for (const i of lines(v.inc).map(x => x.trim().replace(/^include:/, '')).filter(Boolean)) { if (!/^[\w.-]+\.[a-z]{2,}$/i.test(i)) fail(`“${i}” is not a valid domain name for an include.`); parts.push('include:' + i); }
      parts.push(v.all);
      rec = parts.join(' ');
    } else rec = v.rec.trim().replace(/^"|"$/g, '').replace(/"\s*"/g, '');
    if (!/^v=spf1(\s|$)/i.test(rec)) fail('An SPF record starts with “v=spf1”.');
    const terms = rec.split(/\s+/).slice(1);
    const rows = [], warn = [];
    let lookups = 0;
    for (const t of terms) {
      const m = /^([+~?-]?)([a-z0-9]+)(?:[:=](.*))?$/i.exec(t);
      if (!m) { warn.push(`Unknown term “${t}”.`); continue; }
      const [, q, mech, val] = m;
      const qual = { '': 'pass', '+': 'pass', '-': 'fail', '~': 'soft fail', '?': 'neutral' }[q];
      const counts = ['include', 'a', 'mx', 'ptr', 'exists', 'redirect'].includes(mech.toLowerCase());
      if (counts) lookups++;
      const what = { all: 'all other senders', ip4: 'IPv4 address(es) ' + val, ip6: 'IPv6 address(es) ' + val, a: 'the A/AAAA record' + (val ? ' of ' + val : ''), mx: 'the MX servers' + (val ? ' of ' + val : ''), include: 'whatever the SPF record of ' + val + ' allows', redirect: 'use the SPF record of ' + val, ptr: 'reverse DNS (deprecated, do not use)', exists: 'if ' + val + ' exists', exp: 'explanation text on rejection' }[mech.toLowerCase()];
      if (!what) warn.push(`Unknown mechanism “${mech}”.`);
      rows.push([t, mech === 'redirect' || mech === 'exp' ? '—' : qual, what || '?', counts ? '1' : '0']);
    }
    const all = terms.find(t => /^[+~?-]?all$/i.test(t));
    if (!all && !terms.some(t => t.startsWith('redirect='))) warn.push('There is no “all” at the end; senders that do not match then get a neutral result.');
    if (all === '+all' || all === 'all') warn.push('+all lets anyone send mail on behalf of your domain. Use -all or ~all.');
    if (terms.some(t => /^[+~?-]?ptr/i.test(t))) warn.push('The ptr mechanism is deprecated (RFC 7208) and slow; use ip4/ip6 or include.');
    if (terms.filter(t => /^v=spf1/i.test(t)).length) warn.push('“v=spf1” appears twice.');
    const res = [{ l: 'TXT record for the domain (@)', v: rec },
      { note: `${lookups} of at most 10 DNS lookups at the first level. Includes can trigger further lookups themselves; those count too.`, kind: lookups > 10 ? 'err' : lookups > 7 ? 'warn' : 'ok' },
      { l: 'Terms', table: { head: ['Term', 'Result', 'Means', 'Lookups'], rows } }];
    if (rec.length > 255) res.push({ note: `The record is ${rec.length} characters; a TXT string may be at most 255 characters. Split it into several quoted strings.`, kind: 'warn' });
    warn.forEach(w => res.push({ note: w, kind: 'warn' }));
    res.push({ note: 'A domain may have only one SPF record. Two records make SPF invalid.', kind: 'info' });
    return res;
  },
});

// ---------- DMARC ----------
T({
  id: 'dmarc', cat: 'net', ic: 'DMRC', name: 'DMARC record generator',
  desc: 'Build a DMARC record with policy, reporting and alignment, or have an existing record explained.',
  kw: 'dmarc record txt email policy rua ruf reporting spf dkim alignment',
  fields: [
    { k: 'm', t: 'sel', label: 'Mode', opts: [['build', 'Build'], ['check', 'Explain an existing record']] },
    { k: 'domain', t: 'text', label: 'Domain', def: 'example.com', show: v => v.m === 'build' },
    { k: 'p', t: 'sel', label: 'Policy (p)', opts: [['none', 'none: report only (start here)'], ['quarantine', 'quarantine: send to spam'], ['reject', 'reject: refuse']], show: v => v.m === 'build' },
    { k: 'sp', t: 'sel', label: 'Subdomain policy (sp)', opts: [['', 'Same as the main domain'], ['none', 'none'], ['quarantine', 'quarantine'], ['reject', 'reject']], show: v => v.m === 'build' },
    { k: 'pct', t: 'range', label: 'Percentage of messages (pct)', def: 100, min: 1, max: 100, show: v => v.m === 'build' },
    { k: 'rua', t: 'text', label: 'Aggregate reports to (rua)', def: 'dmarc@example.com', show: v => v.m === 'build' },
    { k: 'ruf', t: 'text', label: 'Failure reports to (ruf, optional)', show: v => v.m === 'build' },
    { k: 'adkim', t: 'sel', label: 'DKIM alignment', opts: [['r', 'relaxed (subdomain allowed)'], ['s', 'strict (exact match)']], show: v => v.m === 'build' },
    { k: 'aspf', t: 'sel', label: 'SPF alignment', opts: [['r', 'relaxed'], ['s', 'strict']], show: v => v.m === 'build' },
    { k: 'rec', t: 'area', label: 'DMARC record', rows: 2, def: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; adkim=s; pct=50', show: v => v.m === 'check' },
  ],
  run(v) {
    let rec;
    if (v.m === 'build') {
      const mail = s => s.split(/[,\s]+/).filter(Boolean).map(x => { if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x.replace(/^mailto:/, ''))) fail(`“${x}” is not a valid email address for reports.`); return 'mailto:' + x.replace(/^mailto:/, ''); }).join(',');
      const t = ['v=DMARC1', 'p=' + v.p];
      if (v.sp) t.push('sp=' + v.sp);
      if (v.pct < 100) t.push('pct=' + v.pct);
      if (v.rua.trim()) t.push('rua=' + mail(v.rua));
      if (v.ruf.trim()) t.push('ruf=' + mail(v.ruf), 'fo=1');
      if (v.adkim === 's') t.push('adkim=s');
      if (v.aspf === 's') t.push('aspf=s');
      rec = t.join('; ');
    } else rec = v.rec.trim().replace(/^"|"$/g, '');
    const tags = Object.fromEntries(rec.split(';').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()]; }));
    if (tags.v !== 'DMARC1') fail('A DMARC record starts with “v=DMARC1”.');
    if (!tags.p) fail('The required p= tag (policy) is missing.');
    const EXPL = { v: 'Version', p: 'Policy', sp: 'Subdomain policy', pct: 'Percentage the policy applies to', rua: 'Aggregate reports', ruf: 'Failure reports', adkim: 'DKIM alignment', aspf: 'SPF alignment', fo: 'When to send failure reports', ri: 'Reporting interval (s)', np: 'Policy for non-existent subdomains' };
    const VAL = { none: 'report only', quarantine: 'treat as spam', reject: 'reject', r: 'relaxed', s: 'strict' };
    const res = [{ l: `TXT record for _dmarc.${v.m === 'build' ? v.domain.trim() : '<domain>'}`, v: rec }, { l: 'Explanation', table: { head: ['Tag', 'Meaning', 'Value'], rows: Object.entries(tags).map(([k, x]) => [k, EXPL[k] || '(unknown)', VAL[x] ? `${x} (${VAL[x]})` : x]) } }];
    if (tags.p === 'none') res.push({ note: 'p=none does not yet protect against spoofing. Review the reports for a few weeks, then move to quarantine and later reject.', kind: 'info' });
    if (!tags.rua) res.push({ note: 'Without rua you get no reports and cannot see who is sending mail on behalf of your domain.', kind: 'warn' });
    return res;
  },
});

// ---------- Email headers ----------
function decodeMime(s) {
  // Whitespace between two encoded words is dropped (RFC 2047); elsewhere it is kept.
  return s.replace(/(\?=)\s+(?==\?)/g, '$1').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs, e, t) => {
    try {
      const bytes = e.toUpperCase() === 'B' ? Uint8Array.from(atob(t), c => c.charCodeAt(0)) : Uint8Array.from(t.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } catch { return m; }
  });
}
export function parseHeaders(raw) {
  const head = raw.replace(/\r\n/g, '\n').split(/\n\n/)[0];
  const out = [];
  for (const l of head.split('\n')) {
    if (/^[ \t]/.test(l) && out.length) out[out.length - 1][1] += ' ' + l.trim();
    else { const i = l.indexOf(':'); if (i > 0) out.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); }
  }
  return out;
}
T({
  id: 'emailheader', cat: 'net', ic: 'HDR', name: 'Email header analyzer',
  desc: 'Analyze the headers of an email: the route through the servers, delays and the SPF, DKIM and DMARC results.',
  kw: 'email header headers analyze analysis received spf dkim dmarc route delay spam',
  fields: [{ k: 's', t: 'area', label: 'Headers (Outlook: File > Properties; Gmail: Show original)', rows: 12, def: `Received: from mail.example.com (mail.example.com [203.0.113.25])
	by mx.recipient.org (Postfix) with ESMTPS id 4ABC123
	for <john@recipient.org>; Thu, 22 Oct 2026 14:30:12 -0400
Received: from [192.168.1.20] (unknown [198.51.100.7])
	by mail.example.com (Postfix) with ESMTPSA id 9XYZ;
	Thu, 22 Oct 2026 14:30:05 -0400
Authentication-Results: mx.recipient.org; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com header.s=mail; dmarc=pass header.from=example.com
DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=mail; h=from:to:subject:date; bh=abc=; b=def=
From: =?UTF-8?Q?Ren=C3=A9e_Smith?= <renee@example.com>
To: John <john@recipient.org>
Subject: =?UTF-8?B?UXVvdGUgZm9yIHRoZSBuZXcgc2VydmVy?=
Date: Thu, 22 Oct 2026 14:30:00 -0400
Message-ID: <abc123@example.com>
Return-Path: <renee@example.com>` }],
  run(v) {
    const hs = parseHeaders(v.s);
    if (!hs.length) fail('No headers found. Paste the full headers, including lines such as “Received:” and “From:”.');
    const get = n => hs.filter(h => h[0].toLowerCase() === n.toLowerCase()).map(h => h[1]);
    const res = [{ l: 'Message', kv: [['From', decodeMime(get('From')[0] || '') || null], ['To', decodeMime(get('To')[0] || '') || null], ['Subject', decodeMime(get('Subject')[0] || '') || null], ['Date', get('Date')[0] || null], ['Message-ID', get('Message-ID')[0] || null], ['Return-Path', get('Return-Path')[0] || null], ['Reply-To', get('Reply-To')[0] || null]] }];
    const hops = get('Received').reverse().map(r => {
      const from = /from\s+(\S+)(?:\s+\(([^)]*)\))?/i.exec(r), by = /by\s+(\S+)/i.exec(r), w = /with\s+(\S+)/i.exec(r);
      const tail = r.includes(';') ? r.split(';').pop() : (/((Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s.*)$/.exec(r) || [, ''])[1];
      const d = Date.parse(tail.trim().replace(/\s+\(.*\)$/, ''));
      return { from: from ? from[1] + (from[2] ? ' (' + from[2] + ')' : '') : '', by: by?.[1] || '', with: w?.[1] || '', t: d };
    });
    if (hops.length) {
      res.push({ l: `Route (${plural(hops.length, 'hop', 'hops')}, oldest first)`, table: { head: ['#', 'From', 'By', 'Protocol', 'Time', 'Delay'], rows: hops.map((h, i) => [i + 1, h.from, h.by, h.with, Number.isNaN(h.t) ? '?' : new Date(h.t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', i && !Number.isNaN(h.t) && !Number.isNaN(hops[i - 1].t) ? duration(Math.max(0, (h.t - hops[i - 1].t) / 1000)) || '0 s' : '']) } });
      const sent = Date.parse(get('Date')[0] || ''), last = hops.at(-1).t;
      if (!Number.isNaN(sent) && !Number.isNaN(last)) res.push({ note: `Total delivery time: ${duration(Math.max(0, (last - sent) / 1000)) || 'less than a second'}.`, kind: 'info' });
      if (hops.some(h => /^E?SMTP$/i.test(h.with))) res.push({ note: 'At least one hop did not use TLS (ESMTP without S): the mail crossed the network unencrypted there.', kind: 'warn' });
    }
    const auth = get('Authentication-Results').join('; ') + '; ' + get('ARC-Authentication-Results').join('; ');
    const rows = ['spf', 'dkim', 'dmarc', 'arc'].map(k => { const m = new RegExp(`\\b${k}=(\\w+)([^;]*)`, 'i').exec(auth); return m ? [k.toUpperCase(), m[1], m[2].trim()] : null; }).filter(Boolean);
    if (rows.length) {
      res.push({ l: 'Authentication', table: { head: ['Check', 'Result', 'Details'], rows } });
      const fails = rows.filter(r => !/^(pass|none)$/i.test(r[1]));
      res.push(fails.length ? { note: 'Did not pass: ' + fails.map(r => `${r[0]} (${r[1]})`).join(', ') + '. The message may be spoofed, or the sender’s configuration is incomplete.', kind: 'warn' } : { note: 'SPF, DKIM and DMARC passed according to the receiving server.', kind: 'ok' });
    }
    const dk = get('DKIM-Signature')[0];
    if (dk) res.push({ l: 'DKIM signature', kv: [['Domain (d=)', /\bd=([^;\s]+)/.exec(dk)?.[1] || null], ['Selector (s=)', /\bs=([^;\s]+)/.exec(dk)?.[1] || null], ['Algorithm (a=)', /\ba=([^;\s]+)/.exec(dk)?.[1] || null], ['DNS record', /\bs=([^;\s]+)/.test(dk) ? `${/\bs=([^;\s]+)/.exec(dk)[1]}._domainkey.${/\bd=([^;\s]+)/.exec(dk)?.[1]}` : null]] });
    res.push({ l: `All headers (${hs.length})`, table: { head: ['Name', 'Value'], rows: hs.map(([k, x]) => [k, decodeMime(x)]) } });
    return res;
  },
});
