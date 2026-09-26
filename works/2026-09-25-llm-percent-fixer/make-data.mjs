// 見本のデータ（SemIf が公開した Qwen3.5-4B の判定 256 件）を、公開されている元データから作り直す。依存なし。
//   node make-data.mjs <SemIf の clone> <WANLI の test.jsonl>
// 書き出すもの:
//   semif-wanli256.json … テスト用。各件のロジット・正解の位置・SemIf の交差検証の組
//   index.html          … <script type="text/plain" id="sample-data"> の中身（見本。1 行 1 件、A・B・C の確率と正解）
// 元データ:
//   SemIf（https://github.com/TheoLeeCJ/SemIf-OpenJev）の
//     results/raw/predictions/direct-wanli256.jsonl … 各件で選択肢 A・B・C に付いたロジット
//     benchmarks/manifests/source-selection.jsonl  … 各件が WANLI のどの行か（正解は WANLI 側にある）
//     results/raw/calibration/wanli256.json         … 5 分割交差検証の組分け
//   WANLI（https://huggingface.co/datasets/alisawuffles/WANLI）の test.jsonl（リビジョン 61c95318…・CC BY 4.0）
// 正解の対応は SemIf の benchmarks/build_wanli.py と同じ（entailment → supported など）。
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const [semif, wanliPath] = process.argv.slice(2)
if (!semif || !wanliPath) { console.error('使い方: node make-data.mjs <SemIf の clone> <WANLI の test.jsonl>'); process.exit(1) }
const here = path.dirname(new URL(import.meta.url).pathname)
const WANLI_REVISION = '61c95318fd71c55b6ba355d76253254615f387ec'
const WANLI_SHA256 = '4276e0af7fcdf657d1ab7beb54eaf025fda592a76c9ee86b63b7871953fc74fd'   // SemIf の benchmarks/fetch_sources.py に固定されている値
const LABELS = ['supported', 'insufficient', 'contradicted']
const FROM_WANLI = { entailment: 'supported', neutral: 'insufficient', contradiction: 'contradicted' }
const jsonl = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))

const wanliRaw = readFileSync(wanliPath)
const sha = createHash('sha256').update(wanliRaw).digest('hex')
if (sha !== WANLI_SHA256) throw new Error(`WANLI の SHA-256 が固定値と違う: ${sha}`)
const wanli = new Map(wanliRaw.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => { const r = JSON.parse(l); return [String(r.id), r] }))
const selection = new Map(jsonl(path.join(semif, 'benchmarks/manifests/source-selection.jsonl')).filter((m) => m.source === 'wanli').map((m) => [m.id, m]))
const foldOf = JSON.parse(readFileSync(path.join(semif, 'results/raw/calibration/wanli256.json'), 'utf8')).cv.fold_groups
const preds = jsonl(path.join(semif, 'results/raw/predictions/direct-wanli256.jsonl'))

const orders = [], rows = []
let massMin = 1
for (const p of preds) {
  const m = selection.get(p.id); if (!m) throw new Error(`選定表に無い: ${p.id}`)
  if (m.upstream.revision !== WANLI_REVISION) throw new Error(`WANLI のリビジョンが違う: ${p.id}`)
  const up = wanli.get(String(m.upstream.source_id)); if (!up) throw new Error(`WANLI に無い: ${m.upstream.source_id}`)
  if (JSON.stringify(p.option_ids) !== JSON.stringify(m.option_ids)) throw new Error(`選択肢の並びが違う: ${p.id}`)
  const t = p.option_ids.indexOf(FROM_WANLI[up.gold]); if (t < 0) throw new Error(`正解が選択肢に無い: ${p.id}`)
  const fold = foldOf[m.group_id]; if (fold === undefined) throw new Error(`組分けに無い: ${m.group_id}`)
  const key = p.option_ids.map((id) => LABELS.indexOf(id)).join('')
  let o = orders.indexOf(key); if (o < 0) { orders.push(key); o = orders.length - 1 }
  rows.push([...p.option_logits, t, fold, o])
  massMin = Math.min(massMin, p.allowed_token_mass)
}
if (rows.length !== 256) throw new Error(`256 件のはずが ${rows.length} 件`)

// テスト用の固定データ
const fixture = {
  about: '各行 = [選択肢 A・B・C のロジット, 正解の位置 0-2, SemIf の交差検証の組 0-4, 並び]。並びは orders の番号で、各数字が labels の番号（A・B・C の順）',
  source: { semif: 'TheoLeeCJ/SemIf-OpenJev results/raw/predictions/direct-wanli256.jsonl', wanli: `alisawuffles/WANLI test.jsonl @ ${WANLI_REVISION.slice(0, 8)} (sha256 ${WANLI_SHA256.slice(0, 8)})` },
  labels: LABELS, orders: orders.map((k) => k.split('').map(Number)), allowedMassMin: massMin,
}
writeFileSync(path.join(here, 'semif-wanli256.json'), JSON.stringify(fixture).slice(0, -1) + ',"rows":[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n')

// ページの見本: ロジットを確率にして 4 桁で書く（1 行 1 件: A の確率, B の確率, C の確率, 正解の記号）
const softmax = (z) => { const m = Math.max(...z); const w = z.map((v) => Math.exp(v - m)); const s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s) }
const lines = rows.map(([a, b, c, t]) => [...softmax([a, b, c]).map((p) => Number(p.toPrecision(4))), 'ABC'[t]].join(','))
const sample = '\n# 見本: Qwen3.5-4B の 3 択の判定 256 件（英語の問題。A・B・C の確率, 正解）\n' + lines.join('\n') + '\n'
const htmlPath = path.join(here, 'index.html')
const html = readFileSync(htmlPath, 'utf8')
const open = '<script type="text/plain" id="sample-data">', close = '</script>'
const a = html.indexOf(open); const b = html.indexOf(close, a)
if (a < 0 || b < 0) throw new Error('index.html に見本の置き場が無い')
writeFileSync(htmlPath, html.slice(0, a + open.length) + sample + html.slice(b))
console.log(`${rows.length} 件・並び ${orders.length} 種・A/B/C に乗る確率の最小 ${massMin}`)
