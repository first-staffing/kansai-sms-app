/* ================================================================
   R637 (9.3.4) 2026-11-24  案件逆引きを速く (名簿に電話番号があればサーバーを通さない)
   - 距離の初期値を旧アプリと同じ 15km に (5km だと0名が多く、検索をやり直していた)
   - 端末に名簿 (ロスター) が読み込み済みなら、候補をその場で計算してすぐ表示する。
     サーバーの検索結果 (電話番号つき・正本) が届いたら差し替える。
     電話番号が届くまでの間は、その人の「SMSを開く」は押せないようにする
   - 一度検索した案件・条件の結果は10分間おぼえておき、戻ったときは待たずに出す
   ================================================================ */
window._r637 = "9.3.4";
try { if (typeof state !== "undefined" && (state.reverseRadius == null || state.reverseRadius === 5) && !window._r637RadiusSet) { state.reverseRadius = 15; } } catch(e) {}
window._r637RadiusSet = true;
window._r637Done = window._r637Done || {};   // key -> {at, data}
window._r637Local = window._r637Local || {};  // key -> data

function r637LocalCompute_(c){
  try {
    if (typeof r616RosterReady_ !== "function" || !r616RosterReady_()) return null;
    var cond = state.reverseCond || "", inc = !!state.reverseIncludeConsult, wide = !!state.reverseWideMuni;
    if (c.lat == null || c.lon == null) return null;
    var r = state.reverseRadius || 15;
    var muni = state.reverseMuni || "";
    var items = [], munis = {};
    window._r616Roster.items.forEach(function(a){
      if (!a || a.is_test || a.mail_optout || a.job_type !== c.job_type) return;
      if (a.prefecture === c.prefecture && a.municipality) munis[a.municipality] = 1;
      if (a.lat == null || a.lon == null) return;
      var d = distKm(c.lat, c.lon, a.lat, a.lon);
      if (d == null || !(d <= r)) return;
      if (muni && !wide && a.municipality !== muni) return;
      var m = 0; try { m = reverseMatchCount(a); } catch(e) { m = 0; }
      /* サーバー (searchReverseCandidates) と同じ条件の絞り込み */
      if (cond === "match" && !inc && m < 3) return;
      if (cond === "unknown" && !(!a.desired_start_date || !a.qualifications || a.experience_years == null || a.experience_years === "" || !a.nearest_station || !a.desired_days || !a.desired_slots)) return;
      if (cond === "consult" && !inc && m > 1) return;
      var b = Object.assign({}, a);
      b.dist = Math.round(d * 10) / 10;
      b.match = m;
      try { var ph = window._r618Phone && window._r618Phone[a.id]; if (!b.phone && ph && ph.val) b.phone = ph.val; } catch(e) {}
      items.push(b);
    });
    /* サーバー (searchReverseCandidates) と同じ並び: 一致数 → 距離 → 応募の新しい順 */
    items.sort(function(x, y){ return (y.match - x.match) || (x.dist - y.dist) || String(y.applied_at || "").localeCompare(String(x.applied_at || "")); });
    var want = window._r7ReverseWant || 100;
    var facets = Object.keys(munis).sort();
    return { items: items.slice(0, want), total: items.length, facets: facets };
  } catch(e) { return null; }
}

var r637PrevFetch_ = fetchReverseR7_;
fetchReverseR7_ = function(c){
  try {
    var key = r7ReverseKey(c);
    var done = window._r637Done[key];
    if (done && Date.now() - done.at < 10 * 60 * 1000 && (!window._r7Reverse || window._r7Reverse.key !== key)) {
      window._r7Reverse = { key: key, items: done.data.items.slice(), total: done.data.total, facets: done.data.facets, loading: false, error: "" };
      return;
    }
  } catch(e) {}
  /* 名簿に電話番号まで入っていれば、サーバーに問い合わせずに端末だけで完結させる */
  try {
    if (r637RosterHasPhones_()) {
      var key2 = r7ReverseKey(c);
      if (window._r7Reverse && window._r7Reverse.key === key2 && window._r7Reverse.total != null) return;
      var loc = r637LocalCompute_(c);
      if (loc) {
        window._r7Reverse = { key: key2, items: loc.items, total: loc.total, facets: loc.facets, loading: false, error: "", _r637Full: true };
        try { if (loc.facets) window._r7Facets[r7ReverseCaseKey(c)] = loc.facets; } catch(e) {}
        try { r7MergePool(loc.items); } catch(e) {}
        return;
      }
    }
  } catch(e) {}
  return r637PrevFetch_.apply(this, arguments);
};
function r637RosterHasPhones_(){
  try {
    if (typeof r616RosterReady_ !== "function" || !r616RosterReady_()) return false;
    var it = window._r616Roster.items, n = Math.min(it.length, 200), k = 0;
    for (var i = 0; i < n; i++) if (it[i] && String(it[i].phone || "").replace(/[^0-9]/g, "").length >= 10) k++;
    return n > 0 && k / n >= 0.6;
  } catch(e) { return false; }
}

var r637PrevResults_ = reverseResults;
reverseResults = function(cid){
  var out = r637PrevResults_.apply(this, arguments);
  try {
    if (!window._r6ServerMode) return out;
    var c = CASES.find(function(x){ return x.id === cid; }) || CASES[0];
    if (!c) return out;
    var cache = window._r7Reverse, key = r7ReverseKey(c);
    /* サーバーの結果が出たらおぼえる */
    if (cache && cache.key === key && !cache.loading && cache.total != null && !cache._r637Local && !cache._r637Full) {
      window._r637Done[key] = { at: Date.now(), data: { items: cache.items.slice(), total: cache.total, facets: cache.facets } };
      return out;
    }
    /* 読み込み中: 端末の名簿で計算した候補を先に出す */
    if (cache && cache.key === key && cache.loading) {
      var local = window._r637Local[key] || (window._r637Local[key] = r637LocalCompute_(c));
      if (!local) return out;
      var real = window._r7Reverse;
      window._r7Reverse = { key: key, items: local.items, total: local.total, facets: local.facets, loading: false, error: "", _r637Local: true };
      try {
        if (local.facets && local.facets.length && !window._r7Facets[r7ReverseCaseKey(c)]) window._r7Facets[r7ReverseCaseKey(c)] = local.facets;
        out = r637PrevResults_.apply(this, arguments);
      } finally { window._r7Reverse = real; }
      /* 電話番号が未取得の人の SMS リンクは、正本が届くまで押せないように */
      out = out.replace(/<a class="btn primary" href="sms:&body=[^"]*">([^<]*)<\/a>/g,
        '<a class="btn primary" aria-disabled="true" style="opacity:.5;pointer-events:none">電話番号を確認中…</a>');
      out = '<p class="small r637note">端末の名簿で先に表示しています（サーバーの最新結果に自動で差し替わります）</p>' + out;
    }
  } catch(e) {}
  return out;
};
window.APP_VERSION_LABEL = "v9.3.4";
try { r621PaintVersion_(); } catch(e) {}
