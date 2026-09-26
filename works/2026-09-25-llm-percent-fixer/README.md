# LLM や Jev が出す「◯%確か」を、本当の%に直すツール

LLM の logprobs や Jev の probabilities のような「◯%確か」は、そのまま使うと、実際に当たる割合とずれることがあります。答え合わせ済みの判定の記録を読み込むと、確率を「本当に当たる割合」に直す数（温度 T）を求め、自分のコードに入れる式を出します。計算はブラウザの中だけで行い、記録は外に送りません。

- ページ: https://hitoridev-studio.github.io/topic-craft/works/2026-09-25-llm-percent-fixer/

## 使い方

### ページで使う

1. このリポジトリを落として、`works/2026-09-25-llm-percent-fixer/index.html` をブラウザで開く（上のページを開いても同じ）。見た目と図はリポジトリの `assets/` を使うので、このフォルダだけでなくリポジトリごと落とす。
2. 答え合わせ済みの判定の記録を貼る（形は下の「記録の形」）。
3. 直す数 T と、Python か JavaScript の式が出る。

### 自分のコードで使う

計算は `percent-fixer.js` の 1 ファイルで、ほかのパッケージを使いません。Node でもブラウザでも読めます。

```js
// Node
const pf = require('./percent-fixer.js')
const { rows, errors } = pf.parseRecords(text)   // 記録を読む。読めない行は errors（行番号と理由）
const T = pf.fitTemperature(rows)                  // 直す数
console.log(pf.codeFor(T).js)                      // 自分のコードに入れる式（Python は .python）
```

```html
<!-- ブラウザ: 読み込むと parseRecords・fitTemperature・codeFor などがそのまま使える -->
<script src="percent-fixer.js"></script>
```

直し方は温度スケーリングです。確率 p を 1/T 乗して、合計が 1 になるように割り直します（softmax(log p / T)）。直しても、いちばん確率の高い答えは変わりません。

## 記録の形

1 行に 1 件。次の 3 つの形を混ぜて書けます。`#` で始まる行は読み飛ばします。

```text
# CSV: 選択肢ごとの確率（% でもよい）と、最後に正解（A・B・C…、または 1 から数えた番号）
0.08949,0.0615,0.849,C
# Jev の Choice: 返ってきた probabilities に、正解の選択肢を足す
{"probabilities": {"returns": 0.9, "shipping": 0.06, "billing": 0.04}, "answer": "returns"}
# Jev の Noul: yes の確率と、正解（true か false）
{"noul": 0.83, "answer": true}
```

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | ページ |
| `percent-fixer.js` | 計算（記録を読む・直す数を求める・交差検証・式を出す） |
| `percent-fixer.test.mjs` | テスト |
| `make-data.mjs` | 見本のデータを、公開されている元データから作り直す |
| `semif-wanli256.json` | テストに使う見本のデータ |
| `work.json` | サイトの一覧に出す題と要約 |
| `card.jpg` | リンクのカードの画像 |

## テスト

Node 22 以上で、このフォルダで次を走らせます。ほかのパッケージは要りません。

```sh
node percent-fixer.test.mjs
```

SemIf が公開した値（正解率・直す数・交差検証の組ごとの直す数・ECE）を同じ組分けで再現すること、3 つの形の記録を読めること、出てくる式がページの計算と同じ%を出すこと、T を 0.25 から 8 まで変えても選ぶ答えが変わらないことを確かめます。

## 見本のデータと出典

- 見本は、SemIf（TheoLeeCJ/SemIf-OpenJev・コミット 23cf1f3・MIT）が公開した Qwen3.5-4B の 3 択の判定 256 件です。正解は WANLI（Liu ほか 2022・CC BY 4.0）から取りました。作り直すときは `node make-data.mjs <SemIf の clone> <WANLI の test.jsonl>`。
- Jev の返り値と confidence の式は、TypeSafe の文書（Choice・Noul・Confidence）によります。
- 温度スケーリングは Guo ほか「On Calibration of Modern Neural Networks」（2017）。

## ライセンス

コードは MIT（リポジトリの `LICENSE`）。見本のデータの元は SemIf（MIT）と WANLI（CC BY 4.0）で、権利はそれぞれの作者にあります。
