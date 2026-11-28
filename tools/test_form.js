/* 応募者フォーム (f.html) の動作テスト。公開する前に必ず通す:  node tools/test_form.js
   (jsdom が必要: npm i jsdom)。時間のかかる待ちは 1/200 に縮めて確かめる。
   確かめる内容: 中身がすぐ届く／あとから届く／ずっと届かない／期限切れ／無効な合言葉／案件0件／送信／送信失敗 */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'f.html'), 'utf8').split('location.replace(').join('window.__replace(');
const CASES = n => Array.from({ length: n }, (_, i) => ({ case_id: 'C' + i, facility_name: '施設' + i, municipality: '大阪市', service_type: '特養', distance_km: 1.5 + i, salary_band_text: '介護 1,400円', hours_short_text: '相談可', description: '11月入職できる方', updated_at_src: new Date().toISOString() }));
const CTX = n => ({ ok: true, context: { applicant_id: 'A1', name: 'T_山田 花子', surname: '山田', sender_name: '株式会社ファーストスタッフィング', sender_unknown: false, recommended_cases: CASES(n) } });
function run(name, { token = 'abcdefghij0123456789', replies, post, check, waitMs = 400 }) {
  return new Promise(resolve => {
    const st = { gets: 0, posts: [], replaced: null };
    const dom = new JSDOM(SRC, {
      url: 'https://first-staffing.github.io/kansai-sms-app/f?t=' + token, runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) {
        const st0 = w.setTimeout.bind(w);
        w.setTimeout = (f, ms) => st0(f, Math.max(0, (ms || 0) / 200));
        w.__replace = u => { st.replaced = u; };
        w.scrollTo = () => {};
        w.fetch = (url, opt) => {
          if (opt && opt.method === 'POST') { st.posts.push(JSON.parse(opt.body)); const r = post ? post(st.posts.length) : { ok: true }; return r === 'fail' ? Promise.reject(new Error('net')) : Promise.resolve({ json: () => Promise.resolve(r) }); }
          const r = replies(++st.gets);
          return r === 'fail' ? Promise.reject(new Error('net')) : Promise.resolve({ json: () => Promise.resolve(r) });
        };
      }
    });
    setTimeout(async () => {
      let ok = false, msg = '';
      try { await check(dom.window, st); ok = true; } catch (e) { msg = e.message; }
      console.log((ok ? 'OK  ' : 'NG  ') + name + (msg ? ' — ' + msg : ''));
      dom.window.close(); resolve(ok);
    }, waitMs);
  });
}
const A = (c, m) => { if (!c) throw new Error(m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const res = [];
  res.push(await run('中身がすぐ届く → 8件ぜんぶ表示・備考は出さない', { replies: () => CTX(8), check: (w, st) => {
    const cs = w.document.querySelectorAll('.case'); A(cs.length === 8, 'cases ' + cs.length);
    A([...cs].every(c => !c.hidden), '隠れている案件がある'); A(!st.replaced, '従来フォームへ移った');
    A(w.document.body.textContent.indexOf('11月入職') < 0, '備考が出ている'); A(w.document.querySelector('h1').textContent.indexOf('山田様') >= 0, '宛名');
  } }));
  res.push(await run('作った直後 (5回目で届く) → この画面のまま待って表示', { replies: n => n < 5 ? { ok: false, error: 'context_not_found' } : CTX(3), check: (w, st) => {
    A(!st.replaced, '従来フォームへ移った'); A(w.document.querySelectorAll('.case').length === 3, '表示されていない'); A(st.gets === 5, 'gets ' + st.gets);
  } }));
  res.push(await run('通信が2回失敗してから届く → この画面のまま表示', { replies: n => n < 3 ? 'fail' : CTX(2), check: (w, st) => { A(!st.replaced, '従来フォームへ移った'); A(w.document.querySelectorAll('.case').length === 2, '表示されていない'); } }));
  res.push(await run('1分たっても届かない → 最後に従来フォームへ', { waitMs: 900, replies: () => ({ ok: false, error: 'context_not_found' }), check: (w, st) => { A(st.gets >= 28, 'gets ' + st.gets); A(st.replaced && st.replaced.indexOf('#/form?token=') >= 0, '切り替わっていない'); } }));
  res.push(await run('10秒時点ではまだ従来フォームへ移らない', { waitMs: 50, replies: () => ({ ok: false, error: 'context_not_found' }), check: (w, st) => { A(!st.replaced, '早すぎる切り替え'); A(w.document.getElementById('wait'), '待ちの表示がない'); } }));
  res.push(await run('期限切れ → 案内を出して止まる', { replies: () => ({ ok: false, error: 'context_expired' }), check: (w, st) => { A(!st.replaced, '移った'); A(w.document.body.textContent.indexOf('有効期限') >= 0, '案内なし'); } }));
  res.push(await run('合言葉の形がおかしい → 従来フォームへ', { token: 'short', replies: () => CTX(1), check: (w, st) => { A(st.replaced, '切り替わっていない'); } }));
  res.push(await run('案件が0件 → 従来フォームへ', { replies: () => CTX(0), check: (w, st) => { A(st.replaced, '切り替わっていない'); } }));
  res.push(await run('選んで送信 → 項目がそろって送られ、完了画面', { replies: () => CTX(8), check: async (w, st) => {
    const d = w.document; d.querySelectorAll('.case')[1].click(); d.querySelector('[data-g="anytime"]').click(); d.querySelector('[data-g="days"]').click(); d.getElementById('send').click(); await wait(100);
    A(st.posts.length === 1, 'posts ' + st.posts.length); const p = st.posts[0];
    A(p.path === 'submit' && p.token && p.submit_id, 'path/token'); A(p.selected_case_ids.join() === 'C1', 'cases'); A(p.phone_anytime === true && p.phone_consult_datetime === 'いつでも可', 'phone');
    A(p.intent === 'detail' && p.desired_days_per_week === '週1日', 'intent/days'); A(d.body.textContent.indexOf('送信しました') >= 0, '完了画面');
  } }));
  res.push(await run('送信が2回とも失敗 → 入力を残して「もう一度送信する」', { replies: () => CTX(2), post: () => 'fail', check: async (w, st) => {
    const d = w.document; d.querySelectorAll('.case')[0].click(); d.getElementById('send').click(); await wait(150);
    A(st.posts.length === 2, 'posts ' + st.posts.length); A(st.posts[0].submit_id === st.posts[1].submit_id, '送信IDが変わった'); A(d.getElementById('send').textContent.indexOf('もう一度') >= 0, 'ボタン'); A(d.querySelectorAll('.case[aria-pressed=true]').length === 1, '入力が消えた');
  } }));
  res.push(await run('何も選ばず送信 → 送らず案内', { replies: () => CTX(2), check: async (w, st) => { w.document.getElementById('send').click(); await wait(50); A(st.posts.length === 0, '送ってしまった'); A(!w.document.getElementById('err').hidden, '案内なし'); } }));
  const ng = res.filter(x => !x).length;
  console.log(ng ? '\n' + ng + ' 件が NG。公開しないこと。' : '\nすべて OK');
  process.exit(ng ? 1 : 0);
})();
