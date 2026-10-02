"""S3: собирает файлы Директа по сайтам из data_*.py и проверяет лимиты.
Запуск: python build.py  (только локальные файлы, в сеть не ходит)."""
import csv, sys, pathlib, importlib

OUT = pathlib.Path(__file__).resolve().parent.parent
LIM = {"t1": 35, "t2": 30, "text": 81, "sl_t": 30, "sl_d": 60, "sl_sum": 66, "callout": 25, "path": 20}
UTM = ("utm_source=yandex&utm_medium=cpc&utm_campaign={campaign_id}&utm_content={ad_id}"
       "&utm_term={keyword}&utm_ads={campaign_type}_{source_type}")
errors = []

def chk(label, s, lim):
    # В Директе не считаются в длину узкие символы (. , ! : ; ") — считаем строго, с ними.
    if len(s) > lim:
        errors.append(f"{label}: {len(s)}>{lim}: {s}")

def build(mod_name, slug):
    d = importlib.import_module(mod_name)
    sl_sum = sum(len(t) for t, _, _ in d.SITELINKS)
    chk(f"{slug} сумма быстрых ссылок", "x" * sl_sum, LIM["sl_sum"])
    for t, ds, _ in d.SITELINKS:
        chk(f"{slug} БС заголовок", t, LIM["sl_t"]); chk(f"{slug} БС описание", ds, LIM["sl_d"])
    for c in d.CALLOUTS:
        chk(f"{slug} уточнение", c, LIM["callout"])
    rows, md = [], [f"# {d.SITE}: кампании, фразы, объявления (сгенерировано build.py)\n",
                    f"Регион: {d.REGION}. Цены — с сайта, дата в каждой группе. Частот нет: проверить в Вордстате и прогнозе бюджета.\n",
                    "Общие минус-слова (на кампанию): " + ", ".join("-" + m for m in d.COMMON_MINUS) + "\n"]
    gnum = 0
    for camp, groups in d.CAMPAIGNS:
        md.append(f"\n## {camp}\n")
        for g in groups:
            gnum += 1
            url = d.BASE + g["url"]
            md.append(f"\n### {g['name']}  ({url})\nЦена с сайта: {g['price']}\n")
            md.append("Фразы: " + "; ".join(g["phrases"]) + "\n")
            md.append("Минус на группу: " + ", ".join("-" + m for m in g["minus"]) + "\n")
            for i, (t1, t2, tx, path) in enumerate(g["ads"], 1):
                for k, v in (("t1", t1), ("t2", t2), ("text", tx), ("path", path)):
                    chk(f"{slug}/{g['name']}/об{i} {k}", v, LIM[k])
                md.append(f"{i}. {t1} | {t2} | {tx}  [{len(t1)}/{len(t2)}/{len(tx)}]\n")
            # строки: первое объявление + все фразы; доп. объявления — отдельными строками с «+»
            for j, ph in enumerate(g["phrases"]):
                ad = g["ads"][0] if j == 0 else None
                rows.append(row(camp, gnum, g, ph, ad, url, d, first=(j == 0)))
            for ad in g["ads"][1:]:
                rows.append(row(camp, gnum, g, "", ad, url, d, extra=True))
    (OUT / f"{slug}-direct.md").write_text("".join(md), encoding="utf-8")
    with open(OUT / "import" / f"{slug}-commander.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(HEAD); w.writerows(rows)
    return gnum, len(rows)

HEAD = ["Кампания", "Доп. объявление группы", "Тип объявления", "Номер группы", "Название группы",
        "Фраза (с минус-словами)", "Заголовок 1", "Заголовок 2", "Текст", "Ссылка", "Отображаемая ссылка",
        "Регион", "Ставка", "Заголовки быстрых ссылок", "Описания быстрых ссылок", "Адреса быстрых ссылок",
        "Уточнения", "Минус-фразы на группу"]

def row(camp, gnum, g, ph, ad, url, d, first=False, extra=False):
    t1 = t2 = tx = path = ""
    if ad:
        t1, t2, tx, path = ad
    full = url + ("?" + UTM if ad else "")
    sl = d.SITELINKS if ad else []
    return [camp, "+" if extra else "-", "Текстово-графическое", gnum, g["name"], ph, t1, t2, tx,
            full if ad else "", path, d.REGION if first else "", "",  # ставки не задаём: старт на автостратегии
            "||".join(s[0] for s in sl), "||".join(s[1] for s in sl),
            "||".join(d.BASE + s[2] for s in sl), "||".join(d.CALLOUTS) if ad else "",
            " ".join("-" + m for m in g["minus"]) if first else ""]

if __name__ == "__main__":
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    for m, s in (("data_granit", "granitline"), ("data_kub", "kublesa")):
        print(s, "групп/строк:", build(m, s))
    print("ОШИБКИ ЛИМИТОВ:" if errors else "Лимиты: OK", *errors, sep="\n")
    sys.exit(1 if errors else 0)
