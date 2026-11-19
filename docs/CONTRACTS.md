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
