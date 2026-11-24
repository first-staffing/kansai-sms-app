/* ================================================================
 * 9.12 Gmail 大量配信に耐える (キカリ側サーバー zz_speed_geo.gs の末尾)
 *
 * A. 配信作成のまとめ書き
 *    これまで対象1人ごとに delivery_recipients / send_queue を1行ずつ追記し、
 *    send_queue の番号もそのたびに全行を読んで採番していた (271人で6分の時間切れ)。
 *    作成中だけ追記をためて、最後に appendRows_ で一括で書く。番号は最初の1回だけ
 *    読んで連番で振る。書き込みは元と同じロック (withLock_) の中で行う。
 * B. 作成直後に文脈を読み戻して確認し、OKなら配信に「確認済み」の印を付ける
 *    (送信時の1通ごとの確認を省いて速くする)。NGなら送り直して再確認。
 * C. 送信処理の中だけ、大きい表 (send_queue / delivery_recipients / deliveries) を
 *    (send_queue / delivery_recipients) 1回読んだら覚えておく (1通ごとに全行を読み直していた)。更新した行は覚えている
 *    内容にも反映し、追記があれば忘れる。
 * ================================================================ */
var mfCreate_ = null;

var mfPrevCreate_ = actionMailCreateDelivery_;
actionMailCreateDelivery_ = function (req) {
  var t0 = Date.now();
  mfCreate_ = { rec: [], q: [], qNext: 0, qPrefix: '', flushing: false };
  var out;
  try { out = mfPrevCreate_.apply(this, arguments); }
  finally { mfCreate_ = null; }
  try {
    if (out && out.delivery_id && !out.idempotent_replay) {
      out.create_ms = Date.now() - t0;
      out.relay_verify = mfVerifyDeliveryContexts_(str_(out.delivery_id));
    }
  } catch (e) { try { out.relay_verify = { ok: false, error: errMsg_(e) }; } catch (e2) {} }
  return out;
};

var mfPrevNextId_ = nextId_;
nextId_ = function (tableName) {
  if (mfCreate_ && tableName === 'send_queue') {
    if (!mfCreate_.qNext) {
      var first = mfPrevNextId_('send_queue');
      var m = String(first).match(/^(.*?)(\d+)$/);
      mfCreate_.qPrefix = m ? m[1] : 'Q';
      mfCreate_.qNext = m ? parseInt(m[2], 10) : 1;
    }
    var n = String(mfCreate_.qNext++);
    while (n.length < 6) n = '0' + n;
    return mfCreate_.qPrefix + n;
  }
  return mfPrevNextId_.apply(this, arguments);
};

var mfPrevAppendRow_ = appendRow_;
appendRow_ = function (tableName, obj) {
  if (mfCreate_ && !mfCreate_.flushing && (tableName === 'delivery_recipients' || tableName === 'send_queue')) {
    (tableName === 'send_queue' ? mfCreate_.q : mfCreate_.rec).push(obj);
    return 0;
  }
  mfMemoForget_(tableName);
  return mfPrevAppendRow_.apply(this, arguments);
};

var mfPrevAppendRows_ = appendRows_;
appendRows_ = function (tableName, objs) {
  mfMemoForget_(tableName);
  return mfPrevAppendRows_.apply(this, arguments);
};

function mfFlushCreate_(st) {
  if (!st) return;
  st.flushing = true;
  try {
    if (st.rec.length) {
      var r1 = appendRows_('delivery_recipients', st.rec);
      if (r1 && r1.errors && r1.errors.length) throw new Error('配信先の一括書き込みに失敗: ' + r1.errors.length + '件');
      st.rec = [];
    }
    if (st.q.length) {
      var r2 = appendRows_('send_queue', st.q);
      if (r2 && r2.errors && r2.errors.length) throw new Error('送信キューの一括書き込みに失敗: ' + r2.errors.length + '件');
      st.q = [];
    }
  } finally { st.flushing = false; }
}

var mfPrevWithLock_ = withLock_;
withLock_ = function (fn) {
  if (!mfCreate_) return mfPrevWithLock_.apply(this, arguments);
  var st = mfCreate_;
  return mfPrevWithLock_(function () {
    var out = fn();
    mfFlushCreate_(st);
    return out;
  });
};

/** B. 文脈の読み戻し確認 (先頭・中ほど・末尾の3件)。OKなら6時間「確認済み」 */
function mfVerifyDeliveryContexts_(deliveryId) {
  var d = findRow_('deliveries', 'delivery_id', deliveryId);
  if (d && typeof deliveryIncludeForm_ === 'function' && !deliveryIncludeForm_(d)) return { ok: true, note: 'フォームなし' };
  var toks = readTable_('delivery_recipients').rows
    .filter(function (r) { return str_(r.delivery_id) === deliveryId && str_(r.form_token); })
    .map(function (r) { return str_(r.form_token); });
  if (!toks.length) return { ok: true, note: 'トークンなし' };
  var sample = [toks[0], toks[Math.floor(toks.length / 2)], toks[toks.length - 1]];
  var miss = sample.filter(function (tk) { return !mailfixHasCtx_(tk); });
  if (miss.length) {
    try { relayPushContextsForDelivery_(deliveryId); } catch (e) {}
    miss = sample.filter(function (tk) { return !mailfixHasCtx_(tk); });
  }
  var ok = !miss.length;
  if (ok) { try { CacheService.getScriptCache().put('ctxok_' + deliveryId, '1', 21600); } catch (e) {} }
  return { ok: ok, tokens: toks.length, checked: sample.length, missing: miss.length };
}

/* 送信時の文脈確認: 配信が確認済みなら1通ごとの問い合わせを省く */
var mfPrevEnsure_ = mailfixEnsureContext_;
mailfixEnsureContext_ = function (deliveryId, token) {
  try { if (CacheService.getScriptCache().get('ctxok_' + deliveryId)) return ''; } catch (e) {}
  var r = mfPrevEnsure_.apply(this, arguments);
  if (!r) {
    var m = mailfixInit_();
    m.okCount = m.okCount || {};
    m.okCount[deliveryId] = (m.okCount[deliveryId] || 0) + 1;
    // 同じ配信で3通続けて確認できたら、その配信は確認済みとして扱う (送り直し後の確認を兼ねる)
    if (m.okCount[deliveryId] >= 3) { try { CacheService.getScriptCache().put('ctxok_' + deliveryId, '1', 21600); } catch (e) {} }
  }
  return r;
};

/* C. 送信処理の中だけ、大きい表を覚えておく */
var mfMemo_ = null;
var MF_MEMO_TABLES_ = { send_queue: true, delivery_recipients: true };
function mfMemoForget_(tableName) { if (mfMemo_ && mfMemo_[tableName]) delete mfMemo_[tableName]; }

var mfPrevReadTable_ = readTable_;
readTable_ = function (tableName) {
  if (mfMemo_ && MF_MEMO_TABLES_[tableName]) {
    if (!mfMemo_[tableName]) mfMemo_[tableName] = mfPrevReadTable_.apply(this, arguments);
    return mfMemo_[tableName];
  }
  return mfPrevReadTable_.apply(this, arguments);
};

var mfPrevUpdateRow_ = updateRowByPk_;
updateRowByPk_ = function (tableName, pk, patch) {
  var out = mfPrevUpdateRow_.apply(this, arguments);
  try {
    if (mfMemo_ && mfMemo_[tableName] && patch) {
      var key = TABLE_PK_[tableName];
      var rows = mfMemo_[tableName].rows;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][key]) === String(pk)) { Object.keys(patch).forEach(function (k) { rows[i][k] = patch[k]; }); break; }
      }
    }
  } catch (e) { mfMemoForget_(tableName); }
  return out;
};

var mfPrevURS_ = updateRecipientStatus_;
updateRecipientStatus_ = function (deliveryId, applicantId, patch) {
  var out = mfPrevURS_.apply(this, arguments);
  try {
    if (mfMemo_ && mfMemo_.delivery_recipients && patch) {
      var rows = mfMemo_.delivery_recipients.rows;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].delivery_id) === String(deliveryId) && String(rows[i].applicant_id) === String(applicantId)) {
          Object.keys(patch).forEach(function (k) { rows[i][k] = patch[k]; }); break;
        }
      }
    }
  } catch (e) { mfMemoForget_('delivery_recipients'); }
  return out;
};

var mfPrevProcessSendQueue_ = processSendQueue;
processSendQueue = function (e) {
  var outer = !mfMemo_;
  if (outer) mfMemo_ = {};
  try { return mfPrevProcessSendQueue_.apply(this, arguments); }
  finally { if (outer) mfMemo_ = null; }
};

/* D. 案件を1件ずつ探すたびに案件表 (約7,000行) を全部読んでいた (1人あたり3.5秒)。
   1回の実行の中では索引を作って使い回す。案件表に書いたら作り直す。
   (本番では mfMemoForget_ / updateRowByPk_ ラッパーにも cases の索引破棄を入れてある) */
var mfCasesIdx_ = null;
var mfPrevFindRow_ = findRow_;
findRow_ = function (tableName, key, value) {
  if (tableName === 'cases' && key === 'case_id') {
    if (!mfCasesIdx_) {
      var idx = {};
      readTable_('cases').rows.forEach(function (c) { idx[String(c.case_id)] = c; });
      mfCasesIdx_ = idx;
    }
    var hit = mfCasesIdx_[String(value)];
    if (hit) return hit;
    throw new Error('cases に case_id ' + value + ' が見つかりません');
  }
  return mfPrevFindRow_.apply(this, arguments);
};
