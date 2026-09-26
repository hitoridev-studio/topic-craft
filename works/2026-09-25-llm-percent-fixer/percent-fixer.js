// 答え合わせ済みの判定の記録から、確率を「本当に当たる割合」に直す数（温度 T）を求める計算。依存なし。
//   ブラウザ: <script src="percent-fixer.js"></script> で読むと、下の関数がそのまま使える（index.html と同じ）
//   Node:     const pf = require('./percent-fixer.js')（percent-fixer.test.mjs が使い方の見本）
// 使い方は README.md。
// 直し方は温度スケーリング: 確率 p を 1/T 乗して合計 1 に割り直す（= softmax(log p / T)）。定義は SemIf の benchmarks/calibrate.py と同じ
const LETTERS = 'ABCDEFGHIJKLMNOP'
const YES = new Set(['yes', 'true', '1', 'y', 'はい']), NO = new Set(['no', 'false', '0', 'n', 'いいえ'])
function toProbs(values) {
  const v = values.map(Number)
  if (v.length < 1 || v.some((x) => !Number.isFinite(x) || x < 0)) return null
  const scale = v.some((x) => x > 1) ? 100 : 1                         // 90,6,4 のような % 書きも受ける
  if (v.length === 1) { const p = v[0] / scale; return p <= 1 ? [p, 1 - p] : null }   // 1 つだけなら yes の確率
  const s = v.reduce((a, b) => a + b, 0); return s > 0 ? v.map((x) => x / s) : null
}
function answerIndex(ans, count, keys) {
  if (count === 2 && keys === null && typeof ans !== 'number') {       // yes/no（yes が 0 番）
    const a = String(ans).trim().toLowerCase(); if (YES.has(a)) return 0; if (NO.has(a)) return 1
  }
  if (typeof ans === 'boolean') return ans ? 0 : 1
  if (keys) { const i = keys.indexOf(String(ans)); if (i >= 0) return i }
  const a = String(ans).trim()
  if (/^[A-Pa-p]$/.test(a)) { const i = LETTERS.indexOf(a.toUpperCase()); return i < count ? i : -1 }
  if (/^\d+$/.test(a)) { const i = Number(a) - 1; return i >= 0 && i < count ? i : -1 }   // 1 から数えた番号
  return -1
}
function parseLine(line) {
  const s = line.trim()
  if (!s || s.startsWith('#')) return null
  let probs, t, keys = null
  if (s.startsWith('{')) {
    let o; try { o = JSON.parse(s) } catch { return { error: 'JSON として読めない' } }
    const ans = o.answer ?? o.correct ?? o.label
    if (ans === undefined) return { error: 'answer（正解）が無い' }
    if (typeof o.noul === 'number') { probs = toProbs([o.noul]); if (!probs) return { error: 'noul は 0〜1 の数' }; t = answerIndex(typeof ans === 'boolean' ? ans : String(ans), 2, null) }
    else if (Array.isArray(o.probabilities)) { probs = toProbs(o.probabilities); if (!probs) return { error: '確率が読めない' }; t = answerIndex(typeof ans === 'number' ? String(ans + 1) : ans, probs.length, null) }
    else if (o.probabilities && typeof o.probabilities === 'object') { keys = Object.keys(o.probabilities); probs = toProbs(Object.values(o.probabilities)); if (!probs) return { error: '確率が読めない' }; t = answerIndex(ans, probs.length, keys) }
    else return { error: 'probabilities か noul が無い' }
  } else {
    const parts = s.split(/[,\t]/).map((x) => x.trim()).filter((x) => x !== '')
    if (parts.length < 2) return { error: '確率と正解が要る' }
    probs = toProbs(parts.slice(0, -1)); if (!probs) return { error: '確率が読めない' }
    t = answerIndex(parts[parts.length - 1], probs.length, parts.length === 2 ? null : [])
  }
  if (t < 0) return { error: '正解が選択肢に無い' }
  return { logp: probs.map((p) => Math.log(Math.max(p, 1e-12))), t, n: probs.length }
}
function parseRecords(text) {
  const rows = [], errors = []
  text.split('\n').forEach((line, i) => { const r = parseLine(line); if (!r) return; if (r.error) errors.push({ line: i + 1, msg: r.error }); else rows.push(r) })
  return { rows, errors }
}
function softmax(z, T) {
  const x = z.map((v) => v / T); const m = Math.max(...x)
  const w = x.map((v) => Math.exp(v - m)); const s = w.reduce((a, b) => a + b, 0)
  return w.map((v) => v / s)
}
function argmax(p) { let k = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i; return k }   // 同点は前を取る（numpy と同じ）
function scoreOne(r, T) { const p = softmax(r.logp, T); const k = argmax(p); return { conf: p[k], correct: k === r.t, pick: k } }
function score(rows, T) { return rows.map((r) => scoreOne(r, T)) }
function nll(rows, T) { let s = 0; for (const r of rows) s += -Math.log(Math.max(softmax(r.logp, T)[r.t], 1e-12)); return s / rows.length }
function fitTemperature(rows, lo = 0.05, hi = 20, iterations = 60) {
  const ratio = (Math.sqrt(5) - 1) / 2
  let left = hi - ratio * (hi - lo), right = lo + ratio * (hi - lo)
  let fl = nll(rows, left), fr = nll(rows, right)
  for (let i = 0; i < iterations; i++) {
    if (fl < fr) { hi = right; right = left; fr = fl; left = hi - ratio * (hi - lo); fl = nll(rows, left) }
    else { lo = left; left = right; fl = fr; right = lo + ratio * (hi - lo); fr = nll(rows, right) }
  }
  return (lo + hi) / 2
}
// 組分け: 行を決まった乱数（mulberry32・種 1）で並べ替え、順に 5 組へ配る。同じ記録なら毎回同じ組になる
function foldsFor(n, k = 5, seed = 1) {
  let a = seed >>> 0
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
  const fold = new Array(n); idx.forEach((row, pos) => { fold[row] = pos % k }); return fold
}
// 交差検証: 組 f 以外で T を決め、組 f の行を直して数える。返り値は行の順に並んだ結果と、組ごとの T
function crossValidate(rows, fold, k = 5) {
  const held = new Array(rows.length), temps = []
  for (let f = 0; f < k; f++) {
    const T = fitTemperature(rows.filter((_, i) => fold[i] !== f)); temps.push(T)
    rows.forEach((r, i) => { if (fold[i] === f) held[i] = scoreOne(r, T) })
  }
  return { held, temps }
}
function gate(scored, threshold) { const auto = scored.filter((s) => s.conf >= threshold); return { auto: auto.length, correct: auto.filter((s) => s.correct).length } }
function bins(scored, n = 10) {
  const out = []
  for (let i = 0; i < n; i++) {
    const part = scored.filter((s) => Math.min(n - 1, Math.floor(s.conf * n)) === i)
    out.push(part.length ? { lower: i / n, upper: (i + 1) / n, n: part.length, conf: part.reduce((a, s) => a + s.conf, 0) / part.length, acc: part.filter((s) => s.correct).length / part.length } : null)
  }
  return out
}
function ece(scored, n = 10) { let e = 0; for (const b of bins(scored, n)) if (b) e += Math.abs(b.acc - b.conf) * b.n / scored.length; return e }
function jevConfidence(probs) { const n = probs.length, peak = Math.max(...probs); return Math.max(0, Math.min(1, (n * peak - 1) / (n - 1))) }   // TypeSafe の文書のコードと同じ式
function codeFor(T) {
  const t = T.toFixed(2)
  return {
    python: `T = ${t}  # この記録で決めた直す数

def fix(probs):
    """Jev の probabilities（dict）を直す"""
    w = {k: p ** (1 / T) for k, p in probs.items()}
    s = sum(w.values())
    return {k: v / s for k, v in w.items()}

def fix_yes(p):
    """yes/no の判定の yes の確率（Jev の Noul）を直す"""
    return p ** (1 / T) / (p ** (1 / T) + (1 - p) ** (1 / T))`,
    js: `const T = ${t} // この記録で決めた直す数
const fix = (probs) => { // Jev の probabilities（オブジェクト）を直す
  const w = Object.fromEntries(Object.entries(probs).map(([k, p]) => [k, p ** (1 / T)]))
  const s = Object.values(w).reduce((a, b) => a + b, 0)
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / s]))
}
const fixYes = (p) => p ** (1 / T) / (p ** (1 / T) + (1 - p) ** (1 / T)) // yes/no の判定の yes の確率（Jev の Noul）を直す`,
  }
}

// Node から require したとき（ブラウザでは module が無いので何もしない）
if (typeof module === 'object' && module.exports) module.exports = { parseRecords, parseLine, toProbs, softmax, argmax, score, nll, fitTemperature, foldsFor, crossValidate, gate, bins, ece, jevConfidence, codeFor }
