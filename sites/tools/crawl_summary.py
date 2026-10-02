# S2: сводка по locs-crawl.tsv
import collections, sys
rows = [l.rstrip("\n").split("\t") for l in open("C:/Ilya-audit/sites/raw/locs-crawl.tsv", encoding="utf-8") if l.strip()]
print("rows", len(rows))
codes = collections.Counter(r[0] for r in rows); print("codes", dict(codes))
non200 = [r[:4] for r in rows if r[0] != "200"]; print("non200", non200[:20])
for col, name in [(4, "title"), (5, "h1")]:
    c = collections.Counter(r[col] for r in rows if len(r) > col)
    d = [(k, v) for k, v in c.items() if v > 1]; print("dup", name, len(d), d[:8])
print("empty h1", [r[3] for r in rows if len(r) > 5 and not r[5]][:15])
print("desc<70", [(r[3], r[6]) for r in rows if len(r) > 6 and int(r[6] or 0) < 70][:15])
print("title>70", [(r[3], len(r[4])) for r in rows if len(r) > 4 and len(r[4]) > 70][:15])
print("canon!=self", [r[3] for r in rows if len(r) > 7 and r[7] != "True"][:15])
print("noindex", [r[3] for r in rows if len(r) > 8 and "noindex" in r[8]][:15])
print("slow>800ms", [(r[3], r[1]) for r in rows if r[1].isdigit() and int(r[1]) > 800][:10])
print("ld", collections.Counter(r[9] if len(r) > 9 else "" for r in rows).most_common(10))
# типы страниц по первым сегментам
seg = collections.Counter("/".join(r[3].split("/")[:3]) for r in rows); print("segments", seg.most_common(40))
if len(sys.argv) > 1:
    for r in rows:
        if sys.argv[1] in r[3]: print("\t".join(r))
