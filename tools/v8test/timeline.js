/* 起動からの時間を測る (仮のサーバーに、本番を想定した待ち時間を入れる)。使い方: node tools/v8test/timeline.js  (TL=1 で通信の一覧も出す) */
const pp=require('puppeteer-core'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.join(__dirname,'..','..');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(fs.readFileSync(f))}).listen(8767);
  const br=await pp.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const mock=fs.readFileSync(path.join(__dirname,'mock.js'),'utf8').replace('for(var i=0;i<420;i++)','for(var i=0;i<'+(process.env.N||7800)+';i++)').replace('k<1500','k<7000');
  const pre=mock+`;(function(){
    window.__tl=[];var T0=performance.now();var LAT={ping:1200,getTemplates:1500,getOperators:1300,getApplicantSummary:2500,getResponses:2500,getResponseSummary:1800,getCaseMaster:6000,searchApplicants:1800,getMuniFacets:2500,ngList:1500,getSendQueueStats:1500,getApplicant:1500,issueFormToken:2500};
    var f0=window.fetch;
    window.fetch=function(url,opt){
      if(String(url).indexOf('script.google.com')>=0&&opt&&opt.method==='POST'){
        var req={};try{req=JSON.parse(opt.body||'{}')}catch(e){}
        var a=req.action,st=Math.round(performance.now()-T0),lat=LAT[a]||1500;
        if(a==='searchApplicants')lat=1500+(req.page_size||50)*3; if(a==='getCaseMaster'&&req.updated_since)lat=2000;
        var d=window.__mock(req);if(d===undefined)d={};
        var ent={a:(a==='getResponses'||a==='getResponseSummary'||a==='getSendQueueStats'||a==='ping'?JSON.stringify(req)+' ':'')+a+(a==='searchApplicants'?'('+(req.page_size||50)+(req.filter&&req.filter.prefectures?',京奈':(req.filter&&Object.keys(req.filter).length>1?',絞':''))+',p'+(req.page||1)+')':''),s:st};window.__tl.push(ent);
        return new Promise(function(res){setTimeout(function(){ent.e=Math.round(performance.now()-T0);res({ok:true,status:200,json:function(){return Promise.resolve({ok:true,data:d})}})},lat)});
      }
      if(String(url).indexOf('script.google.com')>=0||String(url).indexOf('workers.dev')>=0)return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({ok:true})},text:function(){return Promise.resolve('')}});
      return f0.apply(this,arguments);
    };
    window.__ms={};var iv=setInterval(function(){var t=Math.round(performance.now()-T0);var M=window.__ms;try{
      if(!M.cards&&document.querySelectorAll('#app article.card').length)M.cards=t;
      if(!M.roster&&window._r616Roster&&window._r616Roster.items&&window._r616Roster.items.length)M.roster=t;
      if(!M.summary&&window._r6ApplicantSummary)M.summary=t;
      if(!M.cases&&typeof r617CasesReadyNow_==='function'&&window._r6ServerMode&&r617CasesReadyNow_())M.cases=t;
      var pk=document.querySelector('.r800todo.pick b');if(!M.pick&&pk&&/\\d/.test(pk.textContent))M.pick=t;
      var td=document.querySelector('.r800home .r800todo b');if(!M.todo&&td&&/\\d/.test(td.textContent))M.todo=t;
      if(!M.server&&window._r6ServerMode)M.server=t;if(!M.own){var so=JSON.parse(localStorage.getItem('r800srv')||'{}');if(so.own)M.own=t}
    }catch(e){}},50);
  })();`;
  async function run(hash,label,second){
    const ctx=await br.createBrowserContext();const pg=await ctx.newPage();await pg.setViewport({width:390,height:844,isMobile:true});pg.on('dialog',d=>d.dismiss());
    await pg.evaluateOnNewDocument(pre);
    await pg.goto('http://localhost:8767/'+hash,{waitUntil:'domcontentloaded'});await sleep(+(process.env.WAIT||30000));
    let r=await pg.evaluate(()=>({ms:window.__ms,tl:window.__tl}));
    console.log('== '+label+' 1回目',JSON.stringify(r.ms));
    if(process.env.TL)console.log(r.tl.map(x=>x.s+'→'+(x.e||'…')+' '+x.a).join('\n'));
    console.log('   通信回数',r.tl.length);
    if(second){await pg.reload({waitUntil:'domcontentloaded'});await sleep(+(process.env.WAIT||30000));r=await pg.evaluate(()=>({ms:window.__ms,tl:window.__tl}));console.log('== '+label+' 2回目(開き直し)',JSON.stringify(r.ms));if(process.env.TL)console.log(r.tl.map(x=>x.s+'→'+(x.e||'…')+' '+x.a).join('\n'));console.log('   通信回数',r.tl.length)}
    await ctx.close();
  }
  await run('#/','ホーム',true);await run('#/list','一覧',true);
  await br.close();srv.close();
})().catch(e=>{console.error(e);process.exit(1)});
