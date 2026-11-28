/* 担当者アプリ (index.html) の動作テスト。仮のサーバー (mock.js・架空の420名) につないで、実際に画面を操作して確かめる。
   使い方: npm i puppeteer-core してから  node tools/v8test/flow.js   (Chrome の場所は CHROME=/path/to/chrome で指定できる)
   確かめる内容: 初回SMS → 画面を離れる → 戻る → 8秒後に自動で記録 / 取り消し / 次の人へ進んだら即記録 / チェックを直接押す / 追いSMS */
const pp=require('puppeteer-core'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.join(__dirname,'..','..');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':p.endsWith('.json')?'application/json':'text/html; charset=utf-8'});r.end(fs.readFileSync(f))}).listen(8766);
  const br=await pp.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const res=[];const A=(c,m)=>{res.push((c?'OK  ':'NG  ')+m);};
  async function open(){
    const pg=await br.newPage();await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    pg.on('dialog',d=>d.dismiss());pg.on('pageerror',e=>res.push('PAGEERR '+e.message));
    await pg.evaluateOnNewDocument((process.env.BIG?fs.readFileSync(path.join(__dirname,'mock.js'),'utf8').replace('for(var i=0;i<420;i++)','for(var i=0;i<2200;i++)').replace('k<1500','k<7000'):fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'))+`
      ;window.__navs=[];try{Object.defineProperty(document,'hidden',{configurable:true,get:function(){return !!window.__hid}});Object.defineProperty(document,'visibilityState',{configurable:true,get:function(){return window.__hid?'hidden':'visible'}})}catch(e){}
      window.__hide=function(v){window.__hid=v;document.dispatchEvent(new Event('visibilitychange'))};`);
    await pg.goto('http://localhost:8766/#/list',{waitUntil:'domcontentloaded'});await sleep(6500);
    // sms: への移動は止めて記録だけする
    await pg.evaluate(()=>{r615NavigateSms_=function(h){window.__navs.push(h)};document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="sms:"]');if(a){window.__navs.push(a.getAttribute('href'));e.preventDefault()}},false)});
    return pg;
  }
  const firstUnsent=pg=>pg.evaluate(()=>{var c=[].slice.call(document.querySelectorAll('#app article.card')).filter(function(c){var cb=c.querySelector('input[type=checkbox]');return cb&&!cb.checked&&c.querySelector('button[onclick*="openSmsDirect615("]')});window.__cs=c;return c.map(function(x){return x.getAttribute('data-anchor').slice(4)}).slice(0,3)});
  const tap=async(pg,id)=>{await pg.evaluate(id=>{var b=document.querySelector('#app article[data-anchor="app:'+id+'"] button[onclick*="openSmsDirect615("]');b.click()},id);await sleep(1500);await pg.evaluate(id=>{var a=document.querySelector('#app article[data-anchor="app:'+id+'"] .r614main a[href^="sms:"]');if(a&&!window.__navs.length)a.click()},id)};
  const sent=(pg,id)=>pg.evaluate(id=>({local:!!(r6161FindApplicant_(id)||{}).sms_sent,server:window.__sentReqs.filter(function(r){return r.applicant_id===id}).length,bar:(document.getElementById('r659Bar')||{}).textContent||'',log:JSON.parse(localStorage.getItem('r800log')||'[]').filter(function(e){return e.id===id})}),id);

  // 1) 8秒待って記録
  let pg=await open();let ids=await firstUnsent(pg);let id=ids[0];
  await tap(pg,id);await sleep(2500);
  let navs=await pg.evaluate(()=>window.__navs.length);A(navs>=1,'初回SMSを押すとSMSが開く ('+navs+')');
  let body=await pg.evaluate(()=>decodeURIComponent((window.__navs[0]||'').split('body=')[1]||''));
  A(body.indexOf('Indeed経由でご登録いただいておりました、株式会社ファーストスタッフィングです。')>=0,'名乗りが新しい文面');
  await pg.evaluate(()=>__hide(true));await sleep(300);await pg.evaluate(()=>__hide(false));await sleep(1200);
  let s=await sent(pg,id);A(/送信済みにします/.test(s.bar)&&!s.local&&s.server===0,'戻った直後: 帯が出て、まだ記録していない ['+s.bar+']');
  let vis=await pg.evaluate(id=>{var c=document.querySelector('#app article[data-anchor="app:'+id+'"]');return c&&c.querySelector('input[type=checkbox]').checked},id);A(vis,'待っている間もカードは送信済みの見た目');
  await sleep(8500);s=await sent(pg,id);A(s.local&&s.server===1&&!s.bar,'8秒後: 自動で記録 (サーバーへ1回)');A(s.log.length===1&&s.log[0].k&&s.log[0].t,'文面の控えが残る ['+(s.log[0]&&s.log[0].t)+']');
  // 2) 取り消し
  id=ids[1];await pg.evaluate(()=>{window.__navs=[]});await tap(pg,id);await sleep(2500);await pg.evaluate(()=>__hide(true));await sleep(300);await pg.evaluate(()=>__hide(false));await sleep(1200);
  await pg.evaluate(()=>document.querySelector('#r659Bar .r659no').click());await sleep(9500);
  s=await sent(pg,id);A(!s.local&&s.server===0&&!s.bar&&!s.log.length,'取り消す: 記録されない (サーバーへも送らない)');
  // 3) 次の人へ進んだら、前の人はすぐ記録
  await pg.evaluate(()=>{window.__navs=[]});await tap(pg,id);await sleep(2500);await pg.evaluate(()=>__hide(true));await sleep(300);await pg.evaluate(()=>__hide(false));await sleep(1200);
  const id3=ids[2];await pg.evaluate(()=>{window.__navs=[]});await tap(pg,id3);await sleep(2500);await pg.evaluate(()=>__hide(true));await sleep(400);
  s=await sent(pg,id);A(s.local&&s.server===1,'次の人のSMSを開いた時点で、前の人を記録');
  await pg.evaluate(()=>__hide(false));await sleep(1200);s=await sent(pg,id3);A(/送信済みにします/.test(s.bar)&&s.server===0,'次の人にも帯が出る');
  await pg.evaluate(()=>document.querySelector('#r659Bar .r659yes').click());await sleep(800);s=await sent(pg,id3);A(s.local&&s.server===1,'OKですぐ記録');
  // 4) チェックボックスを直接押しても記録される (これまでは無反応のことがあった)
  ids=await firstUnsent(pg);const id4=ids[0];
  await pg.evaluate(id=>document.querySelector('#app article[data-anchor="app:'+id+'"] input[type=checkbox]').click(),id4);await sleep(900);
  s=await sent(pg,id4);A(s.local&&s.server===1,'「送信後にチェック」を直接押して記録');
  await pg.close();
  // 5) 追いSMS
  pg=await open();await pg.evaluate(()=>r800View('follow'));await sleep(1500);
  const f=await pg.evaluate(()=>{var c=document.querySelector('#app article.card');var id=c.getAttribute('data-anchor').slice(4);var a=[].slice.call(c.querySelectorAll('a[href^="sms:"]'))[0];var before=(r6161FindApplicant_(id)||{}).sms_last_sent_at;a.click();return {id:id,txt:a.textContent,before:before,n:document.querySelectorAll('#app article.card').length}});
  A(/追いSMSを開く/.test(f.txt),'追客タブに追いSMSの対象が並ぶ ('+f.n+'枚表示)');
  await pg.evaluate(()=>__hide(true));await sleep(300);await pg.evaluate(()=>__hide(false));await sleep(1200);
  s=await sent(pg,f.id);A(/送信済みにします/.test(s.bar),'追いSMS: 戻ると帯が出る');
  await pg.evaluate(()=>document.querySelector('#r659Bar .r659yes').click());await sleep(900);
  s=await sent(pg,f.id);A(s.server===1&&s.log.length===1&&s.log[0].k==='follow','追いSMS: 記録される (控えは「追いSMS」)');
  const still=await pg.evaluate(id=>!!document.querySelector('#app article[data-anchor="app:'+id+'"]'),f.id);A(still,'記録した人が一覧から急に消えない');
  // 6) 追いSMS: 電話番号が一覧に無い人は取りに行ってから開く
  const g=await pg.evaluate(()=>{var cs=document.querySelectorAll('#app article.card');var c=cs[1];var id=c.getAttribute('data-anchor').slice(4);var a=r6161FindApplicant_(id);a.phone="";route();c=document.querySelector('#app article[data-anchor="app:'+id+'"]');var an=c.querySelector('a[href^="sms:"]');window.__navs=[];var href0=an.getAttribute('href');an.click();return {id:id,href0:href0.slice(0,14)}});
  await sleep(700);const nav=await pg.evaluate(()=>(window.__navs[0]||'')+' | '+location.href.slice(0,40));
  A(/^sms:0\d{9,}/.test(nav)||/^sms:0\d{9,}/.test(await pg.evaluate(id=>document.querySelector('#app article[data-anchor="app:'+id+'"] a[href^="sms:"]').getAttribute('href'),g.id)),'番号が無い人: 取りに行ってから開く ['+g.href0+' → '+nav.slice(0,20)+']');
  await pg.close();
  // 7) 今日のピックアップ (SMS): 京都・奈良だけ・登録元は問わない・送信済みも入る・取得日が新しい順 → 近い順
  pg=await open();await pg.evaluate(()=>{location.hash='#/'});await sleep(1500);
  const home=await pg.evaluate(()=>({pick:!!document.querySelector('.r800pick'),txt:(document.querySelector('.r800pick')||{}).textContent||''}));
  A(home.pick&&/SMSを送る人/.test(home.txt)&&/Gmailを送る人/.test(home.txt),'ホームに「今日のピックアップ」が出る');
  await pg.evaluate(()=>r800View('pick'));await sleep(1800);
  const pk=await pg.evaluate(()=>{var p=r800.pickToday();var as=p.sms.map(function(id){return r6161FindApplicant_(id)});var keys=as.map(function(a){var m=r800.matchCases(a);return m[0].acq+'|'+('00000'+Math.round(m[0].d*100)).slice(-6)});var ordered=keys.every(function(k,i){if(!i)return true;var p0=keys[i-1].split('|'),p1=k.split('|');return p0[0]>p1[0]||(p0[0]===p1[0]&&p0[1]<=p1[1])});
    return {n:p.sms.length,prefs:as.every(function(a){return a.prefecture==='京都府'||a.prefecture==='奈良県'}),cos:as.map(function(a){return a.source_company}).filter(function(v,i,x){return x.indexOf(v)===i}).length,sent:as.filter(function(a){return a.sms_sent}).length,ordered:ordered,cards:document.querySelectorAll('#app article.card').length,tag:(document.querySelector('#app article.card .r800tag.pick')||{}).textContent||'',first:document.querySelector('#app article.card').getAttribute('data-anchor').slice(4)===p.sms[0],max:Math.max.apply(null,as.map(function(a){return r800.matchCases(a).length}))}});
  A(pk.n>0&&pk.n<=150&&pk.prefs,'ピックアップは京都・奈良だけ・150人まで ('+pk.n+'人)');
  A(pk.cos>=2,'登録元は問わない ('+pk.cos+'社)');A(pk.sent>0,'送信済みの人も入る ('+pk.sent+'人)');
  A(pk.ordered&&pk.first,'BOの取得日が新しい順 → 近い順に並ぶ');A(/新着BO .*取得・[\d.]+km/.test(pk.tag),'カードに理由が出る ['+pk.tag+']');A(pk.max<=7,'1人につき案件は最大7件');
  const fc=await pg.evaluate(()=>{var p=r800.pickToday();var a=r6161FindApplicant_(p.sms[0]);var m=r800.matchCases(a).map(function(x){return x.id});return {same:JSON.stringify(r622FiveCases_(a))===JSON.stringify(m),n:m.length}});
  A(fc.same&&fc.n>=5,'フォームに載せる案件も同じ決め方 ('+fc.n+'件)');
  const again=await pg.evaluate(()=>{var p1=r800.pickToday().sms.join(',');var a=r6161FindApplicant_(r800.pickToday().sms[0]);a.sms_sent=true;a.sms_last_sent_at=new Date().toISOString();return p1===r800.pickToday().sms.join(',')});
  A(again,'その日のうちは顔ぶれが変わらない');
  const nextDay=await pg.evaluate(()=>{var st=JSON.parse(localStorage.getItem('r800pick2'));var old=st.sms.slice();st.day='2026-01-01';var y=new Date(Date.now()+9*36e5-864e5).toISOString().slice(0,10);st.day=y;localStorage.setItem('r800pick2',JSON.stringify(st));location.reload();return old});
  await sleep(7500);
  const nd=await pg.evaluate(old=>{var p=r800.pickToday();return {n:p?p.sms.length:-1,overlap:p?p.sms.filter(function(id){return old.indexOf(id)>=0}).length:-1}},nextDay);
  A(nd.n>=0&&nd.overlap===0,'次の日は、前の日に選んだ人を外して選び直す (重なり '+nd.overlap+'人・'+nd.n+'人)');
  // 8) 今日のGmail: 条件を入れてGmail送信の画面へ。送るのは確認してから
  await pg.evaluate(()=>{window.__mailReqs=[];r800Mail()});await sleep(2500);
  const ml=await pg.evaluate(()=>{var w=r800.mailWindow();var q=(window.__mailReqs||[]).filter(function(r){return r.action==='mailPreviewTargets'}).pop()||{};var f=q.filter||{};return {hash:location.hash,note:!!document.getElementById('r800MailNote'),prefs:(f.prefectures||[]).join(','),fs:f.has_fs_history,from:f.applied_from,to:f.applied_to,top:q.top_n,w:w,created:(window.__mailReqs||[]).filter(function(r){return r.action==='mailCreateDelivery'}).length}});
  A(ml.hash.indexOf('#/mail')===0&&ml.note,'Gmail送信の画面が開き、条件の説明が出る');
  A(ml.prefs==='京都府,奈良県'&&ml.fs===true,'宛先は京都・奈良のファーストスタッフィング登録者だけ');
  A(ml.from===ml.w.from&&ml.to===ml.w.to&&ml.top===ml.w.n,'今日の範囲 ('+ml.from+'〜'+ml.to+'・'+ml.top+'人) で対象を確認');
  A(ml.created===0,'開いただけでは送信しない');
  const rot=await pg.evaluate(()=>{var w=r800.mailWindow();return apiCall({action:'mailCreateDelivery',subject:'x',filter:{applied_from:w.from,applied_to:w.to}}).then(function(){var s=JSON.parse(localStorage.getItem('r800mail2'));var sent=s.sent,ratio=s.ratio;var y=new Date(Date.now()+9*36e5-864e5).toISOString().slice(0,10);s.day=y;localStorage.setItem('r800mail2',JSON.stringify(s));var w2=r800.mailWindow();return {sent:sent,ratio:ratio,next:w.next,to2:w2.to,from1:w.from,n2:w2.n}})});
  A(rot.sent===true,'送信したら、その日の分は送信済みになる');
  A(rot.next?(rot.to2===rot.next&&rot.to2<rot.from1):(rot.to2>=rot.from1),'次の日は続きの人から (前日 〜'+rot.from1+' → 次 '+rot.to2+'〜・'+rot.n2+'人)');
  await pg.evaluate(()=>r800MailOff());await sleep(600);
  const off=await pg.evaluate(()=>({note:!!document.getElementById('r800MailNote'),f:mailFilterToServer(MF)}));
  A(!off.note&&!off.f.applied_to,'「この条件を外す」で元に戻る');
  await pg.close();
  // 9) サーバーの返事が遅いとき: つながる前に、手元の見本データでピックアップや人数を出さない・覚えない (8.0 の不具合の再発防止)
  {
    const ctx=await br.createBrowserContext();const pg2=await ctx.newPage();await pg2.setViewport({width:390,height:844,isMobile:true});pg2.on('dialog',d=>d.dismiss());pg2.on('pageerror',e=>res.push('PAGEERR '+e.message));
    await pg2.evaluateOnNewDocument('window.__delay=1500;'+fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'));
    await pg2.goto('http://localhost:8766/#/',{waitUntil:'domcontentloaded'});await sleep(900);
    const early=await pg2.evaluate(()=>({server:!!window._r6ServerMode,stored:localStorage.getItem('r800pick2'),storedMail:localStorage.getItem('r800mail2'),pickShown:(function(){var e=document.querySelector('.r800pick');return e&&!e.hidden?e.textContent:''})(),todo:[].slice.call(document.querySelectorAll('.r800home .r800todo b')).map(function(b){return b.textContent}).join(',')}));
    A(!early.server&&!early.stored&&!early.storedMail,'つながる前は、ピックアップを計算も保存もしない');
    A(!/\d/.test(early.pickShown)&&!/\d/.test(early.todo.split(',').slice(0,2).join('')),'つながる前は、見本データの人数を出さない ['+early.todo+']');
    await sleep(9000);
    const late=await pg2.evaluate(()=>{var st=JSON.parse(localStorage.getItem('r800pick2')||'null');return {n:st?st.sms.length:-1,real:st?st.sms.every(function(id){return /^A1\d{5}$/.test(id)}):false,shown:(document.querySelector('.r800pick')||{}).textContent||'',todo:[].slice.call(document.querySelectorAll('.r800home .r800todo b')).map(function(b){return b.textContent}).join(',')}});
    A(late.n>5&&late.real,'つながったあと、本物の名簿でピックアップする ('+late.n+'人)');
    A(/SMSを送る人\s*\d+人/.test(late.shown.replace(/\s+/g,' '))||/\d+人/.test(late.shown),'ホームの数字が自動で出る ['+late.todo+']');
    await ctx.close();
  }
  console.log(res.join('\n'));await br.close();srv.close();process.exit(res.some(r=>!/^OK/.test(r))?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
