"""Прогон эталонного набора: python run_eval.py [rates.json] [eval-set.json]

Метрики:
  answer_accuracy  — доля верных ответов среди кейсов, где ожидается ответ (ok/conflict);
  refusal_accuracy — доля верных отказов среди кейсов, где ожидается отказ;
  overall          — доля всех верных кейсов.
Код выхода 0 — все кейсы верны (годится как обязательная проверка перед изменениями Core).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from rates import RateTable

HERE = Path(__file__).resolve().parent


def _numbers(text: str) -> set:
    return {int(n) for n in re.findall(r"(?<![\d.])\d{3,5}(?![\d])", text)}


def _date_ru(text: str) -> str:
    # 2026-08-26 -> также ищется как 26.08
    return re.sub(r"(\d{4})-(\d{2})-(\d{2})", r"\3.\2.\1 \1-\2-\3", text)


def check(table: RateTable, case: dict) -> tuple[bool, str]:
    exp = case["expect"]
    a = table.ask(case["q"])
    d = a.as_dict()
    errs = []
    if d["status"] != exp["status"]:
        errs.append(f"status {d['status']} != {exp['status']}")
    if "reason" in exp and d["reason"] != exp["reason"]:
        errs.append(f"reason {d['reason']} != {exp['reason']}")
    if "values" in exp and sorted(d["values"]) != sorted(exp["values"]):
        errs.append(f"values {d['values']} != {exp['values']}")
    if "unit" in exp and d["unit"] != exp["unit"]:
        errs.append(f"unit {d['unit']} != {exp['unit']}")
    shown = _numbers(a.text) | {int(v) for v in d["values"]}
    bad = shown & set(exp.get("must_not", []))
    if bad:
        errs.append(f"смешаны значения {sorted(bad)}")
    text = _date_ru(a.text)
    for s in exp.get("text_has", []):
        if s not in text:
            errs.append(f"нет «{s}» в тексте")
    return not errs, "; ".join(errs)


def run(rates_path: Path, eval_path: Path) -> dict:
    table = RateTable.from_json(rates_path)
    cases = json.loads(eval_path.read_text(encoding="utf-8"))["cases"]
    res = {"answer": [0, 0], "refuse": [0, 0], "fails": []}
    for c in cases:
        kind = "refuse" if c["expect"]["status"] == "refuse" else "answer"
        ok, why = check(table, c)
        res[kind][1] += 1
        res[kind][0] += ok
        if not ok:
            res["fails"].append((c["id"], why))
    total_ok = res["answer"][0] + res["refuse"][0]
    total = res["answer"][1] + res["refuse"][1]
    ratio = lambda p: round(p[0] / p[1], 3) if p[1] else None
    return {
        "answer_accuracy": ratio(res["answer"]),
        "refusal_accuracy": ratio(res["refuse"]),
        "overall": round(total_ok / total, 3) if total else None,
        "cases": total,
        "fails": res["fails"],
    }


def main(argv: list[str]) -> int:
    # без аргументов — синтетика (sample-rates + eval-set-sample); с rates.json — реальный набор eval-set.json
    rates_path = Path(argv[1]) if len(argv) > 1 else HERE / "sample-rates.json"
    default_eval = "eval-set.json" if len(argv) > 1 else "eval-set-sample.json"
    eval_path = Path(argv[2]) if len(argv) > 2 else HERE / default_eval
    m = run(rates_path, eval_path)
    print(json.dumps(m, ensure_ascii=False, indent=2))
    return 0 if not m["fails"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
