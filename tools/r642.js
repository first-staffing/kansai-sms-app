<script>
/* ================================================================
   R642 (9.3.9) 2026-11-24  フォーム作成と案件逆引きの高速化
   A. フォーム作成: フォームの番号 (トークン) とURLを画面で作り、待たずにSMSを開く。
      サーバーへの記録は裏で送る (同じ番号の再送は1件にまとまる)。
      届かなかった分は端末に残し、次に開いたとき・画面に戻ったときに送り直す。
      URLの形は、サーバーから実際に返ってきたURLから覚える (覚えるまでは従来どおり)。
   B. 案件逆引き: 名簿 (端末) がそろっていれば、サーバーに問い合わせずに端末だけで計算する。
      電話番号は上から30人分を裏で先に取り、残りはタップしたときに取る (R641)。
   ================================================================ */
window._r642 = "9.3.9";
(function(){
  var LS_TPL = "r642Tpl", LS_Q = "r642Queue";
  var A62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  function rnd(n){
    var b = new Uint8Array(n * 2), s = "";
    try { crypto.getRandomValues(b); } catch(e) { for (var i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
    for (var k = 0; k < b.length && s.length < n; k++) if (b[k] < 248) s += A62.charAt(b[k] % 62);
    while (s.length < n) s += A62.charAt(Math.floor(Math.random() * 62));
    return s;
  }
  function getTpl(){ try { return localStorage.getItem(LS_TPL) || ""; } catch(e) { return ""; } }
  function learn(url, token){
    try {
      url = String(url || ""); token = String(token || "");
      if (!url || !token || url.indexOf(token) < 0 || !/^https:\/\//.test(url)) return;
      var tpl = url.split(token).join("{T}");
      if (tpl.split("{T}").length !== 2) return;
      localStorage.setItem(LS_TPL, tpl);
    } catch(e) {}
  }
  function qGet(){ try { return JSON.parse(localStorage.getItem(LS_Q) || "[]") || []; } catch(e) { return []; } }
  function qSet(a){ try { localStorage.setItem(LS_Q, JSON.stringify(a.slice(-50))); } catch(e) {} }
  function qDel(tk){ qSet(qGet().filter(function(x){ return x.req.client_token !== tk; })); }

  var prev = postJson_;
  var pendingByDelivery = {}, pendingByToken = {};
  function sendBg(req){
    var tk = req.client_token, did = req.client_delivery_id;
    var p = prev.call(window, req).then(function(j){
      var d = (j && j.data) ? j.data : j;
      if (j && j.ok === false) throw new Error(j.error || "issue error");
      if (d && d.form_url && d.form_token) learn(d.form_url, d.form_token);
      qDel(tk);
      return j;
    });
    var tries = function(n, pr){
      return pr.catch(function(err){
        if (n >= 3) throw err;
        return new Promise(function(r){ setTimeout(r, 1500 * (n + 1)); }).then(function(){ return tries(n + 1, prev.call(window, req).then(function(j){ if (j && j.ok === false) throw new Error(j.error || ""); qDel(tk); return j; })); });
      });
    };
    var all = tries(0, p);
    pendingByDelivery[did] = all; pendingByToken[tk] = all;
    all.then(function(){ delete pendingByDelivery[did]; delete pendingByToken[tk]; }, function(){ delete pendingByDelivery[did]; delete pendingByToken[tk]; });
    return all;
  }
  postJson_ = function(req){
    try {
      if (req && req.action === "issueFormToken" && !req.client_token) {
        var tpl = getTpl();
        var ids = req.case_ids || [];
        if (tpl && req.applicant_id && ids.length) {
          var tk = rnd(20);
          var did = "DT" + Date.now().toString(36) + rnd(8).toLowerCase().replace(/[^0-9a-z]/g, "x");
          var r2 = Object.assign({}, req, { client_token: tk, client_delivery_id: did, defer_push: true });
          var q = qGet(); q.push({ at: Date.now(), req: r2 }); qSet(q);
          sendBg(r2).catch(function(){});
          return Promise.resolve({ ok: true, data: {
            delivery_id: did, form_token: tk, form_url: tpl.replace("{T}", tk),
            channel: req.channel || "sms", case_ids: ids, push_deferred: true, client_issued: true } });
        }
      }
      /* 発行の記録より先に、同じ配信の後続 (送信済みの記録など) が着かないように待つ */
      if (req && req.action !== "issueFormToken") {
        var w = (req.delivery_id && pendingByDelivery[req.delivery_id]) || (req.form_token && pendingByToken[req.form_token]);
        if (w) { var self = this, args = arguments; return w.catch(function(){}).then(function(){ return prev.apply(self, args); }); }
      }
    } catch(e) {}
    var out = prev.apply(this, arguments);
    try {
      if (req && req.action === "issueFormToken" && out && typeof out.then === "function") {
        out.then(function(j){ var d = (j && j.data) ? j.data : j; if (d) learn(d.form_url, d.form_token); }, function(){});
      }
    } catch(e) {}
    return out;
  };
  /* 送れなかった分を送り直す (起動時・画面に戻ったとき) */
  function flushQueue(){
    qGet().forEach(function(x){
      if (!x || !x.req || pendingByToken[x.req.client_token]) return;
      if (Date.now() - x.at < 8000) return;
      if (Date.now() - x.at > 3 * 86400000) { qDel(x.req.client_token); return; }
      sendBg(x.req).catch(function(){});
    });
  }
  setTimeout(flushQueue, 3000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) setTimeout(flushQueue, 1000); });
  /* 既に画面にある発行済みURLからも形を覚える */
  setTimeout(function(){
    try {
      if (getTpl()) return;
      (state.deliveries || []).some(function(d){ if (d && d.form_url && d.form_token) { learn(d.form_url, d.form_token); return true; } return false; });
    } catch(e) {}
  }, 4000);
})();

/* ---- B. 案件逆引きを端末だけで ---- */
r637RosterHasPhones_ = function(){
  try { return typeof r616RosterReady_ === "function" && r616RosterReady_(); } catch(e) { return false; }
};
window._r642PhoneSeen = window._r642PhoneSeen || {};
function r642PrefetchPhones_(ids){
  var Q = ids.filter(function(id){
    if (window._r642PhoneSeen[id]) return false;
    var c = window._r618Phone && window._r618Phone[id];
    return !(c && c.val);
  });
  var run = 0;
  var pump = function(){
    while (run < 4 && Q.length) {
      var id = Q.shift(); window._r642PhoneSeen[id] = 1; run++;
      Promise.resolve(apiCall({ action: "getApplicant", applicant_id: id, __bg: 1 })).then(function(res){
        var det = res && res.applicant; if (!det) return;
        var ph = String(det.phone || "").replace(/[^0-9]/g, "");
        if (!ph) return;
        window._r618Phone = window._r618Phone || {};
        window._r618Phone[det.applicant_id || det.id] = { at: Date.now(), val: ph, p: Promise.resolve(res) };
        try {
          var aid = det.applicant_id || det.id;
          var b = document.querySelector('button[onclick^="r641OpenRevSms(\'' + aid + '\'"]');
          if (b) b.setAttribute("data-ready", "1");
        } catch(e) {}
      }).catch(function(){}).then(function(){ run--; pump(); });
    }
  };
  pump();
}
var r642PrevResults_ = reverseResults;
reverseResults = function(cid){
  var out = r642PrevResults_.apply(this, arguments);
  try {
    var cache = window._r7Reverse;
    if (cache && cache.items && cache.items.length) {
      var ids = cache.items.slice(0, 30).filter(function(a){ return !String(a.phone || "").replace(/[^0-9]/g, ""); }).map(function(a){ return a.id; });
      if (ids.length) setTimeout(function(){ r642PrefetchPhones_(ids); }, 50);
    }
  } catch(e) {}
  return out;
};
window.APP_VERSION_LABEL = "v9.3.9";
try { r621PaintVersion_(); } catch(e) {}
</script>
