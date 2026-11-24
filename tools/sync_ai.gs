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
