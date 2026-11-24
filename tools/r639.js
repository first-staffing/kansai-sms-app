/* ================================================================
   R639 (9.3.6) 2026-11-24  案件に座標を入れる (国交省の町丁目の位置)
   - 案件検索アプリで使った国交省「位置参照情報 (大字・町丁目)」から作った
     関西5府県の町丁目の位置表 (town_coords.json、約3万件) を使う
   - 座標の無い案件は、住所 (府県・市区町村・町名・丁目) からその町丁目の位置を入れる。
     町丁目まで分からなければ町名、だめなら市区町村の中心
   - 位置表は案件逆引き・案件検索を開いたときだけ読み込む (約340KB)
   ================================================================ */
window._r639 = "9.3.6";
var R639_URL = "https://first-staffing.github.io/kansai-sms-app/town_coords.json";
window._r639Towns = window._r639Towns || null;
var r639Loading_ = null;
function r639Load_(){
  if (window._r639Towns) return Promise.resolve(window._r639Towns);
  if (r639Loading_) return r639Loading_;
  r639Loading_ = fetch(R639_URL, { credentials: "omit" }).then(function(r){ return r.json(); }).then(function(j){
    window._r639Towns = j; r639FillCases_(); return j;
  }).catch(function(){ r639Loading_ = null; return null; });
  return r639Loading_;
}
var R639_KNUM = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
function r639K2n_(k){
  if (!k) return null;
  if (k === "十") return 10;
  var m = k.match(/^([二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (m) return (m[1] ? R639_KNUM[m[1]] : 1) * 10 + (m[2] ? R639_KNUM[m[2]] : 0);
  return R639_KNUM[k] || null;
}
function r639Norm_(s){
  return String(s || "")
    .replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/^〒?\s*\d{3}-?\d{4}/, "")
    .replace(/[\s　]+/g, "")
    .replace(/[－−‐ー―]/g, "-")
    .replace(/ケ/g, "ヶ");
}
function r639Geo_(addr, prefHint, muniHint){
  var T = window._r639Towns; if (!T) return null;
  var s = r639Norm_(addr);
  var pref = "";
  Object.keys(T).forEach(function(p){ if (s.indexOf(p) === 0) pref = p; });
  if (!pref && prefHint && T[prefHint]) { pref = prefHint; } else if (pref) { s = s.slice(pref.length); }
  if (!pref) return null;
  var cities = T[pref];
  if (s.indexOf(pref) === 0) s = s.slice(pref.length);
  /* 市区町村: 長い名前から前方一致。住所に郡が書かれていない場合も拾う */
  var city = "", rest = s;
  var names = Object.keys(cities).sort(function(a, b){ return b.length - a.length; });
  for (var i = 0; i < names.length && !city; i++) {
    var n = names[i], n2 = n.replace(/^.+?郡/, "");
    if (s.indexOf(n) === 0) { city = n; rest = s.slice(n.length); }
    else if (n2 !== n && s.indexOf(n2) === 0) { city = n; rest = s.slice(n2.length); }
  }
  if (!city && muniHint && cities[muniHint]) { city = muniHint; rest = s.replace(muniHint, ""); }
  if (!city) return null;
  var towns = cities[city], best = null, bestLen = 0, baseHit = null;
  rest = rest.replace(/^大字/, "");
  var chomeNum = null;
  Object.keys(towns).forEach(function(t){
    var tt = t.replace(/^大字/, "");
    if (rest.indexOf(tt) === 0 && tt.length > bestLen) { best = towns[t]; bestLen = tt.length; return; }
    var m = tt.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
    if (m && m[1] && rest.indexOf(m[1]) === 0) {
      var after = rest.slice(m[1].length);
      var dm = after.match(/^(\d+)(?:丁目|-|番|$)/);
      if (dm && Number(dm[1]) === r639K2n_(m[2]) && m[1].length + 1 > bestLen) { best = towns[t]; bestLen = m[1].length + 1; return; }
      if (!baseHit || m[1].length > baseHit.len) baseHit = { len: m[1].length, pts: [] };
      if (baseHit.len === m[1].length) baseHit.pts.push(towns[t]);
    }
  });
  if (best) return { lat: best[0], lon: best[1], level: "town" };
  if (baseHit && baseHit.pts.length) {
    var la = 0, lo = 0; baseHit.pts.forEach(function(p){ la += p[0]; lo += p[1]; });
    return { lat: la / baseHit.pts.length, lon: lo / baseHit.pts.length, level: "town_base" };
  }
  var all = Object.keys(towns).map(function(t){ return towns[t]; });
  if (!all.length) return null;
  var a2 = 0, o2 = 0; all.forEach(function(p){ a2 += p[0]; o2 += p[1]; });
  return { lat: a2 / all.length, lon: o2 / all.length, level: "city" };
}
function r639FixOne_(c){
  if (!c) return false;
  var has = c.lat != null && c.lon != null && isFinite(c.lat) && isFinite(c.lon) && !c._r637RepCoord;
  if (has) return false;
  var g = r639Geo_(c.address || ((c.prefecture || "") + (c.municipality || "")), c.prefecture, c.municipality);
  if (!g) return false;
  c.lat = Number(g.lat.toFixed(6)); c.lon = Number(g.lon.toFixed(6));
  c._r637RepCoord = false; c._r639Level = g.level;
  return true;
}
function r639FillCases_(){
  try {
    if (!window._r639Towns || typeof CASES === "undefined" || !Array.isArray(CASES)) return 0;
    var n = 0;
    CASES.forEach(function(c){ if (r639FixOne_(c)) n++; });
    window._r639Filled = (window._r639Filled || 0) + n;
    if (n && (location.hash || "").indexOf("#/list") === 0 && state.mode === "reverse") { try { route(); } catch(e) {} }
    return n;
  } catch(e) { return 0; }
}
/* 逆引きの座標補完 (R637) より先に、町丁目の位置を使う */
var r639PrevFix_ = r637FixCase_;
r637FixCase_ = function(c){
  if (window._r639Towns) { try { r639FixOne_(c); } catch(e) {} }
  else { try { r639Load_(); } catch(e) {} }
  return r639PrevFix_.apply(this, arguments);
};
/* 案件逆引き・案件検索を開いたら位置表を読み込む。案件マスターが入れ替わったら補い直す */
setInterval(function(){
  try {
    var need = (location.hash || "").indexOf("#/list") === 0 && (state.mode === "reverse" || state.mode === "special");
    if (need && !window._r639Towns) r639Load_();
    if (window._r639Towns && typeof CASES !== "undefined" && CASES !== window._r639LastCases) { window._r639LastCases = CASES; r639FillCases_(); }
  } catch(e) {}
}, 1500);
window.APP_VERSION_LABEL = "v9.3.6";
try { r621PaintVersion_(); } catch(e) {}
