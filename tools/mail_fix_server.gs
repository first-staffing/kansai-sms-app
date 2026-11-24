/* ================================================================
 * 9.11 Gmail 送信の安全策 (キカリ側サーバー zz_speed_geo.gs の末尾に足す)
 *
 * A. 二重送信の防止 (送信直前・配信作成時の両方で効く)
 *    sendTimeExclusionReason_ に「直近72時間に同じ人 (応募者IDまたはメールアドレス)
 *    へ別の配信で送った/送信中」を足す。同じ実行の中で送った分も覚えて外す。
 * B. フォームの文脈を確かめてから送る
 *    フォーム付きの配信は、送る前に受け口 (GAS中継) にそのトークンの文脈があるか
 *    読み戻して確かめる。無ければその配信の文脈を送り直し、それでも無ければ
 *    「送信対象外 (理由つき)」にして送らない。
 * C. 文脈の送信を100件ずつに分ける
 *    個人用の受け口は1回100件まで (超えると全部拒否)。配信の文脈送信を
 *    100件ずつに分けて送る関数を用意し、作成時の送信もそれに置き換える。
 * D. 送った分の裏取りと失敗一覧
 *    mailRunReport(配信ID) で、キューの状態・失敗理由・Gmail送信済みの照合結果を返す。
 * E. 既に送ったリンクの救済
 *    repushRecentMailContexts(日数) で、直近の配信の文脈を受け口へ送り直す
 *    (読み戻して無いものだけ)。
 * ================================================================ */
var MAILFIX_DUP_HOURS_ = 72;
var mailfixMemo_ = null;

function mailfixInit_() {
  if (mailfixMemo_) return mailfixMemo_;
  var since = Date.now() - MAILFIX_DUP_HOURS_ * 3600000;
  var emailById = {};
  try {
    readTable_('applicants').rows.forEach(function (a) {
      var em = str_(a.email).toLowerCase();
      if (em) emailById[str_(a.applicant_id)] = em;
    });
  } catch (e) {}
  var byApp = {}, byEmail = {};
  readTable_('send_queue').rows.forEach(function (q) {
    var st = str_(q.status);
    if (st !== 'sent' && st !== 'sending') return;
    var t = Date.parse(cellDateIso_(q.sent_at) || cellDateIso_(q.updated_at) || cellDateIso_(q.created_at) || '') || 0;
    if (t && t < since) return;
    var aid = str_(q.applicant_id), did = str_(q.delivery_id);
    (byApp[aid] = byApp[aid] || []).push(did);
    var em = emailById[aid];
    if (em) (byEmail[em] = byEmail[em] || []).push(did + '|' + aid);
  });
  mailfixMemo_ = { byApp: byApp, byEmail: byEmail, ctxOk: {}, pushed: {}, deliveries: {} };
  return mailfixMemo_;
}

var mailfixPrevExcl_ = sendTimeExclusionReason_;
sendTimeExclusionReason_ = function (applicant, recipient, optSet, opts) {
  var r = mailfixPrevExcl_.apply(this, arguments);
  if (r) return r;
  try {
    if (opts && opts.is_test_delivery) return r;
    var m = mailfixInit_();
    var aid = str_(applicant && applicant.applicant_id);
    var did = str_(opts && opts.delivery_id);
    var email = str_((recipient && recipient.email) || (applicant && applicant.email)).toLowerCase();
    var other = (m.byApp[aid] || []).some(function (d) { return d !== did; });
    if (!other && email) other = (m.byEmail[email] || []).some(function (k) { return k !== did + '|' + aid; });
    if (other) return '二重送信の防止: 直近' + MAILFIX_DUP_HOURS_ + '時間以内に同じ方へ別の配信で送信済み (または送信中)';
    if (did && recipient && str_(recipient.form_token)) {
      var ce = mailfixEnsureContext_(did, str_(recipient.form_token));
      if (ce) return ce;
    }
    (m.byApp[aid] = m.byApp[aid] || []).push(did);
    if (email) (m.byEmail[email] = m.byEmail[email] || []).push(did + '|' + aid);
  } catch (e) {
    try { Logger.log('mailfix check error: ' + errMsg_(e)); } catch (e2) {}
  }
  return r;
};

/** 受け口にトークンの文脈があるか (GAS中継のときだけ確認できる。確認できない設定では true) */
function mailfixHasCtx_(token) {
  var cfg = null;
  try { cfg = gasRelayConfig_(); } catch (e) { cfg = null; }
  if (!cfg || !cfg.baseUrl) return true;
  var res = UrlFetchApp.fetch(cfg.baseUrl + '?path=form-context&token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return false;
  var j = null;
  try { j = JSON.parse(res.getContentText()); } catch (e) { j = null; }
  return !!(j && j.ok && j.context);
}

function mailfixEnsureContext_(deliveryId, token) {
  var m = mailfixInit_();
  if (m.ctxOk[token]) return '';
  var d = m.deliveries[deliveryId];
  if (d === undefined) { try { d = findRow_('deliveries', 'delivery_id', deliveryId); } catch (e) { d = null; } m.deliveries[deliveryId] = d; }
  try { if (d && typeof deliveryIncludeForm_ === 'function' && !deliveryIncludeForm_(d)) { m.ctxOk[token] = 1; return ''; } } catch (e) {}
  if (mailfixHasCtx_(token)) { m.ctxOk[token] = 1; return ''; }
  if (!m.pushed[deliveryId]) {
    m.pushed[deliveryId] = 1;
    try { mailfixPushDeliveryContexts_(deliveryId); } catch (e) { Logger.log('mailfix repush failed ' + deliveryId + ': ' + errMsg_(e)); }
  }
  if (mailfixHasCtx_(token)) { m.ctxOk[token] = 1; return ''; }
  return '回答フォームの情報が受け口に届いていないため送信を止めました (フォームが開けないメールを送らないため)';
}

/**
 * C. 配信の文脈を100件ずつに分けて受け口へ送る。
 * 既存の relayPushContextsForDelivery_ は「配信ID」単位でまとめて送るため、
 * 受け口の上限 (100件) を超える配信で全部拒否されていた。
 * ここでは delivery_recipients を100人ずつの「仮の配信ビュー」に分けず、
 * 既存関数が使う文脈の組み立て (relayBuildContextsForDelivery_ があればそれ) を使って
 * 自前で100件ずつ送る。組み立て関数が無い場合は既存関数をそのまま呼ぶ。
 */
function mailfixPushDeliveryContexts_(deliveryId) {
  if (typeof relayBuildContextsForDelivery_ === 'function' && typeof relayPushContextList_ === 'function') {
    var list = relayBuildContextsForDelivery_(deliveryId) || [];
    var out = { pushed: 0, chunks: 0, errors: [] };
    for (var i = 0; i < list.length; i += 100) {
      var r = relayPushContextList_(list.slice(i, i + 100));
      out.chunks++;
      if (r && r.ok === false) out.errors.push(r.error || 'push_failed'); else out.pushed += Math.min(100, list.length - i);
    }
    return out;
  }
  return relayPushContextsForDelivery_(deliveryId);
}

/** D. 配信の結果 (キューの状態・失敗理由・Gmail送信済みとの照合) */
function mailRunReport(deliveryId) {
  var me = currentUserEmail_();
  var rows = readTable_('send_queue').rows.filter(function (q) {
    return (!deliveryId || str_(q.delivery_id) === String(deliveryId)) && String(q.sender_email).toLowerCase() === me;
  });
  var counts = {}, failed = [], notVerified = [];
  rows.forEach(function (q) {
    var st = str_(q.status); counts[st] = (counts[st] || 0) + 1;
    if (st === 'failed' || st === 'skipped') {
      var rec = null; try { rec = findRecipient_(q.delivery_id, q.applicant_id); } catch (e) {}
      failed.push({ applicant_id: str_(q.applicant_id), status: st, reason: str_(rec && rec.error) });
    }
  });
  // Gmail の送信済みと照合 (送信済み扱いの行だけ、最大100件)
  var sentRows = rows.filter(function (q) { return str_(q.status) === 'sent'; }).slice(0, 100);
  sentRows.forEach(function (q) {
    var rec = null; try { rec = findRecipient_(q.delivery_id, q.applicant_id); } catch (e) {}
    var em = str_(rec && rec.email);
    if (!em) return;
    var hit = GmailApp.search('in:sent to:' + em + ' newer_than:3d', 0, 1);
    if (!hit || !hit.length) notVerified.push({ applicant_id: str_(q.applicant_id), email_masked: em.replace(/^(.{2}).*(@.*)$/, '$1***$2') });
  });
  var out = { delivery_id: deliveryId || '(all)', counts: counts, failed: failed, sent_not_found_in_gmail: notVerified };
  console.log('[mail-report] ' + JSON.stringify(out));
  return out;
}

/** E. 直近の配信の文脈を、受け口に無いものだけ送り直す (既に送ったリンクの救済) */
function repushRecentMailContexts(days) {
  days = Number(days) || 3;
  var since = Date.now() - days * 86400000;
  var dels = readTable_('deliveries').rows.filter(function (d) {
    var t = Date.parse(cellDateIso_(d.created_at) || '') || 0;
    return t >= since && str_(d.channel || 'gmail') !== 'sms';
  });
  var rec = readTable_('delivery_recipients').rows;
  var out = { deliveries: 0, checked: 0, missing: 0, repushed: 0, still_missing: 0 };
  var t0 = Date.now();
  dels.forEach(function (d) {
    if (Date.now() - t0 > 300000) return;
    var did = str_(d.delivery_id);
    var toks = rec.filter(function (r) { return str_(r.delivery_id) === did && str_(r.form_token); }).map(function (r) { return str_(r.form_token); });
    if (!toks.length) return;
    out.deliveries++;
    var miss = toks.filter(function (tk) { out.checked++; return !mailfixHasCtx_(tk); });
    if (!miss.length) return;
    out.missing += miss.length;
    try { mailfixPushDeliveryContexts_(did); } catch (e) { Logger.log('repush ' + did + ': ' + errMsg_(e)); }
    var still = miss.filter(function (tk) { return !mailfixHasCtx_(tk); });
    out.repushed += miss.length - still.length;
    out.still_missing += still.length;
  });
  console.log('[repush] ' + JSON.stringify(out));
  return out;
}
