// index.html と、そこから読み込む CSS・JS をすべて1つのHTMLファイルにまとめる。
// 学校の端末で、Webフィルターに止められずにファイルとして配るため。
//   実行: node tools/build-single.js   → dist/shosu-app.html
// Service Worker と manifest はファイル版では使わないので入れない。
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const safeStyle = (s) => s.replace(/<\/style/gi, '<\\/style');

html = html.replace(/<link rel="manifest"[^>]*>\s*/i, '');
// まだないファイル（ほかの担当が作業中など）は、とばして警告だけ出す。
// js/preset.js は「<script>/* js/preset.js */ … </script>」の目印つきで入る
// （先生メニューの「ゴール入りのアプリをダウンロード」が、ここをゴール入りに置きかえる）。
const missing = [];
const readOr = (rel) => {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) { missing.push(rel); return null; }
  return fs.readFileSync(f, 'utf8');
};
html = html.replace(/<link rel="stylesheet" href="([^"]+)">\s*/g, (m, href) => {
  const css = readOr(href);
  if (css == null) return '';
  return '<style>/* ' + href + ' */\n' + safeStyle(css) + '\n</style>\n';
});
html = html.replace(/<script src="([^"]+)"><\/script>\s*/g, (m, src) => {
  const js = readOr(src);
  if (js == null) return '';
  return '<script>/* ' + src + ' */\n' + safeScript(js) + '\n</script>\n';
});
if (!/<script>\/\* js\/preset\.js \*\//.test(html)) console.warn('WARNING: js/preset.js の目印がありません');

const stamp = new Date().toISOString().slice(0, 10);
html = html.replace('<head>', '<head>\n<!-- 小数アプリ（1ファイル版） 作成日 ' + stamp + ' -->');

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'shosu-app.html');
fs.writeFileSync(out, html);
// 先生用：ひらくと先生メニューから始まる（中身は同じ。記録も同じ端末なら共通）
const teacher = html
  .replace('<head>', '<head>\n<script id="teacher-start">/* 先生用 */ if(!location.hash||location.hash===\'#\'||location.hash===\'#/\'){location.hash=\'#/teacher\';}</script>')
  .replace('<title>', '<title>（先生用）');
fs.writeFileSync(path.join(outDir, 'shosu-app-teacher.html'), teacher);
console.log('wrote dist/shosu-app-teacher.html');
const left = (html.match(/<script src=|<link rel="stylesheet" href=/g) || []).length;
if (missing.length) console.warn('skipped (not found):', missing.join(', '));
console.log('wrote', path.relative(root, out), Math.round(fs.statSync(out).size / 1024) + 'KB', left ? 'WARNING: external refs left ' + left : '');
