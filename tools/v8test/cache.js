/* 名簿を端末に保存する仕組み (8.3) のテスト。仮のサーバー (mock.js) につないで確かめる。
   使い方: node tools/v8test/cache.js */
const pp=require('puppeteer-core'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.join(__dirname,'..','..');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200);r.end(fs.readFileSync(f))}).listen(8768);
  const br=await pp.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const res=[];const A=(c,m)=>res.push((c?'OK  ':'NG  ')+m);
  const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
  const pg=await br.newPage();await pg.setViewport({width:390,height:844,isMobile:true,hasTouch:true});pg.on('dialog',d=>d.accept());pg.on('pageerror',e=>res.push('PAGEERR '+e.message));
  let delay=0;
  await pg.evaluateOnNewDocument(mock+';window.__delay=Number(sessionStorage.getItem("__d")||0);window.__rosterDelay=Number(sessionStorage.getItem("__rd")||0);window.__navs=[];');
  // 1) 1回目: 保存されていない → ふつうに読み込み、名簿が届いたら保存される
  await pg.goto('http://localhost:8768/#/list',{waitUntil:'domcontentloaded'});await sleep(1500);
  A(await pg.evaluate(()=>!window.r800.rosterCached()),'1回目: 保存した名簿は使われない');
  await sleep(10000);
  const idb=()=>pg.evaluate(()=>new Promise(function(res){var rq=indexedDB.open('r618_app',1);rq.onsuccess=function(){try{var g=rq.result.transaction('kv').objectStore('kv').get('roster_v1');g.onsuccess=function(){var r=g.result;res(r?{n:r.items.length,phone:r.items.filter(function(a){return a.phone||a.email||a.address_rest}).length,area:r.area}:null)};g.onerror=function(){res('err')}}catch(e){res('ex '+e)}};rq.onerror=function(){res('openerr')}}));
  let o=await idb();A(o&&o.n>400,'名簿が届いたら端末に保存される ('+(o&&o.n)+'名)');A(o&&o.phone===0,'電話番号・メール・番地は保存しない');
  // 自分で1人送信済みにする (控えに残る)
  const mine=await pg.evaluate(()=>{var a=window._r616Roster.items.filter(function(a){return !a.sms_sent&&!a.is_test})[0];markSms(a.id,true);return a.id});await sleep(800);
  // 2) 2回目 (通信を遅くして開き直す): 前回の名簿ですぐ並ぶ
  await pg.evaluate(()=>{sessionStorage.setItem('__d','400');sessionStorage.setItem('__rd','9000')});
  const t0=Date.now();await pg.reload({waitUntil:'domcontentloaded'});
  let first=null;for(let i=0;i<40;i++){await sleep(250);const s=await pg.evaluate(()=>({c:!!(window.r800&&window.r800.rosterCached()),cards:document.querySelectorAll('#app article.card').length,srv:!!window._r6ServerMode,note:!!document.getElementById('r800rcNote')}));if(s.cards>0){first=Object.assign({ms:Date.now()-t0},s);break}}
  A(first&&first.c,'開き直し: 前回の名簿で一覧が出る ('+(first?first.ms:'-')+'ミリ秒・名簿の読み込みに9秒かかる通信で)');
  A(first&&first.note,'「前回の名簿を表示中」の注記が出る');
  o=await pg.evaluate(id=>{var a=r6161FindApplicant_(id);return !!(a&&a.sms_sent)},mine);A(o,'自分が前回送った人は、前回の名簿の上でも送信済み');
  // 3) 前回の名簿の間に、ほかの担当が送った人の「初回SMS」を押す → 開かずに知らせる
  await pg.evaluate(()=>{r615NavigateSms_=function(h){window.__navs.push(h)}});
  const other=await pg.evaluate(()=>{var c=[].slice.call(document.querySelectorAll('#app article.card')).filter(function(c){var cb=c.querySelector('input[type=checkbox]');return cb&&!cb.checked&&c.querySelector('button[onclick*="openSmsDirect615("]')})[0];return c.getAttribute('data-anchor').slice(4)});
  await pg.evaluate(id=>window.__otherSent(id),other);
  await pg.evaluate(id=>document.querySelector('#app article[data-anchor="app:'+id+'"] button[onclick*="openSmsDirect615("]').click(),other);
  await sleep(4200);
  o=await pg.evaluate(id=>({navs:window.__navs.length,sent:!!r6161FindApplicant_(id).sms_sent,cached:window.r800.rosterCached()}),other);
  A(o.navs===0&&o.sent,'ほかの担当が送信済みの人: SMSを開かず、送信済みに直す (前回の名簿のまま='+o.cached+')');
  // 4) 最新の名簿に差し替わる
  let fresh=false;for(let i=0;i<60;i++){await sleep(500);if(await pg.evaluate(()=>!window.r800.rosterCached()&&!!window._r616Roster)){fresh=true;break}}
  A(fresh,'しばらくすると最新の名簿に差し替わる');
  await sleep(1500);A(await pg.evaluate(()=>!document.getElementById('r800rcNote')),'差し替わったら注記が消える');
  // 5) 設定から消せる
  await pg.evaluate(()=>{location.hash='#/settings'});await sleep(1500);
  await pg.evaluate(()=>document.querySelector('#r800rc button').click());await sleep(1200);
  o=await idb();A(o===null,'設定の「保存した名簿を消す」で消える');
  console.log(res.join('\n'));await br.close();srv.close();process.exit(res.some(x=>!/^OK/.test(x))?1:0);
})();
