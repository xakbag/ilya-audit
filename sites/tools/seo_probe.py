# S2: только чтение публичных URL (GET/HEAD), без форм и входа
import urllib.request, urllib.error, ssl, re, time, sys, http.client, json
from urllib.parse import urlsplit
UA = "Mozilla/5.0 (site-audit S2)"
class NoRedir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op = urllib.request.build_opener(NoRedir)
def hit(u, method="GET", body=False):
    t = time.time()
    try:
        r = op.open(urllib.request.Request(u, method=method, headers={"User-Agent": UA, "Accept-Encoding": "identity"}), timeout=25)
        code, h, b = r.status, r.headers, (r.read() if body else b"")
    except urllib.error.HTTPError as e:
        code, h, b = e.code, e.headers, (e.read() if body else b"")
    except Exception as e:
        return {"u": u, "err": str(e)[:120]}
    return {"u": u, "code": code, "loc": h.get("Location"), "ms": int((time.time()-t)*1000),
            "hsts": h.get("Strict-Transport-Security"), "server": h.get("Server"),
            "ct": h.get("Content-Type"), "cache": h.get("Cache-Control"), "xrobots": h.get("X-Robots-Tag"),
            "len": len(b) if body else h.get("Content-Length"), "body": b.decode("utf-8", "replace") if body else ""}
mode = sys.argv[1] if len(sys.argv) > 1 else "base"
if mode == "base":
    for d in ["granitline.ru", "kub-lesa.ru"]:
        print("===", d)
        for u in [f"http://{d}/", f"http://www.{d}/", f"https://www.{d}/", f"https://{d}/", f"https://{d}/index.html",
                  f"https://{d}/catalog", f"https://{d}/catalog/", f"https://{d}/CATALOG/", f"https://{d}/?utm_source=x",
                  f"https://{d}/nonexistent-xyz/", f"https://{d}/catalog/nonexistent-xyz/", f"https://{d}/api/"]:
            r = hit(u, body=True)
            b = r.pop("body", "")
            nf = ""
            if b:
                m = re.search(r"<title[^>]*>(.*?)</title>", b, re.S); nf = (m.group(1).strip()[:60] if m else "")
                c = re.search(r'rel="canonical"[^>]+href="([^"]*)"', b); nf += f" | can={c.group(1) if c else None}"
                rb = re.search(r'name="robots"[^>]+content="([^"]*)"', b); nf += f" | rb={rb.group(1) if rb else None}"
            print(json.dumps({k: v for k, v in r.items() if v is not None}, ensure_ascii=False), "|", nf)
        sm = hit(f"https://{d}/sitemap.xml", body=True)
        locs = re.findall(r"<loc>([^<]+)</loc>", sm.get("body", ""))
        lm = re.findall(r"<lastmod>([^<]+)</lastmod>", sm.get("body", ""))
        print("sitemap", sm.get("code"), "locs", len(locs), "lastmod", sorted(set(lm))[:3], "...")
        open(f"C:/Ilya-audit/sites/raw/{d}-locs.txt", "w", encoding="utf-8").write("\n".join(locs))
elif mode == "locs":
    # статус каждого URL из sitemap + title/h1/desc/canonical
    sys.stdout = open("C:/Ilya-audit/sites/raw/locs-crawl.tsv", "w", encoding="utf-8")
    for d in ["granitline.ru", "kub-lesa.ru"]:
        locs = open(f"C:/Ilya-audit/sites/raw/{d}-locs.txt", encoding="utf-8").read().split()
        lim = int(sys.argv[2]) if len(sys.argv) > 2 else 400
        for u in locs[:lim]:
            r = hit(u, body=True); b = r.get("body", "")
            g = lambda p: (lambda m: re.sub(r"\s+|<[^>]+>", " ", m.group(1)).strip() if m else "")(re.search(p, b, re.S | re.I))
            print("\t".join(str(x) for x in [r.get("code"), r.get("ms"), len(b)//1024, urlsplit(u).path,
                  g(r"<title[^>]*>(.*?)</title>"), g(r"<h1[^>]*>(.*?)</h1>"),
                  len(g(r'name="description"[^>]+content="([^"]*)"')),
                  g(r'rel="canonical"[^>]+href="([^"]*)"') == u, g(r'name="robots"[^>]+content="([^"]*)"'),
                  ",".join(sorted(set(re.findall(r'"@type"\s*:\s*"(Product|Offer|AggregateOffer|ItemList|BreadcrumbList|LocalBusiness|Store|Organization|FAQPage)"', b))))]), flush=True)
elif mode == "get":
    for u in sys.argv[2:]:
        r = hit(u, body=True)
        open("C:/Ilya-audit/sites/raw/" + re.sub(r"[^a-z0-9.]+", "_", u.split("//")[1]).strip("_") + ".html", "w", encoding="utf-8").write(r.get("body", ""))
        print(u, r.get("code"), r.get("loc"), len(r.get("body", "")))
