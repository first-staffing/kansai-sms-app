<script>
/* ================================================================
   R644 (9.3.12) 2026-11-25  Gmail 送信: 押した瞬間の反応・二重押し防止・進捗表示
   1. 「この内容で送信する」を押したら、その場で画面上部に送信パネルを出す
      (「送信を開始しました」→ 配信作成中 → 送信中 n件目/全n件 → 完了/失敗内訳)。
   2. 配信の作成中・送信中は、もう一度押しても新しい配信を作らない (二重送信の入口を塞ぐ)。
      直前10分以内に作った配信がある場合も確認を出す。
   3. 画面を閉じても、サーバーのキューに残った分は送信者のトリガーで順に送られる。
      開き直したときにキューの状況 (送信待ち/送信中/送信済み/失敗) を取りに行き、
      残りがあればパネルで表示する。最後の結果は端末に残して再表示する。
   ================================================================ */
window._r644 = "9.3.12";
(function(){
  var LS_K = "r644LastRun";
  var run = null;               /* 実行中の状態 */
  function save(){ try { localStorage.setItem(LS_K, JSON.stringify(run)); } catch(e) {} }
  function load(){ try { return JSON.parse(localStorage.getItem(LS_K) || "null"); } catch(e) { return null; } }
  function panel(){
    var p = document.getElementById("r644Panel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "r644Panel";
    p.style.cssText = "position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#fff;border:2px solid #1e3a5f;border-radius:12px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:14px;max-height:45vh;overflow:auto";
    document.body.appendChild(p);
    return p;
  }
  function hidePanel(){ var p = document.getElementById("r644Panel"); if (p) p.remove(); }
  window.r644Hide = hidePanel;
  function bar(done, total){
    var pct = total > 0 ? Math.min(100, Math.round(done * 100 / total)) : 0;
    return '<div style="height:10px;background:#e5e7eb;border-radius:6px;overflow:hidden;margin:6px 0"><div style="height:100%;width:' + pct + '%;background:#16a34a"></div></div>';
  }
  function paint(){
    if (!run) return;
    var r = run, total = r.total || 0, done = (r.sent || 0) + (r.failed || 0) + (r.excl || 0);
    var remain = (r.remaining != null) ? r.remaining : Math.max(0, total - done);
    var head = "";
    if (r.phase === "creating") head = "送信を開始しました。配信を作成しています…（そのままお待ちください）";
    else if (r.phase === "sending") head = "送信中 " + Math.min(done + 1, total || done + 1) + "件目／全" + (total || "?") + "件";
    else if (r.phase === "server") head = "サーバーで順に送信中（画面を閉じても進みます）";
    else if (r.phase === "done") head = "送信完了";
    else if (r.phase === "stopped") head = "送信が止まっています";
    else if (r.phase === "failed") head = "送信できませんでした";
    var col = r.phase === "done" ? "#16a34a" : (r.phase === "failed" || r.phase === "stopped") ? "#b91c1c" : "#1e3a5f";
    var html = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="color:' + col + '">' + esc(head) + '</b>'
      + '<button style="min-height:32px;padding:2px 10px" onclick="r644Hide()">閉じる</button></div>';
    if (r.phase !== "creating") {
      html += bar(done, total || done);
      html += '<div>送信済み <b>' + (r.sent || 0) + '</b>件 ・ 失敗 <b>' + (r.failed || 0) + '</b>件 ・ 送信対象外 ' + (r.excl || 0) + '件 ・ 残り <b>' + remain + '</b>件</div>';
    }
    if (r.note) html += '<div class="small" style="margin-top:4px">' + esc(r.note) + '</div>';
    if (r.queue) {
      var c = r.queue;
      html += '<div class="small" style="margin-top:4px">サーバーのキュー（あなたの分）: 送信待ち ' + (c.waiting || 0) + ' ・ 送信中 ' + (c.sending || 0) + ' ・ 失敗 ' + (c.failed || 0) + ' ・ 対象外 ' + (c.skipped || 0) + '</div>';
    }
    if (r.at) html += '<div class="small" style="color:#64748b">開始 ' + esc(new Date(r.at).toLocaleString("ja-JP")) + '</div>';
    panel().innerHTML = html;
  }
  window.r644Paint = paint;

  /* 1・2: 押した瞬間の反応と二重押し防止 */
  var prevConfirm = confirmSendMail;
  confirmSendMail = function(){
    if (run && (run.phase === "creating" || run.phase === "sending")) {
      try { showToast("送信処理中です。終わるまでお待ちください（二重送信を防ぐため、もう一度は送りません）"); } catch(e) {}
      paint();
      return Promise.resolve(null);
    }
    var last = load();
    if (last && last.at && Date.now() - last.at < 10 * 60000 && last.phase !== "failed") {
      if (!window.confirm("10分以内に別の配信を送信しています。同じ人に二重に届くおそれがあります。それでも新しく送信しますか？")) return Promise.resolve(null);
    }
    run = { phase: "creating", at: Date.now(), sent: 0, failed: 0, excl: 0, total: (window._mailTargets || []).length };
    save(); paint();
    try { showToast("送信を開始しました"); } catch(e) {}
    var p;
    try { p = prevConfirm.apply(this, arguments); } catch(e) { run.phase = "failed"; run.note = String(e && e.message || e); save(); paint(); throw e; }
    Promise.resolve(p).then(function(opRes){
      if (!run) return;
      var res = opRes && (opRes.result || opRes);
      if (opRes && opRes.status === "failed") { run.phase = "failed"; run.note = "配信を作れませんでした: " + (opRes.error || ""); }
      else if (!opRes) { if (run.phase === "creating") { run.phase = "failed"; run.note = "配信を作れませんでした（条件が変わったか、通信に失敗しました）"; } }
      else {
        if (res && typeof res.target_count === "number") run.total = res.target_count;
        if (res && res.idempotent_replay) { run.phase = "done"; run.note = "同じ内容の配信が作成済みだったため、二重には送っていません"; }
        else if (res && res.relay_push && (res.relay_push.error || res.relay_push.ok === false)) { run.note = "注意: 回答フォームの情報を受け口へ送れていない可能性があります（" + (res.relay_push.error || "") + "）"; }
        if (run.phase === "creating") run.phase = "sending";
      }
      save(); paint();
    });
    return p;
  };

  /* 送信バッチの結果を積算する */
  var prevPost = postJson_;
  postJson_ = function(req){
    var out = prevPost.apply(this, arguments);
    try {
      if (req && req.action === "sendNextBatch" && out && typeof out.then === "function") {
        out.then(function(j){
          var res = (j && j.data) ? j.data : j;
          if (!res || typeof res !== "object") return;
          if (!run || run.phase === "done") run = { phase: "sending", at: Date.now(), sent: 0, failed: 0, excl: 0, total: 0 };
          run.sent += Number(res.sent || 0); run.failed += Number(res.failed || 0); run.excl += Number(res.skipped_excluded || 0);
          if (typeof res.remaining === "number") run.remaining = res.remaining;
          if (res.stats && res.stats.counts) run.queue = res.stats.counts;
          if (!run.total) run.total = run.sent + run.failed + run.excl + (run.remaining || 0);
          if (res.skipped && res.skipped !== "locked") { run.phase = "stopped"; run.note = "今は送信できません（理由: " + res.skipped + "）。残りはサーバーのキューに残り、送信者のトリガーで順に送られます"; }
          else if (res.remaining === 0) { run.phase = "done"; run.note = "送信成功は Gmail での送信が終わった分だけを数えています"; }
          else run.phase = "sending";
          save(); paint();
        }, function(e){
          if (!run) return;
          run.phase = "stopped"; run.note = "通信が止まりました: " + (e && e.message || e) + "。残りはサーバーのキューに残っています";
          save(); paint();
        });
      }
    } catch(e) {}
    return out;
  };

  /* 3: 開き直したとき、キューに残りがあればパネルを出す */
  function checkQueue(){
    try {
      Promise.resolve(apiCall({ action: "getSendQueueStats" })).then(function(st){
        var c = (st && st.counts) || {};
        var left = (c.waiting || 0) + (c.sending || 0);
        var last = load();
        if (left > 0) {
          run = last && last.phase !== "done" ? last : { at: Date.now(), sent: 0, failed: 0, excl: 0, total: 0 };
          run.phase = (window._sendRun && window._sendRun.active) ? "sending" : "server";
          run.queue = c; run.remaining = left;
          if (!run.total) run.total = left;
          save(); paint();
          setTimeout(checkQueue, 15000);
        } else if (last && last.at && Date.now() - last.at < 24 * 3600000 && last.phase !== "done" && last.phase !== "failed") {
          run = last; run.queue = c; run.remaining = 0; run.phase = "done";
          run.note = "前回の送信は終わりました（失敗 " + (c.failed || 0) + "件・送信対象外 " + (c.skipped || 0) + "件はサーバーの記録に残っています）";
          save(); paint();
        }
      }).catch(function(){});
    } catch(e) {}
  }
  setTimeout(checkQueue, 2500);
})();
window.APP_VERSION_LABEL = "v9.3.12";
try { r621PaintVersion_(); } catch(e) {}
</script>
