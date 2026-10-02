# S2: конкуренты — публичная HTML-выдача DuckDuckGo (по одной странице, паузы) + разбор структуры главных
import urllib.request, urllib.parse, re, html, time, sys
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
Q = ["пиломатериалы купить москва доставка", "обрезная доска купить москва", "ригельный кирпич гранит"]
out = []
def get(u, t=25):
    b = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
    enc = "cp1251" if re.search(rb"charset=['\"]?windows-1251", b[:3000], re.I) else "utf-8"
    return b.decode(enc, "replace")
if "serp" in sys.argv:
    for q in Q:
        time.sleep(12)
        try:
            s = get("https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": q, "kl": "ru-ru"}))
            hosts = []
            for l in re.findall(r'class="result__a" href="([^"]+)"', s):
                m = re.search(r"uddg=([^&]+)", l); l = urllib.parse.unquote(m.group(1)) if m else l
                h = urllib.parse.urlsplit(l).netloc
                if h and h not in hosts: hosts.append(h)
            out.append(f"{q}: {hosts[:12]}")
        except Exception as e:
            out.append(f"{q}: ERR {e}")
for h in [a for a in sys.argv[1:] if "." in a]:
    try:
        s = get(f"https://{h}/")
        g = lambda p: (lambda m: re.sub(r"\s+|<[^>]+>", " ", html.unescape(m.group(1))).strip()[:110] if m else "-")(re.search(p, s, re.I | re.S))
        nav = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", a))).strip() for a in re.findall(r"<a[^>]*>(.*?)</a>", s, re.S)]
        nav = [n for n in dict.fromkeys(nav) if 2 < len(n) < 40][:30]
        ld = sorted(set(re.findall(r'"@type"\s*:\s*"([A-Za-z]+)"', s)))
        flags = {k: bool(re.search(p, s, re.I)) for k, p in {"ИНН/ОГРН": r"ИНН|ОГРН", "отзывы": r"отзыв", "доставка": r"доставк", "оплата": r"оплат", "калькулятор": r"калькулятор|рассчита", "metrika": r"mc\.yandex\.ru|ym\("}.items()}
        out.append(f"## {h}\nT: {g(r'<title[^>]*>(.*?)</title>')}\nH1: {g(r'<h1[^>]*>(.*?)</h1>')}\nld: {ld}\nflags: {flags}\nnav: {' | '.join(nav)}")
    except Exception as e:
        out.append(f"## {h} ERR {str(e)[:80]}")
open("C:/Ilya-audit/sites/raw/comp.txt", "a", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
