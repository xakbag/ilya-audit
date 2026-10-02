# S2: углублённые проверки (только GET публичных URL)
import urllib.request, re, collections, json, html
UA = {"User-Agent": "Mozilla/5.0 (site-audit S2)"}
def get(u, n=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25)
        return r.status, r.headers, r.read() if n is None else r.read(n)
    except Exception as e:
        return getattr(e, "code", "ERR"), {}, b""
out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
# 1. уникальность description в карточках
for d in ["granitline.ru", "kub-lesa.ru"]:
    locs = open(f"C:/Ilya-audit/sites/raw/{d}-locs.txt", encoding="utf-8").read().split()
    descs, notext, noprice, offers, imgs, ext = collections.Counter(), [], [], collections.Counter(), set(), collections.Counter()
    sample = [u for u in locs if re.search(r"stone-|kl-\d", u)][::6][:25]
    for u in sample:
        c, h, b = get(u); s = b.decode("utf-8", "replace")
        m = re.search(r'name="description"[^>]+content="([^"]*)"', s); dd = m.group(1) if m else ""
        descs[re.sub(r"\d+[×x]\d+[×x]?\d*", "N", dd)] += 1
        body = re.sub(r"(?is)<(script|style|svg|noscript|header|footer|nav)[^>]*>.*?</\1>", " ", s)
        words = len(re.findall(r"[А-Яа-яЁё]{3,}", re.sub(r"<[^>]+>", " ", body)))
        notext.append(words)
        for j in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', s, re.S):
            for k in ["price", "priceCurrency", "availability", "image", "sku", "brand", "aggregateRating", "review", "seller"]:
                if f'"{k}"' in j: offers[k] += 1
        for i in re.findall(r'<img[^>]+src="([^"]+)"', s): imgs.add(i)
        for e in re.findall(r'<(?:script|link)[^>]+(?:src|href)="(https?://[^"/]+)', s): ext[e] += 1
    P("##", d, "sample", len(sample))
    P("desc patterns (top)", descs.most_common(3))
    P("words in main (min/med/max)", min(notext), sorted(notext)[len(notext)//2], max(notext))
    P("ld fields count", dict(offers))
    P("external hosts", dict(ext))
# 2. вес ресурсов главной
for d in ["granitline.ru", "kub-lesa.ru"]:
    c, h, b = get(f"https://{d}/"); s = b.decode("utf-8", "replace")
    res = set(re.findall(r'(?:src|href)="(/[^"]+\.(?:js|css|webp|jpe?g|png|avif|woff2?|svg))"', s))
    tot = collections.Counter(); big = []
    for r in res:
        c2, h2, b2 = get(f"https://{d}{r}")
        ext_ = r.rsplit(".", 1)[-1]; tot[ext_] += len(b2); big.append((len(b2)//1024, r[-60:], h2.get("Cache-Control") if h2 else None))
    P("##", d, "home html KB", len(b)//1024, "resources", len(res), {k: f"{v//1024}KB" for k, v in tot.items()})
    P("largest", sorted(big, reverse=True)[:6])
    P("preload", len(re.findall(r'rel="preload"', s)), "fonts-link", re.findall(r'href="([^"]*font[^"]*)"', s)[:3])
    P("og:image", re.findall(r'property="og:image" content="([^"]+)"', s)[:1], "twitter", bool(re.search(r'name="twitter:', s)))
    P("favicon", bool(re.search(r'rel="(?:shortcut )?icon"', s)), "apple-touch", bool(re.search(r"apple-touch-icon", s)), "manifest", bool(re.search(r'rel="manifest"', s)))
    P("ld-raw", [j[:400] for j in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', s, re.S)][:1])
    P("internal links", len(set(re.findall(r'href="(/[^"#]*)"', s))), "nofollow", len(re.findall(r'rel="[^"]*nofollow', s)))
# 3. страницы, которых может не быть
for d in ["granitline.ru", "kub-lesa.ru"]:
    for p in ["kontakty", "contacts", "dostavka", "delivery", "oplata", "payment", "o-kompanii", "about", "otzyvy", "reviews", "politika", "privacy", "rekvizity", "portfolio", "faq", "price", "prays", "blog", "stati", "primenenie", "galereya", "foto"]:
        c, h, b = get(f"https://{d}/{p}/", 2048)
        if c == 200: P(d, p, c)
    P(d, "checked service pages")
open("C:/Ilya-audit/sites/raw/deep.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
