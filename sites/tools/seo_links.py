# S2: внутренние ссылки со страниц выборки -> статус; ссылки вне sitemap
import urllib.request, urllib.error, re, glob, os
UA = {"User-Agent": "Mozilla/5.0 (site-audit S2)"}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NR)
out = []
for d, pat in [("granitline.ru", "granitline.ru*.html"), ("kub-lesa.ru", "kub_lesa.ru*.html")]:
    locs = set(open(f"C:/Ilya-audit/sites/raw/{d}-locs.txt", encoding="utf-8").read().split())
    links = set()
    for f in glob.glob(os.path.join(r"C:\Ilya-audit\.tmp-direct", pat)):
        s = open(f, encoding="utf-8", errors="replace").read()
        for h in re.findall(r'href="(/[^"#?]*)', s):
            if not re.search(r"\.(css|js|svg|ico|png|webp|jpe?g|woff2?)$", h): links.add(h)
        for h in re.findall(r'src="(/[^"]+\.(?:webp|jpe?g|png|svg))"', s): links.add(h)
    bad, notin = [], []
    for h in sorted(links):
        u = f"https://{d}{h}"
        try: c = op.open(urllib.request.Request(u, method="HEAD", headers=UA), timeout=20).status
        except urllib.error.HTTPError as e: c = e.code
        except Exception as e: c = "ERR"
        if c != 200: bad.append((c, h))
        if not re.search(r"\.\w{3,4}$", h) and u not in locs: notin.append(h)
    out.append(f"## {d} unique internal={len(links)} non200={bad[:20]} not_in_sitemap={notin[:20]}")
open("C:/Ilya-audit/sites/raw/links.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
