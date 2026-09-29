// 振り分けボード: 問い合わせをサーバー（POST /classify）に送り、振り分け先を出して担当の箱に積む。
// ?samples=1 で開くと、見本の問い合わせを先に流してから入力を待つ。
const SAMPLES = [
  'オペレーターと直接話したい', 'メルマガが毎日来てうるさいので止めたい', '注文したスニーカー、まだ発送されてないんですけど',
  '先月分の領収書を発行してほしい', 'クレカで払おうとしたらエラーになります', '引っ越したのでお届け先の住所を変えたいです',
  '年間プランを途中でやめるとお金かかりますか',
]
const HUMAN = '__human__'
const $ = (id) => document.getElementById(id)
const pct = (p) => Math.round(p * 100) + '%'
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const state = { teams: {}, threshold: 0.9, counts: {}, human: 0, automatic: 0, number: 1, last: null, busy: false }

async function classify(text) {
  const res = await fetch('/classify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ---------- 描画 ----------
function drawGrid(hot) {
  const tile = (key, t) => {
    const n = state.counts[key] || 0
    const plus = hot === key ? `+1 · ${pct(state.last.probability)}` : '+1'
    return `<div class="tile${n ? '' : ' zero'}${hot === key ? ' hot' : ''}" style="--hot:${t.color}">
      <div class="hd"><span class="mark" style="background:${t.color}">${esc(t.mark)}</span><span class="nm">${esc(t.name)}</span></div>
      <div class="n">${n}</div><span class="plus" style="color:${t.color}">${plus}</span></div>`
  }
  $('grid').innerHTML =
    `<div class="tile human${hot === HUMAN ? ' hot' : ''}"><div class="hd"><span class="mark ask">?</span><span class="nm">要確認（人が見る）</span></div>
      <span><span class="plus">+1</span><span class="n">${state.human}</span></span></div>` +
    Object.entries(state.teams).map(([key, t]) => tile(key, t)).join('')
  $('automatic').textContent = state.automatic
  $('human').textContent = state.human
}

function drawVerdict(r) {
  const v = $('verdict')
  const first = state.teams[r.team], [secondKey, secondP] = r.runner_up, second = state.teams[secondKey]
  if (r.automatic) {
    v.className = 'verdict auto'
    v.innerHTML = `<span class="mark" style="background:${first.color}">${esc(first.mark)}</span><span class="t">${esc(first.name)}へ自動で回す</span><span class="p" style="color:${first.color}">${pct(r.probability)}</span>`
    $('note').textContent = `確率 ${pct(state.threshold)} 以上なので、そのまま担当へ`
  } else {
    v.className = 'verdict human'
    v.innerHTML = `<span class="t">要確認</span><div class="split">
      <span style="background:${first.color}" data-w="${r.probability * 100}">${esc(first.name)} ${Math.round(r.probability * 100)}</span>
      <span style="background:${second.color}" data-w="${secondP * 100}">${esc(second.name)} ${Math.round(secondP * 100)}</span></div>`
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const s of v.querySelectorAll('[data-w]')) s.style.width = s.dataset.w + '%' }))
    $('note').textContent = 'どちらとも取れるので、人へ'
  }
  $('ms').textContent = (r.ms / 1000).toFixed(2) + ' 秒'
}

function resetInbox() {
  $('number').textContent = '#' + state.number
  $('verdict').className = 'verdict'
  $('verdict').textContent = 'ここに振り分け先が出ます'
  $('ms').textContent = ''
  $('note').textContent = `確率 ${pct(state.threshold)} 以上なら自動、未満なら人へ`
}

// ---------- 操作 ----------
function tally(r, highlight) {
  state.last = r
  if (r.automatic) { state.counts[r.team] = (state.counts[r.team] || 0) + 1; state.automatic++ } else state.human++
  state.number++
  drawGrid(highlight ? (r.automatic ? r.team : HUMAN) : null)
}

async function submit() {
  const text = $('text').value.trim()
  if (!text || state.busy) return
  state.busy = true; $('go').disabled = true; $('live').classList.add('busy')
  $('verdict').className = 'verdict'; $('verdict').textContent = '判定中…'; $('ms').textContent = ''
  try {
    const r = await classify(text)
    $('number').textContent = '#' + state.number
    drawVerdict(r); tally(r, true)
    document.body.dataset.last = text          // 録画の台本がここを待つ
  } catch (e) {
    $('verdict').textContent = '振り分けに失敗しました: ' + e.message
  } finally { state.busy = false; $('go').disabled = false; $('live').classList.remove('busy') }
}

async function runSamples() {
  $('samples').disabled = true; $('live').classList.add('busy')
  for (const text of SAMPLES) tally(await classify(text), false)
  $('live').classList.remove('busy'); $('samples').disabled = false; resetInbox()
}

$('go').addEventListener('click', submit)
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit() } })
// 次の問い合わせを入れ始めたら文だけ空ける。前の振り分け結果は、次に「振り分ける」を押すまで残す
$('text').addEventListener('focus', () => { if (document.body.dataset.last) { $('text').value = ''; $('number').textContent = '#' + state.number; delete document.body.dataset.last } })
$('samples').addEventListener('click', runSamples)

;(async () => {
  const conf = await (await fetch('/teams')).json()
  state.teams = conf.teams; state.threshold = conf.threshold
  drawGrid(null); resetInbox()
  if (new URLSearchParams(location.search).get('samples') === '1') await runSamples()
  document.body.dataset.ready = '1'
})()
