# Строки raw-файла GitHub по регулярке. Только чтение.
# Использование: gh-raw-grep.py "<regex>" <raw-url> ...
import re, sys, urllib.request

BIDI = re.compile("[​-‏‪-‮⁦-⁩]")
pat = re.compile(sys.argv[1], re.I)
for u in sys.argv[2:]:
    try:
        t = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        print("===", u, "ERR", e)
        continue
    print("===", u, len(t), "B")
    for l in t.splitlines():
        if pat.search(l):
            print("  -", BIDI.sub("", l)[:260])
