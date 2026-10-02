# S2: точечные проверки (только GET)
import urllib.request, re, html
UA = {"User-Agent": "Mozilla/5.0 (site-audit S2)"}
def txt(u):
    s = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style|svg|noscript)[^>]*>.*?</\1>", " ", s)
    return s, "\n".join(l.strip() for l in html.unescape(re.sub(r"<[^>]+>", "\n", t)).splitlines() if l.strip())
out = []
s, t = txt("https://kub-lesa.ru/catalog/rashodnye-materialy/")
out += ["## rashodnye", t[:900]]
s, t = txt("https://kub-lesa.ru/dostavka/")
out += ["## dostavka", t[:1500]]
s, t = txt("https://granitline.ru/")
out += ["## granit nav", " ".join(sorted(set(re.findall(r'href="([^"]+)"', s))))[:1500]]
s, t = txt("https://granitline.ru/catalog/stone-485299897301/")
out += ["## granit card no-offer", t[:1200]]
s, t = txt("https://kub-lesa.ru/catalog/doska-obreznaya/25x100x6000-kl-001/")
out += ["## kl card", t[:1500], "og:", " ".join(re.findall(r'property="(og:[a-z:]+)"', s))]
s, t = txt("https://kub-lesa.ru/catalog/doska-obreznaya/")
out += ["## kl cat text tail", t[-1500:]]
s, t = txt("https://granitline.ru/catalog/bruschatka/")
out += ["## gl cat text tail", t[-1200:]]
open("C:/Ilya-audit/sites/raw/more.txt", "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
