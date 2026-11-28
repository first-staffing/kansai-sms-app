/**
 * 8.0.4 市区町村の入れ直し (キカリ側サーバーに足すファイル。zz_ で始まる名前にして最後に読み込ませる)
 *
 * 2026-11-28: CSV に「市区町村」の列が無く住所が1つの列 (全文) だったため、
 *   prefecture = 京都府 / municipality = 空 / address_rest = 京都府京都市伏見区深草…
 * の形で入った求職者がいる。住所から市区町村を読み取って municipality に入れ、
 * address_rest を「町名・番地・建物名」だけに直す。座標 (lat/lon) やステータスには触らない。
 *
 * 使い方 (エディタから実行):
 *   backfillMunicipalityDry()  … 試し。書き込まない。何人直るか・読み取れない人が何人かを数える
 *   backfillMunicipalityRun()  … 本番。1回の実行で最大 300人 (約4分で打ち切り)。「残り」が 0 になるまで繰り返す
 * 読み取り方は画面側 (tools/r800.js の splitAddress) と同じ:
 *   関西5府県は国交省の位置表 (town_coords.json) の市区町村名と前方一致 (郡を省いた住所も正式名に)。
 *   表に無い府県・当たらない住所は形 (〜郡〜町 / 〜市〜区 / 〜市 / 〜区 / 〜町・村) で読む。
 */
var MUNIFIX_TOWNS_URL_ = 'https://first-staffing.github.io/kansai-sms-app/town_coords.json';
var MUNIFIX_PREFS_ = ['大阪府', '京都府', '兵庫県', '奈良県', '滋賀県', '和歌山県', '東京都', '神奈川県', '埼玉県', '千葉県', '茨城県'];
var MUNIFIX_TABLE_ = null, MUNIFIX_NAMES_ = {};

function munifixTable_() {
  if (MUNIFIX_TABLE_) return MUNIFIX_TABLE_;
  var res = UrlFetchApp.fetch(MUNIFIX_TOWNS_URL_ + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('市区町村の表を読めませんでした: HTTP ' + res.getResponseCode());
  MUNIFIX_TABLE_ = JSON.parse(res.getContentText('UTF-8'));
  return MUNIFIX_TABLE_;
}
function munifixNfkc_(s) {
  return String(s || '').replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' ');
}
function munifixMatch_(pref, m) {
  var cities = munifixTable_()[pref];
  if (cities) {
    var names = MUNIFIX_NAMES_[pref] || (MUNIFIX_NAMES_[pref] = Object.keys(cities).sort(function (a, b) { return b.length - a.length; }));
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (m.indexOf(n) === 0) return { name: n, used: n.length };
      var n2 = n.replace(/^.+?郡/, '');
      if (n2 !== n && m.indexOf(n2) === 0) return { name: n, used: n2.length };
    }
  }
  var r = m.match(/^([^市]{1,5}郡[^市町村]{1,6}[町村])/) || m.match(/^([^市]{1,6}市[^市区町村]{1,5}区)/) ||
    m.match(/^(.{1,7}?市)/) || m.match(/^(.{1,6}?区)/) || m.match(/^(.{1,7}?[町村])/);
  return r ? { name: r[1], used: r[1].length } : null;
}
/** 住所 → { pref, muni, rest }。読み取れなければ null */
function munifixSplit_(address, prefHint) {
  var clean = munifixNfkc_(address).replace(/^\s*〒?\s*\d{3}-?\d{4}\s*/, '').replace(/^\s+|\s+$/g, '');
  if (!clean) return null;
  var m = clean.replace(/\s+/g, ''), pref = '', used = 0;
  for (var i = 0; i < MUNIFIX_PREFS_.length; i++) { if (m.indexOf(MUNIFIX_PREFS_[i]) === 0) { pref = MUNIFIX_PREFS_[i]; used = pref.length; break; } }
  if (!pref) { if (prefHint && MUNIFIX_PREFS_.indexOf(prefHint) >= 0) pref = prefHint; else return null; }
  var hit = munifixMatch_(pref, m.slice(used));
  if (!hit || !hit.name) return null;
  used += hit.used;
  var k = 0, pos = 0;
  for (; pos < clean.length && k < used; pos++) { if (!/\s/.test(clean.charAt(pos))) k++; }
  return { pref: pref, muni: hit.name, rest: clean.slice(pos).replace(/^\s+|\s+$/g, '') };
}

function backfillMunicipalityDry() { var r = backfillMunicipality_(true); Logger.log(JSON.stringify(r, null, 1)); return r; }
function backfillMunicipalityRun() { var r = backfillMunicipality_(false); Logger.log(JSON.stringify(r, null, 1)); return r; }

function backfillMunicipality_(dryRun) {
  var t0 = Date.now(), LIMIT = 300, MAX_MS = 4 * 60 * 1000;
  var rows = readTable_('applicants').rows;
  var out = { dry_run: !!dryRun, total: rows.length, target: 0, fixed: 0, unknown: 0, pref_mismatch: 0, left: 0, by_pref: {}, samples: [], unknown_samples: [] };
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.municipality || '').replace(/\s/g, '') !== '') continue;        // 市区町村が入っている人は触らない
    var addr = String(r.address_rest || '');
    if (!addr.replace(/\s/g, '')) continue;                                       // 住所が無い人は直しようがない
    out.target++;
    var pref = String(r.prefecture || '');
    var sp = munifixSplit_(addr, pref);
    if (!sp) { out.unknown++; if (out.unknown_samples.length < 5) out.unknown_samples.push(String(r.applicant_id)); continue; }
    if (pref && sp.pref !== pref) { out.pref_mismatch++; continue; }              // 府県が食い違う行は触らない (人が見て直す)
    out.by_pref[sp.pref] = (out.by_pref[sp.pref] || 0) + 1;
    if (out.samples.length < 5) out.samples.push({ id: String(r.applicant_id), municipality: sp.muni });
    if (dryRun) { out.fixed++; continue; }
    if (out.fixed >= LIMIT || Date.now() - t0 > MAX_MS) { out.left++; continue; }
    var patch = { municipality: sp.muni, address_rest: sp.rest, updated_at: nowIso_() };
    if (!pref) patch.prefecture = sp.pref;
    updateRowByPk_('applicants', r.applicant_id, patch);
    out.fixed++;
  }
  out.ms = Date.now() - t0;
  return out;
}
