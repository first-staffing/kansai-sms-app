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
    await pg.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname,'mock.js'),'utf8')+`
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
  console.log(res.join('\n'));await br.close();srv.close();process.exit(res.some(r=>!/^OK/.test(r))?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
