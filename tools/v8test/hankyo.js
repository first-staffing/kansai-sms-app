/* 反響一覧 (#/hankyo) の動作テスト。仮のサーバー (mock.js) につないで確かめる。
   使い方: node tools/v8test/hankyo.js */
const pp=require('puppeteer-core'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.join(__dirname,'..','..');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200);r.end(fs.readFileSync(f))}).listen(8767);
  const br=await pp.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const res=[];const A=(c,m)=>res.push((c?'OK  ':'NG  ')+m);
  const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
  const open=async(route,delay)=>{const pg=await br.newPage();await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true});pg.on('dialog',d=>d.accept());pg.on('pageerror',e=>res.push('PAGEERR '+e.message));
    await pg.evaluateOnNewDocument(mock+';window.__delay='+(delay||0)+';window.__navs=[];');await pg.goto('http://localhost:8767/'+route,{waitUntil:'domcontentloaded'});return pg};
  // 1) つながる前は見本を出さない
  let pg=await open('#/hankyo',2500);await sleep(1200);
  let o=await pg.evaluate(()=>({cards:document.querySelectorAll('.r800hk').length,t:document.getElementById('app').innerText}));
  A(o.cards===0&&/読み込み中/.test(o.t)&&!/サンプル/.test(o.t),'つながる前: 見本の回答を出さず「読み込み中」');
  await sleep(14000);
  o=await pg.evaluate(()=>({hash:location.hash,cards:document.querySelectorAll('.r800hk').length,tabs:[].map.call(document.querySelectorAll('.r800tabs button'),b=>b.textContent).join(','),t:document.getElementById('app').innerText}));
  A(o.hash==='#/hankyo'&&o.cards>0,'直接開いても一覧に飛ばされず、反響が並ぶ ('+o.cards+'枚 / '+o.tabs+')');
  A(!/morning|daytime|evening|undefined|NaN/.test(o.t),'英語や undefined が出ていない');
  // 2) SMS → 文面と「対応中」への移動
  await pg.evaluate(()=>{r615NavigateSms_=function(h){window.__navs.push(h)}});
  const rid=await pg.evaluate(()=>document.querySelector('.r800hk').getAttribute('data-resp'));
  await pg.evaluate(()=>[].find.call(document.querySelectorAll('.r800hk button'),b=>b.textContent==='SMSを送る').click());await sleep(2500);
  o=await pg.evaluate(rid=>({nav:decodeURIComponent(window.__navs[0]||''),st:respStatus(state.responses.find(r=>r.id===rid)),hash:location.hash}),rid);
  A(/^sms:\d{9,}/.test(o.nav)&&/株式会社ファーストスタッフィングの/.test(o.nav),'SMSが開き、名乗りが入る');
  A(o.st==='in_progress'&&o.hash==='#/hankyo','SMSを押すと「対応中」に移る');
  // 3) 文面が反響の中身で変わる
  const b=await pg.evaluate(()=>{var f=window.r800.hkSmsBody,a={name:"山田 花子"},c=CASES[0].id;var t=new Date(Date.now()+864e5),d=t.getFullYear()+"-"+("0"+(t.getMonth()+1)).slice(-2)+"-"+("0"+t.getDate()).slice(-2);
    return {a:f(a,{selected_case_ids:[c],phone_dates:["2020-01-01",d],phone_bands:["morning"]}),b:f(a,{phone_anytime:true}),c:f(a,{intent:"見学希望"}),d:f(a,{phone_dates:["2020-01-01"]})}});
  A(/の求人にご興味/.test(b.a)&&/午前（9〜12時）にお電話いたします/.test(b.a)&&!/1\/1（/.test(b.a),'案件へのお礼 + 希望日時の予告 (過ぎた日は使わない)');
  A(/のちほどお電話/.test(b.b),'「いつでも」→ のちほどお電話');
  A(/見学のご希望/.test(b.c)&&/見学の日程/.test(b.c),'見学希望の文面');
  A(/ご都合の良い日時/.test(b.d),'希望が過ぎた日だけ → 都合を聞く');
  // 4) 対応中タブ → 未対応に戻す / 対応済み
  await pg.evaluate(()=>r800HkTab('doing'));await sleep(500);
  await pg.evaluate(rid=>[].find.call(document.querySelectorAll('.r800hk[data-resp="'+rid+'"] button'),b=>b.textContent==='未対応に戻す').click(),rid);await sleep(800);
  o=await pg.evaluate(rid=>respStatus(state.responses.find(r=>r.id===rid)),rid);A(o==='unhandled','未対応に戻せる');
  await pg.evaluate(()=>r800HkTab('open'));await sleep(500);
  await pg.evaluate(rid=>[].find.call(document.querySelectorAll('.r800hk[data-resp="'+rid+'"] button'),b=>b.textContent==='対応済みにする').click(),rid);await sleep(800);
  o=await pg.evaluate(rid=>({st:respStatus(state.responses.find(r=>r.id===rid)),gone:!document.querySelector('.r800hk[data-resp="'+rid+'"]')}),rid);A(o.st==='handled'&&o.gone,'対応済みにすると未対応から消える');
  await pg.close();
  // 5) 回答一覧・掘り起こしに見本が残らない
  for(const rt of ['#/responses','#/dig']){pg=await open(rt,2500);await sleep(14000);const s=await pg.evaluate(()=>/サンプル/.test(document.getElementById('app').innerText));A(!s,rt+' を直接開いても見本が残らない');await pg.close()}
  console.log(res.join('\n'));await br.close();srv.close();process.exit(res.some(x=>!/^OK/.test(x))?1:0);
})();
