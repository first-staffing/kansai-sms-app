/* ================================================================
   R635 (9.3.2) 2026-11-24  案件逆引き配信: 旧アプリと同じ配信本文の型
   - 本文を旧アプリの型に (介護・看護で分ける)
     介護: 早番・日勤・遅番・夜勤（相談可能）／週の回数も相談可能／1,400～1,800円
     看護: 日勤のみ／2,100～2,500円
   - 旧アプリと同じく、候補一覧の上に「配信する本文を確認・編集」を置く。
     この案件の本文として全員に使う ({宛名} は相手ごとに置き換え)。670字まで
   ================================================================ */
window._r635 = "9.3.2";
window._r635Edited = window._r635Edited || {};
function r635Template_(c, job){
  job = job || (c && c.job_type) || "kaigo";
  var kango = job === "kango";
  return [
    "{宛名}様",
    "",
    "株式会社ファーストスタッフィングです。",
    "お近くの" + (kango ? "看護師" : "介護士") + "の派遣求人をご案内します。",
    "",
    "【求人詳細】",
    "■ 施設名：" + String((c && (c.facility || c.facility_name)) || ""),
    "■ 勤務地：" + String((c && (c.address || ((c.prefecture || "") + (c.municipality || "")))) || ""),
    kango ? "■ 勤務時間：日勤のみ" : "■ 勤務時間：早番・日勤・遅番・夜勤（ご相談可能）",
    "■ 勤務日数：週の勤務日数はご相談可能",
    kango ? "■ 派遣時給の目安（看護職：2,100～2,500円）" : "■ 派遣時給の目安（介護職：1,400～1,800円）",
    "※時給はご経験や勤務日数などによって異なります。",
    "",
    "① 詳細希望",
    "② 見学希望",
    "③ 別案件希望",
    "",
    "番号だけでもお気軽にご返信ください。",
    "②の方は、ご都合のよい曜日・時間帯もお知らせいただけるとスムーズです。"
  ].join("\n");
}
function r635CaseBody_(c, a){
  var id = c && c.id;
  var tpl = (id && window._r635Edited[id]) || r635Template_(c, (c && c.job_type) || (a && a.job_type));
  return tpl;
}
reverseSmsBody = function(a, c){
  var name = ""; try { name = smsRecipientName(a && a.name); } catch(e) { name = String((a && a.name) || ""); }
  return r635CaseBody_(c, a).replace(/\{宛名\}/g, name);
};
try { if (window.__APP_LOGIC__) window.__APP_LOGIC__.reverseSmsBody = reverseSmsBody; } catch(e) {}

function r635CurCase_(){
  try { return CASES.find(function(x){ return x.id === state.reverseCase; }) || null; } catch(e) { return null; }
}
function r635Len_(t){ try { return smsSize(t).len; } catch(e) { return String(t || "").length; } }
function r635Decorate_(){
  try {
    if ((location.hash || "").indexOf("#/list") !== 0 || state.mode !== "reverse") return;
    if (document.getElementById("r635box")) return;
    var c = r635CurCase_();
    if (!c) return;
    var anchor = document.querySelector('#app button[onclick^="startSequentialReverse("]');
    var host = anchor ? anchor.closest(".flex") : null;
    if (!host) {
      /* 候補0名でも本文は確認できるように、件数行の後ろに出す */
      var ps = document.querySelectorAll("#app p.small");
      for (var i = 0; i < ps.length; i++) if (/条件の一致が多い順/.test(ps[i].textContent)) { host = ps[i]; break; }
    }
    if (!host) return;
    var box = document.createElement("details");
    box.id = "r635box";
    box.className = "card r635box";
    var body = r635CaseBody_(c);
    box.innerHTML = '<summary><b>配信する本文を確認・編集</b></summary>'
      + '<textarea id="r635ta" rows="20" aria-label="この案件の配信SMS本文">' + esc(body) + '</textarea>'
      + '<p class="small" id="r635cnt"></p>'
      + '<div class="flex r635btns">'
      + '<button type="button" class="primary" id="r635apply">この本文で候補に反映</button>'
      + '<button type="button" id="r635copy">本文をコピー</button>'
      + '<button type="button" id="r635kaigo">介護の型に戻す</button>'
      + '<button type="button" id="r635kango">看護の型に戻す</button>'
      + '</div>';
    host.parentNode.insertBefore(box, host);
    var ta = box.querySelector("#r635ta"), cnt = box.querySelector("#r635cnt");
    var paint = function(){
      var n = r635Len_(ta.value);
      cnt.textContent = n + "文字 · 670文字以内で作成（宛名は相手ごとに置換）";
      cnt.style.color = n > 670 ? "#c0392b" : "";
    };
    ta.addEventListener("input", paint); paint();
    box.querySelector("#r635apply").onclick = function(){
      var v = String(ta.value || "").trim();
      if (!v) return;
      if (r635Len_(v) > 670) { alert("670文字を超えています。短くしてください"); return; }
      window._r635Edited[c.id] = v;
      try { showToast("この案件の本文を候補全員に反映しました", "ok"); } catch(e) {}
      var open = true;
      route();
      setTimeout(function(){ var b = document.getElementById("r635box"); if (b && open) b.open = true; }, 50);
    };
    box.querySelector("#r635copy").onclick = function(){
      var t = ta.value;
      try { navigator.clipboard.writeText(t).then(function(){ try { showToast("本文をコピーしました", "ok"); } catch(e) {} }); } catch(e) { prompt("コピーしてください", t); }
    };
    box.querySelector("#r635kaigo").onclick = function(){ ta.value = r635Template_(c, "kaigo"); paint(); };
    box.querySelector("#r635kango").onclick = function(){ ta.value = r635Template_(c, "kango"); paint(); };
  } catch(e) {}
}
var r635PrevRoute_ = route;
route = function(){ var r = r635PrevRoute_.apply(this, arguments); try { r635Decorate_(); } catch(e) {} return r; };
setInterval(r635Decorate_, 1000);
window.APP_VERSION_LABEL = "v9.3.2";
try { r621PaintVersion_(); } catch(e) {}
