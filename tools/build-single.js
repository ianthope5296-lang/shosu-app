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
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return '<style>/* ' + href + ' */\n' + safeStyle(css) + '\n</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>/* ' + src + ' */\n' + safeScript(js) + '\n</script>';
});

const stamp = new Date().toISOString().slice(0, 10);
html = html.replace('<head>', '<head>\n<!-- 小数アプリ（1ファイル版） 作成日 ' + stamp + ' -->');

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'shosu-app.html');
fs.writeFileSync(out, html);
const left = (html.match(/<script src=|<link rel="stylesheet" href=/g) || []).length;
console.log('wrote', path.relative(root, out), Math.round(fs.statSync(out).size / 1024) + 'KB', left ? 'WARNING: external refs left ' + left : '');
