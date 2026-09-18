// index.html に埋め込んだ生成器と復元器のテスト。依存なし。 node taus88.test.mjs
//   1) Factorio の getInt()（逆コンパイル形）と Boost の taus88（定義形）が全ビット一致する
//   2) 観測 k 回での連立方程式の階数（1回 32・2回 64・3回 88）
//   3) ランダムな状態 300 個で、3回の観測から復元した状態が以後 20 回の出力を全部当てる
import assert from 'node:assert/strict'

export function stepGame(s) {
  let [a, b, c] = s
  a = ((((a << 12) ^ (a >>> 6)) & 0x1fff) ^ (a >>> 19) ^ (a << 12)) >>> 0
  b = ((((b << 4) ^ (b >>> 23)) & 0x7f) ^ (b >>> 25) ^ (b << 4)) >>> 0
  c = ((((c << 17) ^ (c >>> 8)) & 0x1fffff) ^ (c >>> 11) ^ (c << 17)) >>> 0
  return [a, b, c]
}
function lfsr(v, k, q, s) { // Boost linear_feedback_shift_engine<uint32_t, 32, k, q, s>
  const b = ((((v << q) ^ v) >>> 0) >>> (k - s)) >>> 0
  const mask = (0xffffffff << (32 - k)) >>> 0
  return ((((v & mask) >>> 0) << s) ^ b) >>> 0
}
export const stepBoost = (s) => [lfsr(s[0], 31, 13, 12), lfsr(s[1], 29, 2, 4), lfsr(s[2], 28, 3, 17)]
export const out = (s) => (s[0] ^ s[1] ^ s[2]) >>> 0

export function buildSystem(k) {
  const cols = []
  for (let i = 0; i < 96; i++) {
    let s = [0, 0, 0]; s[i >> 5] = (1 << (i & 31)) >>> 0
    const o = []; for (let t = 0; t < k; t++) { s = stepGame(s); o.push(out(s)) }
    cols.push(o)
  }
  const rows = []
  for (let t = 0; t < k; t++) for (let bit = 0; bit < 32; bit++) {
    let m = 0n; for (let i = 0; i < 96; i++) if ((cols[i][t] >>> bit) & 1) m |= 1n << BigInt(i); rows.push(m)
  }
  return rows
}
export function solve(observed) {
  const rows = buildSystem(observed.length).map((m, r) => ({ m, y: (observed[r >> 5] >>> (r & 31)) & 1 }))
  const pivots = []; let rank = 0
  for (let col = 0; col < 96 && rank < rows.length; col++) {
    const bit = 1n << BigInt(col); let p = -1
    for (let r = rank; r < rows.length; r++) if (rows[r].m & bit) { p = r; break }
    if (p < 0) continue
    ;[rows[rank], rows[p]] = [rows[p], rows[rank]]
    for (let r = 0; r < rows.length; r++) if (r !== rank && (rows[r].m & bit)) { rows[r].m ^= rows[rank].m; rows[r].y ^= rows[rank].y }
    pivots.push(col); rank++
  }
  for (let r = rank; r < rows.length; r++) if (rows[r].m === 0n && rows[r].y) return { ok: false, rank }
  const x = [0, 0, 0]
  for (let r = 0; r < rank; r++) if (rows[r].y) { const c = pivots[r]; x[c >> 5] = (x[c >> 5] | (1 << (c & 31))) >>> 0 }
  return { ok: true, rank, state: x }
}

const rnd32 = () => (Math.random() * 2 ** 32) >>> 0
// 1) 一致
for (let n = 0; n < 2000; n++) {
  let a = [rnd32(), rnd32(), rnd32()], b = a.slice()
  for (let t = 0; t < 10; t++) { a = stepGame(a); b = stepBoost(b); assert.deepEqual(a, b) }
}
// 2) 階数
const rankOf = (rows) => { const m = rows.slice(); let rank = 0; for (let col = 0; col < 96; col++) { const bit = 1n << BigInt(col); let p = -1; for (let r = rank; r < m.length; r++) if (m[r] & bit) { p = r; break }; if (p < 0) continue; [m[rank], m[p]] = [m[p], m[rank]]; for (let r = 0; r < m.length; r++) if (r !== rank && (m[r] & bit)) m[r] ^= m[rank]; rank++ } return rank }
assert.deepEqual([1, 2, 3, 4].map((k) => rankOf(buildSystem(k))), [32, 64, 88, 88])
// 3) 復元と予測
for (let n = 0; n < 300; n++) {
  let g = [rnd32(), rnd32(), rnd32()]
  const obs = []; for (let t = 0; t < 3; t++) { g = stepGame(g); obs.push(out(g)) }
  const r = solve(obs); assert.equal(r.ok, true); assert.equal(r.rank, 88)
  let h = r.state; for (let t = 0; t < 3; t++) h = stepGame(h)   // 観測した3回ぶん進める
  for (let t = 0; t < 20; t++) { h = stepGame(h); g = stepGame(g); assert.equal(out(h), out(g)) }
}
console.log('ok: game==boost (2000×10), rank 32/64/88/88, recover+predict 300/300')
