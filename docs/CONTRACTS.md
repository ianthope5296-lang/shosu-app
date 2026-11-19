# 実装の約束（エージェント間の共通インターフェース）

PLAN.md を前提とする。ビルドなし・ES modules なし。各JSファイルは即時関数で `window.Shosu` に機能を追加する。

```js
(function (S) { ... S.Figures = {...}; })(window.Shosu = window.Shosu || {});
```

## 読み込み順（index.html）
```
model/digit-model.js   -> window.DIGIT_MODEL
js/store.js            -> Shosu.Store
js/recognizer.js       -> Shosu.Recognizer
js/figures.js          -> Shosu.Figures
js/pad.js              -> Shosu.Pad
js/problems.js         -> Shosu.Problems
js/generators.js       -> Shosu.Generators
js/demos/core.js       -> Shosu.Demos (register / mount)
js/demos/*.js          -> 各教材が Shosu.Demos.register(...)
js/lessons.js          -> Shosu.Lessons, Shosu.ReviewTopics
js/app.js              -> 起動
```

## ファイル担当
| 担当 | ファイル |
|---|---|
| A 認識 | tools/train-digits.js, model/digit-model.js, js/recognizer.js, tools/recognizer-test.html |
| B 土台 | index.html, css/style.css, js/app.js, js/store.js, js/pad.js, js/problems.js, sw.js, manifest.json |
| C 教材 | js/figures.js, js/demos/core.js, js/demos/*.js, css/demos.css |
| D 内容 | js/lessons.js, js/generators.js, tools/check-lessons.js |

他担当のファイルは編集しない。必要な変更は最終報告に書く。

## Shosu.Recognizer（A）
```js
Shosu.Recognizer.recognize(strokes, boxW, boxH)
// strokes: [[{x,y},...], ...]  マス内座標（px）
// 戻り値: { digit: 0-9 | null(空), conf: 0..1, top: [{digit, conf}, ...上位3] }
Shosu.Recognizer.isReady() // モデル読込済みなら true
```
同期関数。1マス10ms程度以内。

## Shosu.Store（B）
```js
Store.getSettings() / Store.setSettings(obj)  // {checkMode:'auto'|'self', bigText:false}
Store.record(key, pid, {correct, method:'auto'|'self', hints})  // key 例 'lesson-3', 'review-hissanAdd'
Store.stats(key) // {tried, correct, auto, self, hints, done:{pid:bool}}
Store.resetAll()
```

## Shosu.Pad（B）
```js
Pad.digitBox({size}) -> { el, strokes(), clear(), isEmpty(), mark(state /* 'ok'|'ng'|'unsure'|null */), onChange(fn) }
Pad.memo({width, height}) -> { el, clear() }
```

## Shosu.Figures（C）
`Figures.render(spec) -> Element`（SVG推奨、幅は親に合わせて伸縮）
- `{kind:'masu', unit:'L', L:1, d1:2, d2:6, d3:0, level:2}`
  - level:2 … 1Lますを L 個、0.1Lますを d1 個（満杯）、最後に 0.1Lます1個を10目もり付きで d2 目もり分。d2=0 なら部分ますなし
  - level:3 … 1Lます L 個、0.1Lます d1 個、0.01Lます d2 個、最後の 0.01Lます（10目もり）に d3 目もり分
  - `ticks:false` で部分ますの目もりを描かない（目もりを付ける前の状態）
- `{kind:'numberline', min, max, step, labelEvery, unit:'m', arrows:[{v, label:'あ'}], points:[{v, label}]}`
  - step ごとに小目もり、labelEvery 目もりごとに大目もり＋数値ラベル、中間（5目もり）は中くらいの目もり
- `{kind:'placeTable', cols:['10','1','0.1','0.01','0.001'], rows:['0.43','0.425'], highlightCol:null}`
  - 列見出しは「十の位/一の位/1/10の位…」。数は小数点で位をそろえる
- `{kind:'blocks', counts:{'1':2,'0.1':3,'0.01':8,'0.001':6}}`
- `{kind:'tape', from:0, to:3, value:2.83, unit:'m'}`（任意）

## Shosu.Demos（C）
```js
Demos.register(id, { title, mount(el, opts) -> { destroy() } })
Demos.mount(el, id, opts) -> { destroy() }
Demos.list() -> [{id, title}]
```
id: `masu`（opts.level 2|3） `zoomline` `units` `blocks` `compare` `shift` `hissan`（opts.op '+'|'-', opts.presets） `laws` `furikaeri`
大きなボタン（最小48px）、電子黒板でも見やすく。

## 問題データ（D が作り、B が表示・丸つけ）
```js
{ type:'fill', q?:'問題文', fig?:FigureSpec, parts:['…', {a:'1.26'}, 'L', …], hints:['…'] , explain?:'…'}
  // スロット {a:'1.26'} は数字1つにつきマス1つ、'.' は印刷された小数点。{a:'3254'} も可
{ type:'choice', q, fig?, options:['>','<','='], a:'>', hints, explain? }
{ type:'order', q, items:['0.5','5','0.005','0','0.05'], dir:'desc'|'asc', hints }
{ type:'hissan', op:'+'|'-', a:'4.25', b:'2.18', hints? }  // 答えは B が計算
```
共通の任意項目：`id`（問題ID）、`tag`（ふくしゅう分類）。

## Shosu.Problems（B）
```js
Problems.render(container, problem, { onResult(r /* {correct, method, hints} */), onNext() })
```

## Shosu.Generators（D）
```js
Generators.make(name, rng?) -> problem   // name: masuRead, unitConvert, compose, decompose, countUnits,
                                         //   compare, order, times10, numberlineRead, hissanAdd, hissanSub, laws
Generators.names()
```

## Shosu.Lessons（D）
```js
Shosu.Lessons = [{ no:1, subunit:'小数の表し方', title:'0.1Lより少ないはしたの表し方', page:'p.33〜35',
  meate:'…', matome:'…', demo:{id:'masu', opts:{level:2}}, problems:[...], more:['masuRead'] }, ... 10件 ]
Shosu.ReviewTopics = [{ id:'hyoshikata', title:'表し方・単位', gens:['masuRead','unitConvert','numberlineRead'] }, ...]
```

---

# 追加：もんだいづくり（PLAN.md 後半）

## 新しいファイルと担当
| 担当 | ファイル |
|---|---|
| E 共有 | js/share.js, js/store.js への追加（下記APIのみ追加。既存部分は変えない）, tools/share-test.js |
| F 作る画面 | js/maker.js, css/maker.css |
| G 提示・解く | js/present.js, css/present.css, js/app.js（ルート・ホームのボタン追加）, js/problems.js（qInk・hintInk 表示）, index.html（script/css 追加）, sw.js（バージョン更新） |

## インク（手書きの絵）
```js
Ink = { w: 800, h: 300, strokes: [[{x,y}, ...], ...] }   // 書いた欄の大きさと、その中の座標
```
`Shosu.Pad.memo` から取り出せるよう、F は必要なら maker.js 内で独自の手書き欄を作ってよい（pad.js は変えない）。

## 子どもが作った問題（UserProblem）
```js
{ v: 1, kind: 'hissan' | 'fill' | 'compare' | 'masu' | 'numberline',
  author: Ink,            // 名前（手書き、必須）
  hint: Ink | null,       // ヒント（手書き、任意）
  // kind ごと
  hissan:     { op: '+'|'-', a: '4.25', b: '2.18' }
  fill:       { q: Ink, answer: '1.26', unit: 'L' }        // unit: 'L','m','km','kg','g','mL','cm','mm','こ','倍',''
  compare:    { a: '0.43', b: '0.425' }
  masu:       { level: 2|3, L: 1, d1: 2, d2: 6, d3: 0 }
  numberline: { min: '0', max: '1', step: '0.01', labelEvery: 10, arrows: ['0.25', ...] } // 1〜3本
}
```
（kind ごとの項目は UserProblem のトップレベルに置く。例：`{v:1, kind:'hissan', op:'+', a:'4.25', b:'2.18', author, hint}`）

## Shosu.Share（E）
```js
Share.encode(up)          -> Promise<string>   // base64url トークン（圧縮・線の間引き込み）
Share.decode(token)       -> Promise<UserProblem>  // 検証込み。不正なら reject(Error)
Share.url(token)          -> string            // location の origin+pathname + '#/q/' + token
Share.extractTokens(text) -> string[]          // 貼りつけた文章から '#/q/<token>' を全部取り出す（重複なし）
Share.validate(up)        -> { ok, error }
Share.toProblem(up)       -> problem           // 既存の問題形式に変換。fill/masu/numberline は type:'fill'、
                                               // compare は type:'choice'、hissan は type:'hissan'。
                                               // 変換後に qInk（問題文の絵）・hintInk・authorInk を付ける
Share.answerText(up)      -> '1.26L' など      // 提示画面の「答えを見せる」用
Share.MAX_LEN = 6000
Share.simplify(ink)       -> Ink               // 間引き後の線（作る画面で長さの目安を出すのに使える）
```
圧縮は CompressionStream('deflate-raw')（Edge/Chrome 対応）。トークンは URL にそのまま入る文字だけ。

## Shosu.Store 追加（E）
```js
Store.myList() -> [{id, up, created, updated}]   Store.mySave(up, id?) -> id   Store.myDelete(id)
Store.boxList() -> [{token, up, added}]          Store.boxAdd([{token, up}]) -> 追加数（重複除く）
Store.boxRemove(token)  Store.boxClear()
// ともだちの問題の結果は既存の Store.record('friend', token先頭16文字, {...}) を使う
```

## Shosu.Maker（F）
```js
Maker.mount(el, route) -> { destroy() }   // route: 'make' | 'make/<kind>' | 'my' | 'edit/<id>'
```
作成→ためしに解く（Shosu.Problems.render(Share.toProblem(up))）→できあがり（みんなに見せる＝location.hash='#/q/<token>'、リンクをコピー、ほぞん）。

## Shosu.Present（G）
```js
Present.mount(el, up, { token, onSolve, list?: {index, total, onPrev, onNext} }) -> { destroy() }
Present.drawInk(ink, opts?) -> HTMLCanvasElement  // 絵を表示用に描く（problems.js でも使う）
```
ルート（G が app.js に追加）：`#/make…` `#/my` `#/edit/<id>` → Maker、`#/q/<token>` → 提示画面→「自分で解く」、`#/box` → もんだいボックス、`#/box/<n>` → ボックスのn番目を提示。
