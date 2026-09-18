/*
 * 成果物の投稿ページ（post.html）の「X に投稿」。1回押して、動画（または画像）付きで X の投稿画面へ渡す。
 *
 *   共有シートが使える端末（iOS Safari・Android Chrome）: navigator.share({ files, text })
 *     → 共有シートで X を選ぶ → X の投稿画面に本文と動画が入って開く → 投稿ボタン
 *   使えない環境: X の Web Intent（本文だけ。動画は付かない）→ 投稿ボタン
 *
 * リンクは本文に入れず、返信に貼る（本文に外部リンクを付けると届く範囲が下がる傾向）。
 * どちらの経路でも投稿するのは本人。ここは投稿しない。
 * 文字数は X の数え方（英数字1・日本語2・URLは23・上限280）で数える。
 * 添付は同じディレクトリのファイル（post.json の media.src）を fetch で読む。
 */
;(() => {
  const post = JSON.parse(document.getElementById('post').textContent)
  const workUrl = new URL('./index.html', location.href).href
  const $ = (id) => document.getElementById(id)
  const ta = $('draft'), cnt = $('cnt'), go = $('go'), copy = $('copy'), copyReply = $('copyReply'), replyEl = $('reply')
  const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]]
  const URL_RE = /https?:\/\/[^\s<>"'）」]+|(?<![\w@./-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|ai|co|jp|app|me|so|xyz|info|edu|gov|us|uk|de|fr|cn|ru|tv|cc|ly|sh|gg|to|in|ml|page|site|tech|cloud|run|link|blog|news|wiki|art|design|studio|team|world|space|live|online|store|shop|top|club|pro|biz)(?![a-z])(?:\/[^\s<>"'）」]*)?/gi
  const chars = (s) => { let n = 0; for (const ch of s) { const cp = ch.codePointAt(0); n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2 } return n }
  const weighted = (t) => { const s = String(t).normalize('NFC'); let n = 0, last = 0; for (const m of s.matchAll(URL_RE)) { n += chars(s.slice(last, m.index)) + 23; last = m.index + m[0].length } return n + chars(s.slice(last)) }

  ta.value = post.text
  const reply = post.reply.replaceAll('{url}', workUrl)
  replyEl.textContent = reply
  const sync = () => { const w = weighted(ta.value); cnt.textContent = `${w} / 280`; cnt.classList.toggle('over', w > 280); ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px` }
  ta.addEventListener('input', sync); sync()

  async function mediaFile() {
    const m = post.media
    if (!m || !m.src) return null
    const res = await fetch(m.src)
    if (!res.ok) return null
    return new File([await res.blob()], m.name || m.src, { type: m.type })
  }
  go.addEventListener('click', async () => {
    const text = ta.value
    const file = await mediaFile().catch(() => null)
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }) } catch (e) { /* 共有シートを閉じた */ }
      return
    }
    location.href = 'https://x.com/intent/post?text=' + encodeURIComponent(text)
  })
  const flash = (b, label) => { const t = b.textContent; b.textContent = label; b.classList.add('done'); setTimeout(() => { b.textContent = t; b.classList.remove('done') }, 1400) }
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(ta.value); flash(copy, 'コピーした') } catch { ta.select() } })
  copyReply.addEventListener('click', async () => { try { await navigator.clipboard.writeText(reply); flash(copyReply, 'コピーした') } catch {} })
  if (!(navigator.share && navigator.canShare)) $('how').textContent = 'この端末では X の投稿画面が本文入りで開く（動画は付かない）。投稿ボタンは自分で押す。'
})()
