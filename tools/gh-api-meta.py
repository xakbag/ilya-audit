# Лицензия/язык/звёзды/pushed_at/archived через публичный API GitHub (без токена, лимит 60/ч).
# Дополняет tools/gh-meta.py, у которого разбор лицензии со страницы сломался (вёрстка GitHub).
import json, sys, urllib.request

UA = {"User-Agent": "audit", "Accept": "application/vnd.github+json"}

for r in sys.argv[1:]:
    try:
        req = urllib.request.Request("https://api.github.com/repos/" + r, headers=UA)
        d = json.load(urllib.request.urlopen(req, timeout=25))
        lic = (d.get("license") or {}).get("spdx_id") or "?"
        print(r, d.get("stargazers_count"), d.get("language"), lic,
              (d.get("pushed_at") or "")[:10], "ARCHIVED" if d.get("archived") else "", sep=" | ")
    except Exception as e:
        print(r, "ERR", e, sep=" | ")
