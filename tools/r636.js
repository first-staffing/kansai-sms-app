/* ================================================================
   R636 (9.3.3) 2026-11-24  CSV取り込み: 順番待ちに入れたら、その場で処理を始める
   - 1,000行以上の取り込みは順番待ちに入り、1分おきの処理を待っていた。
   - 順番待ちに入れた直後に importProcessNow を呼び、すぐ処理を始める。
     (サーバーが未対応でも何も起きない。従来どおり1分おきの処理が続ける)
   ================================================================ */
(function(){
  if (window._r636) return; window._r636 = true;
  var prev = postJson_;
  var st = { inflight: false, again: false };
  function kick(){
    if (st.inflight) { st.again = true; return; }
    st.inflight = true; st.again = false;
    prev.call(window, { action: "importProcessNow" }).catch(function(){}).then(function(){
      st.inflight = false;
      if (st.again) setTimeout(kick, 300);
    });
  }
  postJson_ = function(req){
    var p = prev.apply(this, arguments);
    try {
      if (req && req.action === "importEnqueue" && p && typeof p.then === "function") {
        p.then(function(j){ try { if (!j || j.ok !== false) kick(); } catch(e) {} }, function(){});
      }
    } catch(e) {}
    return p;
  };
})();
window.APP_VERSION_LABEL = "v9.3.3";
try { r621PaintVersion_(); } catch(e) {}
