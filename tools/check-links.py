# Проверка, что ссылки github.com в markdown-файле открываются (HEAD). Только чтение.
# Использование: check-links.py <file.md>
import re, sys, urllib.request

t = open(sys.argv[1], encoding="utf-8").read()
urls = sorted(set(re.findall(r"\((https://github\.com/[^)\s]+)\)", t)))
bad = []
for u in urls:
    try:
        urllib.request.urlopen(urllib.request.Request(u, method="HEAD", headers={"User-Agent": "Mozilla/5.0"}), timeout=20)
    except Exception as e:
        bad.append((u, str(e)))
print(len(urls), "links; bad:", bad)
