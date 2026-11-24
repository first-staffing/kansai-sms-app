/**
 * 9.7 座標の取り込み (キカリ側サーバーに追加するファイル)
 *
 * 案件検索アプリで使った「国交省 位置参照情報 (大字・町丁目)」の関西5府県・約3万町丁目の
 * 位置表 (GitHub Pages の town_coords.json) を使って、座標が入っていない
 *   - 求職者 (applicants: prefecture + municipality + address_rest)
 *   - 案件 (cases: address、無ければ prefecture + municipality)
 * に lat / lon を入れる。町丁目まで分かれば町丁目、町名までなら町名の中心、
 * それも無理なら市区町村の中心。すでに座標が入っている行は変えない。
 *
 * 使い方:
 *   backfillCoords(true)  … 試し (書き込まない。何件入るかだけ数える)
 *   backfillCoords(false) … 本番 (書き込む)
 *   installCoordBackfillTrigger() … 1時間おきに新しく入った分を埋めるトリガーを置く
 *
 * 書き込み後は、おすすめ案件の事前計算 (recommend_cache) を作り直すと、フォームにも反映される。
 */
var TOWN_COORDS_URL_ = 'https://first-staffing.github.io/kansai-sms-app/town_coords.json';
var TOWN_TABLE_ = null;

function townTable_() {
  if (TOWN_TABLE_) return TOWN_TABLE_;
  var res = UrlFetchApp.fetch(TOWN_COORDS_URL_ + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('町丁目の位置表を読めませんでした: HTTP ' + res.getResponseCode());
  TOWN_TABLE_ = JSON.parse(res.getContentText('UTF-8'));
  return TOWN_TABLE_;
}
var GEO_KNUM_ = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
function geoK2n_(k) {
  if (!k) return null;
  if (k === '十') return 10;
  var m = k.match(/^([二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (m) return (m[1] ? GEO_KNUM_[m[1]] : 1) * 10 + (m[2] ? GEO_KNUM_[m[2]] : 0);
  return GEO_KNUM_[k] || null;
}
function geoNorm_(s) {
  return String(s || '')
    .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/^〒?\s*\d{3}-?\d{4}/, '')
    .replace(/[\s　]+/g, '')
    .replace(/[－−‐ー―]/g, '-')
    .replace(/ケ/g, 'ヶ');
}
/** 住所 → { lat, lon, level: town / town_base / city }。分からなければ null */
function geocodeTown_(addr, prefHint, muniHint) {
  var T = townTable_();
  var s = geoNorm_(addr);
  var pref = '';
  Object.keys(T).forEach(function (p) { if (s.indexOf(p) === 0) pref = p; });
  if (pref) s = s.slice(pref.length); else if (prefHint && T[prefHint]) pref = prefHint;
  if (!pref) return null;
  if (s.indexOf(pref) === 0) s = s.slice(pref.length);
  var cities = T[pref], city = '', rest = s;
  var names = Object.keys(cities).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < names.length && !city; i++) {
    var n = names[i], n2 = n.replace(/^.+?郡/, '');
    if (s.indexOf(n) === 0) { city = n; rest = s.slice(n.length); }
    else if (n2 !== n && s.indexOf(n2) === 0) { city = n; rest = s.slice(n2.length); }
  }
  if (!city && muniHint && cities[muniHint]) { city = muniHint; rest = s.replace(muniHint, ''); }
  if (!city) return null;
  var towns = cities[city], best = null, bestLen = 0, baseHit = null;
  rest = rest.replace(/^大字/, '');
  Object.keys(towns).forEach(function (t) {
    var tt = t.replace(/^大字/, '');
    if (rest.indexOf(tt) === 0 && tt.length > bestLen) { best = towns[t]; bestLen = tt.length; return; }
    var m = tt.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
    if (m && m[1] && rest.indexOf(m[1]) === 0) {
      var after = rest.slice(m[1].length);
      var dm = after.match(/^(\d+)(?:丁目|-|番|$)/);
      if (dm && Number(dm[1]) === geoK2n_(m[2]) && m[1].length + 1 > bestLen) { best = towns[t]; bestLen = m[1].length + 1; return; }
      if (!baseHit || m[1].length > baseHit.len) baseHit = { len: m[1].length, pts: [] };
      if (baseHit.len === m[1].length) baseHit.pts.push(towns[t]);
    }
  });
  if (best) return { lat: best[0], lon: best[1], level: 'town' };
  if (baseHit && baseHit.pts.length) {
    var la = 0, lo = 0; baseHit.pts.forEach(function (p) { la += p[0]; lo += p[1]; });
    return { lat: la / baseHit.pts.length, lon: lo / baseHit.pts.length, level: 'town_base' };
  }
  var all = Object.keys(towns).map(function (t) { return towns[t]; });
  if (!all.length) return null;
  var a2 = 0, o2 = 0; all.forEach(function (p) { a2 += p[0]; o2 += p[1]; });
  return { lat: a2 / all.length, lon: o2 / all.length, level: 'city' };
}
function geoHasCoord_(r) {
  var la = Number(r.lat), lo = Number(r.lon);
  return r.lat !== '' && r.lat != null && r.lon !== '' && r.lon != null && isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
}
function backfillTable_(table, dryRun, addrOf) {
  var t = readTable_(table);
  var latCol = t.headers.indexOf('lat'), lonCol = t.headers.indexOf('lon');
  if (latCol < 0 || lonCol < 0) throw new Error(table + ' に lat / lon 列がありません');
  var stat = { table: table, rows: t.rows.length, had: 0, filled: 0, town: 0, town_base: 0, city: 0, unknown: 0 };
  var latPairs = [], lonPairs = [];
  t.rows.forEach(function (r) {
    if (geoHasCoord_(r)) { stat.had++; return; }
    var a = addrOf(r);
    var g = null;
    try { g = geocodeTown_(a.addr, a.pref, a.muni); } catch (e) { g = null; }
    if (!g) { stat.unknown++; return; }
    stat.filled++; stat[g.level]++;
    latPairs.push({ row: r._row, value: Number(g.lat.toFixed(6)) });
    lonPairs.push({ row: r._row, value: Number(g.lon.toFixed(6)) });
  });
  if (!dryRun && latPairs.length) {
    withLock_(function () {
      var sh = sheet_(table);
      writeColumnRuns_(sh, latCol, latPairs);
      writeColumnRuns_(sh, lonCol, lonPairs);
    });
  }
  return stat;
}
/** 座標の無い求職者・案件に、町丁目の位置を入れる。dryRun=true なら数えるだけ */
function backfillCoords(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var t0 = Date.now();
  var out = {};
  out.applicants = backfillTable_('applicants', dryRun, function (r) {
    return { addr: str_(r.prefecture) + str_(r.municipality) + str_(r.address_rest), pref: str_(r.prefecture), muni: str_(r.municipality) };
  });
  out.cases = backfillTable_('cases', dryRun, function (r) {
    var a = str_(r.address);
    return { addr: a || (str_(r.prefecture) + str_(r.municipality)), pref: str_(r.prefecture), muni: str_(r.municipality) };
  });
  out.dry_run = dryRun; out.ms = Date.now() - t0;
  console.log('[coords] ' + JSON.stringify(out));
  return out;
}
function backfillCoordsHourly() { return backfillCoords(false); }
function installCoordBackfillTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backfillCoordsHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backfillCoordsHourly').timeBased().everyHours(1).create();
  return 'ok';
}


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


/**
 * 9.5 案件検索アプリ (BO) → SMSアプリ の案件取り込み (毎朝1回)
 *
 * - 案件検索アプリ (https://takuya258222-droid.github.io/AI/) に入っている関西の案件 (D_KANSAI) を読み、
 *   SMSアプリの cases へ一括で取り込む (importCasesCommitCore_、source='ai_page')。
 * - 取り込むのは 施設名・住所・府県・市区町村・座標・職種・施設形態・勤務時間/シフト・BOの更新日 だけ。
 *   オーダー本文 (担当者名・電話番号が入っている) は取り込まない。
 * - 新着の判定は BO の更新日 (d) を使う。更新日が無いものは前回の値を保つ (初回は同期日時)。
 * - 今日のデータに無くなった案件 (ai_page 由来) は is_open=false にする (募集終了扱い)。
 * - 6分の実行上限に備え、途中で止まったら次の実行で続きから行う。
 */
var AI_SYNC_URL = 'https://takuya258222-droid.github.io/AI/';
var AI_SYNC_SOURCE = 'ai_page';
var AI_SYNC_CHUNK = 500;
var AI_SYNC_KANSAI = ['大阪府', '兵庫県', '京都府', '奈良県', '滋賀県', '和歌山県'];

function aiSyncKey_(name, addr, jobType) {
  var base = [name, addr, jobType].map(function (v) { return String(v || '').replace(/[\s　]/g, ''); }).join('|');
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, base, Utilities.Charset.UTF_8);
  return 'ai:' + d.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('').slice(0, 16);
}
function aiSyncDate_(d) {
  var m = String(d || '').match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) - 9 * 3600000).toISOString(); // JST 0時
}
function aiSyncFetch_() {
  var res = UrlFetchApp.fetch(AI_SYNC_URL + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('案件検索アプリを読めませんでした: HTTP ' + res.getResponseCode());
  var html = res.getContentText('UTF-8');
  var i = html.indexOf('const D_KANSAI=');
  if (i < 0) i = html.indexOf('var D_KANSAI=');
  if (i < 0) throw new Error('案件データ (D_KANSAI) が見つかりません');
  var start = html.indexOf('[', i);
  // JSON 配列の終わりを括弧の深さで探す (文字列中の括弧は無視)
  var depth = 0, inStr = false, esc = false, end = -1;
  for (var k = start; k < html.length; k++) {
    var ch = html.charAt(k);
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) throw new Error('案件データの終わりが見つかりません');
  return JSON.parse(html.slice(start, end + 1));
}
function aiSyncToCase_(r, out) {
  var cat = String(r.cat || '');
  var jobType = cat.indexOf('看護') >= 0 ? 'kango' : (cat.indexOf('介護') >= 0 ? 'kaigo' : '');
  if (!jobType) { out.reason = 'job_type_unknown'; return null; }
  var addr = String(r.a || '').replace(/^〒\s*\d{3}-?\d{4}\s*/, '').replace(/[\s　]+/g, '');
  var pm = (typeof caseSyncParsePrefMuni_ === 'function') ? caseSyncParsePrefMuni_(addr) : { prefecture: String(r.p || ''), municipality: '' };
  var pref = pm.prefecture || String(r.p || '');
  if (AI_SYNC_KANSAI.indexOf(pref) < 0) { out.reason = 'not_kansai'; return null; }
  var name = String(r.n || '').trim();
  if (!name) { out.reason = 'no_name'; return null; }
  var parts = [];
  if (r.t) parts.push('時間:' + String(r.t).trim());
  if (r.s && r.s.length) parts.push('シフト:' + r.s.join('・'));
  var c = {
    facility_name: name,
    service_type: String(r.ft || '').trim(),
    address: addr,
    prefecture: pref,
    municipality: pm.municipality || '',
    job_type: jobType,
    salary_text: parts.join(' / '),
    is_open: true,
    source: AI_SYNC_SOURCE,
    source_case_key: aiSyncKey_(name, addr, jobType),
    // 原文はオーダー本文 (o) と担当 (c) を除いて残す (個人の連絡先を持ち込まない)
    case_source: { source: AI_SYNC_SOURCE, raw_json: { n: r.n, a: r.a, p: r.p, d: r.d, t: r.t, s: r.s, cat: r.cat, ft: r.ft } }
  };
  if (isFinite(r.lat) && isFinite(r.lon) && r.lat && r.lon) { c.lat = Number(r.lat); c.lon = Number(r.lon); }
  c._bo_date = aiSyncDate_(r.d);
  return c;
}

/** 本体 (毎朝のトリガー / 手動)。途中で時間切れになったら続きは次回 */
function syncCasesFromAiApp() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  var prog = {};
  try { prog = JSON.parse(props.getProperty('AI_SYNC_PROGRESS') || '{}') || {}; } catch (e) { prog = {}; }
  if (prog.day !== day) prog = { day: day, offset: 0, closed_done: false, added: 0, updated: 0, failed: 0 };

  var data = aiSyncFetch_();
  var syncNow = new Date().toISOString();
  var rows = [], skipped = {}, seen = {};
  data.forEach(function (r) {
    var out = {};
    var c = aiSyncToCase_(r, out);
    if (!c) { skipped[out.reason] = (skipped[out.reason] || 0) + 1; return; }
    if (seen[c.source_case_key]) { skipped.duplicate = (skipped.duplicate || 0) + 1; return; }
    seen[c.source_case_key] = 1;
    rows.push(c);
  });

  // 既存の取得日 (BO の日付が無いもの用)
  var keyToCaseId = {};
  readTable_('case_sources').rows.forEach(function (r) {
    if (String(r.source) === AI_SYNC_SOURCE) keyToCaseId[String(r.source_case_key)] = String(r.case_id);
  });
  var caseInfo = {};
  readTable_('cases').rows.forEach(function (c) { caseInfo[String(c.case_id)] = { src: cellDateIso_(c.updated_at_src) || '', open: c.is_open }; });
  rows.forEach(function (c) {
    var id = keyToCaseId[c.source_case_key];
    c.updated_at_src = c._bo_date || (id && caseInfo[id] && caseInfo[id].src) || syncNow;
    delete c._bo_date;
  });

  for (var i = prog.offset; i < rows.length; i += AI_SYNC_CHUNK) {
    if (Date.now() - t0 > 4.5 * 60000) { props.setProperty('AI_SYNC_PROGRESS', JSON.stringify(prog)); aiSyncScheduleResume_(); return { partial: true, offset: prog.offset, total: rows.length }; }
    var res = importCasesCommitCore_({
      file_name: 'ai_app_sync', kind: 'cases', rows: rows.slice(i, i + AI_SYNC_CHUNK),
      client_op_id: 'ai-sync-' + day, chunk_seq: String(i / AI_SYNC_CHUNK + 1)
    }, 'system:ai-sync');
    prog.added += res.added || 0; prog.updated += res.updated || 0; prog.failed += res.failed || 0;
    prog.offset = i + AI_SYNC_CHUNK;
  }

  // 今日のデータに無い ai_page 由来の案件は募集終了扱い
  var closed = 0;
  if (!prog.closed_done && rows.length > 1000) { // データが壊れていそうなとき (件数が少なすぎる) は閉じない
    Object.keys(keyToCaseId).forEach(function (k) {
      if (seen[k] || closed >= 400 || Date.now() - t0 > 5 * 60000) return;
      var id = keyToCaseId[k];
      if (caseInfo[id] && String(caseInfo[id].open) !== 'false' && caseInfo[id].open !== false) {
        try { updateRowByPk_('cases', id, { is_open: false, updated_at: nowIso_() }); closed++; } catch (e) {}
      }
    });
    prog.closed_done = true;
  }
  props.deleteProperty('AI_SYNC_PROGRESS');
  var summary = { at: syncNow, source_rows: data.length, targets: rows.length, added: prog.added, updated: prog.updated, failed: prog.failed, closed: closed, skipped: skipped, ms: Date.now() - t0 };
  try { runCaseIntegrityCheck(); } catch (e) {}
  try {
    var exists = readTable_('settings').rows.some(function (r) { return String(r.key) === 'ai_case_sync_last'; });
    if (exists) updateRowByPk_('settings', 'ai_case_sync_last', { value: JSON.stringify(summary) });
    else appendRow_('settings', { key: 'ai_case_sync_last', value: JSON.stringify(summary) });
  } catch (e) {}
  console.log('[ai-sync] ' + JSON.stringify(summary));
  return summary;
}
function aiSyncScheduleResume_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncCasesFromAiAppResume') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncCasesFromAiAppResume').timeBased().after(60 * 1000).create();
}
function syncCasesFromAiAppResume() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncCasesFromAiAppResume') ScriptApp.deleteTrigger(t); });
  return syncCasesFromAiApp();
}
/** 毎朝 8時台に実行するトリガーを置く (1回だけ実行) */
function installAiCaseSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncCasesFromAiApp') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncCasesFromAiApp').timeBased().atHour(8).nearMinute(0).everyDays(1).inTimezone('Asia/Tokyo').create();
  return 'ok';
}
