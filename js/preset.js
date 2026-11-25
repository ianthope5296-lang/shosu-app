/* preset.js — 配るときに最初から入れておく設定。
 * 先生メニューの「ゴール・Forms入りのアプリをダウンロード」で作った shosu-app.html では、
 * ここが window.SHOSU_PRESET = {"goal": {...}, "formsUrl": "..."}; に置きかわる。
 * formsUrl：子どもが「先生に送る」を押したときに開く Microsoft Forms（学校で決めたもの）。 */
window.SHOSU_PRESET = window.SHOSU_PRESET || {};
if (!window.SHOSU_PRESET.formsUrl) {
  window.SHOSU_PRESET.formsUrl = 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=hE02HiLu7U28DW6kpOnphdTv0bkOdnxPt_eShBybv4RUMDBCTTg3OEZNS0tQV0M3VFA2T1hESlQ2Ti4u&route=shorturl';
}
