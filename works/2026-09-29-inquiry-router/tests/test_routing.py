"""自動か人かの決め方と、測った結果のまとめ方。"""
import unittest

from router.evaluate import summarize
from router.routing import route
from router.teams import load_teams


class RouteTest(unittest.TestCase):
    def test_sure_goes_automatic(self):
        r = route([("REFUND", 0.988), ("FEEDBACK", 0.007)])
        self.assertTrue(r.automatic)
        self.assertEqual(r.team, "REFUND")

    def test_split_goes_to_human_with_runner_up(self):
        r = route([("REFUND", 0.715), ("ORDER", 0.279)])
        self.assertFalse(r.automatic)
        self.assertEqual(r.runner_up, ("ORDER", 0.279))

    def test_threshold_is_inclusive(self):
        self.assertTrue(route([("A", 0.9), ("B", 0.1)], 0.9).automatic)

    def test_bad_threshold(self):
        with self.assertRaises(ValueError):
            route([("A", 1.0)], 0)


class SummarizeTest(unittest.TestCase):
    def test_gates(self):
        rows = [{"gold": "A", "team": "A", "probability": 0.99, "ms": 900},
                {"gold": "B", "team": "A", "probability": 0.95, "ms": 800},
                {"gold": "B", "team": "B", "probability": 0.60, "ms": 1000},
                {"gold": "C", "team": "A", "probability": 0.55, "ms": 700}]
        s = summarize(rows, gates=(0.9,))
        self.assertEqual(s["accuracy"], 0.5)
        self.assertEqual(s["median_ms"], 850)
        g = s["gates"][0]
        self.assertEqual((g["count"], g["misses"], g["automatic"], g["accuracy"]), (2, 1, 0.5, 0.5))


class TeamsTest(unittest.TestCase):
    def test_teams_json(self):
        teams = load_teams()
        self.assertEqual(len(teams.teams), 11)
        self.assertEqual(teams.threshold, 0.9)
        for team in teams.teams.values():
            self.assertTrue({"name", "description", "color", "mark"} <= set(team))


if __name__ == "__main__":
    unittest.main()
