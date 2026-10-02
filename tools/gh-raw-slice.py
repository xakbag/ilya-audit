# Кусок raw-файла GitHub после маркера. Только чтение.
# Использование: gh-raw-slice.py <raw-url> "<маркер>" [длина]
import re, sys, urllib.request

BIDI = re.compile("[​-‏‪-‮⁦-⁩]")
u, mark = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 1500
t = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
t = re.sub(r"<!--.*?-->", "", BIDI.sub("", t), flags=re.S)
i = t.find(mark)
print(t[i:i + n] if i >= 0 else "(маркер не найден)")
