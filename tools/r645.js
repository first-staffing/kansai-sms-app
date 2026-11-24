<script>
/* ================================================================
   R645 (9.3.13) 2026-11-25  Gmail 画面: 表示がずれる・送信対象が出てこない を直す
   1. 市区町村チップ: 府県の順 (大阪→京都→兵庫→奈良→滋賀→和歌山) ・五十音順に並べる。
      名簿 (端末に全件そろった一覧) から作るので、読み込みの途中で並びが変わらない。
   2. 市区町村の小さな枠の中だけスクロールする作り (指で動かすと枠が動いて画面が動かない) をやめる。
      都道府県を選んでいないときは、市区町村は「開く」で出す (長い一覧で画面が伸びないように)。
   3. 対象の確認中は経過秒数を出す。20秒を超えたら「もう一度確認」を出す。
   ================================================================ */
window._r645 = "9.3.13";
var R645_PREF_ORDER = ["大阪府", "京都府", "兵庫県", "奈良県", "滋賀県", "和歌山県"];
function r645Pool_(pool){
  if (pool) return pool;
  try { if (typeof r616RosterReady_ === "function" && r616RosterReady_()) return window._r616Roster.items; } catch(e) {}
  return applicants;
}
mailPrefs = function(pool){
  var src = r645Pool_(pool).filter(function(a){ return a.area === state.area; });
  var set = {}; src.forEach(function(a){ if (a.prefecture) set[a.prefecture] = 1; });
  return Object.keys(set).sort(function(a, b){
    var ia = R645_PREF_ORDER.indexOf(a), ib = R645_PREF_ORDER.indexOf(b);
    if (ia < 0) ia = 99; if (ib < 0) ib = 99;
    return ia - ib || a.localeCompare(b, "ja");
  });
};
mailMunisForPrefs = function(prefs, pool){
  var src = r645Pool_(pool).filter(function(a){ return a.area === state.area; });
  var ps = (prefs && prefs.length) ? prefs : (MF.pref ? [MF.pref] : []);
  var map = {};
  src.forEach(function(a){
    if (!a.municipality) return;
    if (ps.length && ps.indexOf(a.prefecture) < 0) return;
    if (!map[a.municipality]) map[a.municipality] = a.prefecture || "";
  });
  return Object.keys(map).sort(function(a, b){
    var ia = R645_PREF_ORDER.indexOf(map[a]), ib = R645_PREF_ORDER.indexOf(map[b]);
    if (ia < 0) ia = 99; if (ib < 0) ib = 99;
    return ia - ib || a.localeCompare(b, "ja");
  });
};
var r645PrevViewMail_ = viewMail;
viewMail = function(){
  var out = r645PrevViewMail_.apply(this, arguments);
  try {
    var labels = document.querySelectorAll("#app label");
    for (var i = 0; i < labels.length; i++) {
      var t = labels[i].textContent || "";
      if (t.indexOf("市区町村（複数選択可") !== 0) continue;
      var box = labels[i].nextElementSibling;
      if (!box || !box.classList.contains("flex")) continue;
      box.style.maxHeight = "none"; box.style.overflow = "visible";
      if (!MF.prefs.length && !MF.munis.length && box.children.length > 12) {
        var det = document.createElement("details");
        det.id = "r645MuniDet";
        if (window._r645MuniOpen) det.open = true;
        det.addEventListener("toggle", function(){ window._r645MuniOpen = this.open; });
        var sm = document.createElement("summary");
        sm.textContent = "市区町村から選ぶ（" + box.children.length + "件・府県ごとに並んでいます）";
        sm.style.cssText = "cursor:pointer;padding:10px 0;font-weight:700";
        box.parentNode.insertBefore(det, box);
        det.appendChild(sm); det.appendChild(box);
        labels[i].textContent = "市区町村（都道府県を選ぶと、その府県だけに絞って表示します）";
      }
      if (!(typeof r616RosterReady_ === "function" && r616RosterReady_())) {
        var note = document.createElement("p");
        note.id = "r645MuniNote"; note.className = "small";
        note.textContent = "名簿を読み込み中のため、市区町村はまだ一部だけです（読み込みが終わると自動で全部出ます）";
        labels[i].parentNode.insertBefore(note, labels[i].nextSibling);
        r645WatchRoster_();
      }
      break;
    }
  } catch(e) {}
  return out;
};
/* 名簿がそろったら、画面を描き直さずに市区町村チップだけ差し替える (画面が動かないように) */
function r645WatchRoster_(){
  if (window._r645RosterTimer) return;
  window._r645RosterTimer = setInterval(function(){
    if ((location.hash || "").indexOf("#/mail") !== 0) { clearInterval(window._r645RosterTimer); window._r645RosterTimer = null; return; }
    if (!(typeof r616RosterReady_ === "function" && r616RosterReady_())) return;
    clearInterval(window._r645RosterTimer); window._r645RosterTimer = null;
    try {
      var note = document.getElementById("r645MuniNote"); if (note) note.remove();
      var munis = mailMunisForPrefs(MF.prefs);
      var det = document.getElementById("r645MuniDet");
      var box = det ? det.querySelector(".flex") : null;
      if (!box) {
        var labels = document.querySelectorAll("#app label");
        for (var i = 0; i < labels.length; i++) if ((labels[i].textContent || "").indexOf("市区町村（") === 0) { box = labels[i].nextElementSibling; break; }
      }
      if (!box || !box.classList || !box.classList.contains("flex")) return;
      box.innerHTML = munis.map(function(m){ return '<button aria-pressed="' + (MF.munis.indexOf(m) >= 0) + '" onclick="toggleMailMuni(\'' + esc(m) + '\')">' + esc(m) + '</button>'; }).join("");
      var sm = det ? det.querySelector("summary") : null;
      if (sm) sm.textContent = "市区町村から選ぶ（" + munis.length + "件・府県ごとに並んでいます）";
    } catch(e) {}
  }, 2000);
}
/* 3: 確認中の経過秒数 */
(function(){
  var prevText = r616MailCountText_;
  r616MailCountText_ = function(){
    var t = prevText.apply(this, arguments);
    if (window._r616MailChecking) {
      if (!window._r645CheckAt) window._r645CheckAt = Date.now();
      var s = Math.round((Date.now() - window._r645CheckAt) / 1000);
      return "対象を確認中…" + (s >= 2 ? "（" + s + "秒）" : "");
    }
    window._r645CheckAt = 0;
    return t;
  };
  setInterval(function(){
    if (!window._r616MailChecking) return;
    if ((location.hash || "").indexOf("#/mail") !== 0) return;
    try { r616PaintCountEls_(); } catch(e) {}
    var s = window._r645CheckAt ? (Date.now() - window._r645CheckAt) / 1000 : 0;
    if (s > 20) {
      var bc = document.getElementById("r616MailBarCount");
      if (bc && bc.innerHTML.indexOf("r645Retry") < 0) bc.innerHTML += ' <button id="r645Retry" style="min-height:28px;padding:2px 8px" onclick="window._r645CheckAt=0;r616ServerCounts_(true)">もう一度確認</button>';
    }
  }, 1000);
})();
window.APP_VERSION_LABEL = "v9.3.13";
try { r621PaintVersion_(); } catch(e) {}
</script>
