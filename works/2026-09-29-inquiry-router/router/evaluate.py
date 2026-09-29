"""自分の問い合わせ（正解つき）で振り分けを測る。

    python -m router.evaluate data/inquiries-ja.jsonl --model model/jeff-0.8b

入力は 1 行に 1 件の JSON: {"text": "問い合わせ", "team": "正解の担当のキー（teams.json のキー）"}。
出すもの: 正解率・しきい値ごとの「自動で回せる割合」と「その中の正解率」・1 件の時間の中央値。
"""
import argparse
import json
import statistics
import sys
from pathlib import Path

GATES = (0.5, 0.7, 0.8, 0.9, 0.95)


def summarize(results: list[dict], gates=GATES) -> dict:
    """results は {"gold", "team", "probability", "ms"} の並び。"""
    if not results:
        raise ValueError("結果が 0 件")
    n = len(results)
    hit = [r["team"] == r["gold"] for r in results]
    rows = []
    for t in gates:
        passed = [h for r, h in zip(results, hit) if r["probability"] >= t]
        rows.append({"threshold": t, "automatic": len(passed) / n, "accuracy": sum(passed) / len(passed) if passed else None,
                     "misses": len(passed) - sum(passed), "count": len(passed)})
    return {"count": n, "accuracy": sum(hit) / n, "median_ms": statistics.median(r["ms"] for r in results), "gates": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("data", type=Path)
    parser.add_argument("--model", default="model/jeff-0.8b")
    parser.add_argument("--threads", type=int)
    parser.add_argument("--out", type=Path, help="1 件ごとの結果を書く JSONL")
    args = parser.parse_args()

    from router.model import JeffModel     # torch を読むのは測るときだけ（テストは torch 無しで走る）
    from router.teams import load_teams
    teams, model = load_teams(), JeffModel(args.model, args.threads)
    rows = [json.loads(line) for line in args.data.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = []
    for i, row in enumerate(rows, 1):
        ranking, ms = model.classify(row["text"], teams.instructions, teams.criteria)
        results.append({"text": row["text"], "gold": row["team"], "team": ranking[0][0], "probability": ranking[0][1], "ms": ms})
        print(f"\r{i}/{len(rows)}", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)
    if args.out:
        args.out.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in results), encoding="utf-8")
    s = summarize(results)
    print(f"{s['count']} 件  正解率 {s['accuracy']:.1%}  1 件の時間（中央値）{s['median_ms'] / 1000:.2f} 秒")
    print("確率がこの値以上なら自動 | 自動で回せる割合 | その中の正解率 | 外れ")
    for g in s["gates"]:
        acc = "-" if g["accuracy"] is None else f"{g['accuracy']:.1%}"
        print(f"  {g['threshold']:.0%} | {g['automatic']:.0%}（{g['count']} 件） | {acc} | {g['misses']} 件")


if __name__ == "__main__":
    main()
