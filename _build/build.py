#!/usr/bin/env python3
"""Sestavení webu najemsradosti.cz do _site/ (spouští GitHub Action po každém uložení v administraci).

Web je statický export Next.js bez zdrojáků. Build:
  1. zkopíruje export (vše kromě _build, _data, _site a skrytých souborů),
  2. z _data/posts.json vygeneruje články /novinky/<slug>/, výpis /novinky/ a blok Novinky na úvodní stránce
     – HTML i RSC payload (index.txt + self.__next_f v HTML), aby React při hydrataci nic nepřepsal,
     – šablony: _build/sablony/clanek (původní článek), _build/sablony/novinky (původní výpis), index.html (úvod),
  3. vloží do stránek měřicí skript /stats.js (návštěvnost bez cookies, viz webhunter-admin src/stats.js),
  4. doplní cache busting (?v=hash) a version.json (administrace podle něj pozná, že je změna zveřejněná).

Lokálně:  python3 _build/build.py  → _site/ ;  náhled: python3 -m http.server -d _site 8790
"""
import copy, hashlib, html as H, json, math, os, re, shutil, sys
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nrsc import Page, render, find, by_class, text_of, is_el, dumps, esc_text

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_site')
TPL = os.path.join(ROOT, '_build', 'sablony')
SITE = 'Nájem s radostí'
MES = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9-]{0,99}$')
TPL_SLUG = 'kauce-vs-pojisteni-skody'          # článek, ze kterého je šablona
TPL_KEY = 'd5WpkwcpOpXxQSEHrDgM3'              # náhodný klíč hlavy v šabloně (každá stránka má vlastní)


def rs(s):
    """řetězec do RSC: hodnota začínající „$“ se v protokolu Next.js zdvojuje"""
    return '$' + s if isinstance(s, str) and s.startswith('$') else s


def cz_date(iso):
    y, m, d = (int(x) for x in iso.split('-'))
    return f'{d}. {MES[m - 1]} {y}'


def read_time(post):
    words = len(re.sub(r'<[^>]+>', ' ', H.unescape(post.get('body', ''))).split())
    return f'{max(1, math.ceil(words / 200))} min čtení'


def link_id(page):
    """id klientské komponenty next/link (modul 8173) na dané stránce → '$L7' apod."""
    for rid, typ, c in page.rows:
        if typ == '' and c.startswith('I[8173,'): return '$L' + rid
    raise SystemExit(f'{page.name}: nenalezen next/link')


def key_for(slug):
    return hashlib.sha1(slug.encode()).hexdigest()[:21]


# ---------------------------------------------------------------- text článku: HTML z editoru → RSC uzly
DROP = {'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'button', 'select', 'textarea'}


class _Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': '#root', 'attrs': {}, 'ch': []}; self.stack = [self.root]; self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP: self.skip += 1
        el = {'tag': tag, 'attrs': dict(attrs), 'ch': []}
        self.stack[-1]['ch'].append(el)
        if tag not in ('br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr'): self.stack.append(el)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1]['ch'].append({'tag': tag, 'attrs': dict(attrs), 'ch': []})

    def handle_endtag(self, tag):
        if tag in DROP: self.skip = max(0, self.skip - 1)
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]['tag'] == tag: del self.stack[i:]; return

    def handle_data(self, data):
        if not self.skip: self.stack[-1]['ch'].append(data)


A_STYLE = {'color': 'var(--brand-700)', 'textDecoration': 'underline', 'textUnderlineOffset': '3px'}
OL_STYLE = {'paddingInlineStart': 'var(--sp-5)', 'display': 'flex', 'flexDirection': 'column', 'gap': 'var(--sp-2)', 'maxWidth': '66ch'}
FIG_STYLE = {'margin': 0}
IMG_STYLE = {'width': '100%', 'height': 'auto', 'borderRadius': 'var(--r-lg)'}
CAP_STYLE = {'fontSize': 14, 'color': 'var(--ink-2)', 'marginTop': 'var(--sp-2)'}
VYZDVIH_SVG = ["$", "svg", None, {"width": 34, "height": "10", "viewBox": "0 0 26 10", "fill": "none", "aria-hidden": "true", "children": ["$", "path", None, {"d": "M0.8 5h3.2L5.6 1.6 7.6 8.6 9.4 2.4 11 6.8l1.2-1.8h12.9", "stroke": "currentColor", "strokeWidth": "1.4", "strokeLinecap": "round", "strokeLinejoin": "round"}]}]


def safe_href(h):
    h = (h or '').strip()
    if re.match(r'^(https?://|mailto:|tel:|/|#)', h, re.I): return h
    if re.match(r'^[a-z0-9.-]+\.[a-z]{2,}(/|$)', h, re.I): return 'https://' + h
    return None


def img_src(s):
    s = (s or '').strip()
    if re.match(r'^https?://', s): return s
    s = re.sub(r'^(\.\./)+', '', s).lstrip('/')
    return '/' + s if re.match(r'^(img|images)/[A-Za-z0-9_\-/.]+$', s) else None


def _children(lst):
    lst = [c for c in lst if c != '']
    # sloučit sousední texty
    out = []
    for c in lst:
        if isinstance(c, str) and out and isinstance(out[-1], str): out[-1] += c
        else: out.append(c)
    if not out: return None
    return out[0] if len(out) == 1 else out


def inline(nodes):
    out = []
    for n in nodes:
        if isinstance(n, str):
            out.append(rs(re.sub(r'[ \t\r\n]+', ' ', n))); continue
        t = n['tag']
        if t in DROP: continue
        if t == 'br': out.append(['$', 'br', None, {}]); continue
        if t == 'img': continue          # obrázky uvnitř odstavce řeší block()
        inner = inline(n['ch'])
        if t in ('strong', 'b'): out.append(['$', 'strong', None, {'children': _children(inner)}])
        elif t in ('em', 'i'): out.append(['$', 'em', None, {'children': _children(inner)}])
        elif t == 'u': out.append(['$', 'u', None, {'children': _children(inner)}])
        elif t == 'a':
            href = safe_href(n['attrs'].get('href'))
            if not href: out.extend(inner); continue
            p = {'href': rs(href)}
            if re.match(r'^https?://', href) and 'najemsradosti.cz' not in href:
                p.update({'target': '_blank', 'rel': 'noopener noreferrer'})
            p['style'] = A_STYLE; p['children'] = _children(inner)
            out.append(['$', 'a', None, p])
        else: out.extend(inner)          # span apod. → jen obsah
    # okrajové mezery bloku pryč
    if out and isinstance(out[0], str): out[0] = out[0].lstrip()
    if out and isinstance(out[-1], str): out[-1] = out[-1].rstrip()
    while out and is_el(out[-1]) and out[-1][1] == 'br': out.pop()
    return [c for c in out if c != '']


def figure(img, key, alt):
    src = img_src(img['attrs'].get('src'))
    if not src: return None
    cap = (img['attrs'].get('alt') or '').strip()
    ch = [['$', 'img', None, {'src': rs(src), 'alt': rs(cap or alt), 'loading': 'lazy', 'decoding': 'async', 'style': IMG_STYLE}]]
    if cap: ch.append(['$', 'figcaption', None, {'style': CAP_STYLE, 'children': rs(cap)}])
    return ['$', 'figure', key, {'style': FIG_STYLE, 'children': ch}]


def body_nodes(body, alt):
    t = _Tree(); t.feed(body or ''); t.close()
    blocks = []

    def add(node): blocks.append(node)

    def imgs_in(n):
        return [c for c in n['ch'] if isinstance(c, dict) and c['tag'] == 'img'] + \
               [i for c in n['ch'] if isinstance(c, dict) and c['tag'] != 'img' for i in imgs_in(c)]

    def li_items(lst):
        items = []
        for li in lst['ch']:
            if not isinstance(li, dict) or li['tag'] != 'li': continue
            ch = inline([c for c in li['ch'] if not (isinstance(c, dict) and c['tag'] in ('ul', 'ol'))])
            for sub in [c for c in li['ch'] if isinstance(c, dict) and c['tag'] in ('ul', 'ol')]:
                ch.append(list_node(sub, None))
            if ch: items.append(ch)
        return items

    def list_node(n, key):
        items = li_items(n)
        if not items: return None
        seen = set(); lis = []
        for i, ch in enumerate(items):
            k = text_of(ch) or str(i)
            if k in seen: k = f'{k}-{i}'
            seen.add(k)
            lis.append(['$', 'li', rs(k), {'children': _children(ch)}])
        p = {} if n['tag'] == 'ul' else {'style': OL_STYLE}
        p['children'] = lis
        return ['$', n['tag'], key, p]

    pending_quote = []

    def flush_quote():
        if pending_quote:
            add(['$', 'div', 'Q', {'className': 'vyzdvih', 'children': [VYZDVIH_SVG] + [['$', 'p', None, {'children': c}] for c in pending_quote]}])
            pending_quote.clear()

    def block(n):
        if isinstance(n, dict) and n['tag'] in DROP: return
        if isinstance(n, str):
            if n.strip():
                flush_quote(); add(['$', 'p', 'K', {'children': _children(inline([n]))}])
            return
        tag = n['tag']
        if tag == 'blockquote':
            ch = _children(inline(n['ch']))
            if ch is not None: pending_quote.append(ch)
            return
        flush_quote()
        if tag in ('p', 'div', 'pre') or tag not in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'img', 'figure'):
            if tag == 'div' and any(isinstance(c, dict) and c['tag'] in ('p', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'div') for c in n['ch']):
                for c in n['ch']: block(c)
                return
            ch = inline(n['ch'])
            if ch: add(['$', 'p', 'K', {'children': _children(ch)}])
            for im in imgs_in(n):
                f = figure(im, 'K', alt)
                if f: add(f)
            return
        if tag in ('h1', 'h2'):
            ch = _children(inline(n['ch']))
            if ch is not None: add(['$', 'h2', 'K', {'children': ch}])
        elif tag in ('h3', 'h4', 'h5', 'h6'):
            ch = _children(inline(n['ch']))
            if ch is not None: add(['$', 'h3', 'K', {'children': ch}])
        elif tag in ('ul', 'ol'):
            ln = list_node(n, 'K')
            if ln: add(ln)
        elif tag == 'img':
            f = figure(n, 'K', alt)
            if f: add(f)
        elif tag == 'figure':
            for im in imgs_in(n):
                f = figure(im, 'K', alt)
                if f: add(f)

    for n in t.root['ch']: block(n)
    flush_quote()
    for i, b in enumerate(blocks): b[2] = str(i)
    return blocks


# ---------------------------------------------------------------- data
def load_posts():
    posts = json.load(open(os.path.join(ROOT, '_data', 'posts.json'), encoding='utf-8'))
    seen = set(); out = []
    for p in posts:
        if p.get('hidden'): continue
        s = p.get('slug', '')
        if not SLUG_RE.match(s) or s in seen or not (p.get('title') or '').strip():
            print(f'⚠ článek přeskočen (chybí název nebo neplatná adresa): {s!r}'); continue
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', p.get('date') or ''):
            print(f'⚠ článek {s}: neplatné datum, beru dnešní'); p['date'] = __import__('datetime').date.today().isoformat()
        seen.add(s); out.append(p)
    out.sort(key=lambda p: p['date'], reverse=True)
    return out


def image_of(p):
    return img_src(p.get('image')) or '/images/interier-svetly-obyvak.jpg'


def alt_of(p):
    return (p.get('imageAlt') or '').strip() or p['title']


# ---------------------------------------------------------------- karty článků (z karet v šablonách)
def fill_card(card, p):
    """karta odkazu na článek: odznak, nadpis, perex, případně datum a obrázek"""
    card[2] = rs(p['slug']) if card[2] is not None else None
    card[3]['href'] = f'/novinky/{p["slug"]}/'
    for n in find(card, lambda x: x[1] == 'img'):
        n[3]['src'] = rs(image_of(p)); n[3]['alt'] = rs(alt_of(p))
    for n in find(card, by_class('odznak odznak-znacka')): n[3]['children'] = rs(p.get('category') or 'Reality')
    for n in find(card, lambda x: x[1] in ('h2', 'h3')): n[3]['children'] = rs(p['title'])
    for n in find(card, lambda x: x[1] == 'p'): n[3]['children'] = rs(p.get('excerpt') or '')
    for n in find(card, by_class('tnum')):
        ch = n[3]['children']; ch[1] = cz_date(p['date']); ch[3] = read_time(p)
    return card


# ---------------------------------------------------------------- stránky
def build_article(tpl_html, tpl_txt, p, posts):
    pg = Page(tpl_html, tpl_txt, 'clanek'); L = link_id(pg)
    t = pg.tree('8')
    hero, art, more = t[0], t[1], t[2]
    img = find(hero, lambda x: x[1] == 'img')[0][3]
    img['src'] = rs(image_of(p)); img['alt'] = rs(alt_of(p))
    inner = find(hero, by_class('pod-hero-inner'))[0][3]['children']
    inner[1][3]['children'] = rs(p['title']); inner[2][3]['children'] = rs(p.get('excerpt') or '')
    cl = find(art, by_class('obal-uzky clanek'))[0][3]['children']
    meta = cl[0][3]['children']
    meta[1] = cz_date(p['date']); meta[3] = read_time(p); meta[4] = rs(' · ' + (p.get('author') or 'Mgr. Tomáš Veigl'))
    cl[1] = body_nodes(p.get('body', ''), alt_of(p))
    others = [o for o in posts if o['slug'] != p['slug']][:3]
    grid = find(more, by_class('mrizka mrizka-3'))[0]
    tcard = find(grid, lambda x: x[1] == L)[0]
    grid[3]['children'] = [fill_card(copy.deepcopy(tcard), o) for o in others]
    if not others: t.remove(more)
    # metadata
    c = pg.tree('c')
    for n in find(c, lambda x: x[1] == 'title'): n[3]['children'] = rs(f'{p["title"]} | {SITE}')
    desc = (p.get('excerpt') or '').strip() or p['title']
    for n in find(c, lambda x: x[1] == 'meta' and x[3].get('name') == 'description'): n[3]['content'] = rs(desc)
    pg.rsc_replace('0', TPL_SLUG, p['slug'], 3)
    pg.rsc_replace('0', TPL_KEY, key_for(p['slug']), 1)
    # HTML
    head = pg.parts[0]
    head, n1 = re.subn(r'<link rel="preload" as="image" href="[^"]*"/>', lambda m: f'<link rel="preload" as="image" href="{esc_text(image_of(p))}"/>', head, count=1)
    head, n2 = re.subn(r'<title>.*?</title>', lambda m: f'<title>{esc_text(p["title"] + " | " + SITE)}</title>', head, count=1)
    head, n3 = re.subn(r'<meta name="description" content="[^"]*"/>', lambda m: f'<meta name="description" content="{esc_text(desc)}"/>', head, count=1)
    head, n4 = re.subn(r'(<main id="obsah">).*(</main>)', lambda m: m.group(1) + render(t, {L}) + m.group(2), head, count=1, flags=re.S)
    assert (n1, n2, n3, n4) == (1, 1, 1, 1), (n1, n2, n3, n4)
    pg.parts[0] = head
    return pg.output()


def build_listing(tpl_html, tpl_txt, posts):
    pg = Page(tpl_html, tpl_txt, 'novinky'); L = link_id(pg)
    t = pg.tree('0')
    sec = [s for s in find(t, lambda x: x[1] == 'section' and x[3].get('className') == 'sekce') if find(s, by_class('karta karta-hover spotlight-clanek'))][0]
    before = render(sec, {L})
    wrap = sec[3]['children'][3]['children']          # [spotlight, starší články]
    spot = fill_card(wrap[0], posts[0]) if posts else None
    older = wrap[1]
    grid = find(older, by_class('mrizka mrizka-3'))[0]
    tcard = find(grid, lambda x: x[1] == L)[0]
    grid[3]['children'] = [fill_card(copy.deepcopy(tcard), o) for o in posts[1:]]
    new = [x for x in ([spot] if spot else []) + ([older] if len(posts) > 1 else [])]
    if not new: new = [['$', 'p', None, {'style': {'color': 'var(--ink-2)'}, 'children': 'Připravujeme první články.'}]]
    sec[3]['children'][3]['children'] = new
    pg.set_tree('0', t)
    pg.h(before, render(sec, {L}))
    return pg.output()


def build_home(tpl_html, tpl_txt, posts):
    pg = Page(tpl_html, tpl_txt, 'uvod'); L = link_id(pg)
    t = pg.tree('0')
    sec = [s for s in find(t, lambda x: x[1] == 'section' and x[3].get('className') == 'sekce') if 'Čtení pro majitele' in text_of(s) and find(s, by_class('mrizka mrizka-3'))][0]
    before = render(sec, {L})
    grid = find(sec, by_class('mrizka mrizka-3'))[0]
    tcard = find(grid, lambda x: x[1] == L)[0]
    grid[3]['children'] = [fill_card(copy.deepcopy(tcard), o) for o in posts[:3]]
    pg.set_tree('0', t)
    after = render(sec, {L}) if posts else ''
    if not posts:   # bez článků blok z úvodu zmizí
        def drop(n):
            if isinstance(n, list) and not is_el(n) and sec in n: n.remove(sec)
        from nrsc import walk
        walk(t, lambda x: [drop(v) for v in (x[3] or {}).values() if isinstance(v, list)])
    pg.h(before, after)
    return pg.output()


# ---------------------------------------------------------------- kopie, měření, cache busting
def md5(path):
    return hashlib.md5(open(path, 'rb').read()).hexdigest()[:10]


def copy_export():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    def ignore(d, names):
        top = os.path.abspath(d) == ROOT
        return [n for n in names if (top and (n in ('_build', '_data', '_site', 'README.md') or (n.startswith('.') and n != '.nojekyll')))
                or n == '__pycache__' or n == '.DS_Store']
    shutil.copytree(ROOT, OUT, ignore=ignore)


def write(rel, content):
    path = os.path.join(OUT, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content)


def main():
    posts = load_posts()
    copy_export()
    rd = lambda p: open(os.path.join(TPL, p), encoding='utf-8').read()
    a_html, a_txt = rd('clanek/index.html'), rd('clanek/index.txt')
    shutil.rmtree(os.path.join(OUT, 'novinky'), ignore_errors=True)
    for p in posts:
        h, txt = build_article(a_html, a_txt, p, posts)
        write(f'novinky/{p["slug"]}/index.html', h); write(f'novinky/{p["slug"]}/index.txt', txt)
    h, txt = build_listing(rd('novinky/index.html'), rd('novinky/index.txt'), posts)
    write('novinky/index.html', h); write('novinky/index.txt', txt)
    h, txt = build_home(open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read(), open(os.path.join(ROOT, 'index.txt'), encoding='utf-8').read(), posts)
    write('index.html', h); write('index.txt', txt)

    # měření návštěvnosti do všech stránek (ne do administrace a 404)
    tag = f'<script src="/stats.js?v={md5(os.path.join(OUT, "stats.js"))}" defer=""></script>'
    n = 0
    for d, _, files in os.walk(OUT):
        rel = os.path.relpath(d, OUT)
        if rel.split(os.sep)[0] in ('admin', '_next', '404'): continue
        if 'index.html' in files:
            f = os.path.join(d, 'index.html'); s = open(f, encoding='utf-8').read()
            if 'stats.js' not in s:
                i = s.rindex('</body>'); s = s[:i] + tag + s[i:]; open(f, 'w', encoding='utf-8').write(s); n += 1
    # cache busting administrace
    ai = os.path.join(OUT, 'admin', 'index.html')
    if os.path.exists(ai):
        s = open(ai, encoding='utf-8').read()
        for f in ('admin.css', 'admin.js'):
            s = re.sub(rf'{re.escape(f)}(\?v=[0-9a-f]*)?"', f'{f}?v={md5(os.path.join(OUT, "admin", f))}"', s)
        open(ai, 'w', encoding='utf-8').write(s)
    write('version.json', json.dumps({'sha': os.environ.get('GITHUB_SHA', 'local'), 'posts': len(posts)}) + '\n')
    print(f'Hotovo: {len(posts)} článků, měření ve {n} stránkách → {OUT}')


if __name__ == '__main__':
    main()
