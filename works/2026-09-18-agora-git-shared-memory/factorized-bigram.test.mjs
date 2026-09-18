// 論文 "Agora: Git as Shared Memory for Collective AutoResearch"（arXiv:2609.18094）の
// 主要な数字の算術と、勝ち筋 Stage A の線形代数を確かめる。依存なし。
//   node factorized-bigram.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---------- 1. 論文の数字の算術（§4.3・§4.5 の値をそのまま使う） ----------
const RANDOM = 3.3923       // 乱数初期化の bpb
const BEST = 1.899044       // 打ち切り時点の最良
const GPT2 = 1.0            // 学習済み GPT-2 124M（論文は "about 1.0"）
const AT_18TH = 1.9304      // 18 番目の採点済み投稿（Table 4）
const SCORED = 1124         // 採点済み結果の数

test('学習済み GPT-2 との差の 62% を詰めた', (t) => {
  const closed = (RANDOM - BEST) / (RANDOM - GPT2)
  t.diagnostic(`(3.3923 − 1.899044) / (3.3923 − 1.0) = ${closed.toFixed(4)}`)
  assert.equal(Math.round(closed * 100), 62)
})
test('最初の 18 件の採点済み投稿で総減少の約 98%', (t) => {
  const share = (RANDOM - AT_18TH) / (RANDOM - BEST)
  t.diagnostic(`(3.3923 − 1.9304) / (3.3923 − 1.899044) = ${share.toFixed(4)}`)
  assert.equal(Math.round(share * 100), 98)
})
test('残り 1,106 件が見つけたのは次の 0.03', () => {
  assert.equal(SCORED - 18, 1106)
  assert.equal(Math.round((AT_18TH - BEST) * 100) / 100, 0.03)
})

// ---------- 2. Stage A: 遷移表 M を「埋め込み × 出力ヘッド」に畳む（Algorithm 1 の 8〜11 行） ----------
// 乱数（再現できるよう固定シード）
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
// 各行が log-softmax の V×V の表（本物はドナーの次トークン log-softmax の混合。ここでは乱数）
function randomLogProbTable(V, rand) {
  return Array.from({ length: V }, () => {
    const z = Array.from({ length: V }, () => (rand() - 0.5) * 6)
    const m = Math.max(...z); const lse = m + Math.log(z.reduce((a, x) => a + Math.exp(x - m), 0))
    return z.map((x) => x - lse)
  })
}
// 片側ヤコビ法の SVD。A（m×n, m>=n）→ { U: m×n, S: n, V: n×n }（列ベクトルは配列の配列で持つ）
function svd(A) {
  const m = A.length, n = A[0].length
  const W = A.map((r) => r.slice()); const Vm = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      let a = 0, b = 0, g = 0
      for (let i = 0; i < m; i++) { a += W[i][p] * W[i][p]; b += W[i][q] * W[i][q]; g += W[i][p] * W[i][q] }
      if (Math.abs(g) <= 1e-15 * Math.sqrt(a * b)) continue
      off = Math.max(off, Math.abs(g) / Math.sqrt(a * b))
      const zeta = (b - a) / (2 * g); const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta))
      const c = 1 / Math.sqrt(1 + t * t), s = c * t
      for (let i = 0; i < m; i++) { const x = W[i][p], y = W[i][q]; W[i][p] = c * x - s * y; W[i][q] = s * x + c * y }
      for (let i = 0; i < n; i++) { const x = Vm[i][p], y = Vm[i][q]; Vm[i][p] = c * x - s * y; Vm[i][q] = s * x + c * y }
    }
    if (off < 1e-14) break
  }
  const S = Array.from({ length: n }, (_, j) => Math.hypot(...W.map((r) => r[j])))
  const order = S.map((_, j) => j).sort((i, j) => S[j] - S[i])
  return {
    S: order.map((j) => S[j]),
    U: W.map((r) => order.map((j) => (S[j] > 1e-300 ? r[j] / S[j] : 0))),
    V: Vm.map((r) => order.map((j) => r[j])),
  }
}
// Algorithm 1 の 8〜11 行。u = 行平均、C = M − 1uᵀ、rank d−1 の SVD、E と H を組む（温度は 1）
function stageA(M, d) {
  const V = M.length
  const u = Array.from({ length: V }, (_, j) => M.reduce((a, r) => a + r[j], 0) / V)
  const C = M.map((r) => r.map((x, j) => x - u[j]))
  const { U, S, V: Vt } = svd(C)
  const k = d - 1, sd = Math.sqrt(d)
  const E = M.map((_, v) => [1, ...Array.from({ length: k }, (_, i) => U[v][i] / sd)])              // 埋め込み V×d
  const H = M.map((_, w) => [u[w] / sd, ...Array.from({ length: k }, (_, i) => Vt[w][i] * S[i])])   // 出力ヘッド V×d
  return { u, C, S, E, H }
}
// 副層をすべて零にした網の順伝播: 各位置の logits は、その位置の埋め込み × ヘッドᵀ だけで決まる
const forward = (E, H, tokens) => tokens.map((v) => H.map((h) => h.reduce((a, x, i) => a + x * E[v][i], 0)))
const maxAbs = (A, B) => Math.max(...A.flatMap((r, i) => r.map((x, j) => Math.abs(x - B[i][j]))))
const frob = (A, B) => Math.sqrt(A.reduce((a, r, i) => a + r.reduce((b, x, j) => b + (x - B[i][j]) ** 2, 0), 0))

const V = 24
const M = randomLogProbTable(V, rng(2609))

test('中心化した表 C の列和は 0（だから rank(C) ≤ V−1 で、次元 0 を u に空けた rank d−1 がちょうど足りる）', () => {
  const { C } = stageA(M, V)
  for (let j = 0; j < V; j++) assert.ok(Math.abs(C.reduce((a, r) => a + r[j], 0)) < 1e-12)
})
test('d = V: 埋め込み × ヘッドᵀ × √d が遷移表 M を丸ごと復元する', (t) => {
  const { E, H } = stageA(M, V)
  const logits = forward(E, H, [...Array(V).keys()]).map((r) => r.map((x) => x * Math.sqrt(V)))
  t.diagnostic(`V = d = ${V}: 最大誤差 ${maxAbs(logits, M).toExponential(2)}`)
  assert.ok(maxAbs(logits, M) < 1e-9, `最大誤差 ${maxAbs(logits, M)}`)
})
test('d < V: 誤差は落とした特異値ぶんだけ（Eckart–Young）で、d を増やすと単調に減る', (t) => {
  let prev = Infinity
  for (const d of [4, 8, 12, 16, 20]) {
    const { S, E, H } = stageA(M, d)
    const logits = forward(E, H, [...Array(V).keys()]).map((r) => r.map((x) => x * Math.sqrt(d)))
    const err = frob(logits, M)
    const tail = Math.hypot(...S.slice(d - 1))
    t.diagnostic(`d = ${String(d).padStart(2)}: 誤差（フロベニウス）${err.toFixed(4)} ＝ 落とした特異値の二乗和の平方根 ${tail.toFixed(4)}`)
    assert.ok(Math.abs(err - tail) < 1e-9, `d=${d}: 誤差 ${err} vs 落とした特異値 ${tail}`)
    assert.ok(err < prev); prev = err
  }
})
test('文脈を変えても現在トークンが同じなら logits が同じ（= バイグラムモデル）', () => {
  const { E, H } = stageA(M, 8)
  const a = forward(E, H, [3, 17, 5]), b = forward(E, H, [9, 5])
  assert.deepEqual(a[2], b[1])
})
