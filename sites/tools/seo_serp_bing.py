# S2: публичная выдача Bing (одна страница на запрос, пауза)
import urllib.request, urllib.parse, re, time
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36", "Accept-Language": "ru-RU,ru"}
out = []
for q in ["пиломатериалы купить москва доставка", "обрезная доска купить москва цена", "ригельный кирпич гранит купить"]:
    time.sleep(5)
    try:
        s = urllib.request.urlopen(urllib.request.Request("https://www.bing.com/search?" + urllib.parse.urlencode({"q": q, "setlang": "ru", "cc": "RU"}), headers=UA), timeout=25).read().decode("utf-8", "replace")
        hosts = []
        for l in re.findall(r'<h2[^>]*><a[^>]+href="(https?://[^"]+)"', s):
            h = urllib.parse.urlsplit(l).netloc
            if h and h not in hosts: hosts.append(h)
        out.append(f"{q}: {hosts[:12]}")
    except Exception as e:
        out.append(f"{q}: ERR {e}")
open("C:/Ilya-audit/sites/raw/comp.txt", "a", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
