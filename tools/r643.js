<script>
/* ================================================================
   R643 (9.3.10) 2026-11-24  案件逆引き: タップしたらその場でSMSが開くように
   - iPhone は「タップの直後」でないとSMS画面へ移らせない。番号を取りに行ってから
     開こうとすると、その間にタップ扱いが切れて止められていた。
   - 候補を表示したら、表示中の全員の電話番号をサーバーから1回でまとめて取り
     (getPhones)、ボタンを最初から本物のSMSリンクに差し替える。
   - まだ番号が届いていない人を押したときは、取れ次第ボタンを「SMSを開く」に変え、
     もう一度押してもらう (自動で開けた場合はそのまま開く)。
   - 逆引きのSMSには回答フォームを付けない (一覧の「タップ時にフォーム発行」を通さない)。
   ================================================================ */
window._r643 = "9.3.10";
window._r643Asked = window._r643Asked || {};
function r643Href_(aid, cid){
  var a = r641Find_(aid);
  var c = null; try { c = CASES.find(function(x){ return x.id === cid; }); } catch(e) {}
  var ph = a ? r641Phone_(a) : "";
  if (!a || !c || !ph) return "";
  var body = ""; try { body = reverseSmsBody(a, c); } catch(e) {}
  var h = smsLink(ph, body, "case");
  return (h && h.charAt(0) !== "#") ? h : "";
}
function r643Upgrade_(){
  try {
    var bs = document.querySelectorAll('button[onclick^="r641OpenRevSms("]');
    for (var i = 0; i < bs.length; i++) {
      var m = (bs[i].getAttribute("onclick") || "").match(/^r641OpenRevSms\('([^']*)','([^']*)'/);
      if (!m) continue;
      var href = r643Href_(m[1], m[2]);
      if (!href) continue;
      var a = document.createElement("a");
      a.className = "btn primary r643rev";
      a.setAttribute("href", href);
      a.textContent = bs[i].getAttribute("data-r643tapped") ? "SMSを開く（もう一度タップ）" : "この案件のSMSを直接開く";
      bs[i].parentNode.replaceChild(a, bs[i]);
    }
  } catch(e) {}
}
function r643FetchPhones_(ids){
  ids = ids.filter(function(id){
    if (window._r643Asked[id]) return false;
    var c = window._r618Phone && window._r618Phone[id];
    return !(c && c.val);
  });
  if (!ids.length) return Promise.resolve();
  ids.forEach(function(id){ window._r643Asked[id] = 1; });
  var chunks = [];
  for (var i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300));
  return Promise.all(chunks.map(function(ch){
    return Promise.resolve(apiCall({ action: "getPhones", applicant_ids: ch })).then(function(res){
      var P = (res && res.phones) || {};
      window._r618Phone = window._r618Phone || {};
      Object.keys(P).forEach(function(id){
        if (P[id]) window._r618Phone[id] = { at: Date.now(), val: P[id], p: Promise.resolve({ applicant: { applicant_id: id, phone: P[id] } }) };
        try { var a = r641Find_(id); if (a && P[id] && !a.phone) a.phone = P[id]; } catch(e) {}
      });
      r643Upgrade_();
    }).catch(function(){ ch.forEach(function(id){ delete window._r643Asked[id]; }); });
  }));
}
/* 押されたとき: 番号があれば今すぐ開く。無ければまとめて取りに行き、ボタンを本物のリンクに変える */
r641OpenRevSms = function(aid, cid, btn){
  var href = r643Href_(aid, cid);
  if (href) { try { r615NavigateSms_(href); } catch(e) { location.href = href; } return; }
  if (btn) { btn.textContent = "番号を確認中…"; btn.setAttribute("data-r643tapped", "1"); }
  delete window._r643Asked[aid];
  r643FetchPhones_([aid]).then(function(){
    var h2 = r643Href_(aid, cid);
    if (!h2) { if (btn && btn.parentNode) btn.textContent = "電話番号が登録されていません"; return; }
    r643Upgrade_();
  });
};
var r643PrevResults_ = reverseResults;
reverseResults = function(cid){
  var out = r643PrevResults_.apply(this, arguments);
  try { out = out.replace(/<a class="btn primary" href="sms:/g, '<a class="btn primary r643rev" href="sms:'); } catch(e0) {}
  try {
    var cache = window._r7Reverse;
    if (cache && cache.items && cache.items.length) {
      var ids = cache.items.map(function(a){ return a.id; });
      setTimeout(function(){ r643Upgrade_(); r643FetchPhones_(ids); }, 0);
    }
  } catch(e) {}
  return out;
};
/* 逆引きのSMSリンクは、一覧用の「タップ時にフォームを発行して付ける」処理を通さない */
try {
  document.addEventListener("click", function(ev){
    try {
      var t = ev.target, a = null;
      while (t && t !== document) { if (t.tagName === "A") { a = t; break; } t = t.parentNode; }
      if (a && a.classList && a.classList.contains("r643rev")) ev.stopPropagation();
    } catch(e) {}
  }, true);
} catch(e) {}
window.APP_VERSION_LABEL = "v9.3.10";
try { r621PaintVersion_(); } catch(e) {}
</script>
