/**
 * 応募者フォーム中継 (GAS 版) — Cloudflare Worker + KV の置き換え
 *
 * kansai-form-relay (Cloudflare Worker) と同じ役割・同じ応答の形:
 *  - 公開 (ログイン不要):
 *      GET  ?path=form-context&token=...   フォームの文脈 (宛名・職種・提示案件)
 *      GET  ?path=sms-launch&token=...     SMS 起動 (1回限り・10分)
 *      POST {path:'submit', token, ...回答}  回答の受付
 *      POST {path:'optout', token}          配信停止の受付
 *  - 管理 (kikari 側 GAS から。本文に secret が必要):
 *      POST {path:'admin/push-contexts', secret, contexts:[{token, context}]}
 *      POST {path:'admin/push-sms-launch', secret, items:[{token, phone, body, expires_at}]}
 *      POST {path:'admin/pull', secret, limit}
 *      POST {path:'admin/ack', secret, relay_ids:[...]}
 *
 * 保存先: このアカウントのスプレッドシート (setup() で作成)。
 *   ctx シート: token / context(JSON) / updated_at       文脈 (30日)
 *   sub シート: relay_id / kind / token / payload / received_at / dedupe_key  回答 (取り込み後に削除)
 * 文脈は CacheService (6時間) にも置き、開く速さを保つ。
 * 置くもの: 宛名・職種・提示案件の表示用だけ (電話・メールは置かない。SMS 起動だけは
 * 電話番号を含むため CacheService に10分だけ置き、1回読んだら消す)。
 *
 * 初回: setup() をエディタから1回実行 → ログに出る secret を kikari 側の
 *       Script Properties (GAS_RELAY_SECRET) に設定する。
 */

var CTX_TTL_DAYS = 30;
var CACHE_TTL = 21600;
var MAX_CONTEXTS_PER_PUSH = 1000; // 9.11: Gmail配信は100件を超えるため (超えると全件拒否されていた)
var MAX_PULL_LIMIT = 200;
var DEFAULT_PULL_LIMIT = 50;
var SMS_TTL_SECONDS = 600;
var SMS_BODY_MAX_CHARS = 2000;

var ANSWER_STRING_CAPS = {
  intent: 20, experience: 200, interview_desired_date: 100, desired_start_date: 100,
  available_start_date: 100, desired_tour_date: 100, phone_consult_datetime: 200,
  contact_time_slots: 500, free_text: 2000, submit_id: 100,
  experience_band: 20, experience_detail: 1000, desired_rate_band: 100,
  desired_days_per_week: 100, desired_time_slots: 200, start_timing_code: 50
};
var ANSWER_INTENTS = ['detail', 'tour', 'other_case'];
var ANSWER_BOOL_FIELDS = ['optout', 'phone_anytime'];
var CTX_ALLOWED_KEYS = ['applicant_id', 'name', 'surname', 'job_type', 'prefecture',
  'municipality', 'sender_name', 'sender_unknown', 'source_channel', 'delivery_id',
  'recommended_cases', 'recommend_count', 'presented_case_ids', 'missing_hearing',
  'form_fields', 'ctx_expires_at'];
var CASE_ALLOWED_KEYS = ['case_id', 'facility_id', 'facility_name', 'corporation_name',
  'prefecture', 'municipality', 'address', 'job_type', 'service_type',
  'employment_type', 'title', 'description', 'nearest_station', 'salary_text',
  'salary_band_text', 'salary_note', 'hours_text', 'hours_short_text', 'is_open',
  'updated_at_src', 'distance_km'];

// ===== 初期設定 =====
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('STORE_ID');
  if (!id) {
    var ss = SpreadsheetApp.create('応募者フォーム中継 (GAS) 保存先');
    var ctx = ss.getSheets()[0];
    ctx.setName('ctx');
    ctx.getRange(1, 1, 1, 3).setValues([['token', 'context', 'updated_at']]);
    var sub = ss.insertSheet('sub');
    sub.getRange(1, 1, 1, 6).setValues([['relay_id', 'kind', 'token', 'payload', 'received_at', 'dedupe_key']]);
    ctx.getRange('A:A').setNumberFormat('@');
    sub.getRange('A:F').setNumberFormat('@');
    props.setProperty('STORE_ID', ss.getId());
    id = ss.getId();
  }
  var secret = props.getProperty('RELAY_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('RELAY_SECRET', secret);
  }
  Logger.log('STORE_ID=' + id);
  Logger.log('RELAY_SECRET=' + secret);
  return { store_id: id, secret: secret };
}

function store_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('STORE_ID'));
}
function sheet_(name) { return store_().getSheetByName(name); }

// ===== 入口 =====
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var path = String(p.path || '');
    if (path === 'health') return out_({ ok: true, service: 'kansai-form-relay-gas', time: new Date().toISOString() });
    if (path === 'form-context') return out_(formContext_(String(p.token || '').trim()));
    if (path === 'sms-launch') return out_(smsLaunch_(String(p.token || '').trim()));
    return out_({ ok: false, error: 'not_found' });
  } catch (err) {
    console.error('relay-gas get error: ' + errMsg_(err));
    return out_({ ok: false, error: 'internal_error' });
  }
}

function doPost(e) {
  var body = {};
  try {
    var text = (e && e.postData && e.postData.contents) || '';
    if (text.length > 1000000) return out_({ ok: false, error: 'body_too_large' });
    body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return out_({ ok: false, error: 'invalid_body' });
  } catch (e1) { return out_({ ok: false, error: 'invalid_json' }); }
  try {
    var path = String(body.path || '');
    if (path === 'submit') return out_(submit_(body, 'response'));
    if (path === 'optout') return out_(submit_(body, 'optout'));
    if (path.indexOf('admin/') === 0) {
      if (!secretOk_(body.secret)) return out_({ ok: false, error: 'unauthorized' });
      if (path === 'admin/push-contexts') return out_(pushContexts_(body));
      if (path === 'admin/push-sms-launch') return out_(pushSmsLaunch_(body));
      if (path === 'admin/pull') return out_(pull_(body));
      if (path === 'admin/ack') return out_(ack_(body));
    }
    return out_({ ok: false, error: 'not_found' });
  } catch (err) {
    console.error('relay-gas post error: ' + errMsg_(err));
    return out_({ ok: false, error: 'internal_error' });
  }
}

// ===== 文脈 =====
function ctxGet_(token) {
  var c = CacheService.getScriptCache();
  var s = c.get('ctx:' + token);
  if (s) return s;
  var sh = sheet_('ctx');
  var last = sh.getLastRow();
  if (last < 2) return null;
  var cells = sh.getRange(2, 1, last - 1, 1).createTextFinder(token).matchEntireCell(true).matchCase(true).findAll();
  if (!cells || !cells.length) return null;
  var cell = cells[cells.length - 1]; // 追記方式なので一番下が最新
  var row = sh.getRange(cell.getRow(), 1, 1, 3).getValues()[0];
  var upd = Date.parse(row[2]);
  if (isFinite(upd) && Date.now() - upd > CTX_TTL_DAYS * 86400000) return null;
  s = String(row[1] || '');
  if (s && s.length < 90000) { try { c.put('ctx:' + token, s, CACHE_TTL); } catch (e) {} }
  return s || null;
}

function formContext_(token) {
  if (!validToken_(token)) return { ok: false, error: 'invalid_token', status: 400 };
  var raw = ctxGet_(token);
  if (!raw) return { ok: false, error: 'context_not_found', status: 404 };
  var context = null;
  try { context = JSON.parse(raw); } catch (e) { context = null; }
  if (!context) return { ok: false, error: 'context_corrupt', status: 500 };
  if (contextExpired_(context)) return { ok: false, error: 'context_expired', status: 410 };
  return { ok: true, context: context };
}

function pushContexts_(body) {
  var list = body.contexts;
  if (!Array.isArray(list) || !list.length) return { ok: false, error: 'contexts_required' };
  if (list.length > MAX_CONTEXTS_PER_PUSH) return { ok: false, error: 'too_many_contexts' };
  var stored = 0, rejected = [], failed = [], stats = { stripped: 0 };
  var rows = [], cache = {};
  var now = new Date().toISOString();
  list.forEach(function (entry) {
    entry = entry || {};
    if (typeof entry.token !== 'string') { rejected.push('(non-string)'); return; }
    var token = entry.token.trim();
    if (!validToken_(token) || !entry.context || typeof entry.context !== 'object') { rejected.push(token || '(empty)'); return; }
    var s = JSON.stringify(stripContextToAllowlist_(entry.context, stats));
    rows.push([token, s, now]);
    if (s.length < 90000) cache['ctx:' + token] = s;
  });
  if (rows.length) {
    try { CacheService.getScriptCache().putAll(cache, CACHE_TTL); } catch (e0) {}
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sh = sheet_('ctx');
      // 9.2.0 速さ優先: 既存行は探さず常に末尾へ追記する (読むときは一番下の行を使う)
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
      stored = rows.length;
    } catch (e) {
      rows.forEach(function (r) { failed.push({ token: r[0], error: 'store_failed' }); });
    } finally { lock.releaseLock(); }
    try { CacheService.getScriptCache().putAll(cache, CACHE_TTL); } catch (e2) {}
  }
  return { ok: true, stored: stored, rejected: rejected, failed: failed, stripped_keys: stats.stripped };
}

// ===== SMS 起動 (1回限り・10分) =====
function pushSmsLaunch_(body) {
  var list = body.items;
  if (!Array.isArray(list) || !list.length) return { ok: false, error: 'items_required' };
  if (list.length > 20) return { ok: false, error: 'too_many_items' };
  var stored = 0, rejected = [];
  var c = CacheService.getScriptCache();
  list.forEach(function (entry) {
    entry = entry || {};
    var token = typeof entry.token === 'string' ? entry.token.trim() : '';
    var phone = typeof entry.phone === 'string' ? entry.phone.replace(/[^0-9]/g, '') : '';
    var text = typeof entry.body === 'string' ? entry.body : '';
    if (!validToken_(token) || !/^[0-9]{9,15}$/.test(phone) || !text || text.length > SMS_BODY_MAX_CHARS) { rejected.push(token || '(empty)'); return; }
    c.put('sms:' + token, JSON.stringify({ phone: phone, body: text, expires_at: String(entry.expires_at || '') }), SMS_TTL_SECONDS);
    stored++;
  });
  return { ok: true, stored: stored, rejected: rejected, failed: [] };
}
function smsLaunch_(token) {
  if (!validToken_(token)) return { ok: false, error: 'invalid_token' };
  var c = CacheService.getScriptCache();
  var raw = c.get('sms:' + token);
  if (!raw) return { ok: false, error: 'launch_not_found' };
  c.remove('sms:' + token);
  var item = null;
  try { item = JSON.parse(raw); } catch (e) { item = null; }
  if (!item) return { ok: false, error: 'launch_corrupt' };
  return { ok: true, phone: item.phone, body: item.body };
}

// ===== 回答 / 配信停止の受付 =====
function submit_(data, kind) {
  if (typeof data.token !== 'string') return { ok: false, error: 'invalid_token' };
  var token = data.token.trim();
  if (!validToken_(token)) return { ok: false, error: 'invalid_token' };
  var ctxRaw = ctxGet_(token);
  if (!ctxRaw) return { ok: false, error: 'unknown_token' };
  if (kind === 'response') {
    var pc = null; try { pc = JSON.parse(ctxRaw); } catch (e) { pc = null; }
    if (pc && contextExpired_(pc)) return { ok: false, error: 'context_expired' };
  }
  var payload = {};
  var dedupe = '';
  if (kind === 'response') {
    var checked = sanitizeAnswers_(data);
    if (checked.error) return { ok: false, error: checked.error };
    payload = checked.answers;
    dedupe = payload.submit_id ? ('s:' + token + ':' + payload.submit_id) : ('h:' + token + ':' + payloadHash_(payload));
  }
  var c = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (dedupe) {
      var hit = c.get('dd:' + dedupe);
      if (hit) return { ok: true, accepted: true, relay_id: hit, duplicate: true };
      if (payload.submit_id) {
        var sh0 = sheet_('sub'), last0 = sh0.getLastRow();
        if (last0 >= 2) {
          var f = sh0.getRange(2, 6, last0 - 1, 1).createTextFinder(dedupe).matchEntireCell(true).matchCase(true).findNext();
          if (f) { var rid = String(sh0.getRange(f.getRow(), 1).getValue()); return { ok: true, accepted: true, relay_id: rid, duplicate: true }; }
        }
      }
    }
    var relayId = Utilities.getUuid();
    var receivedAt = new Date().toISOString();
    var sh = sheet_('sub');
    sh.appendRow([relayId, kind, token, JSON.stringify(payload), receivedAt, dedupe]);
    if (dedupe) { try { c.put('dd:' + dedupe, relayId, payload.submit_id ? 21600 : 600); } catch (e3) {} }
    return { ok: true, accepted: true, relay_id: relayId };
  } finally { lock.releaseLock(); }
}

function sanitizeAnswers_(data) {
  var out = {};
  var keys = Object.keys(ANSWER_STRING_CAPS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = data[k];
    if (v == null) continue;
    if (Array.isArray(v)) { out[k] = v.slice(0, 20).map(function (x) { return String(x).slice(0, ANSWER_STRING_CAPS[k]); }); continue; }
    if (typeof v !== 'string' && typeof v !== 'number') return { error: 'invalid_field_type: ' + k };
    out[k] = String(v).slice(0, ANSWER_STRING_CAPS[k]);
  }
  if (out.intent != null && out.intent !== '' && ANSWER_INTENTS.indexOf(out.intent) < 0) return { error: 'invalid_intent' };
  if (data.selected_case_ids != null) {
    if (!Array.isArray(data.selected_case_ids)) return { error: 'invalid_selected_case_ids' };
    out.selected_case_ids = data.selected_case_ids.slice(0, 20).map(function (x) { return String(x).slice(0, 100); });
  }
  if (data.phone_dates != null) {
    if (!Array.isArray(data.phone_dates)) return { error: 'invalid_phone_dates' };
    out.phone_dates = data.phone_dates.slice(0, 5).map(function (x) { return String(x).slice(0, 10); });
  }
  if (data.phone_bands != null) {
    if (!Array.isArray(data.phone_bands)) return { error: 'invalid_phone_bands' };
    out.phone_bands = data.phone_bands.slice(0, 4).map(function (x) { return String(x).slice(0, 20); });
  }
  if (data.qualifications != null) {
    if (Array.isArray(data.qualifications)) out.qualifications = data.qualifications.slice(0, 20).map(function (x) { return String(x).slice(0, 100); });
    else if (typeof data.qualifications === 'string') out.qualifications = data.qualifications.slice(0, 500);
    else return { error: 'invalid_qualifications' };
  }
  if (data.experience_years != null && data.experience_years !== '') {
    var n = Number(data.experience_years);
    if (!isFinite(n) || n < 0 || n > 80) return { error: 'invalid_experience_years' };
    out.experience_years = n;
  }
  ANSWER_BOOL_FIELDS.forEach(function (bk) { if (typeof data[bk] === 'boolean') out[bk] = data[bk]; });
  return { answers: out };
}

// ===== 取り込み (kikari 側から) =====
function pull_(body) {
  var limit = DEFAULT_PULL_LIMIT;
  if (body.limit != null) limit = Math.max(1, Math.min(MAX_PULL_LIMIT, parseInt(body.limit, 10) || DEFAULT_PULL_LIMIT));
  var sh = sheet_('sub');
  var last = sh.getLastRow();
  var items = [], corrupt = 0;
  if (last >= 2) {
    var n = Math.min(last - 1, limit * 3);
    var vals = sh.getRange(2, 1, n, 5).getValues();
    for (var i = 0; i < vals.length && items.length < limit; i++) {
      var r = vals[i];
      if (!r[0]) continue;
      var payload = {};
      try { payload = JSON.parse(String(r[3] || '{}')); } catch (e) { corrupt++; continue; }
      items.push({ relay_id: String(r[0]), kind: String(r[1]), token: String(r[2]), payload: payload, received_at: String(r[4]) });
    }
  }
  return { ok: true, items: items, count: items.length, corrupt_count: corrupt, vanished_count: 0,
    scanned_count: items.length + corrupt, list_complete: last - 1 <= items.length + corrupt };
}

function ack_(body) {
  var ids = body.relay_ids;
  if (!Array.isArray(ids)) return { ok: false, error: 'relay_ids_required' };
  var want = {};
  ids.forEach(function (x) { if (typeof x === 'string' && x) want[x] = true; });
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var deleted = 0;
  try {
    var sh = sheet_('sub');
    var last = sh.getLastRow();
    if (last < 2) return { ok: true, deleted: 0 };
    var col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = col.length - 1; i >= 0; i--) {
      if (want[String(col[i][0])]) { sh.deleteRow(i + 2); deleted++; }
    }
  } finally { lock.releaseLock(); }
  return { ok: true, deleted: deleted };
}

// ===== 掃除 (毎日1回: 30日を過ぎた文脈を消す) =====
function cleanupOldContexts() {
  var sh = sheet_('ctx');
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 3).getValues();
  var seen = {}, keep = [];
  for (var i = vals.length - 1; i >= 0; i--) { // 下が最新。同じトークンは最新の1行だけ残す
    var r = vals[i], t = Date.parse(r[2]);
    if (!r[0] || seen[r[0]]) continue;
    seen[r[0]] = 1;
    if (!isFinite(t) || Date.now() - t <= (CTX_TTL_DAYS + 1) * 86400000) keep.push(r);
  }
  keep.reverse();
  var removed = vals.length - keep.length;
  if (removed > 0) {
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      sh.getRange(2, 1, last - 1, 3).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, 3).setValues(keep);
    } finally { lock.releaseLock(); }
  }
  return removed;
}
function installCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cleanupOldContexts') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cleanupOldContexts').timeBased().everyDays(1).atHour(4).create();
  return 'installed';
}

// ===== 共通 =====
function secretOk_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET') || '';
  given = String(given || '');
  if (!expected || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
function stripContextToAllowlist_(ctx, stats) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return ctx;
  var out = {};
  Object.keys(ctx).forEach(function (k) { if (CTX_ALLOWED_KEYS.indexOf(k) < 0) { stats.stripped++; return; } out[k] = ctx[k]; });
  if (Array.isArray(out.recommended_cases)) {
    out.recommended_cases = out.recommended_cases.map(function (c) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return c;
      var co = {};
      Object.keys(c).forEach(function (k) { if (CASE_ALLOWED_KEYS.indexOf(k) < 0) { stats.stripped++; return; } co[k] = c[k]; });
      return co;
    });
  }
  ['presented_case_ids', 'missing_hearing', 'form_fields'].forEach(function (k) {
    if (out[k] != null && !Array.isArray(out[k])) { delete out[k]; stats.stripped++; }
  });
  return out;
}
function contextExpired_(ctx) {
  if (!ctx || !ctx.ctx_expires_at) return false;
  var t = Date.parse(ctx.ctx_expires_at);
  return isFinite(t) && t <= Date.now();
}
function payloadHash_(payload) {
  var s = JSON.stringify(payload || {});
  var h1 = 5381, h2 = 52711;
  for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) ^ c) >>> 0; }
  return h1.toString(36) + '-' + h2.toString(36) + '-' + s.length;
}
function validToken_(t) { return typeof t === 'string' && t.length >= 16 && t.length <= 200 && /^[A-Za-z0-9_-]+$/.test(t); }
function errMsg_(e) { return String(e && e.message ? e.message : e); }
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
