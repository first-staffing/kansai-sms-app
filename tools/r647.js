<script>
/* ================================================================
   R647 (9.3.15) 2026-11-25  Gmail 画面: 市区町村を見やすく並べる
   - 府県ごとに見出し (人数つき) を付ける。
   - 政令市 (大阪市・堺市・京都市・神戸市) の区は「大阪市」などの段にまとめ、区名だけで出す。
   - 「京都市 右京区」「京都市右京区」「大阪府大阪市 東淀川区」「姫路市姫路市網干区」のような
     書き方の違いは1つのボタンにまとめる (押すと元の書き方を全部まとめて選ぶ)。
   - 人数の多い市区町村は名前のあとに人数を小さく出す。
   ================================================================ */
window._r647 = "9.3.15";
function r647Norm_(pref, m){
  var s = String(m || "").replace(/[\s　]+/g, "");
  if (pref && s.indexOf(pref) === 0) s = s.slice(pref.length);
  var mm = s.match(/^(.+?[市郡])(\1)(.*)$/); /* 姫路市姫路市網干区 → 姫路市網干区 */
  if (mm) s = mm[1] + mm[3];
  return s;
}
var R647_CITIES = ["大阪市", "堺市", "京都市", "神戸市"];
function r647Groups_(){
  var F = window._r646Facets;
  var prefs = mailPrefs();
  if (MF.prefs.length) prefs = prefs.filter(function(p){ return MF.prefs.indexOf(p) >= 0; });
  var groups = [];
  prefs.forEach(function(p){
    var raw = F ? Object.keys(F[p] || {}) : mailMunisForPrefs([p]);
    var byName = {};
    raw.forEach(function(m){
      var n = r647Norm_(p, m);
      if (!byName[n]) byName[n] = { name: n, raws: [], count: 0 };
      byName[n].raws.push(m);
      byName[n].count += F && F[p] ? (F[p][m] || 0) : 0;
    });
    var names = Object.keys(byName).sort(function(a, b){ return a.localeCompare(b, "ja"); });
    var total = names.reduce(function(s, n){ return s + byName[n].count; }, 0);
    var cityRows = {}, others = [];
    names.forEach(function(n){
      var city = null;
      R647_CITIES.forEach(function(c){ if (n.indexOf(c) === 0 && n.length > c.length && /区$/.test(n)) city = c; });
      if (city) (cityRows[city] = cityRows[city] || []).push(byName[n]);
      else others.push(byName[n]);
    });
    groups.push({ pref: p, total: total, cities: cityRows, others: others });
  });
  return groups;
}
window._r647Items = [];
function r647Chip_(it, label){
  var i = window._r647Items.length; window._r647Items.push(it);
  var on = it.raws.some(function(r){ return MF.munis.indexOf(r) >= 0; });
  return '<button class="r647chip" aria-pressed="' + on + '" onclick="r647Toggle(' + i + ')">' + (on ? '✓ ' : '') + esc(label)
    + (it.count >= 10 ? '<small>' + it.count + '</small>' : '') + '</button>';
}
function r647Toggle(i){
  var it = window._r647Items[i]; if (!it) return;
  var on = it.raws.some(function(r){ return MF.munis.indexOf(r) >= 0; });
  if (on) MF.munis = MF.munis.filter(function(m){ return it.raws.indexOf(m) < 0; });
  else it.raws.forEach(function(r){ if (MF.munis.indexOf(r) < 0) MF.munis.push(r); });
  route();
}
function r647Html_(){
  window._r647Items = [];
  return r647Groups_().map(function(g){
    var h = '<div class="r647pref"><div class="r647head">' + esc(g.pref) + (g.total ? ' <small>' + g.total + '人</small>' : '') + '</div>';
    R647_CITIES.forEach(function(c){
      var rows = g.cities[c]; if (!rows || !rows.length) return;
      h += '<div class="r647row"><span class="r647city">' + esc(c) + '</span>' + rows.map(function(it){ return r647Chip_(it, it.name.slice(c.length)); }).join("") + '</div>';
    });
    if (g.others.length) h += '<div class="r647row">' + g.others.map(function(it){ return r647Chip_(it, it.name); }).join("") + '</div>';
    return h + '</div>';
  }).join("");
}
(function(){
  var st = document.createElement("style");
  st.textContent = ".r647pref{margin:10px 0 14px}.r647head{font-weight:700;font-size:15px;padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:6px}"
    + ".r647head small{font-weight:400;color:#64748b;margin-left:4px}.r647row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}"
    + ".r647city{font-size:12px;font-weight:700;color:#1e3a5f;background:#eef2f7;border-radius:6px;padding:4px 8px;margin-right:2px}"
    + ".r647chip{min-height:38px;padding:6px 10px}.r647chip small{font-size:10px;color:#64748b;margin-left:4px}"
    + ".r647chip[aria-pressed=true]{background:#1e3a5f!important;color:#fff!important;border-color:#1e3a5f!important;font-weight:700}.r647chip[aria-pressed=true] small{color:#cbd5e1}"
    + "#app .card button[onclick^='toggleMailPref'][aria-pressed=true]{background:#1e3a5f!important;color:#fff!important;border-color:#1e3a5f!important;font-weight:700}"
    + ".r647sel{margin:6px 0 2px;padding:8px 10px;background:#eef2f7;border-radius:8px;font-size:13px}";
  document.head.appendChild(st);
})();
var r647PrevView_ = viewMail;
viewMail = function(){
  var out = r647PrevView_.apply(this, arguments);
  try {
    var labels = document.querySelectorAll("#app label"), box = null;
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || "").indexOf("市区町村（") === 0) {
        var det = document.getElementById("r645MuniDet");
        box = det ? det.querySelector(".flex") : labels[i].nextElementSibling;
        break;
      }
    }
    if (box && box.classList && box.classList.contains("flex")) {
      var div = document.createElement("div");
      div.id = "r647Munis";
      div.innerHTML = r647Html_();
      box.parentNode.replaceChild(div, box);
      var picked = window._r647Items.filter(function(it){ return it.raws.some(function(r){ return MF.munis.indexOf(r) >= 0; }); }).map(function(it){ return it.name; });
      if (picked.length) {
        var sel = document.createElement("div"); sel.className = "r647sel";
        sel.innerHTML = "<b>選択中の市区町村 " + picked.length + "件</b>：" + esc(picked.join("、"));
        var holder = document.getElementById("r645MuniDet") || div;
        holder.parentNode.insertBefore(sel, holder);
      }
      var sm = document.querySelector("#r645MuniDet summary");
      if (sm) sm.textContent = "市区町村から選ぶ（" + window._r647Items.length + "件・府県ごとに並んでいます）";
    }
  } catch(e) {}
  return out;
};
window.APP_VERSION_LABEL = "v9.3.16";
try { r621PaintVersion_(); } catch(e) {}
</script>
