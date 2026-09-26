// index.html の計算のテスト。依存なし。 node percent-fixer.test.mjs
// 計算のコード（percent-fixer.js。ページと同じもの）と、ページの見本（<script id="sample-data">）を読み込み、
//   1) SemIf が公開した値（results/raw/calibration/wanli256.json）を、同じ組分けで再現する
//   2) 見本（4 桁に丸めた確率）でもほぼ同じ直す数になり、ページに出る数（171 件・73% → 35 件・83%）が出る
//   3) 3 つの形（Jev の Choice・Noul・CSV）を読める。読めない行を知らせる
//   4) 出てくる式（Python・JavaScript のうち JavaScript を実行）がページの計算と同じ%を出す
//   5) 直しても選ぶ答えは変わらない。Jev の confidence の式。並び順の偏りの数
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const block = (open) => { const a = html.indexOf(open); assert.ok(a >= 0, open); return html.slice(a + open.length, html.indexOf('</script>', a)) }
const M = createRequire(import.meta.url)('./percent-fixer.js')
const SAMPLE = block('<script type="text/plain" id="sample-data">')
const FIX = JSON.parse(readFileSync(new URL('./semif-wanli256.json', import.meta.url), 'utf8'))
const SEMIF = FIX.rows.map(([a, b, c, t, f, o]) => ({ logp: [a, b, c], t, f, order: FIX.orders[o] }))   // ロジットのままでよい（1 行ごとの定数のずれは softmax で消える）
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} と ${b} の差が ${tol} を超える`)
let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }

// SemIf の results/raw/calibration/wanli256.json（コミット 23cf1f3）の値
const PUBLISHED = {
  accuracy: 0.63671875, temperature: 2.499030870405456,
  foldTemperatures: [2.516702322837534, 2.487449022186513, 2.395304063504799, 2.6771924531743414, 2.4268832150887016],
  eceT1: 0.20841294251388492, eceOutOfFold: 0.06909064131988356,
}

test('SemIf の公開値を再現する（正解率・直す数・組ごとの直す数・ECE）', () => {
  assert.equal(SEMIF.length, 256)
  assert.equal(M.score(SEMIF, 1).filter((s) => s.correct).length, 163)
  near(M.fitTemperature(SEMIF), PUBLISHED.temperature, 1e-6, 'T')
  const fold = SEMIF.map((r) => r.f)
  const cv = M.crossValidate(SEMIF, fold)
  cv.temps.forEach((t, i) => near(t, PUBLISHED.foldTemperatures[i], 1e-6, `組 ${i} の T`))
  near(M.ece(M.score(SEMIF, 1)), PUBLISHED.eceT1, 1e-9, 'ECE(T=1)')
  near(M.ece(cv.held), PUBLISHED.eceOutOfFold, 1e-6, 'ECE(交差検証)')
})

const { rows, errors } = M.parseRecords(SAMPLE)
test('見本は 256 件・読めない行なし・4 桁に丸めても直す数はほぼ同じ', () => {
  assert.equal(rows.length, 256); assert.equal(errors.length, 0)
  near(M.fitTemperature(rows), PUBLISHED.temperature, 1e-3, '見本の T')
  assert.deepEqual(rows.map((r) => r.t), SEMIF.map((r) => r.t))
})
test('ページに出る数: 80% 以上は そのまま 171 件・124 件（73%）→ 直すと 35 件・29 件（83%）', () => {
  const before = M.gate(M.score(rows, 1), 0.8)
  assert.deepEqual(before, { auto: 171, correct: 124 }); assert.equal(Math.round(before.correct / before.auto * 100), 73)
  const fold = M.foldsFor(rows.length)
  assert.deepEqual([0, 1, 2, 3, 4].map((k) => fold.filter((x) => x === k).length), [52, 51, 51, 51, 51])
  const after = M.gate(M.crossValidate(rows, fold).held, 0.8)
  assert.deepEqual(after, { auto: 35, correct: 29 }); assert.equal(Math.round(after.correct / after.auto * 100), 83)
})
test('組分けは同じ記録なら毎回同じ', () => assert.deepEqual(M.foldsFor(256), M.foldsFor(256)))

test('3 つの形を読める（Jev の Choice・Noul・CSV）', () => {
  const r = M.parseRecords([
    '# コメントは読まない',
    '{"probabilities": {"returns": 0.9, "shipping": 0.06, "billing": 0.04}, "answer": "shipping"}',
    '{"noul": 0.83, "answer": true}',
    '{"noul": 0.2, "answer": "no"}',
    '0.94,0.04,0.02,B',
    '0.94,0.04,0.02,3',
    '90,6,4,A',
    '0.7,yes',
    '0.7\t0',
    '',
  ].join('\n'))
  assert.equal(r.errors.length, 0)
  assert.deepEqual(r.rows.map((x) => [x.n, x.t]), [[3, 1], [2, 0], [2, 1], [3, 1], [3, 2], [3, 0], [2, 0], [2, 1]])
  near(Math.exp(r.rows[0].logp[0]), 0.9, 1e-12, 'returns の確率')
  near(Math.exp(r.rows[5].logp[0]), 0.9, 1e-12, '% 書きを 0〜1 に直す')
})
test('読めない行は行番号と理由を返す', () => {
  const r = M.parseRecords('{"probabilities": {"a": 0.5, "b": 0.5}}\n0.5,0.5,Z\n{bad json\n0.5')
  assert.deepEqual(r.errors.map((e) => e.line), [1, 2, 3, 4])
  assert.equal(r.rows.length, 0)
})

test('出てくる式（JavaScript）はページの計算と同じ%を出す', () => {
  const T = 2.4990563376881862
  const code = M.codeFor(T)
  assert.ok(code.python.includes('T = 2.50') && code.js.includes('const T = 2.50'))
  const { fix, fixYes } = new Function(code.js + '\nreturn { fix, fixYes }')()
  const Tr = 2.50   // 式には 2 桁に丸めた T が入る
  const probs = { returns: 0.9, shipping: 0.06, billing: 0.04 }
  const want = M.softmax(Object.values(probs).map(Math.log), Tr), got = Object.values(fix(probs))
  got.forEach((v, i) => near(v, want[i], 1e-12, `fix の ${i}`))
  near(fixYes(0.83), M.softmax([Math.log(0.83), Math.log(0.17)], Tr)[0], 1e-12, 'fixYes')
})
test('直しても選ぶ答えは変わらない（T = 0.25〜8）', () => {
  const base = M.score(rows, 1).map((s) => s.pick)
  for (let T = 0.25; T <= 8; T += 0.25) assert.deepEqual(M.score(rows, T).map((s) => s.pick), base, `T = ${T}`)
})
test('Jev の confidence の式（TypeSafe の文書のコード）: (数 × 最大 − 1) ÷ (数 − 1)', () => {
  near(M.jevConfidence([0.9, 0.06, 0.04]), 0.85, 1e-12, '3 択')
  near(M.jevConfidence([1 / 3, 1 / 3, 1 / 3]), 0, 1e-12, '同点')
  near(M.jevConfidence([0.83, 0.17]), 0.66, 1e-12, '2 択')
})
test('並び順の偏り: 正解が A の位置 54/65・B 55/90・C 54/101', () => {
  const s = M.score(SEMIF, 1)
  const by = [0, 1, 2].map((p) => { const i = SEMIF.map((_, k) => k).filter((k) => SEMIF[k].t === p); return [i.filter((k) => s[k].correct).length, i.length] })
  assert.deepEqual(by, [[54, 65], [55, 90], [54, 101]])
})
test('A・B・C に乗る確率の最小は 99.89% 以上（3 つに絞っても捨てていない）', () => assert.ok(FIX.allowedMassMin >= 0.9989))
console.log(`${n} 件 pass`)
