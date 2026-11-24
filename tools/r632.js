/* R632 (9.2.1) 2026-11-24  フォーム作成を待たずにSMSを開く
   発行 (issueFormToken) では中継への送信を待たない (defer_push)。
   応答が来たら、すぐ裏で pushFormContext を呼んで中継へ送る。
   画面を閉じて送れなかった分は、サーバーの回答取り込み (10分おき) が送る。 */
(function(){
  if (window._r632) return; window._r632 = true;
  var prev = postJson_;
  postJson_ = function(req){
    if (!req || req.action !== "issueFormToken" || req.defer_push === false) return prev.apply(this, arguments);
    var r2 = Object.assign({}, req, { defer_push: true });
    return prev.call(this, r2).then(function(j){
      try {
        var d = (j && j.data) ? j.data : j;
        var tk = d && (d.form_token || (d.result && d.result.form_token));
        if (tk && d.push_deferred) {
          var push = function(n){
            prev.call(window, { action: "pushFormContext", form_token: tk }).catch(function(){
              if (n < 2) setTimeout(function(){ push(n + 1); }, 1500 * (n + 1));
            });
          };
          push(0);
        }
      } catch(e) {}
      return j;
    });
  };
})();
window.APP_VERSION_LABEL = "v9.2.1";
try { r621PaintVersion_(); } catch(e) {}
