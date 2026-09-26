/*
 * topic craft の図の部品（React Flow 12）。作品ページの「仕組み」などを図で見せる。
 * 使い方:
 *   1. ページには <script src="../../assets/flow.js" defer></script> を 1 行置くだけ。React・React Flow・dagre は
 *      このファイルが決まった版で順に読み込む（cdnjs と jsdelivr）
 *   2. 1 ページに図をいくつでも置ける。<div class="flow" data-graph="図の JSON の id"></div> ごとに描く
 *   3. 色はサイトの色（tone: blue このページ・自動 / gold あなた / pink あなたのコード / gray 補足）。凡例は JSON の legend
 * 図の JSON（<script type="application/json" id="…">）:
 *   { "id": "保存の鍵", "direction": "auto|LR|TB", "legend": [{ "tone": "gold", "label": "あなた" }],
 *     "nodes": [{ "id", "eyebrow"（誰が）, "title", "body", "tone", "w"（幅 px）, "x", "y" }],
 *     "edges": [{ "source", "target", "label", "dashed": true }] }
 *   x・y の無いノードは dagre で自動整列する。direction が auto なら、枠の幅が 560px 未満で縦（TB）、それ以上で横（LR）。
 * 見る人ができること: 拡大縮小（ピンチ・＋−）、ノードのドラッグ、「全体を見る」「並べ直す」。ドラッグした配置はこの端末に残る
 *   （localStorage の tc-flow:<id>。使えなければ残さないだけ）。ページのスクロールを奪わないよう、ホイールでは拡大しない。
 */
(function () {
  var LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
    'jsx-shim',
    'https://cdn.jsdelivr.net/npm/@xyflow/react@12.3.6/dist/umd/index.js',
    'https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js',
  ]
  function load(src) {
    if (src === 'jsx-shim') {
      // React Flow の UMD は window.jsxRuntime を求めるが、React 18 の UMD には無い。createElement で補う
      var toEl = function (type, props, key) {
        var p = props || {}, rest = {}, k, kids = []
        for (k in p) if (k !== 'children') rest[k] = p[k]
        if (key !== undefined) rest.key = key
        if (p.children !== undefined) kids = Array.isArray(p.children) ? p.children : [p.children]
        return React.createElement.apply(React, [type, rest].concat(kids))
      }
      window.jsxRuntime = { Fragment: React.Fragment, jsx: toEl, jsxs: toEl }
      return Promise.resolve()
    }
    return new Promise(function (ok, ng) {
      var s = document.createElement('script'); s.src = src; s.async = false
      s.onload = function () { ok() }; s.onerror = function () { ng(new Error('読めない: ' + src)) }
      document.head.appendChild(s)
    })
  }
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.flow[data-graph]'))
  if (!boxes.length) return
  LIBS.reduce(function (p, src) { return p.then(function () { return load(src) }) }, Promise.resolve())
    .then(function () { boxes.forEach(draw); document.documentElement.dataset.flow = 'ready' })
    .catch(function (e) {
      boxes.forEach(function (b) { b.innerHTML = '<p class="flow-fallback">図を読み込めなかった（' + e.message + '）。下の文章に同じことを書いてある。</p>' })
      document.documentElement.dataset.flow = 'failed'
    })

  function draw(box) {
    var RF = window.ReactFlow, h = React.createElement
    var graph = JSON.parse(document.getElementById(box.dataset.graph).textContent)
    var KEY = 'tc-flow:' + (graph.id || box.dataset.graph)
    var dir = graph.direction && graph.direction !== 'auto' ? graph.direction : (box.clientWidth < 560 ? 'TB' : 'LR')
    var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY + ':' + dir) || 'null') } catch (e) { saved = null }
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    box.setAttribute('role', 'img'); if (graph.title) box.setAttribute('aria-label', graph.title)

    function layout(nodes, edges) {
      var g = new dagre.graphlib.Graph(); g.setDefaultEdgeLabel(function () { return {} })
      g.setGraph({ rankdir: dir, nodesep: dir === 'TB' ? 24 : 36, ranksep: dir === 'TB' ? 46 : 64, marginx: 8, marginy: 8 })
      nodes.forEach(function (n) { g.setNode(n.id, { width: n.data.w || 220, height: n.data.hgt || 96 }) })
      edges.forEach(function (e) { g.setEdge(e.source, e.target) })
      dagre.layout(g)
      return nodes.map(function (n) { var p = g.node(n.id); return Object.assign({}, n, { position: { x: p.x - (n.data.w || 220) / 2, y: p.y - (n.data.hgt || 96) / 2 } }) })
    }
    function initial() {
      var nodes = graph.nodes.map(function (n) {
        var pos = (saved && saved[n.id]) || (n.x !== undefined && dir === (graph.direction || 'LR') ? { x: n.x, y: n.y } : null)
        var hgt = 52 + Math.ceil(((n.body || '').length * 12.5) / ((n.w || 220) - 28)) * 19
        return { id: n.id, type: 'card', position: pos || { x: 0, y: 0 }, data: { eyebrow: n.eyebrow, title: n.title, body: n.body, tone: n.tone || 'blue', w: n.w, hgt: hgt }, _nopos: !pos }
      })
      var edges = graph.edges.map(function (e, i) {
        return { id: e.id || ('e' + i), source: e.source, target: e.target, label: e.label, type: 'smoothstep', className: e.dashed ? 'dashed' : '', markerEnd: { type: RF.MarkerType.ArrowClosed, width: 16, height: 16, color: '#cfd3de' } }
      })
      if (nodes.some(function (n) { return n._nopos })) nodes = layout(nodes, edges)
      return { nodes: nodes, edges: edges }
    }
    function CardNode(props) {
      var d = props.data
      return h('div', { className: 'flow-node ' + d.tone + (props.selected ? ' sel' : ''), style: { '--w': (d.w || 220) + 'px' } },
        h(RF.Handle, { type: 'target', position: dir === 'TB' ? RF.Position.Top : RF.Position.Left }),
        d.eyebrow ? h('div', { className: 'eb' }, d.eyebrow) : null,
        h('div', { className: 'ti' }, d.title || ''),
        d.body ? h('div', { className: 'bd' }, d.body) : null,
        h(RF.Handle, { type: 'source', position: dir === 'TB' ? RF.Position.Bottom : RF.Position.Right }))
    }
    var nodeTypes = { card: CardNode }

    // 枠の下に操作と凡例を置く
    var bar = document.createElement('div'); bar.className = 'flow-bar'
    bar.innerHTML = '<button type="button" data-a="fit">全体を見る</button><button type="button" data-a="layout">並べ直す</button>' +
      (graph.legend || []).map(function (l) { return '<span class="lg ' + l.tone + '"><i></i>' + l.label + '</span>' }).join('')
    box.insertAdjacentElement('afterend', bar)

    function App() {
      var init = React.useMemo(initial, [])
      var ns = RF.useNodesState(init.nodes), nodes = ns[0], setNodes = ns[1], onNodesChange = ns[2]
      var es = RF.useEdgesState(init.edges), edges = es[0], onEdgesChange = es[2]
      var inst = React.useRef(null)
      var store = function (list) { try { var o = {}; list.forEach(function (n) { o[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) } }); localStorage.setItem(KEY + ':' + dir, JSON.stringify(o)) } catch (e) {} }
      React.useEffect(function () {
        bar.querySelector('[data-a=fit]').onclick = function () { inst.current && inst.current.fitView({ padding: 0.12, maxZoom: 1 }) }
        bar.querySelector('[data-a=layout]').onclick = function () {
          try { localStorage.removeItem(KEY + ':' + dir) } catch (e) {}
          setNodes(function (cur) { return layout(cur, edges) }); setTimeout(function () { inst.current && inst.current.fitView({ padding: 0.12, maxZoom: 1 }) }, 50)
        }
      })
      return h(RF.ReactFlow, {
        nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange,
        onInit: function (i) { inst.current = i }, fitView: true, fitViewOptions: { padding: 0.12, maxZoom: 1 }, minZoom: 0.2, maxZoom: 2,
        onNodeDragStop: function () { inst.current && store(inst.current.getNodes()) }, nodesConnectable: false, elementsSelectable: true,
        zoomOnScroll: false, preventScrolling: false, panOnDrag: !coarse, zoomOnPinch: true,
      },
        h(RF.Background, { gap: 24, size: 1, color: '#e4e6ee' }),
        h(RF.Controls, { showInteractive: false }))
    }
    ReactDOM.createRoot(box).render(h(RF.ReactFlowProvider, null, h(App)))
  }
})()
