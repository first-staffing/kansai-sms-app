/***** 重複 applicant_id 修復（一時関数） *****
 * DUP_ID_REPAIR_RUNBOOK §10 の提示コード。検証完了後にこのファイルごと削除する。
 * 参照テーブルは一切変更しない（読み取りのみ）。
 */

function drvDupCtx_() {
  var props = PropertiesService.getScriptProperties();
  var appId = props.getProperty('APPLICANT_BOOK_ID');
  var delId = props.getProperty('DELIVERY_BOOK_ID');
  if (!appId || !delId) throw new Error('APPLICANT_BOOK_ID / DELIVERY_BOOK_ID が Script Properties にありません');
  return { app: SpreadsheetApp.openById(appId), del: SpreadsheetApp.openById(delId) };
}

function drvDupSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('シートがありません: ' + name);
  return sh;
}

function drvDupCol_(sh, name) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = headers.indexOf(name);
  if (i < 0) throw new Error('列が見つかりません: ' + name + ' @ ' + sh.getName());
  return i + 1;
}

// 候補名から列を解決する。見つからなければ 0（呼び出し側で停止判断）
function drvDupColAny_(sh, names) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var k = 0; k < names.length; k++) {
    var i = headers.indexOf(names[k]);
    if (i >= 0) return i + 1;
  }
  return 0;
}

function drvDupApplicants_() {
  var ctx = drvDupCtx_();
  var sh = drvDupSheet_(ctx.app, 'applicants');
  var nameCol = drvDupColAny_(sh, ['name', '氏名', '名前', 'applicant_name']);
  var dobCol = drvDupColAny_(sh, ['dob', 'birth_date', '生年月日', '誕生日']);
  if (!nameCol || !dobCol) throw new Error('氏名／生年月日の列が解決できません（ヘッダー名を実施前に確認すること）');
  return {
    ss: ctx.app, sh: sh, lastRow: sh.getLastRow(),
    idCol: drvDupCol_(sh, 'applicant_id'),
    phoneCol: drvDupCol_(sh, 'phone'),
    emailCol: drvDupCol_(sh, 'email'),
    nameCol: nameCol, dobCol: dobCol,
    createdCol: drvDupColAny_(sh, ['created_at', '作成日時', '登録日時'])
  };
}

function drvDupNorm_(v) { return String(v == null ? '' : v).trim(); }

// ID列と4キーを読み、グループ化と分類（MERGE / RENUMBER）を行う
function drvDupScan_() {
  var a = drvDupApplicants_();
  var n = a.lastRow - 1;
  var ids = a.sh.getRange(2, a.idCol, n, 1).getValues();
  var keys = ['phoneCol', 'emailCol', 'nameCol', 'dobCol'].map(function (c) {
    return a.sh.getRange(2, a[c], n, 1).getValues();
  });
  var created = a.createdCol ? a.sh.getRange(2, a.createdCol, n, 1).getValues() : null;
  var rowsById = {}, dataRows = 0, maxNum = 0;
  for (var i = 0; i < n; i++) {
    var id = drvDupNorm_(ids[i][0]);
    if (id === '') continue;
    dataRows++;
    if (!rowsById[id]) rowsById[id] = [];
    rowsById[id].push(i + 2); // シート行番号
    var m = id.match(/^A(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  var groups = [], overSize = 0, mergeCount = 0, renumberCount = 0;
  Object.keys(rowsById).forEach(function (id) {
    var rows = rowsById[id];
    if (rows.length < 2) return;
    if (rows.length > 2) { overSize++; return; }
    var r1 = rows[0] - 2, r2 = rows[1] - 2;
    var match = keys.map(function (col) { return drvDupNorm_(col[r1][0]) === drvDupNorm_(col[r2][0]) ? 'Y' : ''; });
    var cls = (match[0] && match[1] && match[2] && match[3]) ? 'MERGE' : 'RENUMBER';
    if (cls === 'MERGE') mergeCount++; else renumberCount++;
    // RENUMBER の保持者仮置き: created_at が古い方、同点なら行番号が小さい方（＝ rows[0]）
    var keeper = rows[0], moved = rows[1];
    if (cls === 'RENUMBER' && created) {
      var t1 = String(created[r1][0]), t2 = String(created[r2][0]);
      if (t2 !== '' && (t1 === '' || t2 < t1)) { keeper = rows[1]; moved = rows[0]; }
    }
    groups.push({
      old_id: id, row_first: rows[0], row_second: rows[1], cls: cls,
      match: match,
      keeper_row: cls === 'RENUMBER' ? keeper : '',
      moved_row: cls === 'RENUMBER' ? moved : ''
    });
  });
  groups.sort(function (x, y) { return x.row_first - y.row_first; });
  return { dataRows: dataRows, distinct: Object.keys(rowsById).length,
    groups: groups, overSize: overSize,
    mergeCount: mergeCount, renumberCount: renumberCount, maxNum: maxNum };
}

function drvDupFormatId_(num) {
  var s = String(num);
  while (s.length < 6) s = '0' + s;
  return 'A' + s;
}

// 手順C1: バックアップ（applicants シート全体の複製）
function drvDupBackup() {
  var a = drvDupApplicants_();
  var name = 'bak_dup_id_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var bak = a.sh.copyTo(a.ss);
  bak.setName(name);
  Logger.log('backup sheet=%s dataRows=%s (applicants dataRows=%s)', name, bak.getLastRow() - 1, a.lastRow - 1);
}

// 手順C2: 分類スキャンと作業シート作成（PIIの値は書かない。キー一致／不一致のみ）
function drvDupList() {
  var scan = drvDupScan_();
  var a = drvDupApplicants_();
  var name = 'dup_id_work_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var ws = a.ss.insertSheet(name);
  var out = [['old_id', 'row_first', 'row_second', 'class',
    'match_phone', 'match_email', 'match_name', 'match_dob',
    'keeper_row', 'moved_row', 'new_id', 'human_confirmed', 'closed_marked', 'note']];
  scan.groups.forEach(function (g) {
    out.push([g.old_id, g.row_first, g.row_second, g.cls,
      g.match[0], g.match[1], g.match[2], g.match[3],
      g.keeper_row, g.moved_row, '', '', '', '']);
  });
  ws.getRange(1, 1, out.length, out[0].length).setValues(out);
  Logger.log('dataRows=%s distinct=%s groups=%s merge=%s renumber=%s overSize=%s maxNum=%s workSheet=%s',
    scan.dataRows, scan.distinct, scan.groups.length, scan.mergeCount, scan.renumberCount,
    scan.overSize, scan.maxNum, name);
  if (scan.groups.length !== 316 || scan.overSize > 0) Logger.log('STOP: グループ数が 316 でない、または3行以上の組があります');
  if (scan.mergeCount !== 217 || scan.renumberCount !== 99) Logger.log('STOP: 分類が MERGE 217 / RENUMBER 99 とずれています（理由を説明できるまで進めない）');
}

// 作業シートを読み戻す
function drvDupWork_(workSheetName) {
  var a = drvDupApplicants_();
  var ws = drvDupSheet_(a.ss, workSheetName);
  var rows = ws.getRange(2, 1, ws.getLastRow() - 1, 14).getValues();
  return rows.map(function (r) {
    return { old_id: String(r[0]).trim(), row_first: Number(r[1]), row_second: Number(r[2]),
      cls: String(r[3]).trim(),
      keeper_row: Number(r[8]) || 0, moved_row: Number(r[9]) || 0,
      new_id: String(r[10]).trim(), human_confirmed: String(r[11]).trim(),
      closed_marked: String(r[12]).trim() };
  }).filter(function (t) { return t.old_id !== ''; });
}

var DRV_DUP_REF_TABLES_ = [
  { book: 'app', sheet: 'applicant_events' },
  { book: 'app', sheet: 'optouts' },
  { book: 'app', sheet: 'import_batches' },
  { book: 'del', sheet: 'delivery_recipients' },
  { book: 'del', sheet: 'case_match_proposals' },
  { book: 'del', sheet: 'responses' },
  { book: 'del', sheet: 'send_queue' }
];

// 手順C3: 参照件数の実測（読み取りのみ。実施前・実施後に同じ関数で測り、ログを突き合わせる）
function drvDupRefCount(workSheetName) {
  var ctx = drvDupCtx_();
  var work = drvDupWork_(workSheetName);
  var dupSet = {};
  work.forEach(function (t) { dupSet[t.old_id] = true; });
  DRV_DUP_REF_TABLES_.forEach(function (def) {
    var ss = def.book === 'app' ? ctx.app : ctx.del;
    var sh = ss.getSheetByName(def.sheet);
    if (!sh) { Logger.log('ref %s: シートなし', def.sheet); return; }
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var idIdx = headers.indexOf('applicant_id');
    if (idIdx < 0) { Logger.log('ref %s: applicant_id 列なし（参照列なしとして記録）', def.sheet); return; }
    var lastRow = sh.getLastRow();
    var total = 0, byStatus = {};
    if (lastRow > 1) {
      var ids = sh.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
      var stIdx = headers.indexOf('status');
      var statuses = stIdx >= 0 ? sh.getRange(2, stIdx + 1, lastRow - 1, 1).getValues() : null;
      for (var i = 0; i < ids.length; i++) {
        if (dupSet[String(ids[i][0]).trim()]) {
          total++;
          if (statuses) { var st = String(statuses[i][0]); byStatus[st] = (byStatus[st] || 0) + 1; }
        }
      }
    }
    Logger.log('ref %s total=%s byStatus=%s', def.sheet, total, JSON.stringify(byStatus));
  });
  Logger.log('send_queue の status に waiting / sending が含まれていたら STOP（未送信・処理中の参照あり）');
}
function drvDupRefCountRun() {
  drvDupRefCount('dup_id_work_YYYYMMDD_HHMMSS'); // ← 作業シート名に書き換えて実行
}

// 手順C4: dry-run（採番計画。書き込みは作業シートの new_id 列のみ）
// moved_row が確定している行に、moved_row の行番号順で連番を割り当てる（両編共通プール）
function drvDupPlan(workSheetName) {
  var scan = drvDupScan_();
  var work = drvDupWork_(workSheetName);
  var a = drvDupApplicants_();
  var n = a.lastRow - 1;
  var ids = a.sh.getRange(2, a.idCol, n, 1).getValues();
  var existing = {};
  ids.forEach(function (r) { var id = String(r[0]).trim(); if (id) existing[id] = true; });
  work.forEach(function (t) { if (t.new_id) existing[t.new_id] = true; }); // 計画済みの新IDも衝突判定に含める（計画を2回に分けても安全）
  var targets = work.filter(function (t) { return t.moved_row > 0 && !t.new_id; })
    .sort(function (x, y) { return x.moved_row - y.moved_row; });
  var next = scan.maxNum + 1, assigned = {};
  for (var i = 0; i < targets.length; i++) {
    while (existing[drvDupFormatId_(next)]) next++;
    var nid = drvDupFormatId_(next);
    existing[nid] = true;
    assigned[targets[i].old_id + '@' + targets[i].moved_row] = nid;
    next++;
  }
  var ws = drvDupSheet_(a.ss, workSheetName);
  var rows = ws.getRange(2, 1, ws.getLastRow() - 1, 14).getValues();
  for (var j = 0; j < rows.length; j++) {
    var key = String(rows[j][0]).trim() + '@' + Number(rows[j][9]);
    if (assigned[key]) rows[j][10] = assigned[key];
  }
  if (rows.length) ws.getRange(2, 1, rows.length, 14).setValues(rows);
  var vals = Object.keys(assigned).map(function (k) { return assigned[k]; }).sort();
  Logger.log('assigned=%s range=%s..%s', vals.length, vals[0], vals[vals.length - 1]);
}
function drvDupPlanRun() {
  drvDupPlan('dup_id_work_YYYYMMDD_HHMMSS'); // ← 作業シート名に書き換えて実行
}

// 本実行: moved_row の ID セルだけを行位置ベースで書く（両編共通。参照は変更しない）
// MERGE の組は human_confirmed が Y でなければ書かない
function drvDupRun(workSheetName) {
  var a = drvDupApplicants_();
  var work = drvDupWork_(workSheetName).filter(function (t) { return t.moved_row > 0 && t.new_id !== ''; });
  var n = a.lastRow - 1;
  var ids = a.sh.getRange(2, a.idCol, n, 1).getValues();
  var existing = {};
  ids.forEach(function (r) { var id = String(r[0]).trim(); if (id) existing[id] = true; });
  // 直前アサート
  for (var i = 0; i < work.length; i++) {
    var t = work[i];
    if (String(ids[t.moved_row - 2][0]).trim() !== t.old_id) {
      Logger.log('STOP: 対象行の現在IDが old_id と一致しません: row=%s', t.moved_row); return;
    }
    if (existing[t.new_id]) { Logger.log('STOP: 新IDが既に存在します: %s', t.new_id); return; }
    if (t.cls === 'MERGE' && t.human_confirmed !== 'Y') {
      Logger.log('STOP: MERGE の組に人間確認の記録がありません: %s', t.old_id); return;
    }
  }
  // 書式をテキストにしてから、連続行をまとめて書く（writeColumnRuns_ と同方式）
  a.sh.getRange(2, a.idCol, n, 1).setNumberFormat('@');
  var sorted = work.slice().sort(function (x, y) { return x.moved_row - y.moved_row; });
  var written = 0, start = sorted[0].moved_row, vals = [[sorted[0].new_id]];
  for (var k = 1; k <= sorted.length; k++) {
    if (k < sorted.length && sorted[k].moved_row === start + vals.length) { vals.push([sorted[k].new_id]); continue; }
    a.sh.getRange(start, a.idCol, vals.length, 1).setValues(vals);
    written += vals.length;
    if (k < sorted.length) { start = sorted[k].moved_row; vals = [[sorted[k].new_id]]; }
  }
  Logger.log('written=%s', written);
}
function drvDupRunExec() {
  drvDupRun('dup_id_work_YYYYMMDD_HHMMSS'); // ← 作業シート名に書き換えて実行
}

// 検証: バックアップとの突合（値はログに出さず件数だけ出す）
// MERGE の主行は属性補完で phone / email が変わりうるため、属性変化は別カウントで報告する
function drvDupVerify(workSheetName, backupSheetName) {
  var a = drvDupApplicants_();
  var bak = drvDupSheet_(a.ss, backupSheetName);
  var work = drvDupWork_(workSheetName);
  var planByRow = {}, keeperRows = {};
  work.forEach(function (t) {
    if (t.moved_row > 0) planByRow[t.moved_row] = t;
    if (t.cls === 'MERGE' && t.keeper_row > 0) keeperRows[t.keeper_row] = true;
  });
  var n = a.lastRow - 1;
  var bn = bak.getLastRow() - 1;
  var idsNow = a.sh.getRange(2, a.idCol, n, 1).getValues();
  var idsBak = bak.getRange(2, drvDupCol_(bak, 'applicant_id'), bn, 1).getValues();
  var seen = {}, distinct = 0, dataRows = 0;
  var idChangedTarget = 0, idChangedOther = 0, idPlanMismatch = 0, closedCount = 0;
  for (var i = 0; i < n; i++) {
    var id = String(idsNow[i][0]).trim();
    if (id === '') continue;
    dataRows++;
    if (!seen[id]) { seen[id] = true; distinct++; }
    var before = String(idsBak[i][0]).trim();
    var row = i + 2;
    if (planByRow[row]) {
      if (id !== before) idChangedTarget++;
      if (id !== planByRow[row].new_id) idPlanMismatch++;
    } else if (id !== before) idChangedOther++;
  }
  work.forEach(function (t) { if (t.cls === 'MERGE' && t.closed_marked === 'Y') closedCount++; });
  // 属性照合: moved_row の phone / email は不変のはず。MERGE 主行の変化は補完分として別に数える
  var phonesNow = a.sh.getRange(2, a.phoneCol, n, 1).getValues();
  var emailsNow = a.sh.getRange(2, a.emailCol, n, 1).getValues();
  var phonesBak = bak.getRange(2, drvDupCol_(bak, 'phone'), bn, 1).getValues();
  var emailsBak = bak.getRange(2, drvDupCol_(bak, 'email'), bn, 1).getValues();
  var colMismatch = 0, keeperColChanged = 0;
  for (var j = 0; j < n; j++) {
    var rowJ = j + 2;
    var diff = String(phonesNow[j][0]) !== String(phonesBak[j][0]) || String(emailsNow[j][0]) !== String(emailsBak[j][0]);
    if (!diff) continue;
    if (keeperRows[rowJ]) keeperColChanged++;
    else colMismatch++;
  }
  Logger.log('dataRows=%s (backup %s) distinct=%s changedTarget=%s changedOther=%s planMismatch=%s closedMarked=%s keeperColChanged=%s colMismatch=%s',
    dataRows, bn, distinct, idChangedTarget, idChangedOther, idPlanMismatch, closedCount, keeperColChanged, colMismatch);
  Logger.log('合格条件: dataRows＝バックアップ行数 かつ distinct＝dataRows かつ changedOther＝0 かつ planMismatch＝0 かつ colMismatch＝0（keeperColChanged は補完・判断の記録と突き合わせる）');
}
function drvDupVerifyRun() {
  drvDupVerify('dup_id_work_YYYYMMDD_HHMMSS', 'bak_dup_id_YYYYMMDD_HHMMSS'); // ← 両シート名に書き換えて実行
}

// 復旧: 作業シートの old_id を moved_row へ書き戻す（ID列のみ・行位置ベース）
// 属性補完と閉鎖マークの巻き戻しは、バックアップの同じ行位置の値で別途行う（§7）
function drvDupRestore(workSheetName) {
  var a = drvDupApplicants_();
  var work = drvDupWork_(workSheetName).filter(function (t) { return t.moved_row > 0 && t.new_id !== ''; });
  var n = a.lastRow - 1;
  var ids = a.sh.getRange(2, a.idCol, n, 1).getValues();
  for (var i = 0; i < work.length; i++) {
    var t = work[i];
    if (String(ids[t.moved_row - 2][0]).trim() !== t.new_id) {
      Logger.log('STOP: 対象行の現在IDが new_id と一致しません: row=%s', t.moved_row); return;
    }
  }
  a.sh.getRange(2, a.idCol, n, 1).setNumberFormat('@');
  var sorted = work.slice().sort(function (x, y) { return x.moved_row - y.moved_row; });
  var restored = 0, start = sorted[0].moved_row, vals = [[sorted[0].old_id]];
  for (var k = 1; k <= sorted.length; k++) {
    if (k < sorted.length && sorted[k].moved_row === start + vals.length) { vals.push([sorted[k].old_id]); continue; }
    a.sh.getRange(start, a.idCol, vals.length, 1).setValues(vals);
    restored += vals.length;
    if (k < sorted.length) { start = sorted[k].moved_row; vals = [[sorted[k].old_id]]; }
  }
  Logger.log('restored=%s', restored);
}
function drvDupRestoreRun() {
  drvDupRestore('dup_id_work_YYYYMMDD_HHMMSS'); // ← 作業シート名に書き換えて実行
}
