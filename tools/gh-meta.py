# Метаданные публичных репозиториев GitHub без токена и без API:
# звёзды/лицензия/язык — со страницы репозитория, дата последнего коммита — из commits.atom.
import re, sys, urllib.request

UA = {"User-Agent": "Mozilla/5.0 audit"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read().decode("utf-8", "replace")


def first(pat, s):
    m = re.search(pat, s, re.S)
    return m.group(1).strip() if m else "?"


for r in sys.argv[1:]:
    try:
        html = get("https://github.com/" + r)
        stars = first(r'id="repo-stars-counter-star"[^>]*title="([\d,]+)"', html)
        lic = first(r'octicon-law[^<]*</svg>\s*([^<]+?)\s*</a>', html)
        lang = first(r'itemprop="programmingLanguage"[^>]*>\s*([^<]+)<', html)
        if lang == "?":
            lang = first(r'<span class="color-fg-default text-bold mr-1">([^<]+)</span>', html)
        arch = "ARCHIVED" if "This repository has been archived" in html else ""
        atom = get("https://github.com/%s/commits.atom" % r)
        last = first(r"<updated>([\d-]{10})", atom.split("<entry>", 1)[-1])
        print(r, stars, lang, lic, last, arch, sep=" | ")
    except Exception as e:
        print(r, "ERR", e, sep=" | ")
