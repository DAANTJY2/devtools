import { T, fail } from '../core/registry.js';
import { qrMatrix, qrSvg, svgUrl, qrPng } from '../lib/qr.js';

const ECL = [['L', 'L: 7% recovery'], ['M', 'M: 15% recovery'], ['Q', 'Q: 25% recovery'], ['H', 'H: 30% recovery']];
async function qrResults(text, v, name) {
  const m = await qrMatrix(text, v.ecl);
  const o = { fg: v.fg, bg: v.transp ? 'transparent' : v.bg, margin: Math.round(v.margin) };
  const svg = qrSvg(m, { ...o, scale: 8 });
  const png = await qrPng(m, { ...o, scale: Math.max(4, Math.round(v.size / (m.n + o.margin * 2))) });
  return [{ l: `QR code (${m.n} × ${m.n} modules)`, img: svgUrl(svg), alt: 'QR code' },
    png ? { l: 'Download as PNG', dl: { name: name + '.png', data: png, mime: 'image/png' } } : null,
    { l: 'Download as SVG', dl: { name: name + '.svg', data: svg, mime: 'image/svg+xml' } }];
}
const styleFields = [
  { k: 'ecl', t: 'sel', label: 'Error correction', def: 'M', opts: ECL },
  { k: 'fg', t: 'color', label: 'Foreground', def: '#000000' },
  { k: 'bg', t: 'color', label: 'Background', def: '#ffffff' },
  { k: 'transp', t: 'chk', label: 'Transparent background' },
  { k: 'margin', t: 'range', label: 'Margin (modules)', def: 4, min: 0, max: 10 },
  { k: 'size', t: 'sel', label: 'PNG size', def: '512', opts: [['256', '256 px'], ['512', '512 px'], ['1024', '1024 px'], ['2048', '2048 px']] },
];

T({
  id: 'qr', cat: 'media', ic: 'QR', name: 'QR code generator',
  desc: 'Create a QR code from text or a URL, with custom colors and error correction; download as PNG or SVG.',
  kw: 'qr code qrcode generator create url link png svg barcode',
  fields: [{ k: 's', t: 'area', label: 'Text or URL', def: 'https://example.com', rows: 3, mono: false }, ...styleFields],
  ex: [{ n: 'Phone number', v: { s: 'tel:+12025550123' } }, { n: 'Email', v: { s: 'mailto:info@example.com?subject=Question' } }, { n: 'vCard', v: { s: 'BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jane\nFN:Jane Doe\nTEL:+12025550123\nEMAIL:jane@example.com\nEND:VCARD' } }],
  async run(v) {
    if (!v.s) return [{ note: 'Type the text or URL for the QR code.', kind: 'info' }];
    const res = await qrResults(v.s, v, 'qr-code');
    if (v.fg.toLowerCase() === v.bg.toLowerCase() && !v.transp) res.unshift({ note: 'Foreground and background have the same color; the code cannot be scanned.', kind: 'warn' });
    return res;
  },
});

const wifiEsc = s => s.replace(/([\\;,:"])/g, '\\$1');
T({
  id: 'wifiqr', cat: 'media', ic: 'WIFI', name: 'Wi-Fi QR code generator',
  desc: 'Create a QR code that lets phones join your Wi-Fi network instantly; download as PNG or SVG.',
  kw: 'wifi wi-fi qr code wlan ssid password guest network connect',
  fields: [
    { k: 'ssid', t: 'text', label: 'Network name (SSID)', def: 'Guest network' },
    { k: 'sec', t: 'sel', label: 'Security', opts: [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP (outdated)'], ['nopass', 'None (open network)']] },
    { k: 'pw', t: 'text', label: 'Password', def: 'welcome-to-our-home', show: v => v.sec !== 'nopass' },
    { k: 'hidden', t: 'chk', label: 'Hidden network' },
    ...styleFields,
  ],
  async run(v) {
    if (!v.ssid) fail('Enter the network name (SSID).');
    if (v.sec === 'WPA' && v.pw.length < 8) fail('A WPA password has at least 8 characters.');
    const s = `WIFI:T:${v.sec};S:${wifiEsc(v.ssid)};${v.sec !== 'nopass' ? `P:${wifiEsc(v.pw)};` : ''}${v.hidden ? 'H:true;' : ''};`;
    return [...await qrResults(s, v, 'wifi-' + v.ssid.replace(/[^\w-]+/g, '_')), { l: 'Code contents', v: s },
      { note: 'Anyone who scans the code can see the password. Only display it where that is fine, for example for a guest network.', kind: 'info' }];
  },
});

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
T({
  id: 'svgplaceholder', cat: 'media', ic: 'SVG', name: 'SVG placeholder generator',
  desc: 'Create a placeholder image with custom dimensions, colors and text, as SVG or a data URL.',
  kw: 'svg placeholder image dummy width height mockup',
  fields: [
    { k: 'w', t: 'num', label: 'Width (px)', def: 640, min: 1, max: 10000 },
    { k: 'h', t: 'num', label: 'Height (px)', def: 360, min: 1, max: 10000 },
    { k: 'bg', t: 'color', label: 'Background', def: '#cfd6df' },
    { k: 'fg', t: 'color', label: 'Text color', def: '#4a5563' },
    { k: 'text', t: 'text', label: 'Text (empty = dimensions)' },
    { k: 'fs', t: 'num', label: 'Font size (px, empty = automatic)', min: 1 },
    { k: 'cross', t: 'chk', label: 'Diagonal lines' },
  ],
  run(v) {
    const w = Math.round(v.w), h = Math.round(v.h);
    if (!(w > 0 && h > 0)) fail('Width and height must be greater than 0.');
    const text = v.text || `${w} × ${h}`;
    const fs = v.fs || Math.max(10, Math.round(Math.min(w / Math.max(text.length, 4) * 1.6, h / 3)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${v.bg}"/>`
      + (v.cross ? `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="${v.fg}" stroke-opacity=".3" stroke-width="2"/>` : '')
      + `<text x="50%" y="50%" fill="${v.fg}" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="600" text-anchor="middle" dominant-baseline="central">${xmlEsc(text)}</text></svg>`;
    const url = svgUrl(svg);
    return [{ l: 'Preview', img: url, alt: 'Placeholder ' + text }, { l: 'SVG', v: svg }, { l: 'Data URL (for src="…")', v: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) },
      { l: 'Download SVG', dl: { name: `placeholder-${w}x${h}.svg`, data: svg, mime: 'image/svg+xml' } }];
  },
});

T({
  id: 'camera', cat: 'media', ic: 'CAM', name: 'Camera recorder',
  desc: 'Take photos and videos with your camera, locally in the browser, and download them.',
  kw: 'camera webcam photo video record recorder screenshot',
  ui(root, { h, toast }) {
    const video = h('video', { autoplay: true, playsinline: true, muted: true, 'aria-label': 'Camera view' });
    const status = h('p', { class: 'muted small', role: 'status' }, 'The camera is off. Nothing is sent or stored outside this page.');
    const gallery = h('div', { class: 'gallery', 'aria-label': 'Recordings' });
    const sel = h('select', { 'aria-label': 'Choose camera', style: 'width:auto' });
    const withAudio = h('input', { type: 'checkbox', id: 'camAudio', checked: true });
    let stream = null, rec = null, chunks = [];
    const urls = [];
    const startBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => start() }, 'Camera on');
    const stopBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => stop() }, 'Camera off');
    const shotBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => shot() }, 'Take photo');
    const recBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => toggleRec() }, 'Record video');
    const setOn = on => { [stopBtn, shotBtn, recBtn].forEach(b => { b.disabled = !on; }); startBtn.disabled = on; };
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'This browser does not support a camera, or the page is not served over HTTPS or localhost.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: sel.value ? { deviceId: { exact: sel.value } } : { facingMode: 'user' }, audio: withAudio.checked });
        video.srcObject = stream; setOn(true);
        status.textContent = 'The camera is on.';
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        if (sel.options.length !== devs.length) sel.replaceChildren(...devs.map((d, i) => h('option', { value: d.deviceId }, d.label || 'Camera ' + (i + 1))));
        const cur = stream.getVideoTracks()[0]?.getSettings().deviceId; if (cur) sel.value = cur;
      } catch (e) {
        status.textContent = e.name === 'NotAllowedError' ? 'No permission to use the camera. Allow it via the lock icon in the address bar.' : e.name === 'NotFoundError' ? 'No camera found.' : 'The camera could not start: ' + e.message;
      }
    }
    function stop() { if (rec?.state === 'recording') rec.stop(); stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; setOn(false); status.textContent = 'The camera is off.'; }
    const add = (url, name, isVideo) => { urls.push(url); gallery.prepend(h('figure', {}, isVideo ? h('video', { src: url, controls: true }) : h('img', { src: url, alt: 'Photo ' + name }), h('a', { class: 'btn small', href: url, download: name }, 'Download'))); };
    function shot() {
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(b => { add(URL.createObjectURL(b), `photo-${stamp()}.png`); toast('Photo taken'); }, 'image/png');
    }
    function toggleRec() {
      if (rec?.state === 'recording') { rec.stop(); return; }
      const type = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find(t => window.MediaRecorder?.isTypeSupported(t));
      if (!type) { status.textContent = 'Video recording is not supported in this browser.'; return; }
      chunks = []; rec = new MediaRecorder(stream, { mimeType: type });
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => { add(URL.createObjectURL(new Blob(chunks, { type })), `video-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, true); recBtn.textContent = 'Record video'; status.textContent = 'Recording finished.'; };
      rec.start(); recBtn.textContent = '■ Stop recording'; status.textContent = '● Recording…';
    }
    const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    sel.addEventListener('change', () => { if (stream) { stop(); start(); } });
    root.append(h('div', { class: 'panel' }, h('div', { class: 'row' }, startBtn, stopBtn, shotBtn, recBtn, sel, h('label', { for: 'camAudio', class: 'row' }, withAudio, ' Audio')), status, video), gallery);
    return () => { stop(); urls.forEach(u => URL.revokeObjectURL(u)); };
  },
});
