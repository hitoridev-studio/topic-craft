# 迷うものだけ人に回す、日本語の問い合わせ振り分けツール。手元の PC だけで動く

お客様の問い合わせを入れると、11 の担当（アカウント・返金・注文・配送など）のどれが受けるかを、担当ごとの確率つきで出します。いちばん高い確率が 90% 以上ならそのまま担当へ回し、どちらとも取れるものは「要確認」として人に回します。

判定するのは Jeff（Jev と同じ呼び方で使える 0.8B の小さな判定モデル）で、API キーも GPU も要りません。手元の 4 コアの CPU で 1 件約 0.9 秒でした。

- ページ: https://hitoridev-studio.github.io/topic-craft/works/2026-09-29-inquiry-router/

## 起動する

Python 3.10 以上と、約 2 GB の空きが要ります。

```sh
git clone --depth 1 https://github.com/hitoridev-studio/topic-craft
cd topic-craft/works/2026-09-29-inquiry-router
python3 -m venv .venv && . .venv/bin/activate

# Linux で GPU が無いなら、先に CPU 版の torch を入れる（入れないと GPU 用の大きな版が入る）
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.0 torchvision==0.29.0
pip install -r requirements.txt

# モデル（1.7 GB。Apache 2.0）
hf download mstrasser/Jeff-Qwen3.5-0.8B --local-dir model/jeff-0.8b --exclude "videos/*"

python -m router.server
```

`http://127.0.0.1:8765/` を開き、問い合わせを入れて「振り分ける」（または Enter）を押します。下の「見本を流す」を押すと、見本の問い合わせ 7 件を振り分けて担当の箱に積みます。

## 自分の担当に変える

担当は `teams.json` だけで決まります。`teams` の中身を自分の担当に書き換えてください（キー・表示名・説明・色・一文字のしるし）。モデルが読むのは `description`（説明）です。説明の書き方で当たり方が大きく変わります（下の「確かめたこと」）。90% のしきい値は `threshold` で変えられます。

```json
{
  "instructions": "このお客様の問い合わせは、どの担当が対応すべきですか？",
  "threshold": 0.9,
  "teams": {
    "REFUND": { "name": "返金", "description": "返金：返金の条件・返金の依頼・返金状況の確認", "color": "#e08a9b", "mark": "返" }
  }
}
```

## 自分のコードで使う

```python
from router.model import JeffModel
from router.routing import route
from router.teams import load_teams

teams = load_teams()
model = JeffModel("model/jeff-0.8b")
ranking, ms = model.classify("届いた商品が壊れていたので返金してください", teams.instructions, teams.criteria)
decided = route(ranking, teams.threshold)
print(decided.team, round(decided.probability, 3), "自動" if decided.automatic else "人へ")   # REFUND 0.988 自動
```

サーバーを起動しているなら、HTTP でも呼べます。

```sh
curl -s -X POST http://127.0.0.1:8765/classify -H 'content-type: application/json' -d '{"text":"パスワードを忘れてログインできません"}'
# {"ranking": [["ACCOUNT", 0.994...], ...], "ms": ..., "team": "ACCOUNT", "probability": 0.994..., "runner_up": [...], "automatic": true}
```

## 自分の問い合わせで測る

正解つきの問い合わせを 1 行 1 件の JSONL（`{"text": "…", "team": "teams.json のキー"}`）にして渡すと、正解率と、しきい値ごとに「自動で回せる割合」と「その中の正解率」を出します。

```sh
python -m router.evaluate data/inquiries-ja.jsonl
```

## 確かめたこと

手元の 4 コアの CPU（Intel Xeon 2.1 GHz・メモリ 16 GB・GPU なし）で、`data/inquiries-ja.jsonl` の 330 件を測りました。

| | 結果 |
|---|---|
| 正解率（11 の担当） | 92.7%（330 件中 306 件） |
| 確率 90% 以上だけ自動にしたとき | 58% を自動で回し、その中の外れは 192 件中 1 件 |
| 1 件の時間（中央値） | 0.91 秒 |

- 担当の説明を英語で書くと、同じ問い合わせで 81.8% でした（説明の中身は日本語版と完全には同じではないので、言語の差とは言えません）。説明の書き方で 10 ポイント以上変わります。
- 問い合わせが日本語でも英語でも、正解率は変わりませんでした（英語の説明で 81.8% と 80.0%）。
- 学習する前のモデル（Qwen3.5-0.8B）は、別のデータ（音声アシスタントへの日本語の依頼 600 件・18 択。MASSIVE）で 42〜47% でした。Jeff は同じ条件で 84〜86% です。Jeff の学習は英語だけですが、日本語にも効いています。
- 文の組み立ては、Jeff の元のコード（`jeff/model.py` の `decision_messages`）が組み立てる文と 1 文字も違わないことをテストで確かめています（`tests/test_decision.py`）。

## 注意

- 測った問い合わせは、英語の公開データを言語モデルで日本語に訳したものです。実際のお客様の文は、もっと長く、話がいくつも混ざります。自分の問い合わせで測ってから使ってください。
- 「確率 90% 以上なら正しい」は、このデータで測った結果です。自信を持って外すこともあります（「注文した商品がいつ届くか確認できますか？」を、正解の「配送」ではなく「注文」に 93% で回しました）。
- Jeff の作者は、推論が要る問題では Jev に劣ると書いています。日本語の常識問題（JCommonsenseQA）では 76.9%（Jev の公表値は 97.1%）でした。担当の振り分けのような、選択肢の説明から選ぶ判断に向きます。
- Jeff は Jev の開発元（TypeSafe）とは関係のない、独立したプロジェクトです。

## ファイル

| ファイル | 中身 |
|---|---|
| `router/decision.py` | Jev と同じ形の問いを、Jeff に渡す文に組み立てる |
| `router/model.py` | Jeff を読み込み、担当ごとの確率を出す |
| `router/routing.py` | 自動で回すか人に回すかを決める |
| `router/teams.py` | 担当の定義（`teams.json`）を読む |
| `router/server.py` | 画面と振り分けの API を出す |
| `router/evaluate.py` | 自分の問い合わせで測る |
| `web/` | 振り分けボードの画面 |
| `teams.json` | 担当の定義 |
| `data/` | 測った問い合わせ 330 件（CDLA-Sharing-1.0。`data/README.md`） |
| `tests/` | テスト |
| `index.html`・`work.json`・`card.jpg`・`screen.png` | サイトのページと一覧 |

## テスト

```sh
python -m unittest -v
```

torch は要りません。文の組み立てが Jeff と同じこと、自動か人かの決め方、測った結果のまとめ方、`teams.json` の形を確かめます。

## 出典

- Jeff: https://github.com/firelex/jeff （コードは MIT。モデルの重みは Apache 2.0: https://huggingface.co/mstrasser/Jeff-Qwen3.5-0.8B ）
- 問い合わせのデータ: Bitext Customer Service Tagged Training Dataset（CDLA-Sharing-1.0）
- Jev の日本語の公表値: 「日本語ベンチマークでJevの性能を検証する」（IVRy、https://zenn.dev/ivry/articles/65c1c4242e1156 ）

## ライセンス

コードは MIT（リポジトリの `LICENSE`）。`router/decision.py` の文の形は Jeff（MIT, Copyright (c) 2026 Mathias Strasser, Copyright (c) 2026 Denis Yarats）に合わせています。`data/inquiries-ja.jsonl` は CDLA-Sharing-1.0。モデルの重みは含みません（Apache 2.0）。
