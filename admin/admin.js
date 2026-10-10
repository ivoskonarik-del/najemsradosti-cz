/* =====================================================================
   Administrace najemsradosti.cz (Nájem s radostí)
   Články jsou v repozitáři (_data/posts.json). Uložení = jeden commit přes
   webhunter-admin (Cloudflare Worker), GitHub Action web přegeneruje (_build/build.py).
   Návštěvnost: webhunter-admin /api/najemsradosti/stats (bez cookies, viz /stats.js).
   Vzor: administrace tomasveigl.cz.
   ===================================================================== */
'use strict';
(() => {
const CFG = {
  id: 'najemsradosti', repo: 'ivoskonarik-del/najemsradosti-cz', site: '/',
  api: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === '8787' ? 'http://localhost:8787' : 'https://webhunter-admin.webhunter.workers.dev',
};
const FILES = { posts: '_data/posts.json' };
const LABEL = { posts: 'Články' };
const AUTHOR = 'Mgr. Tomáš Veigl';
const SITE_IMAGES = ['hero-byt-kuchyn', 'interier-obyvak', 'interier-pokoj', 'interier-svetly-obyvak', 'najemni-smlouva', 'opravy-udrzba', 'prezentace-nemovitosti', 'prohlidka-zajemcu'].map((n) => `images/${n}.jpg`);
const NOSTAT = 'nsr_nemerit';   // stejný klíč čte /stats.js (administrace běží na stejné doméně jako web)

const S = { sess: null, D: {}, snap: {}, pending: {}, preview: {}, def: false, saving: false, pub: { state: 'off', text: '' }, stats: {}, metric: 'visits', days: 30 };
const BLOB2PATH = {};

const LOGO = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect width="44" height="44" rx="10" fill="#0F525A"></rect><path d="M10 21.5 22 11.5l12 10" stroke="#73C7D2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12.5 23.2v9.3h19v-9.3" stroke="#73C7D2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"></path><path d="M12.5 28.6h2.6l1.5-4.4 2.1 8.3 2.2-11 2.1 11 1.7-6.1 1.3 2.2h5.5" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const brand = (sub) => `<span class="brand">${LOGO}<span><b>Nájem s radostí</b><small>${sub}</small></span></span>`;

/* ------------------------------------------------------------ icons */
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const IC = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  dash: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  building: I('<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-5h6v5"/><path d="M10 11h4"/>'),
  pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  star: I('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  starF: I('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>'),
  text: I('<path d="M4 6h16M4 12h10M4 18h14"/>'),
  phone: I('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  ext: I('<path d="M14 4h6v6"/><path d="M20 4L10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  drag: I('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  eye: I('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: I('<path d="M17.9 17.9A10.5 10.5 0 0 1 12 19c-7 0-11-7-11-7a18.7 18.7 0 0 1 5.1-5.9M9.9 5.2A9.9 9.9 0 0 1 12 5c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/>'),
  trash: I('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
  copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  up: I('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  down: I('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  x: I('<path d="M18 6L6 18M6 6l12 12"/>', 'stroke-width="2.4"'),
  upload: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  check: I('<path d="M20 6L9 17l-5-5"/>'),
  alert: I('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h0"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  menu: I('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  chev: I('<path d="M6 9l6 6 6-6"/>'),
  lock: I('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  download: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  quote: I('<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 3-2 5-4 5z"/><path d="M14 21c3 0 7-1 7-8V5h-7v7h4c0 3-2 5-4 5z"/>'),
};

/* ------------------------------------------------------------ utils */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const today = () => new Date().toISOString().slice(0, 10);
const czDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : (d || ''); };
const ago = (iso) => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'právě teď'; if (s < 3600) return `před ${Math.round(s / 60)} min`; if (s < 86400) return `před ${Math.round(s / 3600)} h`; return czDate(iso); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const move = (arr, from, to) => { if (to < 0 || to >= arr.length || from === to) return; arr.splice(to, 0, arr.splice(from, 1)[0]); };
const src = (p) => !p ? '' : (S.preview[String(p).replace(/^\//, '')] || (/^(https?:|data:|blob:)/.test(p) ? p : CFG.site + String(p).replace(/^\//, '')));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 8);

function toast(title, sub = '', type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, type === 'err' ? 7000 : 4200);
}

function modal({ title, body, actions = [], wide = false, onMount }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Zavřít">${IC.x}</button></div>
      <div class="modal-b">${body}</div>${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-ghost'}" data-a="${i}">${a.label}</button>`).join('')}</div>` : ''}</div>`;
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    bg.addEventListener('click', (e) => {
      if (e.target === bg || e.target.closest('[data-close]')) return close(null);
      const b = e.target.closest('[data-a]');
      if (b) { const a = actions[+b.dataset.a]; const v = a.value !== undefined ? a.value : (a.get ? a.get(bg) : true); if (v === false) return; close(v); }
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(bg);
    if (onMount) onMount(bg, close);
    const f = bg.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 50);
  });
}
const confirmDlg = (title, text, ok = 'Smazat', cls = 'btn-danger') => modal({ title, body: `<p>${text}</p>`, actions: [{ label: 'Zrušit', value: false }, { label: ok, cls, value: true }] }).then((v) => v === true);

/* ------------------------------------------------------------ server (WebHunter admin API) */
const b64e = (bytes) => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (str) => b64e(new TextEncoder().encode(str));
function saveSess() { localStorage.setItem('nsr_sess_' + CFG.id, JSON.stringify({ t: S.sess, def: S.def, exp: Date.now() + 11.5 * 3600e3 })); }
async function api(path, opt = {}, retried = false) {
  const headers = { ...(opt.body && typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) };
  if (S.sess) headers.Authorization = 'Bearer ' + S.sess;
  let r;
  try { r = await fetch(`${CFG.api}/api/${CFG.id}${path}`, { ...opt, headers, cache: 'no-store' }); }
  catch { throw new Error('Nelze se spojit se serverem administrace. Zkontrolujte připojení k internetu.'); }
  if (r.status === 401 && path !== '/login' && !retried && S.D.posts) {
    if (await reauth()) return api(path, opt, true);   // přihlášení vypršelo uprostřed práce — neztratit rozdělanou práci
  }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
  return opt.raw ? r.text() : r.json();
}
const readFile = (path) => api('/file?path=' + encodeURIComponent(path) + '&t=' + Date.now(), { raw: true });
async function commit(files, message) {
  // 1) každý soubor nahrát jako blob (tělo jde na GitHub beze změny), 2) jeden commit se všemi soubory
  const out = []; const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const { sha } = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.b64 ?? utf8b64(f.content), encoding: 'base64' }) });
      out.push({ path: f.path, sha });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return (await api('/commit', { method: 'POST', body: JSON.stringify({ files: out, message }) })).sha;
}

/* ------------------------------------------------------------ publish watcher */
let pubTimer = null;
function setPub(state, text) { S.pub = { state, text }; const el = $('.pub'); if (el) { el.className = 'pub ' + state; el.innerHTML = `<i></i><span>${esc(text)}</span>`; } }
function watchPublish(sha) {
  localStorage.setItem('nsr_pub', JSON.stringify({ sha, t: Date.now() }));
  clearInterval(pubTimer);
  setPub('busy', 'Zveřejňuji změny…');
  const started = Date.now();
  pubTimer = setInterval(async () => {
    try {
      const v = await fetch(CFG.site + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      if (v.sha === sha) { clearInterval(pubTimer); localStorage.removeItem('nsr_pub'); setPub('', 'Web je aktuální'); toast('Změny jsou na webu', 'Web byl právě aktualizován.', 'ok'); return; }
    } catch {}
    if (Date.now() - started > 8 * 60000) { clearInterval(pubTimer); setPub('warn', 'Zveřejnění trvá déle'); }
  }, 6000);
}
function initPub() {
  const p = JSON.parse(localStorage.getItem('nsr_pub') || 'null');
  if (p && Date.now() - p.t < 10 * 60000) watchPublish(p.sha); else setPub('', 'Web je aktuální');
}

/* ------------------------------------------------------------ images */
async function compress(file, max = 1800) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`Soubor „${file.name}“ nejde načíst. Použijte JPG, PNG nebo WebP.`); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82)), ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86)); ext = 'jpg'; }
  return { blob, ext };
}
async function upload(file, hint = '') {
  const { blob, ext } = await compress(file);
  const d = new Date();
  const name = (slugify(hint) || slugify(file.name.replace(/\.[^.]+$/, '')) || 'foto').slice(0, 40);
  const path = `img/uploads/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${name}-${uid()}.${ext}`;
  const buf = await blob.arrayBuffer();
  S.pending[path] = b64e(buf);
  S.preview[path] = URL.createObjectURL(blob); BLOB2PATH[S.preview[path]] = path;
  return path;
}
async function uploadMany(files, hint) {
  const out = [];
  for (const f of files) {
    if (!f.type.startsWith('image/') && !/\.(heic|jpe?g|png|webp)$/i.test(f.name)) continue;
    try { out.push(await upload(f, hint)); } catch (e) { toast('Obrázek se nepodařilo načíst', e.message, 'err'); }
  }
  return out;
}
function allImages() {
  const set = new Set([...Object.keys(S.pending), ...SITE_IMAGES]);
  const re = /(?:img|images)\/[A-Za-z0-9_\-/.]+\.(?:webp|png|jpe?g)/g;
  (JSON.stringify(S.D).match(re) || []).forEach((p) => set.add(p));
  return [...set];
}
function pickFromLibrary() {
  const imgs = allImages();
  return modal({
    title: 'Knihovna obrázků', wide: true,
    body: `<div class="toolbar"><div class="search">${IC.search}<input type="search" placeholder="Hledat podle názvu souboru…" data-q></div><span class="muted">${imgs.length} obrázků na webu</span></div><div class="lib">${imgs.map((p) => `<button data-p="${esc(p)}" title="${esc(p)}"><img src="${esc(src(p))}" loading="lazy" alt=""></button>`).join('')}</div>`,
    onMount: (bg, close) => {
      bg.querySelector('.lib').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) close(b.dataset.p); });
      bg.querySelector('[data-q]').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('.lib button', bg).forEach((b) => { b.style.display = b.dataset.p.toLowerCase().includes(q) ? '' : 'none'; }); });
    },
  });
}

/* image picker (single) — registry of getters/setters per render */
let IP = [];
function imgPick(get, set, opts = {}) {
  const id = IP.push({ get, set, opts }) - 1;
  const v = get();
  return `<div class="img-pick" data-ip="${id}"><div class="pv">${v ? `<img src="${esc(src(v))}" alt="">` : 'Bez obrázku'}</div>
    <div><div class="bts"><button type="button" class="btn btn-ghost btn-sm" data-ipa="up">${IC.upload} Nahrát</button><button type="button" class="btn btn-ghost btn-sm" data-ipa="lib">${IC.image} Z knihovny</button>${v && !opts.required ? `<button type="button" class="btn btn-ghost btn-sm" data-ipa="rm">Odebrat</button>` : ''}</div>
    ${v ? `<div class="path">${esc(v)}</div>` : ''}</div><input type="file" accept="image/*" hidden></div>`;
}
function bindIP(root) {
  $$('.img-pick', root).forEach((el) => {
    const r = IP[+el.dataset.ip]; if (!r) return;
    const refresh = () => { IP[+el.dataset.ip] = r; const tmp = document.createElement('div'); tmp.innerHTML = imgPick(r.get, r.set, r.opts); const n = tmp.firstElementChild; el.replaceWith(n); bindIP(n.parentElement); r.opts.onChange?.(); };
    const file = el.querySelector('input[type=file]');
    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-ipa]')?.dataset.ipa; if (!a) return;
      if (a === 'up') file.click();
      if (a === 'lib') { const p = await pickFromLibrary(); if (p) { r.set(p); changed(); refresh(); } }
      if (a === 'rm') { r.set(''); changed(); refresh(); }
    });
    file.addEventListener('change', async () => { const [p] = await uploadMany([...file.files], r.opts.hint); if (p) { r.set(p); changed(); refresh(); } });
  });
}


/* ------------------------------------------------------------ re-login without losing work */
let reauthP = null;
function reauth() {
  if (reauthP) return reauthP;
  reauthP = modal({
    title: 'Přihlaste se prosím znovu',
    body: `<p>Z bezpečnostních důvodů vypršelo přihlášení. Vaše rozpracované změny zůstávají — po přihlášení se uloží.</p><div class="f" style="margin-top:1rem"><label>Heslo</label><input type="password" data-rpw autocomplete="current-password"></div><p class="hint" data-rerr style="color:var(--danger)"></p>`,
    actions: [{ label: 'Zrušit', value: false }, { label: 'Přihlásit', cls: 'btn-primary', get: (bg) => ({ pw: bg.querySelector('[data-rpw]').value }) }],
    onMount: (bg) => bg.querySelector('[data-rpw]').addEventListener('keydown', (e) => { if (e.key === 'Enter') bg.querySelector('[data-a="1"]').click(); }),
  }).then(async (v) => {
    if (!v) return false;
    try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: v.pw }) }); S.sess = r.token; S.def = r.def; saveSess(); return true; }
    catch (e) { toast('Přihlášení se nepovedlo', e.message, 'err'); return false; }
  }).finally(() => { reauthP = null; });
  return reauthP;
}
IC.chart = I('<path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16V8"/><path d="M17 16v-7"/>');
IC.refresh = I('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>');

/* ------------------------------------------------------------ data + dirty state */
async function loadAll() {
  S.D.posts = JSON.parse(await readFile(FILES.posts));
  snapshot();
}
function snapshot(keys = Object.keys(FILES)) { keys.forEach((k) => { S.snap[k] = JSON.stringify(S.D[k]); }); }
const dirtyKeys = () => Object.keys(FILES).filter((k) => JSON.stringify(S.D[k]) !== S.snap[k]);
const changed = debounce(() => updateSavebar(), 120);
function discard() { dirtyKeys().forEach((k) => { S.D[k] = JSON.parse(S.snap[k]); }); updateSavebar(); route(); toast('Změny zahozeny'); }
window.addEventListener('beforeunload', (e) => { if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; } });

function validate() {
  const ps = new Set();
  for (const p of S.D.posts) {
    if (!p.title?.trim()) return 'Článek bez nadpisu — doplňte nadpis, nebo článek smažte.';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug || '')) return `Článek „${p.title}“ má neplatnou adresu (URL). Použijte malá písmena, čísla a pomlčky.`;
    if (ps.has(p.slug)) return `Dva články mají stejnou adresu „${p.slug}“.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) return `Článek „${p.title}“ nemá vyplněné datum.`;
    if (/src="blob:/.test(p.body || '')) return `V článku „${p.title}“ je obrázek, který se nenahrál. Vložte ho prosím znovu.`;
    ps.add(p.slug);
  }
  return null;
}

async function saveAll() {
  const keys = dirtyKeys();
  if (!keys.length || S.saving) return;
  const err = validate(); if (err) return toast('Nelze uložit', err, 'err');
  S.saving = true; updateSavebar();
  const bar = document.createElement('div'); bar.className = 'progress-line'; document.body.appendChild(bar);
  try {
    const files = keys.map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 1) + '\n' }));
    const used = JSON.stringify(S.D);
    const imgs = Object.keys(S.pending).filter((p) => used.includes(p));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, keys.map((k) => LABEL[k]).join(', ') + (imgs.length ? ` (+${imgs.length} ${imgs.length === 1 ? 'obrázek' : imgs.length < 5 ? 'obrázky' : 'obrázků'})` : ''));
    imgs.forEach((p) => delete S.pending[p]);
    snapshot(keys);
    toast('Uloženo', 'Změny se na webu objeví přibližně za minutu.', 'ok');
    watchPublish(sha);
  } catch (e) {
    toast('Uložení se nepovedlo', e.message, 'err');
  } finally { S.saving = false; bar.remove(); updateSavebar(); }
}

/* ------------------------------------------------------------ text článku (Quill) */
let quillP = null;
function loadQuill() {
  if (quillP) return quillP;
  quillP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js';
    s.onload = () => {
      const Quill = window.Quill, Img = Quill.import('formats/image');
      // náhled nově nahraných obrázků je blob: — Quill ho jinak zahodí
      class Image2 extends Img { static sanitize(url) { return /^(https?:|blob:|data:|\/)/.test(url) ? url : '//:0'; } }
      Quill.register(Image2, true);
      res(Quill);
    };
    s.onerror = () => { quillP = null; rej(new Error('Editor textu se nepodařilo načíst. Zkontrolujte připojení k internetu.')); };
    document.head.appendChild(s);
  });
  return quillP;
}
// v datech: src="/img/uploads/…"; v editoru: dosud neuložené obrázky jako blob: náhled
const toEditor = (h) => String(h || '').replace(/src="\/?((?:img|images)\/[^"]+)"/g, (m, p) => `src="${S.preview[p] || '/' + p}"`);
const fromEditor = (h) => h.replace(/src="(blob:[^"]+)"/g, (m, u) => (BLOB2PATH[u] ? `src="/${BLOB2PATH[u]}"` : m))
  .replace(/src="https?:\/\/(?:www\.)?najemsradosti\.cz\//g, 'src="/');
async function mountRTE(el, html, onChange, hint) {
  el.innerHTML = '<div class="rte-loading"><span class="spin"></span> Načítám editor textu…</div>';
  try {
    const Quill = await loadQuill();
    if (!el.isConnected) return;
    el.innerHTML = '<div class="rte"><div class="q"></div></div>';
    const q = new Quill(el.querySelector('.q'), {
      theme: 'snow', placeholder: 'Napište článek… Nadpisy, odrážky, odkazy a obrázky nastavíte v liště nahoře.',
      modules: { toolbar: { container: [[{ header: [2, 3, false] }], ['bold', 'italic'], [{ list: 'bullet' }, { list: 'ordered' }], ['blockquote', 'link', 'image'], ['clean']],
        handlers: { image() {
          const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = async () => {
            const [p] = await uploadMany([...inp.files], hint()); if (!p) return;
            const r = q.getSelection(true); q.insertEmbed(r.index, 'image', S.preview[p], 'user'); q.setSelection(r.index + 1, 0, 'silent');
            toast('Obrázek vložen', 'Uloží se spolu s článkem.');
          };
          inp.click();
        } } } },
    });
    q.clipboard.dangerouslyPasteHTML(toEditor(html), 'silent'); q.history.clear();
    const tips = { 'ql-bold': 'Tučně', 'ql-italic': 'Kurzíva', 'ql-blockquote': 'Zvýrazněný blok (rámeček s textem)', 'ql-link': 'Odkaz', 'ql-image': 'Vložit obrázek', 'ql-clean': 'Odstranit formátování', 'ql-header': 'Nadpis' };
    Object.entries(tips).forEach(([c, t]) => $$('.' + c, el).forEach((b) => b.setAttribute('title', t)));
    $$('.ql-list[value=bullet]', el).forEach((b) => b.setAttribute('title', 'Odrážky'));
    $$('.ql-list[value=ordered]', el).forEach((b) => b.setAttribute('title', 'Číslovaný seznam'));
    const tb = q.theme.tooltip?.textbox; if (tb) tb.dataset.link = 'https://…';
    q.on('text-change', debounce(() => { let h = fromEditor(q.getSemanticHTML().replace(/&nbsp;/g, ' ')); if (/^<p>(<br>)?<\/p>$/.test(h) || (!q.getText().trim() && !/<img/.test(h))) h = ''; onChange(h); }, 250));
  } catch (e) { el.innerHTML = `<div class="banner err">${IC.alert}<span><b>Editor se nenačetl</b>${esc(e.message)}</span></div>`; }
}

/* ------------------------------------------------------------ LOGIN */
const PULSE = `<svg class="pulse" viewBox="0 0 1440 240" preserveAspectRatio="none" style="width:100%;height:200px" fill="none" aria-hidden="true"><path d="M0 120h120l40-70 34 150 44-200 40 180 34-110 30 70 26-40h180l40-60 34 130 44-180 40 160 34-100 30 62 26-36h180l40-54 34 118 44-166 40 146 34-92 30 56 26-32h240" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
function renderLogin(msg = '') {
  document.title = 'Přihlášení — Administrace najemsradosti.cz';
  $('#app').innerHTML = `<div class="login">
    <div class="login-art">${PULSE}
      ${brand('Administrace webu')}
      <div><h1>Vítejte v <em>administraci</em></h1><p>Tady přidáváte a upravujete články v Novinkách a sledujete návštěvnost webu. Změny se na webu objeví zhruba do minuty.</p></div>
      <div class="foot"><span>najemsradosti.cz · Mgr. Tomáš Veigl</span></div></div>
    <div class="login-form"><form novalidate>
      <h2>Přihlášení</h2><p class="sub">Zadejte heslo do administrace.</p>
      <div class="f"><label for="pw">Heslo</label><div class="pw-wrap"><input type="password" id="pw" autocomplete="current-password" required><button type="button" data-show>Zobrazit</button></div></div>
      <button class="btn btn-primary btn-lg" style="width:100%;margin-top:1.2rem" type="submit">Přihlásit se</button>
      <p class="err">${esc(msg)}</p>
      <a class="back" href="/">← Zpět na web</a>
    </form></div></div>`;
  const form = $('form'), pw = $('#pw');
  $('[data-show]').addEventListener('click', (e) => { pw.type = pw.type === 'password' ? 'text' : 'password'; e.target.textContent = pw.type === 'password' ? 'Zobrazit' : 'Skrýt'; });
  pw.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = form.querySelector('[type=submit]'); b.disabled = true; b.innerHTML = '<span class="spin" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></span> Ověřuji…';
    try {
      const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw.value }) });
      S.sess = r.token; S.def = r.def; saveSess();
      await boot();
    } catch (err) {
      $('.err').textContent = err.status === 401 ? 'Nesprávné heslo. Zkuste to znovu.' : err.message;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); pw.select();
    }
    finally { b.disabled = false; b.textContent = 'Přihlásit se'; }
  });
}
function logout() {
  if (dirtyKeys().length && !confirm('Máte neuložené změny. Opravdu se odhlásit a zahodit je?')) return;
  localStorage.removeItem('nsr_sess_' + CFG.id); S.sess = null; S.snap = {}; S.D = {}; location.hash = ''; renderLogin();
}

/* ------------------------------------------------------------ SHELL */
function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <a href="#/">${brand('Administrace webu')}</a>
      <nav>
        <a class="item" href="#/" data-nav="dash">${IC.dash}Přehled</a>
        <div class="grp">Obsah</div>
        <a class="item" href="#/clanky" data-nav="clanky">${IC.pen}Články<span class="count" data-count="posts"></span></a>
        <div class="grp">Web</div>
        <a class="item" href="#/navstevnost" data-nav="navstevnost">${IC.chart}Návštěvnost</a>
        <a class="item" href="#/nastaveni" data-nav="nastaveni">${IC.gear}Nastavení</a>
      </nav>
      <div class="foot">
        <div class="pub"><i></i><span></span></div>
        <a class="item" href="/" target="_blank" rel="noopener" style="display:flex;gap:.75rem;align-items:center;padding:.55rem .75rem;border-radius:9px;color:#C9D3E0;font-size:.88rem">${IC.ext.replace('<svg', '<svg width="17" height="17"')}Otevřít web</a>
        <div class="me"><img src="/images/tym-tomas-veigl.jpg" alt=""><span><b>Tomáš Veigl</b><small>Správce webu</small></span><button data-logout title="Odhlásit">${IC.logout.replace('<svg', '<svg width="17" height="17"')}</button></div>
      </div>
    </aside>
    <div class="main">
      <header class="top"><button class="burger" aria-label="Menu">${IC.menu.replace('<svg', '<svg width="20" height="20"')}</button><div class="crumb"></div><div class="actions"></div></header>
      <div class="page" id="page"></div>
    </div>
  </div>
  <div class="savebar"><span class="txt"></span><button class="btn btn-ghost btn-sm" data-discard>Zahodit</button><button class="btn btn-teal" data-save>${IC.check} Uložit a zveřejnit</button></div>`;
  $('[data-logout]').addEventListener('click', logout);
  $('[data-save]').addEventListener('click', saveAll);
  $('[data-discard]').addEventListener('click', async () => { if (await confirmDlg('Zahodit změny?', 'Všechny neuložené změny se ztratí.', 'Zahodit')) discard(); });
  const side = $('.side');
  $('.burger').addEventListener('click', () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; document.body.appendChild(s); });
  side.addEventListener('click', (e) => { if (e.target.closest('a') && side.classList.contains('open')) { side.classList.remove('open'); $('.scrim')?.remove(); } });
  window.addEventListener('scroll', () => $('.top')?.classList.toggle('scrolled', scrollY > 8), { passive: true });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveAll(); } });
  initPub();
}
function updateNav(key) {
  $$('.side [data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === key));
  $$('.side [data-count]').forEach((el) => { el.textContent = S.D.posts.length; });
}
function updateSavebar() {
  const bar = $('.savebar'); if (!bar) return;
  const keys = dirtyKeys();
  const imgs = Object.keys(S.pending).filter((p) => JSON.stringify(S.D).includes(p)).length;
  bar.classList.toggle('show', keys.length > 0 || S.saving);
  bar.querySelector('.txt').innerHTML = S.saving ? '<b>Ukládám…</b><small>Nahrávám změny na web</small>' : `<b>Neuložené změny</b><small>${keys.map((k) => LABEL[k]).join(', ')}${imgs ? ` · ${imgs} ${imgs === 1 ? 'nový obrázek' : imgs < 5 ? 'nové obrázky' : 'nových obrázků'}` : ''}</small>`;
  bar.querySelector('[data-save]').disabled = S.saving;
  bar.querySelector('[data-discard]').disabled = S.saving;
  updateNav($('.side [data-nav].on')?.dataset.nav);
}
function setTop(crumbs, actions = '') {
  $('.crumb').innerHTML = crumbs.map((c, i) => i < crumbs.length - 1 && c[1] ? `<a href="${c[1]}">${esc(c[0])}</a><span>/</span>` : `<span>${esc(c[0])}</span>`).join('');
  $('.top .actions').innerHTML = actions;
  document.title = crumbs[crumbs.length - 1][0] + ' — Administrace';
}
const page = () => $('#page');

/* ------------------------------------------------------------ router */
const ROUTES = [[/^\/?$/, viewDash], [/^\/clanky$/, viewPosts], [/^\/clanek\/(.+)$/, viewPost], [/^\/navstevnost$/, viewStats], [/^\/nastaveni$/, viewSettings]];
const FRESH = new Set();
function route() {
  if (!S.D.posts) return;
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  IP = [];
  const old = $('#page'); if (old) { const n = document.createElement('div'); n.className = 'page'; n.id = 'page'; old.replaceWith(n); }
  for (const it of FRESH) {   // nový nedotčený článek po odchodu z editoru zahodit
    const cur = h.endsWith('/' + it.slug);
    if (!cur && !it.title && !it.body && !it.image && !it.excerpt) { const i = S.D.posts.indexOf(it); if (i > -1) S.D.posts.splice(i, 1); FRESH.delete(it); }
    else if (!cur) FRESH.delete(it);
  }
  for (const [re, fn] of ROUTES) { const m = h.match(re); if (m) { window.scrollTo(0, 0); fn(...m.slice(1)); updateSavebar(); return; } }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ------------------------------------------------------------ helpers */
const nf = new Intl.NumberFormat('cs-CZ');
const num = (n) => nf.format(n || 0);
const plural = (n, a, b, c) => (n === 1 ? a : n > 1 && n < 5 ? b : c);
const sortedPosts = () => [...S.D.posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const postUrl = (p) => `/novinky/${p.slug}/`;
async function loadStats(days, force = false) {
  const k = String(days);
  if (!force && S.stats[k] && Date.now() - S.stats[k].t < 60e3) return S.stats[k].d;
  const d = await api('/stats?days=' + days + '&t=' + Date.now());
  S.stats[k] = { t: Date.now(), d };
  return d;
}

/* ------------------------------------------------------------ DASHBOARD */
function viewDash() {
  updateNav('dash');
  setTop([['Přehled']], `<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${IC.ext} Otevřít web</a>`);
  const P = sortedPosts();
  const h = new Date().getHours();
  const hi = h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer';
  page().innerHTML = `
    ${S.def ? `<div class="banner warn">${IC.lock}<span><b>Používáte výchozí heslo „admin“</b>Z bezpečnostních důvodů si ho prosím hned změňte.</span><a class="btn btn-primary btn-sm" href="#/nastaveni">Změnit heslo</a></div>` : ''}
    <section class="welcome">
      <div><h2>${hi}, <em>Tomáši</em>.</h2><p>Na webu Nájem s radostí máte ${P.filter((p) => !p.hidden).length} ${plural(P.length, 'článek', 'články', 'článků')} v Novinkách. Nový článek se po uložení sám objeví na úvodní stránce i ve výpisu novinek.</p>
        <div class="acts"><a class="btn btn-teal" href="#/clanek/new">${IC.plus} Napsat článek</a><a class="btn btn-ghost" href="#/navstevnost">${IC.chart} Návštěvnost</a><a class="btn btn-ghost" href="/" target="_blank" rel="noopener">${IC.ext} Zobrazit web</a></div></div>
      <div class="avatar"><img src="/images/tym-tomas-veigl.jpg" alt=""></div></section>
    <div class="kpis" data-kpis>${['Návštěvy za 30 dní', 'Zobrazení stránek', 'Dnes', 'Právě na webu'].map((t) => `<div class="card kpi"><small>${t}</small><b>–</b><span class="ch">načítám…</span></div>`).join('')}</div>
    <div class="dash-grid">
      <div class="card"><div class="card-head"><h3>Poslední články</h3><a class="btn btn-ghost btn-sm" href="#/clanky">Všechny</a></div>
        <ul class="recent">${P.slice(0, 6).map((p) => `<li><img src="${esc(src(p.image))}" alt="" loading="lazy"><span class="t"><b><a href="#/clanek/${esc(p.slug)}">${esc(p.title || 'Bez nadpisu')}</a></b><small>${czDate(p.date)}${p.hidden ? ' · skrytý' : ''}</small></span></li>`).join('') || '<li class="muted">Zatím žádné články.</li>'}</ul>
      </div>
      <div class="card"><div class="card-head"><h3>Nejčtenější stránky <small>30 dní</small></h3><a class="btn btn-ghost btn-sm" href="#/navstevnost">Podrobně</a></div><div data-top><p class="card-pad muted">Načítám…</p></div></div>
    </div>`;
  loadStats(30).then((d) => {
    const today = d.daily[d.daily.length - 1] || { visits: 0, views: 0 };
    const k = $$('[data-kpis] .kpi'); if (!k.length) return;
    const set = (i, v, ch, cls = '') => { k[i].querySelector('b').innerHTML = v; const c = k[i].querySelector('.ch'); c.textContent = ch; c.className = 'ch ' + cls; };
    set(0, num(d.totals.visits), changeTxt(d.totals.visits, d.prev.visits).t, changeTxt(d.totals.visits, d.prev.visits).c);
    set(1, num(d.totals.views), changeTxt(d.totals.views, d.prev.views).t, changeTxt(d.totals.views, d.prev.views).c);
    set(2, num(today.visits), `${num(today.views)} ${plural(today.views, 'zobrazení', 'zobrazení', 'zobrazení')} stránek`);
    set(3, `<span class="live"><i></i>${num(d.live)}</span>`, 'za posledních 30 minut');
    $('[data-top]').innerHTML = d.pages.length ? pagesTable(d.pages.slice(0, 6), d.totals.views) : `<p class="card-pad muted">Zatím žádná data${d.since ? '' : ' — měření běží od spuštění administrace'}.</p>`;
  }).catch((e) => { const t = $('[data-top]'); if (t) t.innerHTML = `<p class="card-pad muted">Návštěvnost se nepodařilo načíst: ${esc(e.message)}</p>`; $$('[data-kpis] .ch').forEach((c) => { c.textContent = ''; }); });
}
function changeTxt(cur, prev) {
  if (!prev) return { t: cur ? 'nové období měření' : '', c: '' };
  const p = Math.round((cur - prev) / prev * 100);
  return { t: `${p > 0 ? '+' : ''}${p} % proti předchozímu období`, c: p > 0 ? 'up' : p < 0 ? 'down' : '' };
}

/* ------------------------------------------------------------ POSTS */
function viewPosts() {
  updateNav('clanky');
  setTop([['Články']], `<a class="btn btn-primary" href="#/clanek/new">${IC.plus} Napsat článek</a>`);
  page().innerHTML = `<div class="page-head"><div><h1>Články</h1><p>Články se v Novinkách řadí podle data — nejnovější je nahoře ve výpisu a první tři jsou i na úvodní stránce.</p></div></div>
    <div class="post-grid">
      <a class="card pc" href="#/clanek/new" style="border:1.5px dashed #C3D3D5;box-shadow:none;background:transparent;display:grid;place-items:center;min-height:260px;text-align:center;color:var(--muted)"><span>${IC.plus.replace('<svg', '<svg width="30" height="30"')}<br><b style="font-family:var(--serif);font-weight:600;font-size:1.4rem;color:var(--text)">Nový článek</b></span></a>
      ${sortedPosts().map((p) => `<a class="card pc" href="#/clanek/${esc(p.slug)}"${p.hidden ? ' style="opacity:.55"' : ''}><div class="img">${p.image ? `<img src="${esc(src(p.image))}" alt="" loading="lazy">` : ''}</div><div class="b"><small><span>${czDate(p.date)}</span>${p.hidden ? '<span class="st st-hidden">Skryto</span>' : ''}</small><b>${esc(p.title || 'Bez nadpisu')}</b></div></a>`).join('')}
    </div>`;
}
function uniqueSlug(base, self, list) {
  let s = base || 'clanek', i = 2;
  while (list.some((x) => x !== self && x.slug === s)) s = `${base}-${i++}`;
  return s;
}
function viewPost(slug) {
  updateNav('clanky');
  const P = S.D.posts;
  if (slug === 'new') {
    const p = { slug: '', title: '', date: today(), excerpt: '', image: '', imageAlt: '', category: 'Reality', author: AUTHOR, body: '', hidden: false };
    p.slug = uniqueSlug('novy-clanek', p, P); p._new = true; P.unshift(p); FRESH.add(p); changed();
    history.replaceState(null, '', '#/clanek/' + p.slug);
    return viewPost(p.slug);
  }
  const p = P.find((i) => i.slug === slug);
  if (!p) { page().innerHTML = `<div class="empty"><b>Článek nenalezen</b><a class="btn btn-ghost" href="#/clanky">Zpět na články</a></div>`; return; }
  const isNew = !!p._new; delete p._new;
  const published = !isNew && JSON.parse(S.snap.posts || '[]').some((x) => x.slug === p.slug && !x.hidden);
  let slugTouched = !isNew;
  setTop([['Články', '#/clanky'], [p.title || 'Nový článek']], `${published ? `<a class="btn btn-ghost" href="${postUrl(p)}" target="_blank" rel="noopener">${IC.ext} Na webu</a>` : ''}<button class="btn btn-teal" data-save2>${IC.check} Uložit</button>`);
  page().innerHTML = `<div class="page-head"><div><h1>${isNew ? 'Nový <em>článek</em>' : 'Upravit článek'}</h1></div></div>
    <div class="ed"><div>
      <section class="card sec"><div class="card-pad fgrid">
        <div class="f big full"><label for="p-title">Nadpis článku</label><input type="text" id="p-title" data-f="title" value="${esc(p.title)}" placeholder="Např. Jak vybrat spolehlivého nájemníka"></div>
        <div class="f full"><label for="p-ex">Perex <span class="opt">krátké shrnutí pod nadpisem a na kartičce článku</span></label><textarea id="p-ex" data-f="excerpt" rows="3" placeholder="Jedna až dvě věty, o čem článek je.">${esc(p.excerpt)}</textarea></div>
        <div class="f full"><div class="lab">Text článku</div><div data-rte></div>
          <p class="hint">V liště: nadpis (H2 / H3), tučně, kurzíva, odrážky, číslovaný seznam, zvýrazněný blok (uvozovky), odkaz (označte text a klikněte na řetízek) a obrázek.</p></div>
      </div></section>
    </div>
    <aside class="ed-side">
      <div class="card card-pad" style="display:grid;gap:1rem">
        <div class="f"><div class="lab">Náhledový obrázek</div>${imgPick(() => p.image, (v) => { p.image = v; changed(); }, { hint: p.title, required: false })}<p class="hint">Zobrazí se nahoře v článku a ve výpisu novinek. Ideálně fotka na šířku.</p></div>
        <div class="f"><label for="p-alt">Popis obrázku <span class="opt">pro nevidomé a Google</span></label><input type="text" id="p-alt" data-f="imageAlt" value="${esc(p.imageAlt || '')}" placeholder="Např. Světlý obývací pokoj"></div>
        <div class="f"><label for="p-date">Datum</label><input type="date" id="p-date" data-f="date" value="${esc(p.date)}"></div>
        <div class="f"><label for="p-cat">Štítek</label><input type="text" id="p-cat" data-f="category" value="${esc(p.category || 'Reality')}"></div>
        <div class="f"><label for="p-auth">Autor</label><input type="text" id="p-auth" data-f="author" value="${esc(p.author || AUTHOR)}"></div>
        <div class="f"><label for="p-slug">Adresa (URL)</label><div class="affix"><span>/novinky/</span><input type="text" id="p-slug" data-f="slug" value="${esc(p.slug)}"></div></div>
        <label class="tog" style="justify-content:space-between"><span>Skrýt z webu</span><input type="checkbox" data-hide ${p.hidden ? 'checked' : ''}><span class="sw"></span></label>
      </div>
      <div class="card card-pad" style="display:grid;gap:.6rem">
        <button class="btn btn-primary btn-lg" data-save3>${IC.check} Uložit a zveřejnit</button>
        <button class="btn btn-danger" data-del>${IC.trash} Smazat článek</button>
      </div>
    </aside></div>`;
  const root = page();
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (!f) return;
    if (f === 'slug') { slugTouched = true; p.slug = slugify(e.target.value); }
    else p[f] = e.target.value;
    if (f === 'title' && !slugTouched) { p.slug = uniqueSlug(slugify(p.title) || 'novy-clanek', p, P); $('#p-slug').value = p.slug; }
    changed();
  });
  $('#p-slug').addEventListener('blur', (e) => { p.slug = uniqueSlug(slugify(e.target.value) || 'clanek', p, P); e.target.value = p.slug; history.replaceState(null, '', '#/clanek/' + p.slug); changed(); });
  $('#p-title').addEventListener('blur', () => { if (!slugTouched) history.replaceState(null, '', '#/clanek/' + p.slug); });
  $('[data-hide]', root).addEventListener('change', (e) => { p.hidden = e.target.checked; changed(); });
  mountRTE($('[data-rte]', root), p.body, (h) => { p.body = h; changed(); }, () => p.title);
  bindIP(root);
  $('[data-save2]').addEventListener('click', saveAll); $('[data-save3]', root).addEventListener('click', saveAll);
  $('[data-del]', root).addEventListener('click', async () => {
    if (await confirmDlg('Smazat článek?', `„${esc(p.title || 'Nový článek')}“ po uložení zmizí z webu.`)) { P.splice(P.indexOf(p), 1); FRESH.delete(p); changed(); location.hash = '#/clanky'; toast('Článek smazán', 'Z webu zmizí po kliknutí na „Uložit a zveřejnit“.'); }
  });
  if (isNew) setTimeout(() => $('#p-title')?.focus(), 60);
}

/* ------------------------------------------------------------ NÁVŠTĚVNOST */
const PAGE_NAMES = {
  '/': 'Úvodní stránka', '/sluzby/': 'Služby', '/balicky/': 'Balíčky a ceny', '/jak-to-funguje/': 'Jak to funguje', '/o-nas/': 'O nás',
  '/novinky/': 'Novinky', '/kontakt/': 'Kontakt', '/gdpr/': 'Ochrana osobních údajů',
  '/sluzby/priprava-a-prezentace/': 'Služby · Příprava a prezentace', '/sluzby/prohlidky-a-vyber-najemnika/': 'Služby · Výběr nájemníka',
  '/sluzby/pravni-servis/': 'Služby · Nájemní smlouva', '/sluzby/garance-a-pojisteni/': 'Služby · Garance a pojištění',
  '/sluzby/technicka-sprava/': 'Služby · Opravy a havárie 24/7', '/sluzby/administrativa-a-kontrola/': 'Služby · Kontrola a vyúčtování',
};
function pageName(path) {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const m = path.match(/^\/novinky\/([^/]+)\/$/);
  if (m) { const p = S.D.posts.find((x) => x.slug === m[1]); return p ? 'Článek · ' + p.title : 'Článek (smazaný)'; }
  return path;
}
const SRC_NAMES = { '': 'Přímo (zadaná adresa, záložky, e-mail, aplikace)' };
const DEV_NAMES = { mobil: 'Mobil', pocitac: 'Počítač', tablet: 'Tablet', '': 'Neznámé' };
let regionNames; try { regionNames = new Intl.DisplayNames(['cs'], { type: 'region' }); } catch {}
const country = (cc) => (!cc || cc === 'XX' || cc === 'T1' ? 'Neznámá' : (regionNames?.of(cc) || cc));
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
function pagesTable(rows, total) {
  return `<table class="tbl"><thead><tr><th>Stránka</th><th class="n">Zobrazení</th><th class="n">Návštěvy</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a class="pg" href="${esc(r.path)}" target="_blank" rel="noopener" title="${esc(r.path)}">${esc(pageName(r.path))}</a><div class="meter" aria-hidden="true"><i style="width:${pct(r.views, rows[0].views)}%"></i></div></td><td class="n">${num(r.views)}</td><td class="n">${num(r.visits)}</td></tr>`).join('')}</tbody></table>`;
}
function shareTable(rows, label, total, name) {
  return `<table class="tbl"><thead><tr><th>${label}</th><th class="n">Návštěvy</th><th class="n">Podíl</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(name(r))}<div class="meter" aria-hidden="true"><i style="width:${pct(r.visits, total)}%"></i></div></td><td class="n">${num(r.visits)}</td><td class="n">${pct(r.visits, total)} %</td></tr>`).join('') || `<tr><td colspan="3" class="muted">Zatím žádná data.</td></tr>`}</tbody></table>`;
}
function weekly(daily) {
  const out = [];
  for (let i = 0; i < daily.length; i += 7) {
    const ch = daily.slice(i, i + 7);
    out.push({ day: ch[0].day, to: ch[ch.length - 1].day, views: ch.reduce((s, x) => s + x.views, 0), visits: ch.reduce((s, x) => s + x.visits, 0) });
  }
  return out;
}
function niceMax(v) { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * p; }
function drawChart(el, rows, metric) {
  const W = Math.max(320, el.clientWidth), H = 260, padL = 40, padB = 26, padT = 10, padR = 6;
  const max = niceMax(Math.max(...rows.map((r) => r[metric]), 0));
  const iw = W - padL - padR, ih = H - padT - padB, slot = iw / rows.length;
  const bw = Math.max(1, Math.min(24, slot - 2));
  const y = (v) => padT + ih - (v / max) * ih;
  const ticks = [0, max / 4, max / 2, max * 3 / 4, max];
  const fmtD = (d) => { const [, m, dd] = d.split('-'); return `${+dd}. ${+m}.`; };
  const lab = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const bar = (x, top, w, h) => { const r = Math.min(4, w / 2, h); return h <= 0 ? '' : `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`; };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric === 'visits' ? 'Návštěvy' : 'Zobrazení stránek'} v čase">
    <g class="grid">${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
    <g class="ax">${ticks.map((t) => `<text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${num(Math.round(t))}</text>`).join('')}
      ${lab.map((i) => `<text x="${padL + slot * i + slot / 2}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}">${fmtD(rows[i].day)}</text>`).join('')}</g>
    ${rows.map((r, i) => { const x = padL + slot * i + (slot - bw) / 2, v = r[metric], top = y(v); return `<g><rect class="hit" data-i="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${ih}"/><path class="bar" d="${bar(x, top, bw, padT + ih - top)}"/></g>`; }).join('')}
  </svg><div class="tip"></div>`;
  const tip = el.querySelector('.tip');
  el.querySelector('svg').addEventListener('mouseover', (e) => {
    const h = e.target.closest('.hit'); if (!h) { tip.style.display = 'none'; return; }
    const r = rows[+h.dataset.i], sc = el.clientWidth / W;
    tip.innerHTML = `<b>${r.to ? `${fmtD(r.day)} – ${fmtD(r.to)}` : czDate(r.day)}</b>${num(r.visits)} <span>${plural(r.visits, 'návštěva', 'návštěvy', 'návštěv')}</span> · ${num(r.views)} <span>zobrazení</span>`;
    tip.style.left = Math.min(el.clientWidth - 90, Math.max(90, (padL + slot * h.dataset.i + slot / 2) * sc)) + 'px';
    tip.style.top = Math.max(30, y(r[metric]) * sc) + 'px'; tip.style.display = 'block';
  });
  el.querySelector('svg').addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}
function viewStats() {
  updateNav('navstevnost');
  setTop([['Návštěvnost']], `<button class="btn btn-ghost" data-reload>${IC.refresh || ''} Obnovit</button>`);
  const nomeasure = localStorage.getItem(NOSTAT) === '1';
  page().innerHTML = `<div class="page-head"><div><h1>Návštěvnost</h1><p>Kolik lidí web navštívilo, co čtou a odkud přišli. Měříme bez cookies, takže web nepotřebuje cookie lištu.</p></div>
      <div class="seg" data-days>${[[7, '7 dní'], [30, '30 dní'], [90, '3 měsíce'], [365, 'Rok']].map(([d, t]) => `<button data-d="${d}" class="${S.days === d ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    ${nomeasure ? `<div class="banner info">${IC.info}<span><b>Vaše návštěvy z tohoto prohlížeče se nepočítají</b>Změníte to v Nastavení.</span></div>` : ''}
    <div data-st><p class="muted" style="display:flex;gap:.7rem;align-items:center"><span class="spin"></span> Načítám návštěvnost…</p></div>`;
  $('[data-days]').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; S.days = +b.dataset.d; viewStats(); });
  $('[data-reload]').addEventListener('click', () => { loadStats(S.days, true).then(() => viewStats()); });
  loadStats(S.days).then((d) => {
    const box = $('[data-st]'); if (!box) return;
    const rows = S.days > 90 ? weekly(d.daily) : d.daily;
    const vt = d.totals.visits, cv = changeTxt(vt, d.prev.visits), cw = changeTxt(d.totals.views, d.prev.views);
    const since = d.since ? czDate(d.since) : null;
    box.innerHTML = `
      <div class="kpis">
        <div class="card kpi"><small>Návštěvy</small><b>${num(vt)}</b><span class="ch ${cv.c}">${cv.t}</span></div>
        <div class="card kpi"><small>Zobrazení stránek</small><b>${num(d.totals.views)}</b><span class="ch ${cw.c}">${cw.t}</span></div>
        <div class="card kpi"><small>Stránek na návštěvu</small><b>${vt ? (d.totals.views / vt).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '0'}</b><span class="ch">průměr za období</span></div>
        <div class="card kpi"><small>Právě na webu</small><b><span class="live"><i></i>${num(d.live)}</span></b><span class="ch">za posledních 30 minut</span></div>
      </div>
      <section class="card chart-card"><div class="chart-head"><h3>${S.metric === 'visits' ? 'Návštěvy' : 'Zobrazení stránek'} <small>${S.days > 90 ? 'po týdnech' : 'po dnech'}</small></h3>
        <div class="seg" data-metric><button data-m="visits" class="${S.metric === 'visits' ? 'on' : ''}">Návštěvy</button><button data-m="views" class="${S.metric === 'views' ? 'on' : ''}">Zobrazení</button></div></div>
        <div class="chart" data-chart></div>
        <details class="tview"><summary>Zobrazit jako tabulku</summary><table class="tbl"><thead><tr><th>${S.days > 90 ? 'Týden od' : 'Den'}</th><th class="n">Návštěvy</th><th class="n">Zobrazení</th></tr></thead><tbody>${[...rows].reverse().map((r) => `<tr><td>${czDate(r.day)}</td><td class="n">${num(r.visits)}</td><td class="n">${num(r.views)}</td></tr>`).join('')}</tbody></table></details>
      </section>
      <div class="stat-grid">
        <section class="card"><div class="card-head"><h3>Nejčtenější stránky</h3></div>${d.pages.length ? pagesTable(d.pages, d.totals.views) : '<p class="card-pad muted">Zatím žádná data.</p>'}</section>
        <div style="display:grid;gap:1.4rem">
          <section class="card"><div class="card-head"><h3>Odkud lidé přišli</h3></div>${shareTable(d.sources, 'Zdroj', vt, (r) => SRC_NAMES[r.src] ?? r.src)}</section>
          <section class="card"><div class="card-head"><h3>Zařízení</h3></div>${shareTable(d.devices, 'Zařízení', vt, (r) => DEV_NAMES[r.dev] ?? r.dev)}</section>
          <section class="card"><div class="card-head"><h3>Země</h3></div>${shareTable(d.countries, 'Země', vt, (r) => country(r.cc))}</section>
        </div>
      </div>
      <p class="stat-note"><b>Jak měříme:</b> návštěva = jeden člověk (prohlížeč) za den, zobrazení = každá načtená stránka. Web si do prohlížeče nic neukládá a IP adresy se neukládají, proto nepotřebuje souhlas s cookies. Roboti a vyhledávače se nepočítají. ${since ? `Data máme od ${since}.` : 'Měření běží od spuštění administrace (10. 10. 2026).'}</p>`;
    const ch = $('[data-chart]'); drawChart(ch, rows, S.metric);
    $('[data-metric]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; S.metric = b.dataset.m; viewStats(); });
    const ro = new ResizeObserver(debounce(() => { if (ch.isConnected) drawChart(ch, rows, S.metric); else ro.disconnect(); }, 150)); ro.observe(ch);
  }).catch((e) => { const box = $('[data-st]'); if (box) box.innerHTML = `<div class="banner err">${IC.alert}<span><b>Návštěvnost se nepodařilo načíst</b>${esc(e.message)}</span></div>`; });
}

/* ------------------------------------------------------------ SETTINGS */
function viewSettings() {
  updateNav('nastaveni');
  setTop([['Nastavení']]);
  const nomeasure = localStorage.getItem(NOSTAT) === '1';
  page().innerHTML = `<div class="page-head"><div><h1>Nastavení</h1><p>Heslo do administrace, měření návštěvnosti a záloha článků.</p></div></div>
    <div class="dash-grid">
      <div style="display:grid;gap:1.4rem;align-content:start">
        <section class="card"><div class="card-head"><h3>Heslo do administrace</h3>${S.def ? '<span class="st st-rezervace">Výchozí heslo</span>' : '<span class="st st-nabidka">Nastaveno</span>'}</div>
          <form class="card-pad fgrid" data-pw>
            <div class="f full"><label>Současné heslo</label><input type="password" name="old" autocomplete="current-password"></div>
            <div class="f"><label>Nové heslo</label><input type="password" name="n1" autocomplete="new-password" minlength="8"></div>
            <div class="f"><label>Nové heslo znovu</label><input type="password" name="n2" autocomplete="new-password"></div>
            <div class="full" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap"><span class="hint" style="margin:0">Alespoň 8 znaků. Po změně se odhlásí všechna ostatní zařízení.</span><button class="btn btn-primary" type="submit">Změnit heslo</button></div>
          </form></section>
        <section class="card"><div class="card-head"><h3>Zabezpečení</h3><span class="st st-nabidka">Chráněno</span></div>
          <div class="card-pad" style="display:grid;gap:.7rem;font-size:.9rem;color:#344054">
            <p>Heslo se ověřuje na zabezpečeném serveru a nikde na webu není uložené. Po 8 chybných pokusech se přihlašování na 15 minut zablokuje.</p>
            <p>Přihlášení platí 12 hodin, pak vás administrace požádá o heslo znovu — rozpracované změny se přitom neztratí.</p>
          </div></section>
      </div>
      <div style="display:grid;gap:1.4rem;align-content:start">
        <section class="card"><div class="card-head"><h3>Měření návštěvnosti</h3></div><div class="card-pad" style="display:grid;gap:.8rem">
          <label class="tog" style="justify-content:space-between"><span>Nepočítat moje návštěvy z tohoto prohlížeče</span><input type="checkbox" data-nostat ${nomeasure ? 'checked' : ''}><span class="sw"></span></label>
          <p class="muted" style="font-size:.86rem">Zapněte na počítači a telefonu, ze kterých web sám často otevíráte, ať čísla nezkreslujete. Platí jen pro tento prohlížeč.</p>
        </div></section>
        <section class="card"><div class="card-head"><h3>Stav webu</h3></div><div class="card-pad" style="display:grid;gap:.8rem">
          <div class="pub ${S.pub.state}" style="background:var(--line-2);color:var(--text)"><i></i><span>${esc(S.pub.text)}</span></div>
          <p class="muted" style="font-size:.86rem">Po uložení se web automaticky přegeneruje a zveřejní. Obvykle to trvá 30–90 sekund.</p>
        </div></section>
        <section class="card"><div class="card-head"><h3>Záloha článků</h3></div><div class="card-pad" style="display:grid;gap:.8rem">
          <p class="muted" style="font-size:.86rem">Stáhněte si všechny články do jednoho souboru. Každé uložení se navíc automaticky archivuje, takže se dá vrátit i starší verze.</p>
          <button class="btn btn-ghost" data-backup>${IC.download} Stáhnout zálohu</button>
        </div></section>
        <section class="card"><div class="card-pad" style="display:grid;gap:.6rem"><button class="btn btn-ghost" data-lo>${IC.logout} Odhlásit se</button></div></section>
      </div>
    </div>`;
  $('[data-lo]').addEventListener('click', logout);
  $('[data-nostat]').addEventListener('change', (e) => { if (e.target.checked) localStorage.setItem(NOSTAT, '1'); else localStorage.removeItem(NOSTAT); toast(e.target.checked ? 'Vaše návštěvy se nebudou počítat' : 'Vaše návštěvy se opět počítají', 'Platí pro tento prohlížeč.', 'ok'); });
  $('[data-backup]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...S.D }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${CFG.id}-zaloha-${today()}.json`; a.click();
  });
  $('[data-pw]').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const b = f.querySelector('[type=submit]');
    const old = f.old.value, n1 = f.n1.value, n2 = f.n2.value;
    if (n1.length < 8) return toast('Nové heslo je příliš krátké', 'Použijte alespoň 8 znaků.', 'err');
    if (n1 !== n2) return toast('Hesla se neshodují', '', 'err');
    b.disabled = true; b.textContent = 'Měním…';
    try {
      const r = await api('/password', { method: 'POST', body: JSON.stringify({ old, password: n1 }) });
      S.sess = r.token; S.def = false; saveSess();
      toast('Heslo změněno', 'Příště se přihlaste novým heslem.', 'ok'); viewSettings();
    } catch (err) { toast('Heslo se nepodařilo změnit', err.message, 'err'); }
    finally { b.disabled = false; b.textContent = 'Změnit heslo'; }
  });
}

/* ------------------------------------------------------------ boot */
async function boot() {
  $('#app').innerHTML = `<div class="boot"><span class="muted" style="display:flex;gap:.7rem;align-items:center"><span class="spin"></span> Načítám obsah webu…</span></div>`;
  try { await loadAll(); }
  catch (e) {
    if (e.status === 401) { localStorage.removeItem('nsr_sess_' + CFG.id); S.sess = null; return renderLogin('Přihlášení vypršelo. Přihlaste se prosím znovu.'); }
    $('#app').innerHTML = `<div class="boot"><div class="banner err" style="max-width:520px">${IC.alert}<span><b>Obsah se nepodařilo načíst</b>${esc(e.message)}</span><button class="btn btn-ghost btn-sm" onclick="location.reload()">Zkusit znovu</button></div></div>`;
    return;
  }
  renderShell(); route();
}
const sess = JSON.parse(localStorage.getItem('nsr_sess_' + CFG.id) || 'null');
if (sess && sess.exp > Date.now()) { S.sess = sess.t; S.def = !!sess.def; boot(); } else renderLogin();
})();
