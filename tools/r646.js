<script>
/* ================================================================
   R646 (9.3.14) 2026-11-25  Gmail 画面の市区町村が一部しか出ない不具合
   原因: 一覧を「端末に読み込み済みの一部の応募者」から作っていた (京都府・兵庫県で8件など)。
   直し: サーバーから地域の全求職者の 府県→市区町村 (人数つき) を1回もらって使う (6時間覚える)。
         届いたら、Gmail 画面のときだけ1回描き直す。
   ================================================================ */
window._r646 = "9.3.14";
(function(){
  function key(){ return "r646Facets_" + (state.area || "kansai"); }
  function load(){
    try { var j = JSON.parse(localStorage.getItem(key()) || "null"); if (j && Date.now() - j.at < 6 * 3600000) return j.facets; } catch(e) {}
    return null;
  }
  window._r646Facets = load();
  var fetching = false;
  function fetchFacets(){
    if (fetching) return; fetching = true;
    Promise.resolve(apiCall({ action: "getMuniFacets", area: state.area || "kansai" })).then(function(res){
      fetching = false;
      if (!res || !res.facets) return;
      var had = !!window._r646Facets;
      window._r646Facets = res.facets;
      try { localStorage.setItem(key(), JSON.stringify({ at: Date.now(), facets: res.facets })); } catch(e) {}
      if (!had && (location.hash || "").indexOf("#/mail") === 0) { try { route(); } catch(e) {} }
    }).catch(function(){ fetching = false; });
  }
  setTimeout(fetchFacets, 1500);
  var prevPrefs = mailPrefs, prevMunis = mailMunisForPrefs;
  mailPrefs = function(pool){
    var F = window._r646Facets;
    if (pool || !F) return prevPrefs.apply(this, arguments);
    return Object.keys(F).sort(function(a, b){
      var ia = R645_PREF_ORDER.indexOf(a), ib = R645_PREF_ORDER.indexOf(b);
      if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia - ib || a.localeCompare(b, "ja");
    });
  };
  mailMunisForPrefs = function(prefs, pool){
    var F = window._r646Facets;
    if (pool || !F) return prevMunis.apply(this, arguments);
    var ps = (prefs && prefs.length) ? prefs : (MF.pref ? [MF.pref] : []);
    var out = [];
    mailPrefs().forEach(function(p){
      if (ps.length && ps.indexOf(p) < 0) return;
      Object.keys(F[p] || {}).sort(function(a, b){ return a.localeCompare(b, "ja"); }).forEach(function(m){ if (out.indexOf(m) < 0) out.push(m); });
    });
    return out;
  };
  /* 一覧がサーバー由来なら「名簿を読み込み中」の注記は出さない */
  var prevView = viewMail;
  viewMail = function(){
    var out = prevView.apply(this, arguments);
    try { if (window._r646Facets) { var n = document.getElementById("r645MuniNote"); if (n) n.remove(); } else fetchFacets(); } catch(e) {}
    return out;
  };
})();
window.APP_VERSION_LABEL = "v9.3.14";
try { r621PaintVersion_(); } catch(e) {}
</script>
