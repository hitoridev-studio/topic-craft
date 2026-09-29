"""文の組み立てが Jeff の元のコードと 1 文字も違わないこと。確率の並べ方。"""
import json
import unittest
from pathlib import Path

from router.decision import decision_messages, ranked

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "jeff-prompt.json").read_text(encoding="utf-8"))


class DecisionMessagesTest(unittest.TestCase):
    def test_same_as_jeff(self):
        # 期待値は Jeff の jeff/model.py の decision_messages が組み立てた文（fixtures/jeff-prompt.json）
        got = decision_messages(FIXTURE["state"], FIXTURE["instructions"], FIXTURE["criteria"], FIXTURE["codes"])
        self.assertEqual(got, FIXTURE["expected"])

    def test_option_without_description_is_key_only(self):
        text = decision_messages("s", "q", {"yes": None, "no": "違う"}, ["A", "B"])[1]["content"][0]["text"]
        self.assertIn("A: yes\nB: no: 違う", text)

    def test_too_many_options(self):
        with self.assertRaises(ValueError):
            decision_messages("s", "q", {"a": None, "b": None}, ["A"])


class RankedTest(unittest.TestCase):
    def test_sorted_and_normalized(self):
        got = ranked(["a", "b", "c"], [0.2, 0.6, 0.2])
        self.assertEqual([k for k, _ in got], ["b", "a", "c"])
        self.assertAlmostEqual(sum(p for _, p in got), 1.0)

    def test_renormalizes(self):
        self.assertAlmostEqual(ranked(["a", "b"], [2.0, 2.0])[0][1], 0.5)


if __name__ == "__main__":
    unittest.main()
