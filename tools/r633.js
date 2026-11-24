/* ================================================================
   R633 (9.3.0) 2026-11-24  目次画面 + アンケートフォームモード
   - 入口 (#/) を目次にする: CSV取り込み / 案件フォーム配信 / アンケートフォーム /
     Gmail送信 / 案件逆引き配信（文面）
   - 「アンケートフォーム」から入ると、初回SMSが Google フォームのアンケート文面になる。
     回答フォームを作らない (発行の通信なし) ので、タップ1回ですぐSMSが開く
   - どちらで送るかは目次で選ぶ (この端末で覚える)。文面は設定画面で編集でき、
     サーバーのテンプレート (kind=sms_mode, name=survey) に保存して全担当者で共有
   - アンケートの回答は Google フォーム側で見る (アプリには取り込まない)
   ================================================================ */
window._r633 = "9.3.0";
var R633_URL = "https://docs.google.com/forms/d/e/1FAIpQLScNskySGOko_tswU5PwG1uTc44zWzCm2EFZyeeCBApFJy7C_Q/viewform";
var R633_DEFAULT = [
  "{宛名}様",
  "ファーストスタッフィングです。",
  "この度はご応募いただき、ありがとうございます。",
  "",
  "＼時給アップキャンペーン実施中／",
  "",
  "ご希望に合った案件だけをご案内するため、30秒アンケートにご協力ください。",
  "希望エリア・勤務条件に加えて、面談や見学の希望日も入力できます。",
  "",
  "▼アンケートはこちら",
  R633_URL,
  "",
  "ご回答後、担当エージェントよりご連絡いたします。",
  "",
  "株式会社ファーストスタッフィング",
  "担当：{担当者}"
].join("\n");
window._r633State = (function(){
  try { var s = LS.get("r633Survey", null); if (s && typeof s.body === "string" && s.body) return { body: s.body }; } catch(e) {}
  return { body: R633_DEFAULT };
})();
window._r633Mode = (function(){ try { return LS.get("r633Mode", "form") === "survey" ? "survey" : "form"; } catch(e) { return "form"; } })();
function r633SetMode_(m){ window._r633Mode = (m === "survey") ? "survey" : "form"; try { LS.set("r633Mode", window._r633Mode); } catch(e) {} }
/* アンケート文面を使うのは「アンケートフォーム」から入った一覧の初回SMSだけ */
function r633On_(){
  try { return window._r633Mode === "survey" && (location.hash || "").indexOf("#/list") === 0 && (typeof state === "undefined" || !state.mode || state.mode === "first"); } catch(e) { return false; }
}
function r633Save_(){ try { LS.set("r633Survey", window._r633State); } catch(e) {} }

/* サーバーのテンプレート同期で状態を受け取る */
var r633PrevApplyTpl_ = applyServerTemplates_;
applyServerTemplates_ = function(res){
  var out = r633PrevApplyTpl_.apply(this, arguments);
  try {
    var row = (res && res.templates || []).filter(function(t){ return t && t.kind === "sms_mode" && /^survey/.test(String(t.name || "")); })[0];
    if (row && String(row.body || "")) { window._r633State = { body: String(row.body) }; r633Save_(); }
  } catch(e) {}
  return out;
};

/* 本文 */
function r633Body_(a){
  var name = ""; try { name = smsRecipientName(a.name); } catch(e) { name = String(a.name || ""); }
  var op = ""; try { op = currentOpName() || ""; } catch(e) {}
  var b = String(window._r633State.body || R633_DEFAULT);
  b = b.replace(/\{宛名\}/g, name).replace(/\{担当者\}/g, op || "担当");
  /* 担当者名が取れないときは「担当：担当」の行を消す */
  if (!op) b = b.replace(/\n担当：担当$/, "");
  return b;
}
function r633Phone_(a){
  var phone = String(a.phone || "").replace(/[^0-9]/g, "");
  if (!phone) { try { var c = window._r618Phone && window._r618Phone[a.id]; if (c && c.val) phone = c.val; } catch(e) {} }
  /* 端末の名簿 (ロスター) にあればそれを使う (サーバーに問い合わせない) */
  if (!phone) { try { var ro = window._r616Roster && window._r616Roster.items; if (ro) { for (var i = 0; i < ro.length; i++) if (ro[i] && ro[i].id === a.id) { phone = String(ro[i].phone || "").replace(/[^0-9]/g, ""); break; } } } catch(e) {} }
  return phone;
}
function r633Find_(id){ try { return applicants.find(function(x){ return x.id === id; }) || null; } catch(e) { return null; } }

/* 一覧の「初回SMS」: オンの間は発行なしで、その場で sms: リンクを作る */
var r633PrevFresh_ = r626Fresh_;
r626Fresh_ = function(id){
  if (!r633On_()) return r633PrevFresh_.apply(this, arguments);
  var a = r633Find_(id);
  if (!a || a.mail_optout) return null;
  try { if (typeof isOptoutForSms === "function" && isOptoutForSms(a)) return null; } catch(e) {}
  var phone = r633Phone_(a);
  if (!phone) return null;
  var body = r633Body_(a);
  var href = "";
  try { href = smsLink(phone, body); } catch(e) { return null; }
  if (!href || href.charAt(0) === "#") return null;
  return { href: href, phone: phone, body: body, at: Date.now(), launch: false, survey: true };
};

/* 本文を作る共通処理 (詳細画面の「SMS作成を開く」など) */
var r633PrevFirstBody_ = r614FirstBody_;
r614FirstBody_ = function(a){
  if (!r633On_()) return r633PrevFirstBody_.apply(this, arguments);
  return { tpl: { id: "survey", title: "アンケート", body: window._r633State.body }, body: r633Body_(a) };
};
var r633PrevBodyWithUrl_ = r614BodyWithUrl_;
r614BodyWithUrl_ = function(body, url){
  if (r633On_()) return body; /* アンケート文面にはフォームURLを付けない */
  return r633PrevBodyWithUrl_.apply(this, arguments);
};
/* オンの間は SMS 用の回答フォームを作らない (メール配信のフォームはそのまま) */
var r633PrevFormUrl_ = formUrlFor;
formUrlFor = function(a){
  if (r633On_()) return "";
  return r633PrevFormUrl_.apply(this, arguments);
};
var r633PrevIssue_ = (typeof issueFormInvite === "function") ? issueFormInvite : null;
if (r633PrevIssue_) {
  issueFormInvite = function(a, channel){
    if (r633On_() && channel !== "mail") return null;
    return r633PrevIssue_.apply(this, arguments);
  };
}
var r633PrevCompose_ = (typeof openSmsCompose614 === "function") ? openSmsCompose614 : null;
if (r633PrevCompose_) {
  openSmsCompose614 = function(){
    if (!r633On_()) return r633PrevCompose_.apply(this, arguments);
    var keep = state.attachFormSms;
    state.attachFormSms = false;
    try { return r633PrevCompose_.apply(this, arguments); } finally { state.attachFormSms = keep; }
  };
}
var r633PrevDirect_ = openSmsDirect615;
openSmsDirect615 = function(){
  if (!r633On_()) return r633PrevDirect_.apply(this, arguments);
  var keep = state.attachFormSms;
  state.attachFormSms = false;
  try { return r633PrevDirect_.apply(this, arguments); } finally { state.attachFormSms = keep; }
};
try {
  if (window.__APP_LOGIC__) {
    window.__APP_LOGIC__.openSmsDirect615 = openSmsDirect615;
    if (r633PrevCompose_) window.__APP_LOGIC__.openSmsCompose614 = openSmsCompose614;
  }
} catch(e) {}

/* 設定画面: アンケートの文面 */
function r633SettingsCard_(){
  var s = window._r633State;
  var div = document.createElement("div");
  div.className = "card r633card";
  div.id = "r633card";
  div.innerHTML =
    '<h3 style="margin:0 0 6px">アンケートフォームの文面</h3>' +
    '<p class="small" style="margin:0 0 8px">目次の「アンケートフォーム」から送る初回SMSの文面です。{宛名} はお名前、{担当者} は送る人の名前に置き換わります。保存すると全担当者に反映されます。</p>' +
    '<textarea id="r633body" rows="15" style="width:100%;box-sizing:border-box;font-size:14px;line-height:1.5">' + esc(s.body || R633_DEFAULT) + '</textarea>' +
    '<div class="flex" style="margin-top:8px;gap:8px;flex-wrap:wrap">' +
      '<button class="primary" id="r633save">保存する</button>' +
      '<button id="r633reset">初期の文面に戻す</button>' +
      '<span class="small" id="r633msg"></span>' +
    '</div>';
  setTimeout(function(){
    var msg = document.getElementById("r633msg");
    document.getElementById("r633reset").onclick = function(){ document.getElementById("r633body").value = R633_DEFAULT; };
    document.getElementById("r633save").onclick = function(){
      var body = String(document.getElementById("r633body").value || "").trim() || R633_DEFAULT;
      if (body.indexOf("http") < 0) { msg.textContent = "文面にアンケートのリンクが入っていません"; return; }
      msg.textContent = "保存中…";
      var done = function(){
        window._r633State = { body: body };
        r633Save_();
        msg.textContent = "保存しました";
        try { showToast("アンケートの文面を保存しました", "ok"); } catch(e) {}
      };
      if (window._r6ServerMode && typeof apiCall === "function") {
        apiCall({ action: "updateTemplate", kind: "sms_mode", name: "survey", body: body })
          .then(done, function(e){ msg.textContent = "保存できませんでした：" + String(e && e.message || e); });
      } else done();
    };
  }, 0);
  return div;
}
var r633PrevViewSettings_ = viewSettings;
viewSettings = function(){
  var r = r633PrevViewSettings_.apply(this, arguments);
  try {
    var app = document.getElementById("app");
    if (app && !document.getElementById("r633card")) {
      var first = app.querySelector(".card");
      if (first && first.parentNode) first.parentNode.insertBefore(r633SettingsCard_(), first);
      else app.appendChild(r633SettingsCard_());
    }
  } catch(e) {}
  return r;
};

/* 一覧の上に、いまどちらで送っているかを出す */
function r633Badge_(){
  try {
    var el = document.getElementById("r633badge");
    var onList = (location.hash || "").indexOf("#/list") === 0 && (!state.mode || state.mode === "first");
    if (!onList) { if (el) el.remove(); return; }
    var survey = window._r633Mode === "survey";
    var html = (survey ? "📝 アンケートフォームで送信中" : "📋 案件フォームで送信中") + ' <a href="#/">目次へ</a>';
    if (!el) {
      el = document.createElement("div");
      el.id = "r633badge";
      var app = document.getElementById("app");
      if (app) app.insertBefore(el, app.firstChild);
    }
    el.className = "r633badge" + (survey ? " survey" : "");
    if (el.innerHTML !== html) el.innerHTML = html;
  } catch(e) {}
}

/* 目次 */
function r633Go_(kind){
  try {
    if (kind === "form" || kind === "survey") {
      r633SetMode_(kind);
      state.mode = "first"; state.visible = 20;
      location.hash = "#/list";
    } else if (kind === "special") {
      /* 案件逆引き配信: 旧アプリと同じく、案件を選ぶ画面から始める */
      state.mode = "reverse"; state.visible = 20;
      location.hash = "#/list";
      setTimeout(function(){ try { if (typeof openCaseSearch === "function") openCaseSearch(); } catch(e) {} }, 300);
    } else if (kind === "import") location.hash = "#/import";
    else if (kind === "mail") location.hash = "#/mail";
    setTimeout(function(){ try { route(); } catch(e) {} }, 0);
  } catch(e) {}
}
function r633Menu_(){
  var items = [
    ["import", "📥", "CSV取り込みのみ", "応募者のCSVを取り込むだけ（送信はしない）"],
    ["form", "📋", "案件フォーム配信", "初回SMSに、おすすめ案件を選べる回答フォームを付けて送る"],
    ["survey", "📝", "アンケートフォーム", "初回SMSに30秒アンケート（Googleフォーム）を付けて送る。フォーム作成がないので最速"],
    ["mail", "✉️", "Gmail送信", "条件で絞ってGmailで案件を一斉配信する"],
    ["special", "🎯", "案件逆引き配信（文面）", "案件を選んで、近くの求職者へ求人詳細の文面でSMSを送る"]
  ];
  var cur = window._r633Mode === "survey" ? "survey" : "form";
  return '<h2 class="r633h">何をしますか？</h2><div class="r633menu">' + items.map(function(it){
    var on = (it[0] === cur) ? ' <span class="r633cur">前回これ</span>' : "";
    return '<button type="button" class="r633tile" onclick="r633Go_(\'' + it[0] + '\')">' +
      '<span class="r633ic">' + it[1] + '</span><span class="r633tx"><b>' + it[2] + on + '</b><small>' + it[3] + '</small></span><span class="r633ar">›</span></button>';
  }).join("") + '</div>' +
  '<div class="r633sub"><a href="#/responses">回答一覧</a><a href="#/dig">掘り起こし</a><a href="#/settings">設定</a></div>';
}
var r633PrevViewHome_ = viewHome;
viewHome = function(){
  var h = location.hash || "";
  if (h.indexOf("#/proposals") === 0) return r633PrevViewHome_.apply(this, arguments);
  if (h === "" || h === "#" || h === "#/" || h.indexOf("#/menu") === 0) {
    try { var app = document.getElementById("app"); if (app) { app.innerHTML = r633Menu_(); return; } } catch(e) {}
  }
  return r633PrevViewHome_.apply(this, arguments);
};
var r633PrevRoute_ = route;
route = function(){
  var h = location.hash || "";
  if (h === "" || h === "#" || h === "#/" || h === "#/home" || h.indexOf("#/menu") === 0) {
    try { renderSummary(); } catch(e) {}
    try { var app = document.getElementById("app"); if (app) app.innerHTML = r633Menu_(); } catch(e) {}
    try { window.scrollTo(0, 0); } catch(e) {}
    try { r621PaintVersion_(); } catch(e) {}
    try { var bb = document.getElementById("bulkBar"); if (bb) bb.style.display = "none"; } catch(e) {}
    try { r616PaintBars_(); } catch(e) {}
    return;
  }
  var r = r633PrevRoute_.apply(this, arguments);
  try { r633Badge_(); } catch(e) {}
  return r;
};
setInterval(r633Badge_, 1500);
try {
  var _ih = window._r633InitHash || "";
  if (_ih === "" || _ih === "#" || _ih === "#/") {
    if ((location.hash || "") !== "#/") { try { history.replaceState(null, "", "#/"); } catch(e) {} }
    route();
  }
} catch(e) {}

window.APP_VERSION_LABEL = "v9.3.0";
try { r621PaintVersion_(); } catch(e) {}
