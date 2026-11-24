/**
 * 9.7 座標の取り込み (キカリ側サーバーに追加するファイル)
 *
 * 案件検索アプリで使った「国交省 位置参照情報 (大字・町丁目)」の関西5府県・約3万町丁目の
 * 位置表 (GitHub Pages の town_coords.json) を使って、座標が入っていない
 *   - 求職者 (applicants: prefecture + municipality + address_rest)
 *   - 案件 (cases: address、無ければ prefecture + municipality)
 * に lat / lon を入れる。町丁目まで分かれば町丁目、町名までなら町名の中心、
 * それも無理なら市区町村の中心。すでに座標が入っている行は変えない。
 *
 * 使い方:
 *   backfillCoords(true)  … 試し (書き込まない。何件入るかだけ数える)
 *   backfillCoords(false) … 本番 (書き込む)
 *   installCoordBackfillTrigger() … 1時間おきに新しく入った分を埋めるトリガーを置く
 *
 * 書き込み後は、おすすめ案件の事前計算 (recommend_cache) を作り直すと、フォームにも反映される。
 */
var TOWN_COORDS_URL_ = 'https://first-staffing.github.io/kansai-sms-app/town_coords.json';
var TOWN_TABLE_ = null;

function townTable_() {
  if (TOWN_TABLE_) return TOWN_TABLE_;
  var res = UrlFetchApp.fetch(TOWN_COORDS_URL_ + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('町丁目の位置表を読めませんでした: HTTP ' + res.getResponseCode());
  TOWN_TABLE_ = JSON.parse(res.getContentText('UTF-8'));
  return TOWN_TABLE_;
}
var GEO_KNUM_ = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
function geoK2n_(k) {
  if (!k) return null;
  if (k === '十') return 10;
  var m = k.match(/^([二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (m) return (m[1] ? GEO_KNUM_[m[1]] : 1) * 10 + (m[2] ? GEO_KNUM_[m[2]] : 0);
  return GEO_KNUM_[k] || null;
}
function geoNorm_(s) {
  return String(s || '')
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/^〒?\s*\d{3}-?\d{4}/, '')
    .replace(/[\s　]+/g, '')
    .replace(/[－−‐ー―]/g, '-')
    .replace(/ケ/g, 'ヶ');
}
/** 住所 → { lat, lon, level: town / town_base / city }。分からなければ null */
function geocodeTown_(addr, prefHint, muniHint) {
  var T = townTable_();
  var s = geoNorm_(addr);
  var pref = '';
  Object.keys(T).forEach(function (p) { if (s.indexOf(p) === 0) pref = p; });
  if (pref) s = s.slice(pref.length); else if (prefHint && T[prefHint]) pref = prefHint;
  if (!pref) return null;
  if (s.indexOf(pref) === 0) s = s.slice(pref.length);
  var cities = T[pref], city = '', rest = s;
  var names = Object.keys(cities).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < names.length && !city; i++) {
    var n = names[i], n2 = n.replace(/^.+?郡/, '');
    if (s.indexOf(n) === 0) { city = n; rest = s.slice(n.length); }
    else if (n2 !== n && s.indexOf(n2) === 0) { city = n; rest = s.slice(n2.length); }
  }
  if (!city && muniHint && cities[muniHint]) { city = muniHint; rest = s.replace(muniHint, ''); }
  if (!city) return null;
  var towns = cities[city], best = null, bestLen = 0, baseHit = null;
  rest = rest.replace(/^大字/, '');
  Object.keys(towns).forEach(function (t) {
    var tt = t.replace(/^大字/, '');
    if (rest.indexOf(tt) === 0 && tt.length > bestLen) { best = towns[t]; bestLen = tt.length; return; }
    var m = tt.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
    if (m && m[1] && rest.indexOf(m[1]) === 0) {
      var after = rest.slice(m[1].length);
      var dm = after.match(/^(\d+)(?:丁目|-|番|$)/);
      if (dm && Number(dm[1]) === geoK2n_(m[2]) && m[1].length + 1 > bestLen) { best = towns[t]; bestLen = m[1].length + 1; return; }
      if (!baseHit || m[1].length > baseHit.len) baseHit = { len: m[1].length, pts: [] };
      if (baseHit.len === m[1].length) baseHit.pts.push(towns[t]);
    }
  });
  if (best) return { lat: best[0], lon: best[1], level: 'town' };
  if (baseHit && baseHit.pts.length) {
    var la = 0, lo = 0; baseHit.pts.forEach(function (p) { la += p[0]; lo += p[1]; });
    return { lat: la / baseHit.pts.length, lon: lo / baseHit.pts.length, level: 'town_base' };
  }
  var all = Object.keys(towns).map(function (t) { return towns[t]; });
  if (!all.length) return null;
  var a2 = 0, o2 = 0; all.forEach(function (p) { a2 += p[0]; o2 += p[1]; });
  return { lat: a2 / all.length, lon: o2 / all.length, level: 'city' };
}
function geoHasCoord_(r) {
  var la = Number(r.lat), lo = Number(r.lon);
  return r.lat !== '' && r.lat != null && r.lon !== '' && r.lon != null && isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
}
function backfillTable_(table, dryRun, addrOf) {
  var t = readTable_(table);
  var latCol = t.headers.indexOf('lat'), lonCol = t.headers.indexOf('lon');
  if (latCol < 0 || lonCol < 0) throw new Error(table + ' に lat / lon 列がありません');
  var stat = { table: table, rows: t.rows.length, had: 0, filled: 0, town: 0, town_base: 0, city: 0, unknown: 0 };
  var latPairs = [], lonPairs = [];
  t.rows.forEach(function (r) {
    if (geoHasCoord_(r)) { stat.had++; return; }
    var a = addrOf(r);
    var g = null;
    try { g = geocodeTown_(a.addr, a.pref, a.muni); } catch (e) { g = null; }
    if (!g) { stat.unknown++; return; }
    stat.filled++; stat[g.level]++;
    latPairs.push({ row: r._row, value: Number(g.lat.toFixed(6)) });
    lonPairs.push({ row: r._row, value: Number(g.lon.toFixed(6)) });
  });
  if (!dryRun && latPairs.length) {
    withLock_(function () {
      var sh = sheet_(table);
      writeColumnRuns_(sh, latCol, latPairs);
      writeColumnRuns_(sh, lonCol, lonPairs);
    });
  }
  return stat;
}
/** 座標の無い求職者・案件に、町丁目の位置を入れる。dryRun=true なら数えるだけ */
function backfillCoords(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var t0 = Date.now();
  var out = {};
  out.applicants = backfillTable_('applicants', dryRun, function (r) {
    return { addr: str_(r.prefecture) + str_(r.municipality) + str_(r.address_rest), pref: str_(r.prefecture), muni: str_(r.municipality) };
  });
  out.cases = backfillTable_('cases', dryRun, function (r) {
    var a = str_(r.address);
    return { addr: a || (str_(r.prefecture) + str_(r.municipality)), pref: str_(r.prefecture), muni: str_(r.municipality) };
  });
  out.dry_run = dryRun; out.ms = Date.now() - t0;
  console.log('[coords] ' + JSON.stringify(out));
  return out;
}
function backfillCoordsHourly() { return backfillCoords(false); }
function installCoordBackfillTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backfillCoordsHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backfillCoordsHourly').timeBased().everyHours(1).create();
  return 'ok';
}
