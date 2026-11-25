// The app shell: navigation, search, favorites, recently used and theme.
import { cats, tools, byId } from './core/registry.js';
import { h, icon, mountTool, copy, toast } from './core/ui.js';
import { stripAccents } from './core/util.js';
import './tools/index.js';

const $ = s => document.querySelector(s);
const main = $('#main'), side = $('#side'), q = $('#q'), qres = $('#qres'), topCrumbs = $('#topCrumbs');
const catOf = id => cats.find(c => c.id === id);

// ---------- browser storage ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('itk.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('itk.' + k, JSON.stringify(v)); } catch { /* private window: not stored */ } },
};
let favs = store.get('favs', []).filter(id => byId.has(id));
let recent = store.get('recent', []).filter(id => byId.has(id));
const memory = new Map(); // entered values per tool, while the page is open

const isFav = id => favs.includes(id);
function toggleFav(id) {
  const was = isFav(id);
  favs = was ? favs.filter(x => x !== id) : [...favs, id];
  store.set('favs', favs);
  toast(was ? 'Removed from favorites' : 'Added to favorites');
  document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => setStar(b, id));
  if (!location.hash.slice(1)) {
    // Redraw the favorites row, but keep the scroll position and the focus on the star.
    const y = scrollY, onStar = document.activeElement?.dataset.fav === id;
    renderHome();
    scrollTo(0, y);
    if (onStar) main.querySelector(`.card [data-fav="${id}"], .home-tool-row [data-fav="${id}"]`)?.focus({ preventScroll: true });
  }   else if (location.hash === '#favorites') renderCollection('favorites');
  else if (location.hash === '#all' || location.hash.startsWith('#category/')) {
    const y = scrollY, onStar = document.activeElement?.dataset.fav === id;
    renderDirectory(location.hash.startsWith('#category/') ? location.hash.slice(10) : undefined);
    scrollTo(0, y);
    if (onStar) main.querySelector(`.card [data-fav="${id}"], .home-tool-row [data-fav="${id}"]`)?.focus({ preventScroll: true });
    renderSide();
    return;
  }
  renderSide();
}
function setStar(btn, id) {
  const on = isFav(id);
  btn.setAttribute('aria-pressed', on);
  btn.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites');
  btn.title = btn.getAttribute('aria-label');
}
const starBtn = (id, cls = '') => {
  const b = h('button', { class: 'star ' + cls, type: 'button', 'data-fav': id, onclick: e => { e.preventDefault(); e.stopPropagation(); toggleFav(id); } }, icon('star'));
  setStar(b, id);
  return b;
};
const badge = (t, cls = '') => h('span', { class: 'ic ' + cls, 'data-cat': t.cat, 'aria-hidden': 'true' }, t.ic);

// ---------- search ----------
const norm = s => stripAccents(String(s).toLowerCase());
const index = tools.map(t => ({ t, name: norm(t.name), id: t.id.toLowerCase(), kw: norm(t.kw), desc: norm(t.desc), cat: norm(catOf(t.cat).name) }));
export function search(query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const x of index) {
    let score = 0;
    for (const w of words) {
      const s = x.id === w ? 120 : x.name.startsWith(w) ? 100 : new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(x.name) ? 60
        : x.name.includes(w) ? 40 : x.kw.includes(w) || x.id.includes(w) ? 25 : x.desc.includes(w) ? 10 : x.cat.includes(w) ? 5 : 0;
      if (!s) { score = 0; break; }
      score += s;
    }
    if (score) hits.push([score + (isFav(x.t.id) ? 3 : 0), x.t]);
  }
  if (!hits.length) return fuzzy(words);
  return hits.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'en')).map(x => x[1]);
}
// No hits: allow one or two typos per word. Swapped neighbours (“bsae”) count as one typo.
function lev(a, b) {
  let pp = [], p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const d = [i];
    for (let j = 1; j <= b.length; j++) {
      d[j] = Math.min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[j] = Math.min(d[j], pp[j - 2] + 1);
    }
    pp = p; p = d;
  }
  return p[b.length];
}
function fuzzy(words) {
  const out = [];
  for (const x of index) {
    const toks = (x.name + ' ' + x.kw + ' ' + x.id).split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const w of words) {
      const max = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
      const best = Math.min(...toks.map(t => lev(w, t.slice(0, w.length + 1)) - (t.startsWith(w.slice(0, 2)) ? 0.5 : 0)));
      if (best > max) { score = 0; break; }
      score += 10 - best;
    }
    if (score) out.push([score, x.t]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => x[1]);
}

// One result list, used by the palette and by the search on the home page.
const found = n => `${n} ${n === 1 ? 'tool' : 'tools'} found`;
function searchList(input, list, status, { limit = 10, idle = () => [] } = {}) {
  let sel = 0, hits = [], statusTimer;
  const opts = () => [...list.querySelectorAll('[role=option]')];
  const mark = () => {
    opts().forEach((li, i) => li.setAttribute('aria-selected', i === sel));
    if (hits.length) input.setAttribute('aria-activedescendant', list.id + '-' + sel); else input.removeAttribute('aria-activedescendant');
    opts()[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const row = (t, i) => h('li', { role: 'option', id: list.id + '-' + i, 'data-cat': t.cat, onmousedown: e => { e.preventDefault(); go(t.id); }, onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
    badge(t), h('span', { class: 'qres-t' }, h('b', {}, t.name), h('small', {}, t.desc)), h('span', { class: 'qres-c' }, catOf(t.cat).name));
  function show() {
    const val = input.value.trim();
    const all = val ? search(val) : [];
    hits = val ? all.slice(0, limit) : idle();
    sel = 0;
    list.replaceChildren(...(!val && hits.length ? [h('li', { class: 'qres-label', 'aria-hidden': 'true' }, 'Recent and favorites')] : []), ...hits.map(row));
    if (val && !hits.length) list.append(h('li', { class: 'empty' }, `No tool matches “${val}”. Try another word.`));
    else if (!hits.length) list.append(h('li', { class: 'empty' }, `Type to search ${tools.length} tools.`));
    else list.append(h('li', { class: 'qres-foot', 'aria-hidden': 'true' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' to navigate'), h('span', {}, h('kbd', {}, '↵'), ' to open'), h('span', {}, h('kbd', {}, 'Esc'), ' to close')));
    // Announce the count once typing pauses, not after every key.
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = val ? (all.length ? found(all.length) : `No tool matches “${val}”`) : ''; }, 250);
    mark();
  }
  input.addEventListener('input', show);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel].id); }
  });
  return show;
}

// ---------- command palette ----------
const palette = $('#palette'), findBtn = $('#findBtn');
const showQ = searchList(q, qres, $('#qstatus'), { idle: () => [...new Set([...favs, ...recent])].slice(0, 8).map(id => byId.get(id)) });
function openPalette() {
  if (palette.open) return q.select();
  q.value = '';
  showQ();
  palette.showModal();
  q.focus();
}
findBtn.addEventListener('click', openPalette);
palette.addEventListener('click', e => { if (e.target === palette) palette.close(); }); // click on the backdrop
// In a search field, Chrome lets Escape clear the text instead of closing the dialog.
q.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); palette.close(); } });
function go(id) { if (palette.open) palette.close(); location.hash = id; }

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  // In an empty search box, / also means “search”, not a character.
  const emptySearch = e.target.id === 'q' && !e.target.value;
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && (!typing || emptySearch))) {
    e.preventDefault();
    openPalette();
  }
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeNav(true);
});
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
document.querySelectorAll('.kbd-mod').forEach(k => { k.textContent = isMac ? '⌘' : 'Ctrl'; });

// ---------- sidebar with all tools (a drawer on narrow screens) ----------
const openCats = new Set(store.get('openCats', []));
function renderSide() {
  const cur = location.hash.slice(1);
  const curTool = byId.get(cur);
  const curCat = cur.startsWith('category/') ? catOf(cur.slice(9)) : curTool && catOf(curTool.cat);
  const navLink = (id, label, ic, n) => h('a', {
    class: 'side-home' + (cur === id ? ' on' : ''),
    href: id ? '#' + id : '#',
    'aria-current': cur === id ? 'page' : undefined,
  }, icon(ic), h('span', { class: 'cat-n' }, label), n !== undefined ? h('span', { class: 'count' }, n) : '');
  side.replaceChildren(
    h('a', { class: 'side-brand', href: '#', onclick: e => goHome(e) }, h('span', {}, 'DevTools')),
    h('p', { class: 'side-tag' }, 'A focused toolbox for the web.'),
    h('nav', { 'aria-label': 'All tools' },
      navLink('', 'Overview', 'home'),
      navLink('all', 'All tools', 'search', tools.length),
      navLink('favorites', 'Favorites', 'star', favs.length),
      navLink('recent', 'Recently used', 'clock', recent.length),
      h('div', { class: 'side-title' }, h('span', {}, 'Categories')),
      ...cats.map(c => {
        const list = tools.filter(t => t.cat === c.id);
        const open = openCats.has(c.id) || curCat?.id === c.id;
        const d = h('details', { class: 'side-group' + (curCat?.id === c.id ? ' cur' : ''), 'data-cat': c.id, open, ontoggle: () => { d.open ? openCats.add(c.id) : openCats.delete(c.id); store.set('openCats', [...openCats]); } },
          h('summary', {}, icon(c.id), h('span', { class: 'cat-n' }, c.name), h('span', { class: 'count' }, list.length), icon('chevron', 'chev')),
          h('ul', {}, list.map(t => link(t, cur))));
        return d;
      })),
    h('div', { class: 'side-foot' },
      h('button', { class: 'side-help', type: 'button', onclick: openKeys }, 'Keyboard shortcuts'),
      h('p', {}, icon('lock'), h('span', {}, 'Everything runs locally in your browser.'))));
  side.querySelector('a.on')?.scrollIntoView({ block: 'nearest' });
}
// Long names are cut off with an ellipsis; the tooltip shows the full name.
const link = (t, cur) => h('li', {}, h('a', { href: '#' + t.id, class: cur === t.id ? 'on' : '', title: t.name, 'aria-current': cur === t.id ? 'page' : undefined }, t.name));

const menuBtn = $('#menuBtn'), scrim = $('#scrim'), themeBtn = $('#themeBtn');
// While the drawer is open, the page behind it is inert: no scrolling, no tabbing into it.
const behind = () => [main, findBtn, themeBtn, document.querySelector('.brand')];
function openNav() { document.body.classList.add('nav-open'); scrim.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); behind().forEach(el => { el.inert = true; }); side.querySelector('a')?.focus(); }
function closeNav(focusBtn) { document.body.classList.remove('nav-open'); scrim.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); behind().forEach(el => { el.inert = false; }); if (focusBtn) menuBtn.focus(); }
menuBtn.addEventListener('click', () => document.body.classList.contains('nav-open') ? closeNav() : openNav());
scrim.addEventListener('click', () => closeNav());
side.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
// From 1024px the sidebar is always visible, so a drawer left open must not keep the page inert.
matchMedia('(min-width: 1024px)').addEventListener?.('change', () => closeNav());

// ---------- keyboard shortcuts dialog ----------
const keys = $('#keys');
const openKeys = () => keys.showModal();
$('#keysX').replaceChildren(icon('close'));
$('#keysX').addEventListener('click', () => keys.close());
keys.addEventListener('click', e => { if (e.target === keys) keys.close(); }); // click on the backdrop

// ---------- theme ----------
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const syncTheme = () => { const d = isDark(); themeBtn.replaceChildren(icon(d ? 'sun' : 'moon')); themeBtn.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); themeBtn.title = themeBtn.getAttribute('aria-label'); };
themeBtn.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('itk.theme', next); } catch { /* not stored */ }
  syncTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncTheme);
menuBtn.replaceChildren(icon('menu'));
syncTheme();

// ---------- pages ----------
let cleanup = null;
// The whole card is the link (via .card-link::after); the star sits above it and does not navigate.
const card = (t, tag = true, openAction = true) => h('article', { class: 'card', 'data-cat': t.cat },
  h('div', { class: 'card-top' }, badge(t), starBtn(t.id, 'card-star')),
  h('a', { class: 'card-link', href: '#' + t.id }, t.name),
  h('p', { class: 'card-d' }, t.desc),
  tag ? h('span', { class: 'tag' }, catOf(t.cat).name) : '',
  openAction ? h('span', { class: 'card-open', 'aria-hidden': 'true' }, 'Open tool', icon('chevron')) : '');
const grid = (list, tag, openAction = true) => h('div', { class: 'grid' }, list.map(t => card(t, tag, openAction)));
const nTools = n => `${n} ${n === 1 ? 'tool' : 'tools'}`;

const categoryExplorer = () => h('section', { class: 'explore', 'aria-labelledby': 'exploreTitle' },
  h('div', { class: 'explore-head' }, h('h2', { id: 'exploreTitle' }, 'Explore categories'),
    h('a', { class: 'explore-all', href: '#all' }, 'All tools', icon('chevron'))),
  h('div', { class: 'category-grid' }, cats.map(c => h('a', {
    class: 'category-tile' + (c.id === 'dev' ? ' category-featured' : ''),
    'data-cat': c.id,
    href: '#category/' + c.id,
  },
    h('span', { class: 'cat-glyph' }, icon(c.id)),
    h('span', { class: 'category-copy' }, h('strong', {}, c.name),
      h('span', { class: 'category-description' }, categoryDescriptions[c.id]),
      h('small', {}, nTools(tools.filter(t => t.cat === c.id).length))),
    icon('chevron', 'category-arrow')))));
const categoryDescriptions = {
  crypto: 'Hashes, keys, passwords and security helpers.',
  convert: 'Convert text, data and files between formats.',
  web: 'Inspect web content, URLs and request data.',
  dev: 'Format, validate and generate developer resources.',
  net: 'Explore IP addresses, DNS and network details.',
  media: 'Work with image, video and media files.',
  math: 'Calculate, convert and explore numeric values.',
  time: 'Work with dates, timestamps and measurements.',
  text: 'Transform, compare and organize text.',
  data: 'Generate and inspect structured data.',
  ref: 'Quick references for everyday developer tasks.',
};
const featuredTools = ['jsonts', 'uuid', 'hash'].map(id => byId.get(id)).filter(Boolean);

function homeCollection(kind, title, eyebrow, ids, emptyMessage) {
  const entries = ids.slice(0, 5).map(id => byId.get(id)).filter(Boolean);
  return h('section', { class: 'home-list-section', 'aria-labelledby': `home-${kind}-title` },
    h('div', { class: 'home-section-head' },
      h('div', {},
        h('p', { class: 'home-kicker' }, eyebrow),
        h('h2', { id: `home-${kind}-title` }, title)),
      h('a', { class: 'home-section-link', href: '#' + kind }, 'View all', icon('chevron'))),
    entries.length
      ? h('ul', { class: 'home-tool-list' }, entries.map(t => h('li', { class: 'home-tool-row' },
        h('a', { class: 'home-tool-link', href: '#' + t.id },
          h('span', { class: 'home-tool-copy' }, h('strong', {}, t.name), h('small', {}, catOf(t.cat).name)),
          icon('chevron', 'home-tool-arrow')),
        kind === 'favorites' ? starBtn(t.id, 'home-tool-star') : '')))
      : h('div', { class: 'home-empty' },
        h('p', {}, emptyMessage)));
}

// Category filter and sort order of the catalog, remembered in this browser.
let catFilter = store.get('filter', ''), sortBy = store.get('sort', 'cat');
if (!catOf(catFilter)) catFilter = '';
function goHome(e, cat = '') {
  e?.preventDefault();
  catFilter = cat;
  store.set('filter', cat);
  if (location.hash.slice(1)) location.hash = ''; else { renderHome(); renderSide(); }
}

function catalog({ title = 'All utilities', category = null } = {}) {
  const status = h('p', { class: 'sr-only', role: 'status' });
  const count = h('span', { class: 'sec-n' });
  const body = h('div', { class: 'catalog' });
  let query = '', favoriteOnly = false;
  const fill = announce => {
    const q = norm(query);
    const list = tools.filter(t => (!catFilter || t.cat === catFilter) && (!favoriteOnly || isFav(t.id))
      && (!q || norm(`${t.name} ${t.desc} ${t.kw} ${t.id} ${catOf(t.cat).name}`).includes(q)));
    count.textContent = nTools(list.length);
    if (!list.length) body.replaceChildren(h('div', { class: 'empty-state' }, icon('search'),
      h('h3', {}, query ? 'No matching tools' : 'No favorite tools in this view'),
      h('p', { class: 'muted' }, query ? 'Try another search or category.' : 'Add favorites with the star button.')));
    else if (sortBy === 'az') body.replaceChildren(grid([...list].sort((a, b) => a.name.localeCompare(b.name, 'en')), true));
    else body.replaceChildren(...cats.filter(c => (!catFilter || c.id === catFilter) && list.some(t => t.cat === c.id)).map(c => {
      const inCat = list.filter(t => t.cat === c.id);
      return h('section', { class: 'cat-sec', 'data-cat': c.id, id: 'cat-' + c.id, 'aria-labelledby': 'cat-h-' + c.id },
        h('h3', { id: 'cat-h-' + c.id }, icon(c.id), h('a', { class: 'cat-title-link', href: '#category/' + c.id }, c.name), h('span', { class: 'count' }, inCat.length)), grid(inCat, !!category));
    }));
    if (announce) status.textContent = nTools(list.length) + ' shown';
  };
  const pick = (label, value, opts, set) => h('label', { class: 'pick' }, h('span', {}, label),
    h('select', { onchange: e => { set(e.target.value); fill(true); } }, opts.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
  const search = h('input', { class: 'catalog-search', type: 'search', placeholder: category ? `Search ${category.name.toLowerCase()}…` : 'Search all tools…',
    'aria-label': category ? `Search ${category.name}` : 'Search all tools', oninput: e => { query = e.target.value.trim(); fill(true); } });
  fill(false);
  return h('section', { class: 'sec', 'aria-labelledby': 'allT' },
    h('div', { class: 'sec-h' },
      h('h2', { id: 'allT', tabindex: '-1' }, title), count,
    ),
    h('div', { class: 'catalog-toolbar' }, search,
      h('div', { class: 'picks' },
        pick('Filter', favoriteOnly ? 'favorites' : 'all', [['all', 'All tools'], ['favorites', 'Favorites']], v => { favoriteOnly = v === 'favorites'; }),
        !category && pick('Category', catFilter, [['', 'All categories'], ...cats.map(c => [c.id, c.name])], v => { catFilter = v; store.set('filter', v); }),
        pick('Sort', sortBy, [['cat', 'By category'], ['az', 'A–Z']], v => { sortBy = v; store.set('sort', v); }))),
    status, body);
}

function renderHome() {
  document.title = 'DevTools';
  main.replaceChildren(h('div', { class: 'home' },
    h('section', { class: 'intro overview-intro', 'aria-labelledby': 'workspaceTitle' },
      h('div', { class: 'intro-copy' },
        h('h1', { id: 'workspaceTitle' }, 'Tools for ', h('span', { class: 'hero-title-light' }, 'everyday work.')),
        h('p', { class: 'lead' }, 'Practical utilities for common developer and IT tasks.'),
        h('div', { class: 'hero-meta', 'aria-label': 'Toolkit information' },
          h('span', {}, `${tools.length} tools`),
          h('span', {}, `${cats.length} categories`)))),
    h('section', { class: 'featured-section', 'aria-labelledby': 'featuredTitle' },
      h('div', { class: 'home-section-head' },
        h('h2', { id: 'featuredTitle' }, 'Selected tools'),
        h('a', { class: 'home-section-link', href: '#all' }, 'All tools', icon('chevron'))),
      grid(featuredTools, true, false)),
    categoryExplorer(),
    h('div', { class: 'home-collections' },
      homeCollection('recent', 'Recently used', 'PICK UP WHERE YOU LEFT OFF', recent, 'Open a tool and it will appear here.'),
      homeCollection('favorites', 'Favorites', 'SAVED TOOLS', favs, 'Save a tool with its star to find it here.'))));
}

function renderDirectory(category) {
  const c = category && catOf(category);
  if (c) {
    catFilter = c.id;
    store.set('filter', c.id);
  }
  document.title = (c?.name || 'All tools') + ' · DevTools';
  main.replaceChildren(h('div', { class: 'home directory' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#' }, 'Overview'), icon('chevron'),
      c ? h('a', { href: '#all' }, 'All tools') : h('span', {}, 'All tools'),
      c && [icon('chevron'), h('span', {}, c.name)]),
    h('header', { class: 'page-intro' }, c && h('span', { class: 'ic big category-icon', 'data-cat': c.id }, icon(c.id)), h('div', {},
      h('h1', {}, c?.name || 'All tools'),
      h('p', { class: 'lead' }, c
        ? `${nTools(tools.filter(t => t.cat === c.id).length)} in this category. Search by name, description, or keyword.`
        : `Browse ${tools.length} browser-based tools. Search by name, description, or category.`)),
    ),
    catalog({ title: c ? `${c.name} tools` : 'All tools', category: c })));
}

function renderCollection(kind) {
  const favorites = kind === 'favorites';
  const source = favorites ? favs : recent;
  const title = favorites ? 'Favorite tools' : 'Recently used';
  const description = favorites
    ? `${source.length} saved ${source.length === 1 ? 'tool' : 'tools'}, kept privately in this browser.`
    : `${source.length} ${source.length === 1 ? 'tool' : 'tools'} opened recently, kept privately in this browser.`;
  let query = '', order = favorites ? 'az' : 'recent';
  const body = h('div', { class: 'collection-results' });
  const fill = () => {
    let list = source.map(id => byId.get(id)).filter(Boolean);
    if (query) list = list.filter(t => norm(`${t.name} ${t.desc} ${catOf(t.cat).name}`).includes(norm(query)));
    if (order === 'az') list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    if (order === 'cat') list.sort((a, b) => catOf(a.cat).name.localeCompare(catOf(b.cat).name, 'en') || a.name.localeCompare(b.name, 'en'));
    body.replaceChildren(list.length ? grid(list) : h('div', { class: 'empty-state big' },
      icon(favorites ? 'star' : 'clock'),
      h('h2', {}, query ? 'No matching tools' : favorites ? 'No favorites yet' : 'No recent tools'),
      h('p', { class: 'muted' }, query ? 'Try another search.' : favorites ? 'Use the star on any tool to save it here.' : 'Open a tool and it will appear here.')));
  };
  const search = h('input', { class: 'collection-search', type: 'search', placeholder: 'Filter tools…', 'aria-label': 'Filter tools', oninput: e => { query = e.target.value.trim(); fill(); } });
  const sort = h('select', { 'aria-label': 'Sort tools', onchange: e => { order = e.target.value; fill(); } },
    h('option', { value: favorites ? 'az' : 'recent' }, favorites ? 'Name: A–Z' : 'Most recent'),
    h('option', { value: 'cat' }, 'Category'),
    h('option', { value: favorites ? 'recent' : 'az' }, favorites ? 'Most recent' : 'Name: A–Z'));
  fill();
  document.title = title + ' · DevTools';
  main.replaceChildren(h('div', { class: 'home collection' },
    h('header', { class: 'page-intro' }, h('h1', {}, title), h('p', { class: 'lead' }, description)),
    h('div', { class: 'collection-tools' }, search, h('label', {}, 'Sort', sort)),
    body));
}

function renderTool(t) {
  document.title = t.name + ' · DevTools';
  recent = [t.id, ...recent.filter(x => x !== t.id)].slice(0, 8);
  store.set('recent', recent);
  const cat = catOf(t.cat);
  const body = h('div', { class: 'tool-body' });
  const linkBtn = h('button', { class: 'iconbtn', type: 'button', title: 'Copy link to this tool', 'aria-label': 'Copy link to this tool', onclick: () => copy(location.href, 'Link copied') }, icon('link'));
  main.replaceChildren(h('article', { class: 'tool', 'data-cat': t.cat },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, h('a', { href: '#', onclick: e => goHome(e) }, 'All tools'), icon('chevron'),
      h('a', { href: '#', onclick: e => goHome(e, cat.id) }, cat.name)),
    h('header', { class: 'tool-h' },
      badge(t, 'big'),
      h('div', { class: 'tool-t' }, h('h1', {}, t.name), h('p', { class: 'muted' }, t.desc)),
      h('div', { class: 'tool-a' }, starBtn(t.id, 'iconbtn'), linkBtn)),
    body,
    h('p', { class: 'privacy' }, icon('lock'), h('span', {}, t.privacy || 'This tool runs entirely in your browser. Your input is never sent anywhere.'))));
  cleanup = mountTool(t, body, memory);
}

function renderMissing(id) {
  document.title = 'Not found · DevTools';
  const hits = search(id.replace(/[-_]/g, ' ')).slice(0, 6);
  main.replaceChildren(h('div', { class: 'home' }, h('div', { class: 'empty-state big' }, icon('search'), h('h1', {}, 'This tool does not exist'),
    h('p', { class: 'muted' }, 'There is no tool called “' + id + '”. Check the link or search below.')),
  hits.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, 'Did you mean…')), grid(hits)) : '', h('p', {}, h('a', { class: 'btn', href: '#' }, icon('home'), 'Back to all tools'))));
}

function renderTopCrumbs(id) {
  const tool = byId.get(id);
  let items;
  if (tool) {
    const category = catOf(tool.cat);
    items = [['All tools', '#all'], [category.name, '#category/' + category.id], [tool.name]];
  } else if (id.startsWith('category/') && catOf(id.slice(9))) {
    const category = catOf(id.slice(9));
    items = [['All tools', '#all'], [category.name]];
  } else if (id === 'all') items = [['All tools']];
  else if (id === 'favorites') items = [['Favorites']];
  else if (id === 'recent') items = [['Recently used']];
  else if (id) items = [['Not found']];
  else items = [['Overview']];
  topCrumbs.replaceChildren(...items.flatMap(([label, href], i) => [
    ...(i ? [icon('chevron', 'top-crumb-sep')] : []),
    href ? h('a', { href }, label) : h('span', { 'aria-current': 'page' }, label),
  ]));
}

function route() {
  if (palette.open) palette.close();
  if (cleanup) { cleanup(); cleanup = null; }
  const id = decodeURIComponent(location.hash.slice(1));
  document.body.classList.toggle('is-home', !id);
  if (!id) renderHome();
  else if (byId.has(id)) renderTool(byId.get(id));
  else if (id === 'all') { catFilter = ''; store.set('filter', ''); renderDirectory(); }
  else if (id === 'favorites' || id === 'recent') renderCollection(id);
  else if (id.startsWith('category/') && catOf(id.slice(9))) renderDirectory(id.slice(9));
  else renderMissing(id);
  renderTopCrumbs(id);
  renderSide();
  window.scrollTo(0, 0);
  if (id) main.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
// The skip link must not change the hash (and therefore the route).
document.querySelector('.skip').addEventListener('click', e => { e.preventDefault(); main.focus(); });
route();
