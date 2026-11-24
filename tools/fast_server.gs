/**
 * 9.6 高速化 (キカリ側サーバーに追加するファイル)
 *
 * A. 案件フォーム作成の高速化 (約5.9秒 → 1〜2秒の見込み)
 *    - 画面は「待たない発行」(defer_push) を送ってくる (v9.2.1 から)。
 *    - そのときは、発行の記録 (deliveries / delivery_recipients の2行) も後回しにして、
 *      トークンとURLだけ先に返す。記録の中身は Script Properties (pi_<token>) に置く。
 *    - 後回しにした記録は、次のどれかが来た時点で必ず先に書く (記録ずれを防ぐ):
 *        1) 画面がすぐ続けて呼ぶ pushFormContext
 *        2) SMS送信済みの記録 (markSmsSent) で同じ delivery_id が来たとき
 *        3) トークンで宛先行を探すとき (回答の取り込みなど)
 *        4) 1分おきの回答取り込みのついで (60秒以上残っている分)
 *
 * B. CSV取り込みの高速化
 *    - 1,000行以上の取り込みは順番待ち (import_queue) に入り、1分おきのトリガーが
 *      1回に3チャンクまで処理していた。開始まで最大1分 + 3チャンクごとに1分待ち。
 *    - 画面が順番待ちに入れた直後に importProcessNow を呼び、その場で処理を始める。
 *    - トリガー側も「3チャンクまで」をやめ、時間の許す限り続けて処理する。
 *
 * このファイルはプロジェクトの一番最後のファイルとして置くこと (既存の関数を包むため)。
 *
 * 貼り付け後に既存コードへ入れる変更 (2か所):
 *   (1) 振り分け (apiCall の switch):
 *       case 'issueFormToken': return (req.defer_push && gasRelayConfig_()) ? actionIssueFormTokenFast_(req) : actionIssueFormToken_(req);
 *       case 'importProcessNow': return actionImportProcessNow_(req);
 *   (2) processImportQueue の while 条件の `processed < 3 &&` を外す
 */

// ===================== A. フォーム作成 =====================
var PENDING_ISSUE_PREFIX_ = 'pi_';
var PENDING_DELIVERY_PREFIX_ = 'pd_';

function actionIssueFormTokenFast_(req) {
  var tt = Date.now(), tl = [];
  var me = requireKikariUser_();
  var applicantId = String(req.applicant_id || '');
  if (!applicantId) throw new Error('applicant_id が必要です');
  var applicant = findApplicant_(applicantId);
  tl.push('applicant ' + (Date.now() - tt));
  if (smsBlockedReason_(applicant)) throw new Error('配信停止中のためフォーム案内は発行できません');
  var channel = String(req.channel || 'sms') === 'mail' ? 'mail' : 'sms';
  var caseIds = toList_(req.case_ids || req.selected_case_ids || req.presented_case_ids);
  if (!caseIds.length) {
    var n = channel === 'sms' ? SMS_RECOMMEND_DEFAULT : clampRecommendCount_(req.recommend_count);
    caseIds = (typeof storedRecommendCaseIds_ === 'function') ? storedRecommendCaseIds_(applicant, n) : [];
  }
  var op = {};
  try { op = operatorByEmail_(me) || {}; } catch (e) { op = {}; }
  var issueBodyText = String(req.body_snapshot || req.body_template || req.body || '');
  var issueTplVer = req.template_version
    ? { template_id: String(req.template_id || ''), template_version: String(req.template_version) }
    : templateVersionFor_({ template_id: req.template_id, template_kind: req.template_kind }, issueBodyText);
  var deliveryId = 'DT' + Date.now().toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
  var token = newFormToken_();
  var pend = {
    me: me, sender_name: str_(op.display_name), applicant_id: applicantId, email: str_(applicant.email),
    case_ids: caseIds, channel: channel, campaign_id: String(req.campaign_id || ''),
    template_id: issueTplVer.template_id || '', template_version: issueTplVer.template_version || '',
    delivery_id: deliveryId, token: token, at: nowIso_(), saved_ms: Date.now()
  };
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PENDING_ISSUE_PREFIX_ + token, JSON.stringify(pend));
  props.setProperty(PENDING_DELIVERY_PREFIX_ + deliveryId, token);
  tl.push('saved ' + (Date.now() - tt));
  console.log('[issue-fast] ' + tl.join(' / '));
  return { delivery_id: deliveryId, form_token: token, form_url: formUrlForToken_(token),
    sender_email: me, sender_name: str_(op.display_name), channel: channel, case_ids: caseIds,
    push_deferred: true, rows_deferred: true };
}

/** 後回しにした発行の記録を書く。書いたら true。無ければ false (何度呼んでもよい) */
function flushPendingIssue_(token) {
  token = String(token || '');
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PENDING_ISSUE_PREFIX_ + token)) return false;
  var lock = LockService.getScriptLock();
  var mine = false;
  if (!lock.hasLock()) { lock.waitLock(20000); mine = true; }
  try {
    var raw = props.getProperty(PENDING_ISSUE_PREFIX_ + token); // ロックの中で読み直す (二重書き込み防止)
    if (!raw) return false;
    var p = JSON.parse(raw);
    appendRow_('deliveries', {
      delivery_id: p.delivery_id, sender_email: p.me, sender_name: p.sender_name, subject: '(フォーム案内リンク)',
      body_template: '', mode: 'per_person', recommend_count: (p.case_ids || []).length,
      filter_json: JSON.stringify({ form_invite: true, channel: p.channel, campaign_id: p.campaign_id || '' }),
      target_count: 1, sent_count: 0, failed_count: 0,
      status: 'form_link', scheduled_at: '', created_by: p.me,
      created_at: p.at, started_at: '', finished_at: '',
      template_id: p.template_id, template_version: p.template_version
    });
    appendRow_('delivery_recipients', {
      delivery_id: p.delivery_id, applicant_id: p.applicant_id, email: p.email,
      recommended_case_ids: (p.case_ids || []).join(','),
      status: 'form_link', error: '', sent_at: '',
      form_token: p.token, created_at: p.at, updated_at: p.at,
      cases_snapshot: '', body_snapshot: '', template_version: p.template_version
    });
    // 中継の文脈作りが全件読みしないよう、いま書いた2行を覚えておく (actionIssueFormToken_ と同じ)
    try {
      ISSUE_MEMO_ = {
        rec: { delivery_id: p.delivery_id, applicant_id: p.applicant_id, email: p.email,
          recommended_case_ids: (p.case_ids || []).join(','), status: 'form_link', error: '', sent_at: '',
          form_token: p.token, created_at: p.at, updated_at: p.at },
        delivery: { delivery_id: p.delivery_id, sender_email: p.me, sender_name: p.sender_name,
          subject: '(フォーム案内リンク)', mode: 'per_person', status: 'form_link', created_by: p.me, created_at: p.at,
          filter_json: JSON.stringify({ form_invite: true, channel: p.channel, campaign_id: p.campaign_id || '' }) }
      };
    } catch (eM) {}
    props.deleteProperty(PENDING_ISSUE_PREFIX_ + token);
    props.deleteProperty(PENDING_DELIVERY_PREFIX_ + p.delivery_id);
    return true;
  } finally { if (mine) lock.releaseLock(); }
}
function flushPendingIssueByDelivery_(deliveryId) {
  var tk = PropertiesService.getScriptProperties().getProperty(PENDING_DELIVERY_PREFIX_ + String(deliveryId || ''));
  return tk ? flushPendingIssue_(tk) : false;
}
/** 60秒以上残っている後回し分をまとめて書く (回答取り込みのついで) */
function flushStalePendingIssues_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), n = 0, t0 = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(PENDING_ISSUE_PREFIX_) !== 0 || Date.now() - t0 > 60000) return;
    var p = null; try { p = JSON.parse(all[k]); } catch (e) { p = null; }
    if (p && p.saved_ms && Date.now() - p.saved_ms < 60000) return;
    try { if (flushPendingIssue_(k.slice(PENDING_ISSUE_PREFIX_.length))) n++; } catch (e2) { Logger.log('flush 失敗 ' + k + ': ' + errMsg_(e2)); }
  });
  if (n) console.log('[flush] ' + n);
  return n;
}

// 既存の関数を包む (どのファイルに書いても、読み込み時に差し替わる)
(function () {
  // 1) 画面からの後追い送信: 先に記録を書く
  var prevPush = actionPushFormContext_;
  actionPushFormContext_ = function (req) {
    try { flushPendingIssue_(req && req.form_token); } catch (e) { Logger.log('flush(push): ' + errMsg_(e)); }
    var r = prevPush.apply(this, arguments);
    try { ISSUE_MEMO_ = null; } catch (e1) {}
    return r;
  };
  // 2) SMS送信済みの記録: 同じ delivery_id の記録を先に書く
  var prevSms = actionRecordSmsSent_;
  actionRecordSmsSent_ = function (req) {
    try { if (req && req.delivery_id) flushPendingIssueByDelivery_(req.delivery_id); } catch (e) { Logger.log('flush(sms): ' + errMsg_(e)); }
    return prevSms.apply(this, arguments);
  };
  // 3) トークンで宛先行を探すとき
  var prevFind = findRecipientByToken_;
  findRecipientByToken_ = function (token) {
    try { flushPendingIssue_(token); } catch (e) {}
    return prevFind.apply(this, arguments);
  };
  // 4) 1分おきの回答取り込みのついで
  var prevDeferred = pushDeferredContexts_;
  pushDeferredContexts_ = function () {
    try { flushStalePendingIssues_(); } catch (e) { Logger.log('flushStale: ' + errMsg_(e)); }
    return prevDeferred.apply(this, arguments);
  };
})();

// ===================== B. CSV取り込み =====================
/** 画面が順番待ちに入れた直後に呼ぶ。時間の許す限り、その場で処理する */
function actionImportProcessNow_(req) {
  requireKikariUser_();
  var t0 = Date.now(), processed = 0, errors = 0;
  // 同時に何本も走らせない (他で処理中なら何もしない)
  var cache = CacheService.getScriptCache();
  if (cache.get('import_now_running')) return { skipped: 'running' };
  cache.put('import_now_running', '1', 330);
  try {
    while (Date.now() - t0 < 270000) {
      var group = claimNextImportChunk_();
      if (!group) break;
      var res = null, err = null;
      try { res = (group.req && group.req.kind === 'cases')
        ? importCasesCommitCore_(group.req, group.actor)
        : importCommitCore_(group.req, group.actor); }
      catch (e) { err = e; errors++; }
      try { finishImportChunk_(group, res, err); } catch (e2) {}
      processed++;
    }
  } finally { cache.remove('import_now_running'); }
  console.log('[import-now] chunks=' + processed + ' ms=' + (Date.now() - t0));
  return { processed_chunks: processed, errors: errors, ms: Date.now() - t0 };
}
