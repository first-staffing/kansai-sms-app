/* ================================================================
   R634 (9.3.1) 2026-11-24  案件逆引き配信（特需SMS）のテンプレート
   - 本文欄の上に「介護テンプレを入れる」「看護テンプレを入れる」ボタン
   - 施設名・住所は入力欄の値を入れる。{宛名} は送るときにお名前に置き換わる
   - 本文が空なら、職種に合わせて自動で入れる。テンプレのまま職種を変えたら入れ直す
   ================================================================ */
window._r634 = "9.3.1";
var R634_TPL = {
  kaigo: [
    "{宛名}様",
    "",
    "株式会社ファーストスタッフィングです。",
    "お近くの介護士の派遣求人をご案内します。",
    "",
    "【求人詳細】",
    "■ 施設名：{施設名}",
    "■ 勤務地：{勤務地}",
    "■ 勤務時間：早番・日勤・遅番・夜勤（ご相談可能）",
    "■ 勤務日数：週の勤務日数はご相談可能",
    "■ 派遣時給の目安（介護職：1,400～1,800円）",
    "※時給はご経験や勤務日数などによって異なります。",
    "",
    "① 詳細希望",
    "② 見学希望",
    "③ 別案件希望",
    "",
    "番号だけでもお気軽にご返信ください。",
    "②の方は、ご都合のよい曜日・時間帯もお知らせいただけるとスムーズです。"
  ].join("\n"),
  kango: [
    "{宛名}様",
    "",
    "株式会社ファーストスタッフィングです。",
    "お近くの看護師の派遣求人をご案内します。",
    "",
    "【求人詳細】",
    "■ 施設名：{施設名}",
    "■ 勤務地：{勤務地}",
    "■ 勤務時間：日勤のみ",
    "■ 勤務日数：週の勤務日数はご相談可能",
    "■ 派遣時給の目安（看護職：2,100～2,500円）",
    "※時給はご経験や勤務日数などによって異なります。",
    "",
    "① 詳細希望",
    "② 見学希望",
    "③ 別案件希望",
    "",
    "番号だけでもお気軽にご返信ください。",
    "②の方は、ご都合のよい曜日・時間帯もお知らせいただけるとスムーズです。"
  ].join("\n")
};
function r634Build_(job){
  var name = "", addr = "";
  try { name = String((document.getElementById("spName") || {}).value || "").trim(); } catch(e) {}
  try { addr = String((document.getElementById("spAddr") || {}).value || "").trim(); } catch(e) {}
  return (R634_TPL[job] || R634_TPL.kaigo)
    .replace("{施設名}", name || "（施設名）")
    .replace("{勤務地}", addr || "（住所）");
}
function r634IsTemplate_(body){
  var b = String(body || "");
  return b.indexOf("【求人詳細】") >= 0 && b.indexOf("派遣時給の目安") >= 0;
}
function r634Fill_(job){
  var ta = document.getElementById("spBody");
  if (!ta) return;
  if (!job) { try { job = document.getElementById("spJob").value; } catch(e) { job = "kaigo"; } }
  try { var sel = document.getElementById("spJob"); if (sel && sel.value !== job) sel.value = job; } catch(e) {}
  ta.value = r634Build_(job);
  ta.rows = Math.max(ta.rows || 0, 20);
}
function r634Decorate_(){
  try {
    if ((location.hash || "").indexOf("#/list") !== 0 || state.mode !== "special") return;
    var ta = document.getElementById("spBody");
    if (!ta || document.getElementById("r634row")) return;
    var row = document.createElement("div");
    row.id = "r634row";
    row.className = "r634row";
    row.innerHTML = '<button type="button" onclick="r634Fill_(\'kaigo\')">介護テンプレを入れる</button>'
      + '<button type="button" onclick="r634Fill_(\'kango\')">看護テンプレを入れる</button>';
    ta.parentNode.insertBefore(row, ta);
    ta.rows = Math.max(ta.rows || 0, 20);
    /* 空、または以前の初期文面 (［施設名］の入ったもの) なら新しいテンプレにする */
    if (!String(ta.value || "").trim() || /［施設名］|おすすめポイント3つ/.test(ta.value)) r634Fill_();
    var sel = document.getElementById("spJob");
    if (sel) sel.addEventListener("change", function(){ if (r634IsTemplate_(ta.value)) r634Fill_(sel.value); });
    /* 施設名・住所を後から入れたとき、テンプレのままなら差し替える */
    ["spName", "spAddr"].forEach(function(idn){
      var el = document.getElementById(idn);
      if (el) el.addEventListener("input", function(){
        if (r634IsTemplate_(ta.value) && /（施設名）|（住所）/.test(ta.value)) r634Fill_();
      });
    });
  } catch(e) {}
}
var r634PrevRoute_ = route;
route = function(){ var r = r634PrevRoute_.apply(this, arguments); try { r634Decorate_(); } catch(e) {} return r; };
setInterval(r634Decorate_, 1000);
window.APP_VERSION_LABEL = "v9.3.1";
try { r621PaintVersion_(); } catch(e) {}
