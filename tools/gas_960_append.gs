
// ===== 4.0 (2026-11-27) NGのサーバー側拒否・通知件名・{市区町村}・計測・案件検索アプリ連動確認 =====
// --- A. 配信NGの人には、SMSの起動ページもフォームの案内も発行しない。送信済みの記録も受け付けない ---
var ngIds960_ = null;
function ngIdsOnce960_() {
  if (!ngIds960_) { try { ngIds960_ = ngIdSet944_() || {}; } catch (e) { ngIds960_ = {}; } }
  return ngIds960_;
}
(function () {
  var prevB = smsBlockedReason_;
  smsBlockedReason_ = function (applicant) {
    var r = prevB.apply(this, arguments);
    if (r) return r;
    try { if (applicant && ngIdsOnce960_()[str_(applicant.applicant_id)]) return '配信NGリストに入っているため実行できません'; } catch (e) {}
    return r;
  };
  var prevL = actionIssueSmsLaunch_;
  actionIssueSmsLaunch_ = function (req) {
    var hit = false;
    try { hit = !!ngIdsOnce960_()[str_(req && req.applicant_id)]; } catch (e) {}
    if (hit) throw new Error('配信NGリストに入っているため、SMSは送れません');
    return prevL.apply(this, arguments);
  };
})();

// --- B. 回答通知メールの件名に、名前・電話の希望日時・見学希望日・選んだ案件を入れる ---
function notifySubject960_(ctx, base) {
  var nm = str_(ctx && ctx.applicantName);
  if (!nm) return base;
  var parts = [];
  var ph = '';
  try { ph = str_(notifyPhoneText_(ctx)).replace(/\s+/g, ' ').trim(); } catch (e) {}
  if (ph) parts.push('電話 ' + (ph.length > 26 ? ph.slice(0, 25) + '…' : ph));
  var tour = str_(ctx.desiredTourDate);
  if (tour) {
    parts.push('見学 ' + tour.split(',').slice(0, 3).map(function (d) {
      var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d);
      return m ? (Number(m[2]) + '/' + Number(m[3])) : str_(d);
    }).join('・'));
  }
  var cs = [];
  try { cs = notifyCases940_(ctx.selectedCaseIds); } catch (e2) { cs = []; }
  if (cs.length) {
    var n0 = str_(cs[0].name);
    if (n0.length > 16) n0 = n0.slice(0, 15) + '…';
    parts.push(n0 + (cs.length > 1 ? ' ほか' + (cs.length - 1) + '件' : ''));
  }
  var neo = '【応募者配信】フォーム回答 ' + nm + '様' + (parts.length ? '｜' + parts.join('｜') : '');
  var re = /【応募者配信】フォーム回答がありました(?: \(.*様\))?$/;
  return re.test(base) ? base.replace(re, neo) : base;
}
function testNotifySubject960() {
  var ctx = { applicantName: '杉本 テスト', phoneConsultDatetime: '11/28（土） 午前（9〜12時）', desiredTourDate: '2026-12-01,2026-12-03', selectedCaseIds: ['C000004', 'C003953'] };
  Logger.log(notifySubject960_(ctx, '【応募者配信】フォーム回答がありました (杉本 テスト様)'));
  Logger.log(notifySubject960_(ctx, '【本日電話希望】【応募者配信】フォーム回答がありました (杉本 テスト様)'));
  Logger.log(notifySubject960_({ applicantName: '' }, '【応募者配信】フォーム回答がありました'));
}

// --- C. Gmail の件名・本文で {市区町村} を使えるようにする (その人の市区町村。無ければ府県、それも無ければ「お近く」) ---
(function () {
  var prevE = expandTemplate_;
  expandTemplate_ = function (template, applicant) {
    var t = String(template || '');
    if (t.indexOf('{市区町村}') >= 0) {
      var m = str_(applicant && applicant.municipality) || str_(applicant && applicant.prefecture) || 'お近く';
      arguments[0] = t.split('{市区町村}').join(m);
    }
    return prevE.apply(this, arguments);
  };
})();

// --- D. 重いところの計測 (Gmail配信の「対象の確認」と「作成」) ---
function prof960_(label, fn) {
  var names = ['readTable_', 'tableValues_', 'openCases_', 'recommendCasesFor_', 'computeMailTargets_', 'findApplicant_',
    'findRow_', 'appendRow_', 'appendRows_', 'updateRowByPk_', 'relayHttp_', 'mfVerifyDeliveryContexts_', 'buildMailBody_',
    'expandTemplate_', 'withLock_', 'nextId_', 'activityContext_', 'optoutEmailSet_', 'ngIdSet944_', 'storedRecommendCaseIds_',
    'mailUrlsForRecipient_', 'buildCasesSnapshot_', 'requireKikariUser_', 'operatorByEmail_', 'sendTimeExclusionReason_',
    'fsApplicantIndex_', 'evSummary946_', 'isNgName_', 'isNgRow_', 'recommendText_', 'pushDeferredContexts_', 'invalidateTableCache_'];
  var g = globalThis, st = {}, orig = {};
  names.forEach(function (n) {
    var f = g[n];
    if (typeof f !== 'function') return;
    orig[n] = f; st[n] = { c: 0, ms: 0 };
    g[n] = function () { var t = Date.now(); try { return f.apply(this, arguments); } finally { st[n].c++; st[n].ms += Date.now() - t; } };
  });
  var t0 = Date.now(), err = '';
  try { fn(); } catch (e) { err = String((e && e.message) || e); }
  var total = Date.now() - t0;
  Object.keys(orig).forEach(function (n) { g[n] = orig[n]; });
  var rows = Object.keys(st).filter(function (n) { return st[n].c; })
    .sort(function (a, b) { return st[b].ms - st[a].ms; })
    .map(function (n) { return n + ' ' + st[n].ms + 'ms x' + st[n].c; });
  Logger.log(label + ' total ' + total + 'ms ' + (err ? 'ERR ' + err : '') + ' wrapped ' + Object.keys(orig).length + '\n' + rows.join('\n'));
}
function profPreview960() {
  prof960_('preview', function () {
    var r = actionMailPreviewTargets_({ filter: {}, top_n: 700, recommend_count: 3, mode: 'per_person' });
    Logger.log('targets ' + r.target_count + ' matched ' + r.matched_count);
  });
}
// テスト応募者 A000001 とテストアドレスだけに作る (test: true)。実応募者には作らない
function profCreateTest960() {
  prof960_('createTest', function () {
    var r = actionMailCreateDelivery_({ subject: '【テスト】4.0 計測 {宛名}様｜{市区町村}', body_template: '{宛名}様\n\n{おすすめ案件}', filter: {}, top_n: 5, recommend_count: 3, mode: 'per_person', test: true });
    Logger.log(JSON.stringify(r).slice(0, 500));
  });
}

// --- E. 案件検索アプリとの連動の確認 (読むだけ。取り込みはしない) ---
function chkAiLink960() {
  var src = aiSyncFetch_();
  var want = {}, skipped = 0;
  src.forEach(function (r) { var o = {}; var c = aiSyncToCase_(r, o); if (c) want[c.source_case_key] = c; else skipped++; });
  var rows = prevReadTable944_('cases').rows;
  var have = {}, open = 0, closed = 0, other = {}, newest = '';
  rows.forEach(function (c) {
    var s = str_(c.source);
    if (s !== AI_SYNC_SOURCE) { other[s || '(空)'] = (other[s || '(空)'] || 0) + 1; return; }
    have[str_(c.source_case_key)] = c;
    if (toBool_(c.is_open)) open++; else closed++;
    var u = str_(c.updated_at); if (u > newest) newest = u;
  });
  var missing = 0, stale = 0, closedButLive = 0;
  Object.keys(want).forEach(function (k) { if (!have[k]) missing++; else if (!toBool_(have[k].is_open)) closedButLive++; });
  Object.keys(have).forEach(function (k) { if (!want[k] && toBool_(have[k].is_open)) stale++; });
  // トリガーの一覧は読まない (ScriptApp を使うと新しい権限が要るおそれがあるため)。トリガーは画面の「トリガー」で見る
  Logger.log(JSON.stringify({
    ai_app_rows: src.length, ai_app_usable: Object.keys(want).length, ai_app_skipped: skipped,
    sms_ai_cases: Object.keys(have).length, sms_open: open, sms_closed: closed, sms_last_updated: newest,
    not_yet_in_sms: missing, in_sms_but_gone_from_ai_app_still_open: stale, closed_in_sms_but_live_in_ai_app: closedButLive,
    other_sources: other
  }));
}
