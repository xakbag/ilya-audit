# Лицензия (первая строка LICENSE) и строки README по ключевым словам. Только чтение, без API.
# Использование: gh-readme.py "<regex>" owner/repo ...
import re, sys, urllib.request

UA = {"User-Agent": "Mozilla/5.0 audit"}
BIDI = re.compile("[​-‏‪-‮⁦-⁩]")


def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read().decode("utf-8", "replace")
    except Exception:
        return ""


pat = re.compile(sys.argv[1], re.I)
for r in sys.argv[2:]:
    base = "https://raw.githubusercontent.com/%s/HEAD/" % r
    lic = ""
    for n in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"):
        t = get(base + n)
        if t:
            lic = " ".join(t.split()[:8])
            break
    rd = ""
    for n in ("README.md", "README.rst", "readme.md", "README"):
        rd = get(base + n)
        if rd:
            break
    rd = BIDI.sub("", re.sub(r"<!--.*?-->", "", rd, flags=re.S))
    hits = [l.strip()[:160] for l in rd.splitlines() if pat.search(l)][:8]
    print("=== %s | LICENSE: %s | README %d B" % (r, lic or "?", len(rd)))
    for h in hits:
        print("  -", h)
