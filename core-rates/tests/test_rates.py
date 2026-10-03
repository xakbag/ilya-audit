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

    def test_eval_set_all_pass(self):
        m = run_eval.run(HERE / "sample-rates.json", HERE / "eval-set-sample.json")
        self.assertEqual(m["fails"], [], m["fails"])
        self.assertEqual(m["answer_accuracy"], 1.0)
        self.assertEqual(m["refusal_accuracy"], 1.0)


if __name__ == "__main__":
    unittest.main()
