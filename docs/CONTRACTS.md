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

---

# 追加2：途中から・まとめモード・星と称号（PLAN.md「追加機能2」）

## ファイル担当
| 担当 | ファイル |
|---|---|
| H 星と称号 | js/stars.js, css/stars.css, tools/stars-test.js |
| I まとめモード | js/matome.js, js/generators.js（レベル対応の追加。既存の呼び方はそのまま動くこと）, tools/check-lessons.js（検査の追加）, tools/matome-test.js |
| J 途中から・画面 | js/session.js, js/app.js, js/problems.js, js/maker.js, js/present.js, css/style.css, index.html, sw.js |

読み込み順：store.js → share.js → … → generators.js → matome.js（generators の後）… stars.js と session.js は store.js の直後。

## Shosu.Stars（H）
```js
Stars.CATALOG   // [{id, kind:'normal'|'special', group:'lesson'|'matome'|'review'|'more'|'make'|'friend'|'present', label, how}]
Stars.TITLES    // [{id, icon, name, need:{normal, specialKinds, specialTotal}}]  宇宙・スペース系8段階（PLAN E）
Stars.log(type, data) -> [新しくもらった星]   // 出来事を記録して評価。もらった星があれば自分でゲット表示・称号アップのおいわいを出す
   // type と data：
   //  'lesson'  {no}                         （Store.stats('lesson-'+no) と S.Lessons の問題数から判定）
   //  'review'  {topic, total, correct}      （1回分が終わったとき）
   //  'more'    {correct:true|false}         （もっとれんしゅうの1問ごと）
   //  'matome'  {level:'easy'|'normal'|'hard', minutes, total, correct, finished:true|false}
   //  'made'    {kind, token}                （問題を作った：ほぞん または リンク/コードのコピー。同じ token は1回）
   //  'friend'  {token, correct, authorKey}  （ともだちの問題に答えた。authorKey は作った人を区別する文字列）
   //  'present' {token}                      （自分の問題を「みんなに見せる」）
Stars.evaluate() -> [新しくもらった星]          // 起動時に呼ぶ。前からの記録（Store）も星に変える
Stars.summary() -> {normal, normalMax, specialTotal, specialKinds, specialKindsMax, title, next, needForNext:{normal, specialKinds, specialTotal}}
Stars.badge() -> HTMLElement                    // 上のバー用「★23 ✦12 🪐小数プラネット」。押すと #/stars。変化に合わせて自動で更新
Stars.mountCollection(el) -> {destroy()}        // 星のずかん画面の中身（#/stars は J が作る）
Stars.onChange(fn)
```
保存：localStorage 'shosu.stars'（もらった星と日付、✦の合計、出来事の記録）。

## Shosu.Matome（I）
```js
Matome.LEVELS = [{id:'easy', label:'かんたん'}, {id:'normal', label:'ふつう'}, {id:'hard', label:'むずかしい'}]
Matome.TIMES  = [5, 10, 15, 20]
Matome.TAGS   = ['hyoshikata','shikumi','daisho','jubai','tashizan','hikizan','kimari']
Matome.build({level, minutes, weak /* {tag: 0..1 の×の割合} 任意 */, rng}) -> { problems:[problem...], seconds:[目安秒...], total秒 }
Matome.estimate(problem, level) -> 秒
```
problem は既存の問題形式（fill/choice/order/hissan）。各 problem に tag を付ける。
`Generators.make(name, rng, {level})` でレベル指定（省略時は今までどおり）。

## Shosu.Session（J）
```js
Session.save(key, state)  Session.load(key) -> state|null  Session.clear(key)
// key 例 'lesson-3', 'more-3', 'review-daisho', 'matome'
```

---

# 追加4：じぶんで計画（PLAN.md「追加機能4」）

## ファイル担当
| 担当 | ファイル |
|---|---|
| L 計画 | js/planner.js, css/planner.css, tools/planner-test.js |
| M ふりかえり | js/reflect.js, css/reflect.css, tools/reflect-test.js |
| N つなぎ | js/share.js, js/stars.js, tools/stars-test.js, tools/share-test.js, js/app.js, js/icons.js, js/preset.js（新規）, index.html, sw.js, tools/build-single.js |

## ゴール（Goal）
```js
Goal = { v:1, id:'g-<作成時刻36進>', name:'小数のテスト', date:'2026-11-28',
  classes:[{date:'2026-11-24', minutes:20, lesson:7 /*任意: 第○時*/ , note:'' /*任意*/}, ...],
  created:'ISO' }
```
保存：localStorage 'shosu.goal'。読み込み時の優先：window.SHOSU_PRESET.goal（ゴール入りのアプリ）が保存中のものより新しい（created が後）なら上書き。

## Shosu.Share 追加（N）
```js
Share.encodeGoal(goal) -> Promise<token>      Share.decodeGoal(token) -> Promise<Goal>
Share.encodeReflection(r) -> Promise<token>   Share.decodeReflection(token) -> Promise<Reflection>
Share.kindOf(token) -> 'problem'|'goal'|'reflection'|null
Share.extractTokens(text) は3種類とも取り出す（先頭の版文字で種類を見分ける。'1'=問題のまま、goal・reflection は別の文字）
Share.codeText(token) -> コピー用の文（http(s) なら URL '#/q/'|'#/g/'|'#/r/'、file:// なら「しょうすうもんだい／しょうすうゴール／しょうすうふりかえり #/x/…」）
```

## Shosu.Planner（L）
```js
Planner.goal() -> Goal|null      Planner.setGoal(goal)        // 保存・上書き
Planner.settings() / setSettings({extraMinutes:0|10|15|20|30, extraDays:'everyday'|'weekdays'|[曜日0-6]})
Planner.ITEMS()  -> [{id, kind:'lesson'|'review'|'matome'|'make', ref, label, minutes, href, done():bool, stars:{got,max}}]
   // id 例 'lesson-3', 'review-daisho', 'matome-normal-10', 'make'
Planner.draft() -> Roadmap        // ゴールから逆算した下書き
Planner.roadmap() -> Roadmap      Planner.saveRoadmap(rm)
   // Roadmap = { goalId, days:[{date, type:'class'|'self', minutes, items:[itemId...], lesson?}] }
Planner.today() -> {date, type, minutes, items:[itemId], plan:TodayPlan|null}
Planner.savePlan(TodayPlan)  Planner.plan(date) -> TodayPlan|null
   // TodayPlan = { date, items:[itemId], meate:{choices:[text], ink:Ink|null}, started:'ISO' }
Planner.meateCandidates(itemIds) -> [text]
Planner.mountRoadmap(el) / mountToday(el) -> {destroy()}   // 画面の中身（ルートは N が作る）
Planner.todayPanel() -> HTMLElement|null   // ホーム上部「きょうの計画」（計画があるときだけ）
```

## Shosu.Reflect（M）
```js
Reflect.history(date) -> { items:[{itemId,label,done,correct,total,hints}], problems:{total,correct,hints}, stars:[...], made:n, friend:n }
   // Store・Stars の記録から、その日の分を集める
Reflect.save(Reflection)  Reflect.list() -> [Reflection]  Reflect.get(date)
   // Reflection = { v:1, date, name:Ink|null, meate:{choices,ink}, y:{auto:[text], extra:[text]}, w:{eval:'double'|'single'|'triangle', choices:[text], ink:Ink|null},
   //               t:{choices:[text], ink:Ink|null}, aid }
Reflect.nextSuggestions() -> [text]     // 直近の T（次の今日の計画・めあて候補に使う）
Reflect.mountYWT(el, date) -> {destroy()}   Reflect.mountBox(el) -> {destroy()}
Reflect.profileName() / setProfileName(ink)   // 最初に1回書く名前
```

## 星（N が stars.js に追加）
Stars.log('plan', {date})、Stars.log('reflect', {date, eval, planDone:bool, usedPrevT:bool})、Stars.log('roadmapDone', {goalId})。
称号：小数サン ★56＋✦全しゅるい、小数ギャラクシー ★ぜんぶ（63）＋✦全しゅるい＋✦合計30。
