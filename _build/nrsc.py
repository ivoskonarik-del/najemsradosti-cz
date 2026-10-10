"""Práce se statickým exportem Next.js (App Router) bez zdrojáků.

Stránka = HTML + RSC payload (v HTML jako self.__next_f.push([1,"…"]) a stejný obsah v index.txt).
Každá změna musí být v HTML i v RSC, jinak React při hydrataci vrátí původní obsah.
Převzato z ~/ulesa/tools/rsc.py a ~/byiv/tools/rscx.py (renderer ověřen bajtovou shodou s exportem).
"""
import json, re

PUSH_RE = re.compile(r'<script>self\.__next_f\.push\((\[1,.*?\])\)</script>', re.S)


def parse_rows(text):
    b = text.encode('utf-8'); rows = []; i = 0
    while i < len(b):
        c = b.index(b':', i); rid = b[i:c].decode(); j = c + 1
        m = re.match(rb'T([0-9a-f]+),', b[j:j + 20])
        if m:
            n = int(m.group(1), 16); s = j + m.end()
            rows.append([rid, 'T', b[s:s + n].decode('utf-8')]); i = s + n
        else:
            e = b.index(b'\n', j); rows.append([rid, '', b[j:e].decode('utf-8')]); i = e + 1
    return rows


def ser_rows(rows):
    out = []
    for rid, typ, content in rows:
        out.append(f'{rid}:T{len(content.encode("utf-8")):x},{content}' if typ == 'T' else f'{rid}:{content}\n')
    return ''.join(out)


def esc_push(s):
    j = json.dumps([1, s], ensure_ascii=False, separators=(',', ':'))
    return (j.replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
             .replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


class Page:
    """Jedna stránka exportu: HTML (mimo RSC skripty) + řádky RSC."""

    def __init__(self, html, txt=None, name=''):
        self.name = name
        pushes = PUSH_RE.findall(html)
        self.rsc = ''.join(json.loads(p)[1] for p in pushes)
        if txt is not None and txt != self.rsc:
            raise SystemExit(f'{name}: index.txt nesouhlasí s RSC v HTML')
        self.rows = parse_rows(self.rsc)
        assert ser_rows(self.rows) == self.rsc, f'{name}: RSC round-trip'
        self.parts = PUSH_RE.split(html)  # sudé = HTML, liché = push argumenty
        self._t = {}

    @classmethod
    def load(cls, d):
        html = open(f'{d}/index.html', encoding='utf-8').read()
        try: txt = open(f'{d}/index.txt', encoding='utf-8').read()
        except FileNotFoundError: txt = None
        return cls(html, txt, d)

    # --- RSC řádky jako JSON stromy
    def row(self, rid):
        return [r for r in self.rows if r[0] == rid and r[1] == ''][0]

    def tree(self, rid):
        if rid not in self._t:
            r = self.row(rid); t = json.loads(r[2])
            assert dumps(t) == r[2], f'{self.name}: JSON round-trip řádku {rid}'
            self._t[rid] = t
        return self._t[rid]

    def set_tree(self, rid, t):
        self._t[rid] = t

    def rsc_replace(self, rid, old, new, count=1):
        r = self.row(rid)
        if rid in self._t: r[2] = dumps(self._t.pop(rid))
        n = r[2].count(old)
        if n != count: raise SystemExit(f'{self.name} RSC {rid}: „{old[:60]}“ {n}×, čekáno {count}×')
        r[2] = r[2].replace(old, new)

    # --- viditelné HTML (mimo RSC skripty)
    def html_count(self, s):
        return sum(self.parts[k].count(s) for k in range(0, len(self.parts), 2))

    def h(self, old, new, count=1):
        n = self.html_count(old)
        if n != count: raise SystemExit(f'{self.name} HTML: „{old[:80]}“ {n}×, čekáno {count}×')
        for k in range(0, len(self.parts), 2): self.parts[k] = self.parts[k].replace(old, new)

    def output(self):
        for rid, t in self._t.items(): self.row(rid)[2] = dumps(t)
        rsc = ser_rows(self.rows)
        out = []; first = True
        for k, p in enumerate(self.parts):
            if k % 2 == 0: out.append(p)
            elif first: out.append('<script>self.__next_f.push(' + esc_push(rsc) + ')</script>'); first = False
        return ''.join(out), rsc


# ---------------- render RSC uzlu do HTML (jako React SSR) ----------------
VOID = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr'}
ATTR = {'className': 'class', 'htmlFor': 'for', 'charSet': 'charset', 'httpEquiv': 'http-equiv', 'crossOrigin': 'crossorigin',
        'fetchPriority': 'fetchpriority', 'colSpan': 'colspan', 'rowSpan': 'rowspan', 'tabIndex': 'tabindex', 'readOnly': 'readonly',
        'autoComplete': 'autocomplete', 'maxLength': 'maxlength', 'strokeWidth': 'stroke-width', 'strokeLinecap': 'stroke-linecap',
        'strokeLinejoin': 'stroke-linejoin', 'srcSet': 'srcset', 'dateTime': 'datetime'}
UNITLESS = {'lineHeight', 'fontWeight', 'opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom', 'aspectRatio',
            'gridRow', 'gridColumn', 'columnCount', 'orphans', 'widows'}
SKIP = {'children', 'dangerouslySetInnerHTML', 'key', 'prefetch', 'scroll', 'replace', 'ref'}


def unrs(s):
    """RSC řetězec → skutečný text („$$…“ = text začínající „$“)"""
    return s[1:] if isinstance(s, str) and s.startswith('$$') else s


def esc_text(s):
    s = unrs(s)
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&#x27;')


def style_str(st):
    out = []
    for k, v in st.items():
        if v is None or v == '$undefined' or v is False or v == '': continue
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v != 0 and k not in UNITLESS: v = f'{v}px'
        out.append(re.sub(r'([A-Z])', lambda m: '-' + m.group(1).lower(), k) + f':{v}')
    return ';'.join(out)


def attrs(props):
    s = ''
    for k, v in props.items():
        if k in SKIP or v is None or v == '$undefined' or v is False: continue
        if k == 'style': s += f' style="{esc_text(style_str(v))}"'; continue
        name = ATTR.get(k, k)
        s += f' {name}=""' if v is True else f' {name}="{esc_text(str(v))}"'
    return s


def is_el(n):
    return isinstance(n, list) and len(n) == 4 and n[0] == '$' and isinstance(n[1], str)


def render(n, links):
    if n is None or n is False or n is True or n == '$undefined': return ''
    if isinstance(n, str): return esc_text(n)
    if isinstance(n, (int, float)): return str(n)
    if is_el(n):
        _, tag, key, props = n
        props = props or {}
        if tag in links:   # next/link → <a>, href jde v HTML na konec
            props = dict(props); href = props.pop('href', None); props['href'] = href; tag = 'a'
        if tag.startswith('$'): raise ValueError('neznámý odkaz ' + tag)
        a = attrs(props)
        if tag in VOID: return f'<{tag}{a}/>'
        if 'dangerouslySetInnerHTML' in props: return f'<{tag}{a}>{props["dangerouslySetInnerHTML"]["__html"]}</{tag}>'
        return f'<{tag}{a}>{render_children(props.get("children"), links)}</{tag}>'
    if isinstance(n, list): return render_children(n, links)
    raise ValueError(repr(n)[:100])


def _flat(ch, out):
    if isinstance(ch, list) and not is_el(ch):
        for c in ch: _flat(c, out)
    else: out.append(ch)
    return out


def render_children(ch, links):
    if ch is None: return ''
    items = _flat(ch, []) if (isinstance(ch, list) and not is_el(ch)) else [ch]
    out = ''; prev_text = False
    for c in items:
        txt = isinstance(c, (str, int, float)) and not isinstance(c, bool) and c != '$undefined'
        if txt and prev_text: out += '<!-- -->'
        r = render(c, links)
        out += r
        if r == '' and not txt: continue
        prev_text = txt
    return out


def walk(n, fn):
    """projde strom RSC; fn(uzel) pro každý prvek"""
    if isinstance(n, list):
        if is_el(n):
            fn(n)
            for v in (n[3] or {}).values():
                if isinstance(v, (list, dict)): walk(v, fn)
        else:
            for c in n: walk(c, fn)
    elif isinstance(n, dict):
        for v in n.values():
            if isinstance(v, (list, dict)): walk(v, fn)


def find(n, pred):
    res = []
    walk(n, lambda x: pred(x) and res.append(x))
    return res


def by_class(cls):
    return lambda x: (x[3] or {}).get('className') == cls


def text_of(n):
    out = []
    def go(x):
        if isinstance(x, str) and x != '$undefined': out.append(x)
        elif is_el(x): go((x[3] or {}).get('children'))
        elif isinstance(x, list):
            for c in x: go(c)
    go(n)
    return ''.join(out)
