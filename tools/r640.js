/* ================================================================
   R640 (9.3.7) 2026-11-24  案件逆引き 0名の原因調べ
   - 距離が初期化されない (画面の状態が後から作り直されて 5km 扱い) のを、
     表示のたびに 15km へ補う
   - 結果の下に「診断」行を出す: 案件の座標、名簿の読み込み状況
     (人数・座標あり・電話あり)、計算した場所 (端末/サーバー)、サーバーの返事
   ================================================================ */
window._r640 = "9.3.7";
window._r640Last = window._r640Last || null;
(function(){
  var prev = postJson_;
  postJson_ = function(req){
    var p = prev.apply(this, arguments);
    try {
      if (req && req.action === "searchReverseCandidates" && p && typeof p.then === "function") {
        var t0 = Date.now();
        p.then(function(j){
          var d = (j && j.data) ? j.data : j;
          window._r640Last = { at: Date.now(), ms: Date.now() - t0, total: d && d.total, reason: (d && d.reason) || "", radius: req.radius_km, lat: req.case && req.case.lat, lon: req.case && req.case.lon, err: (j && j.ok === false) ? String(j.error || "") : "" };
        }, function(e){ window._r640Last = { at: Date.now(), ms: Date.now() - t0, err: String(e && e.message || e) }; });
      }
    } catch(e) {}
    return p;
  };
})();
function r640FixRadius_(){ try { if (state.reverseRadius == null || !isFinite(state.reverseRadius)) state.reverseRadius = 15; } catch(e) {} }
function r640Diag_(c){
  try {
    var ro = window._r616Roster, items = (ro && ro.items) || [];
    var withCoord = 0, withPhone = 0, sameJob = 0;
    items.forEach(function(a){
      if (a.lat != null && a.lon != null) withCoord++;
      if (String(a.phone || "").replace(/[^0-9]/g, "").length >= 10) withPhone++;
      if (c && a.job_type === c.job_type) sameJob++;
    });
    var rs = window._r616RosterLoading ? "読み込み中" : (ro && ro.area === state.area ? "読み込み済み" : (window._r616RosterFailedArea === state.area ? "失敗" : "未読み込み"));
    var cache = window._r7Reverse || {};
    var src = cache._r637Full ? "端末" : (cache._r637Local ? "端末(仮)" : "サーバー");
    var L = window._r640Last;
    var parts = [
      "案件の座標: " + (c && c.lat != null ? (Number(c.lat).toFixed(4) + "," + Number(c.lon).toFixed(4) + (c._r639Level ? "（" + c._r639Level + "）" : (c._r637RepCoord ? "（市区町村の中心）" : "（元から）"))) : "なし") + " ／ 住所: " + ((c && (c.address || ((c.prefecture || "") + (c.municipality || "")))) || "なし"),
      "名簿: " + rs + " " + items.length + "人（座標あり " + withCoord + "・電話あり " + withPhone + "・同じ職種 " + sameJob + "） ／ 職種: " + (c && c.job_type || "?") + " ／ 距離: " + (state.reverseRadius || "未設定") + "km",
      "計算した場所: " + src + (L ? " ／ サーバーの返事: " + (L.err ? "エラー " + L.err : (L.total + "名" + (L.reason ? "・理由 " + L.reason : "") + "・" + L.ms + "ms・送った座標 " + L.lat + "," + L.lon + "・" + L.radius + "km")) : " ／ サーバーへの問い合わせ: まだ")
    ];
    return '<details class="r640diag"><summary>診断（0名のときはここをスクショしてください）</summary><p class="small">' + parts.map(esc).join("<br>") + '</p></details>';
  } catch(e) { return ""; }
}
var r640PrevResults_ = reverseResults;
reverseResults = function(cid){
  r640FixRadius_();
  var out = r640PrevResults_.apply(this, arguments);
  try {
    var c = CASES.find(function(x){ return x.id === cid; }) || CASES[0];
    var zero = /条件の一致が多い順: 0名/.test(out);
    var d = r640Diag_(c);
    if (zero) d = d.replace('<details class="r640diag">', '<details class="r640diag" open>');
    out = out + d;
  } catch(e) {}
  return out;
};

/* サーバーが0名でも、端末の名簿 (市区町村の中心も使う) で見つかるなら、そちらを出す。
   サーバーは求職者の座標が無い人を数えないため、座標の入っていない名簿だと0名になる */
window._r640PhoneQ = window._r640PhoneQ || { running: 0, queue: [], seen: {} };
function r640PrefetchPhones_(ids){
  var Q = window._r640PhoneQ;
  ids.forEach(function(id){
    if (Q.seen[id]) return;
    var c = window._r618Phone && window._r618Phone[id];
    if (c && c.val) return;
    Q.seen[id] = 1; Q.queue.push(id);
  });
  var pump = function(){
    while (Q.running < 3 && Q.queue.length) {
      var id = Q.queue.shift(); Q.running++;
      Promise.resolve(apiCall({ action: "getApplicant", applicant_id: id, __bg: 1 })).then(function(res){
        var det = res && res.applicant; if (!det) return;
        var ph = String(det.phone || "").replace(/[^0-9]/g, "");
        if (!ph) return;
        window._r618Phone = window._r618Phone || {};
        window._r618Phone[det.applicant_id || det.id] = { at: Date.now(), val: ph, p: Promise.resolve(res) };
        window._r637Local = {};
        clearTimeout(window._r640Repaint);
        window._r640Repaint = setTimeout(function(){ try { if ((location.hash || "").indexOf("#/list") === 0 && state.mode === "reverse") route(); } catch(e) {} }, 400);
      }).catch(function(){}).then(function(){ Q.running--; pump(); });
    }
  };
  pump();
}
var r640PrevResults2_ = reverseResults;
reverseResults = function(cid){
  var out = r640PrevResults2_.apply(this, arguments);
  try {
    if (!window._r6ServerMode) return out;
    var c = CASES.find(function(x){ return x.id === cid; }) || CASES[0];
    var cache = window._r7Reverse;
    if (!c || !cache || cache.loading || cache.total !== 0 || cache._r637Full) return out;
    var key = r7ReverseKey(c);
    var local = window._r637Local[key] || (window._r637Local[key] = r637LocalCompute_(c));
    if (!local || !local.total) return out;
    var real = window._r7Reverse;
    window._r7Reverse = { key: key, items: local.items, total: local.total, facets: local.facets, loading: false, error: "", _r637Local: true };
    var html;
    try { html = r640PrevResults2_.apply(this, arguments); } finally { window._r7Reverse = real; }
    html = html.replace(/<p class="small r637note">[^<]*<\/p>/, "");
    html = html.replace(/<a class="btn primary" href="sms:&body=[^"]*">([^<]*)<\/a>/g,
      '<a class="btn primary" aria-disabled="true" style="opacity:.5;pointer-events:none">電話番号を確認中…</a>');
    html = '<p class="small r637note">サーバーでは0名でした。座標が無い求職者を市区町村の中心で数えて表示しています</p>' + html;
    var ids = local.items.filter(function(a){ return !String(a.phone || "").replace(/[^0-9]/g, ""); }).slice(0, 40).map(function(a){ return a.id; });
    if (ids.length) r640PrefetchPhones_(ids);
    var m = out.match(/<details class="r640diag"[\s\S]*<\/details>$/);
    return html + (m ? m[0].replace(" open>", ">") : "");
  } catch(e) { return out; }
};
var r640PrevRoute_ = route;
route = function(){ r640FixRadius_(); return r640PrevRoute_.apply(this, arguments); };
window.APP_VERSION_LABEL = "v9.3.7";
try { r621PaintVersion_(); } catch(e) {}
