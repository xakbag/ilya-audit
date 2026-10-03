import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from rates import Rate, RateTable  # noqa: E402
import run_eval  # noqa: E402


class RatesTest(unittest.TestCase):
    def setUp(self):
        self.t = RateTable.from_json(HERE / "sample-rates.json")

    def test_conflict_same_date_shows_both(self):
        a = self.t.answer("Дом 10", "террасная доска", "м2")
        self.assertEqual(a.status, "conflict")
        self.assertEqual(sorted(r.value for r in a.values), [3500, 4000])
        self.assertIn("2026-08-26", a.text)
        self.assertIn("комплексная строка", a.text)
        self.assertNotIn("1700", a.text)
        self.assertNotIn("2000", a.text)

    def test_units_not_mixed(self):
        a = self.t.answer("дом 10", "террасная доска", "п.м")
        self.assertEqual(a.status, "ok")
        self.assertEqual([r.value for r in a.values], [2000])
        self.assertNotIn("3500", a.text)

    def test_ambiguous_unit_refused(self):
        a = self.t.answer("дом 10", "террасная доска")
        self.assertEqual((a.status, a.reason), ("refuse", "ambiguous_unit"))

    def test_unit_mismatch_refused(self):
        a = self.t.answer("дом 10", "покраска фасада", "м")
        self.assertEqual((a.status, a.reason), ("refuse", "unit_mismatch"))

    def test_latest_version_wins_and_older_mentioned(self):
        a = self.t.answer("дом 7", "покраска фасада", "м²")
        self.assertEqual([r.value for r in a.values], [520])
        self.assertIn("Ранее", a.text)

    def test_same_value_same_date_is_not_conflict(self):
        r = dict(object="дом 1", work="x", unit="м", document="d", date="2026-01-01")
        t = RateTable([Rate(value=10, version="1", **r), Rate(value=10, version="2", **r)])
        self.assertEqual(t.answer("дом 1", "x", "м").status, "ok")

    def test_unknown_object(self):
        self.assertEqual(self.t.answer("дом 99", "x").reason, "unknown_object")

    def test_formulate_cannot_change_values(self):
        a = self.t.ask("дом 10 террасная доска за м²", formulate=lambda s: "переформулировано")
        self.assertEqual(a.text, "переформулировано")
        self.assertEqual(a.status, "conflict")
        self.assertEqual(sorted(a.as_dict()["values"]), [3500, 4000])

    def test_b35c_unit_variants(self):
        # fix1: «п.м.» в данных = «м»; варианты записи единиц в вопросе
        r = dict(object="дом 1", work="x", document="d", version="1", date="2026-01-01")
        t = RateTable([Rate(unit="п.м.", value=600, **r), Rate(unit="м²", value=900, **r)])
        self.assertEqual(t.answer("дом 1", "x", "м").values[0].value, 600)
        for q in ("дом 1 x за метр погонный", "дом 1 x, м.п.", "дом 1 x за пог. м", "дом 1 x, руб/п.м."):
            self.assertEqual(t.ask(q).as_dict()["values"], [600], q)
        for q in ("дом 1 x за кв. м", "дом 1 x, квадратный метр", "дом 1 x за м.кв", "дом 1 x кв.м."):
            self.assertEqual(t.ask(q).as_dict()["values"], [900], q)

    def test_b35c_value_rounded_to_kopecks(self):
        import json, tempfile, os
        row = dict(object="дом 1", work="x", unit="м", value=3300.0000000000005, document="d",
                   version="1", date="2026-01-01")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump({"rates": [row, {**row, "value": 21739.13043478261, "unit": "шт"}]}, f)
        try:
            t = RateTable.from_json(f.name)
        finally:
            os.unlink(f.name)
        a = t.answer("дом 1", "x", "м")
        self.assertEqual(a.as_dict()["values"], [3300])
        self.assertIn("3300 руб/м", a.text)
        self.assertEqual(t.answer("дом 1", "x", "шт").as_dict()["values"], [21739.13])

    def test_b35c_undated_different_value_is_conflict(self):
        r = dict(object="дом 1", work="x", unit="м²", document="d")
        t = RateTable([Rate(value=350, version="1", date="", **r),
                       Rate(value=700, version="2", date="", **r),
                       Rate(value=350, version="3", date="2026-06-29", **r)])
        a = t.answer("дом 1", "x", "м²")
        self.assertEqual((a.status, sorted(a.as_dict()["values"])), ("conflict", [350, 700]))
        # без даты, но то же значение — не конфликт
        t2 = RateTable([Rate(value=350, version="1", date="", **r), Rate(value=350, version="3", date="2026-06-29", **r)])
        self.assertEqual(t2.answer("дом 1", "x", "м²").status, "ok")

    def test_b35c_no_object_asks_to_clarify_without_values(self):
        a = self.t.ask("Сколько стоит террасная доска за м²?")
        d = a.as_dict()
        self.assertEqual((d["status"], d["reason"], d["clarify"], d["values"]), ("refuse", "no_object", True, []))
        self.assertIn("Уточните дом", a.text)
        self.assertIn("дом 10", a.text)
        for n in ("3500", "4000", "1700", "2000"):
            self.assertNotIn(n, a.text)
        # неизвестная работа без дома — обычный отказ, без уточнения
        b = self.t.ask("Сколько стоит укладка паркета за м²?")
        self.assertEqual((b.reason, b.clarify), ("no_object", False))

    def test_eval_set_all_pass(self):
        m = run_eval.run(HERE / "sample-rates.json", HERE / "eval-set-sample.json")
        self.assertEqual(m["fails"], [], m["fails"])
        self.assertEqual(m["answer_accuracy"], 1.0)
        self.assertEqual(m["refusal_accuracy"], 1.0)


if __name__ == "__main__":
    unittest.main()
