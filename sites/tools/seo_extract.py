# S2: извлечение SEO-полей из локальных выгрузок (только чтение файлов)
import re, glob, os, json, html
D = r"C:\Ilya-audit\.tmp-direct"
def g(p, s, fl=re.I | re.S):
    m = re.search(p, s, fl)
    return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else None
for f in sorted(glob.glob(os.path.join(D, "*.html"))):
    if "robots" in f: continue
    s = open(f, encoding="utf-8", errors="replace").read()
    imgs = re.findall(r"<img\b[^>]*>", s, re.I)
    noalt = [i for i in imgs if not re.search(r'\balt\s*=\s*"[^"]+"', i, re.I)]
    r = {
        "file": os.path.basename(f), "bytes": len(s),
        "title": g(r"<title[^>]*>(.*?)</title>", s),
        "desc": g(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', s),
        "canonical": g(r'<link[^>]+rel="canonical"[^>]+href="([^"]*)"', s),
        "robots": g(r'<meta[^>]+name="robots"[^>]+content="([^"]*)"', s),
        "h1": [html.unescape(re.sub(r"<[^>]+>|\s+", " ", h)).strip() for h in re.findall(r"<h1[^>]*>(.*?)</h1>", s, re.I | re.S)],
        "h2n": len(re.findall(r"<h2", s, re.I)),
        "og": sorted(set(re.findall(r'property="(og:[a-z_:]+)"', s))),
        "ld": sorted(set(re.findall(r'"@type"\s*:\s*"([A-Za-z]+)"', s))),
        "itemtype": sorted(set(re.findall(r'itemtype="https?://schema.org/([A-Za-z]+)"', s))),
        "metrika": bool(re.search(r"mc\.yandex\.ru|ym\(", s)),
        "ym_verif": bool(re.search(r'name="yandex-verification"', s)),
        "gtag": bool(re.search(r"googletagmanager|gtag\(", s)),
        "viewport": bool(re.search(r'name="viewport"', s)),
        "lang": g(r"<html[^>]*lang=\"([^\"]+)\"", s),
        "imgs": len(imgs), "noalt": len(noalt),
        "lazy": len(re.findall(r'loading="lazy"', s)),
        "webp": len(re.findall(r"\.webp", s)),
        "scripts": re.findall(r'<script[^>]+src="([^"]+)"', s)[:12],
        "css": re.findall(r'<link[^>]+href="([^"]+\.css[^"]*)"', s)[:8],
        "fonts": sorted(set(re.findall(r"fonts\.(?:googleapis|gstatic)\.com|\.woff2?", s))),
        "crumbs": bool(re.search(r"breadcrumb|хлебн", s, re.I)),
        "price_rub": len(re.findall(r"(?:руб|₽)", s)),
        "inn": bool(re.search(r"ИНН|ОГРН", s)),
        "tel": len(set(re.findall(r'href="tel:([^"]+)"', s))),
        "forms": len(re.findall(r"<form", s, re.I)),
        "generator": g(r'<meta[^>]+name="generator"[^>]+content="([^"]*)"', s),
        "links_int": len(re.findall(r'href="/(?!/)', s)),
        "inline_style_kb": round(sum(len(x) for x in re.findall(r"<style[^>]*>(.*?)</style>", s, re.I | re.S)) / 1024, 1),
        "inline_js_kb": round(sum(len(x) for x in re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", s, re.I | re.S)) / 1024, 1),
    }
    if os.environ.get("FULL"): print(json.dumps(r, ensure_ascii=False)); continue
    print(f"{r['file']} | {r['bytes']//1024}KB | T[{r['title']}]{len(r['title'] or '')} | D{len(r['desc'] or '')}[{(r['desc'] or '')[:90]}] | can={r['canonical']} rb={r['robots']} | H1={r['h1']} h2={r['h2n']} | ld={r['ld']}{r['itemtype']} og={len(r['og'])} | ym={r['metrika']} yv={r['ym_verif']} gt={r['gtag']} | img {r['imgs']}/noalt {r['noalt']} lazy {r['lazy']} | crumbs={r['crumbs']} rub={r['price_rub']} inn={r['inn']} tel={r['tel']} forms={r['forms']} | ijs={r['inline_js_kb']}KB css={len(r['css'])} scr={len(r['scripts'])} fonts={r['fonts']} gen={r['generator']}")
