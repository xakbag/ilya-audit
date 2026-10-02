# Поиск репозиториев GitHub через HTML-страницу поиска (без API). Только чтение.
import json, re, sys, urllib.parse, urllib.request

for q in sys.argv[1:]:
    url = "https://github.com/search?type=repositories&q=" + urllib.parse.quote(q)
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        print("##", q, "ERR", e)
        continue
    print("##", q)
    m = re.search(r'<script type="application/json" data-target="react-app.embeddedData">(.*?)</script>', html, re.S)
    if not m:
        print("  (нет данных)")
        continue
    data = json.loads(m.group(1))
    for r in data.get("payload", {}).get("results", [])[:8]:
        desc = re.sub(r"<[^>]+>", "", r.get("hl_trunc_description") or "")[:100]
        print("  %s | ★%s | %s | %s | %s" % (re.sub(r"<[^>]+>", "", r.get("hl_name", "")), r.get("followers"),
              r.get("language"), (r.get("repo", {}).get("repository", {}).get("updated_at") or "")[:10], desc))
