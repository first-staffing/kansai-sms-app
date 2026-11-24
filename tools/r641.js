<script>
/* ================================================================
   R641 (9.3.8) 2026-11-24  案件逆引き: 電話番号がまだ届いていない人のSMSも開く
   - これまでは番号の先読み (最初の40人) が済んだ人しかSMSボタンが押せず、
     それ以降は「電話番号を確認中…」や宛先なしのリンクになっていた
   - ボタンを押した時点で番号を取りに行き、取れたらそのままSMSを開く
   ================================================================ */
window._r641 = "9.3.8";
function r641Find_(aid){
  var a = null;
  try { a = applicants.find(function(x){ return x.id === aid; }); } catch(e) {}
  if (!a) try { a = (window._r7Reverse && window._r7Reverse.items || []).find(function(x){ return x.id === aid; }); } catch(e) {}
  if (!a) try { a = (window._r616Roster && window._r616Roster.items || []).find(function(x){ return x.id === aid; }); } catch(e) {}
  return a;
}
function r641Phone_(a){
  var p = String(a && a.phone || "").replace(/[^0-9]/g, "");
  if (!p) try { var c = window._r618Phone && window._r618Phone[a.id]; if (c && c.val) p = c.val; } catch(e) {}
  return p;
}
function r641OpenRevSms(aid, cid, btn){
  var a = r641Find_(aid);
  var c = null; try { c = CASES.find(function(x){ return x.id === cid; }); } catch(e) {}
  if (!a || !c) { alert("候補の情報が見つかりません。画面を開き直してください"); return; }
  if (btn && btn.getAttribute("data-busy") === "1") return;
  var label = btn ? btn.textContent : "";
  var done = function(){ if (btn) { btn.removeAttribute("data-busy"); btn.textContent = label; } };
  var go = function(phone){
    var body = "";
    try { body = reverseSmsBody(a, c); } catch(e) {}
    var href = smsLink(phone, body, "case");
    done();
    if (!href || href.charAt(0) === "#") { alert("文面を確認してください"); return; }
    try { r615NavigateSms_(href); } catch(e) { location.href = href; }
  };
  var ph = r641Phone_(a);
  if (ph) { go(ph); return; }
  if (btn) { btn.setAttribute("data-busy", "1"); btn.textContent = "番号を確認中…"; }
  Promise.resolve(apiCall({ action: "getApplicant", applicant_id: aid })).then(function(res){
    var det = res && res.applicant;
    var p2 = String(det && det.phone || "").replace(/[^0-9]/g, "");
    if (!p2) { done(); alert("この方は電話番号が登録されていません"); return; }
    a.phone = p2;
    try { window._r618Phone = window._r618Phone || {}; window._r618Phone[aid] = { at: Date.now(), val: p2, p: Promise.resolve(res) }; } catch(e) {}
    go(p2);
  }).catch(function(e){ done(); alert("電話番号の確認に失敗しました: " + (e && e.message || e)); });
}
var r641PrevResults_ = reverseResults;
reverseResults = function(cid){
  var out = r641PrevResults_.apply(this, arguments);
  try {
    /* 番号なしのリンク / 確認中の灰色ボタン → 押したら番号を取りに行くボタン */
    out = out.replace(/<a class="btn primary" (?:href="sms:&(?:amp;)?body=[^"]*"|aria-disabled="true"[^>]*)>[^<]*<\/a>(\s*<button onclick="previewReverseBody\('([^']*)','([^']*)'\)")/g,
      function(all, rest, aid, c2){
        return '<button class="primary" onclick="r641OpenRevSms(\'' + aid + '\',\'' + c2 + '\',this)">この案件のSMSを直接開く</button>' + rest;
      });
  } catch(e) {}
  return out;
};
window.APP_VERSION_LABEL = "v9.3.8";
try { r621PaintVersion_(); } catch(e) {}
</script>
