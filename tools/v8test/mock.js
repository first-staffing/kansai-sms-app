/* 動作テスト用の仮のサーバー。名前・電話番号はすべて架空 (乱数で作っている)。本番のデータは一切入っていない */
(function(){
  var seed=42;function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}
  function pick(a){return a[Math.floor(rnd()*a.length)]}
  var NOW=Date.now();
  var OPS=[["t-sugimoto@kikari.co.jp","杉本卓也"],["a-yokoyama@kikari.co.jp","横山渥士"],["k-ishihara@kikari.co.jp","石原謙"],["k-suganuma@kikari.co.jp","菅沼光輝"]];
  var PREF=[["大阪府",["大阪市北区","大阪市東淀川区","堺市堺区","豊中市","吹田市"],34.70,135.50],["兵庫県",["神戸市中央区","尼崎市","西宮市"],34.70,135.19],["京都府",["京都市伏見区","京田辺市","宇治市"],34.93,135.76],["奈良県",["奈良市","北葛城郡王寺町"],34.68,135.80]];
  var SEI=["佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤","吉田","山田","前田","藤田"],MEI=["美咲","陽子","恵","直子","真由美","翔","健太","優子","智子","里奈"];
  var apps=[],resp=[];
  for(var i=0;i<420;i++){
    var p=pick(PREF),daysAgo=i<40?Math.floor(rnd()*14):(i<160?14+Math.floor(rnd()*120):130+Math.floor(rnd()*800));
    var applied=new Date(NOW-daysAgo*864e5-Math.floor(rnd()*8e7)).toISOString();
    var sent=rnd()<(i<40?0.35:0.45),sentDays=sent?Math.floor(rnd()*Math.min(daysAgo+1,25)):null;
    var op=pick(OPS),co=i%7===3?"旧ネメシス":(i%11===5?"ラブキャリア":"ファーストスタッフィング");
    var id="A"+String(100000+i);
    var a={applicant_id:id,area:"kansai",name:pick(SEI)+pick(MEI),surname:"",birth_date:(1960+Math.floor(rnd()*42))+"-0"+(1+Math.floor(rnd()*9))+"-15",prefecture:p[0],municipality:pick(p[1]),nearest_station:"",lat:p[2]+(rnd()-.5)*.2,lon:p[3]+(rnd()-.5)*.2,job_type:rnd()<.7?"kaigo":"kango",qualifications:"",experience_years:Math.floor(rnd()*15),desired_days_per_week:"",desired_time_slots:"",source_company:co,applied_at:applied,csv_status:pick(["未対応","未対応","未対応","接触待ち","面談設定","不通"]),app_status:"",sms_sent:sent,sms_last_sent_at:sent?new Date(NOW-sentDays*864e5-3e6).toISOString():"",mail_optout:rnd()<.02,is_active_target:true,desired_start_date:"",last_contact_at:sent?new Date(NOW-sentDays*864e5).toISOString():"",next_contact_date:"",has_fs_history:co==="ファーストスタッフィング",has_past_fs:co==="ファーストスタッフィング",is_test:false,phone:"090"+String(10000000+i)};
    if(sent)a.activity={last_actor_name:op[1],last_type:"sms_sent",last_at:a.sms_last_sent_at,last_send:{sender_email:op[0],sender_name:op[1],actor_name:op[1],at:a.sms_last_sent_at,channel:"sms",delivery_id:""},open_response_status:"",in_progress_by:"",brake:{level:"none"}};
    apps.push(a);
    if(sent&&rnd()<(op[1]==="杉本卓也"?0.28:0.12)){
      var st=pick(["unhandled","in_progress","handled"]);
      resp.push({response_id:"R"+i,delivery_id:"",applicant_id:id,applicant_name:a.name,sender_email:op[0],sender_unknown:false,source_channel:pick(["sms","sms","generic_url"]),intent:pick(["詳細希望","見学希望","別案件希望"]),experience:"",free_text:"",status:st,handled:st==="handled",created_at:new Date(Date.parse(a.sms_last_sent_at)+Math.floor(rnd()*2*864e5)).toISOString(),phone_consult_datetime:"",has_phone_consult:false,phone_priority:5});
      if(st!=="handled"&&a.activity)a.activity.open_response_status=st;
    }
  }
  apps.push({applicant_id:"A000001",area:"kansai",name:"T_テスト 太郎",prefecture:"大阪府",municipality:"大阪市北区",job_type:"kaigo",source_company:"ファーストスタッフィング",applied_at:new Date(NOW-864e5).toISOString(),csv_status:"未対応",sms_sent:false,is_test:true,has_fs_history:true,phone:"09000000000"});
  apps.sort(function(x,y){return x.applied_at<y.applied_at?1:-1});
  window.__mockApps=apps;window.__mockResp=resp;window.__sentReqs=[];
  function filt(f){f=f||{};return apps.filter(function(a){
    if(f.area&&a.area!==f.area)return false;if(!f.include_test&&a.is_test)return false;
    if(f.prefecture&&a.prefecture!==f.prefecture)return false;
    if(f.sms_state==="sent"&&!a.sms_sent)return false;if(f.sms_state==="unsent"&&a.sms_sent)return false;
    if(f.has_fs_history&&!a.has_fs_history)return false;
    if(f.keyword&&a.name.indexOf(f.keyword)<0)return false;
    if(f.source_companies&&f.source_companies.length&&f.source_companies.indexOf(a.source_company)<0)return false;
    return true})}
  function summ(area){var m=filt({area:area});var o={area:area,total:m.length,sent:0,unsent:0,sms_target:m.length,fs_history:0,area_unset:0,pref_counts:{},csv_status_counts:{},company_counts:{},muni_by_pref:{}};
    m.forEach(function(r){if(r.sms_sent)o.sent++;else o.unsent++;if(r.has_fs_history)o.fs_history++;o.pref_counts[r.prefecture]=(o.pref_counts[r.prefecture]||0)+1;o.csv_status_counts[r.csv_status]=(o.csv_status_counts[r.csv_status]||0)+1;o.company_counts[r.source_company]=(o.company_counts[r.source_company]||0)+1;var mb=o.muni_by_pref[r.prefecture]||(o.muni_by_pref[r.prefecture]={});mb[r.municipality]=(mb[r.municipality]||0)+1});return o}
  window.__mock=function(req){
    switch(req.action){
      case "ping":return {pong:true,time:new Date().toISOString(),activeUserEmail:"t-sugimoto@kikari.co.jp",schema:null};
      case "getOperators":return {operators:OPS.map(function(o){return {email:o[0],display_name:o[1],role:"admin",reply_to:o[0],can_send:true,auto_calendar:false,signature:"",is_placeholder:false}}),my_email:"t-sugimoto@kikari.co.jp"};
      case "getTemplates":return {templates:[]};
      case "getApplicantSummary":var s=summ(req.area||"kansai");s.areas={kansai:summ("kansai"),kanto:summ("kanto")};return s;
      case "searchApplicants":var m=filt(req.filter),pg=req.page||1,ps=req.page_size||50;return {total:m.length,page:pg,page_size:ps,items:m.slice((pg-1)*ps,pg*ps)};
      case "getApplicant":var a=apps.filter(function(x){return x.applicant_id===req.applicant_id})[0];return a||{};
      case "getResponses":var lim=req.limit||200,off=req.offset||0;var rows=resp.filter(function(r){return req.all_senders===true||!req.sender_email||r.sender_email===req.sender_email});if(req.all_senders!==true&&!req.sender_email)rows=resp.filter(function(r){return r.sender_email==="t-sugimoto@kikari.co.jp"});return {total:rows.length,unhandled_count:rows.filter(function(r){return r.status==="unhandled"}).length,open_count:rows.filter(function(r){return r.status!=="handled"}).length,summary:{unhandled_count:3,open_count:5},items:rows.slice(off,off+lim)};
      case "getResponseSummary":return {unhandled_count:3,open_count:5};
      case "markSmsSent":window.__sentReqs.push(req);var b=apps.filter(function(x){return x.applicant_id===req.applicant_id})[0];if(b){b.sms_sent=true;b.sms_last_sent_at=new Date().toISOString()}return {recorded:req.applicant_id,sms_last_sent_at:new Date().toISOString()};
      case "issueFormToken":return {token:"abcdefghij0123456789",url:"https://first-staffing.github.io/kansai-sms-app/f?t=abcdefghij0123456789",short_url:"https://first-staffing.github.io/kansai-sms-app/f?t=abcdefghij0123456789"};
      case "getCaseMaster":if(req.updated_since)return {cases:[],server_time:new Date().toISOString()};var cs=[];for(var k=0;k<1500;k++){var pp=PREF[k%4];cs.push({case_id:"C"+k,facility_name:"施設"+k,service_type:k%3?"特養":"有料",prefecture:pp[0],municipality:pp[1][k%pp[1].length],address:pp[0]+pp[1][k%pp[1].length]+"1-"+k,lat:pp[2]+(((k*37)%100)/100-.5)*.25,lon:pp[3]+(((k*53)%100)/100-.5)*.25,job_type:k%4?"kaigo":"kango",salary_text:"時給1500円",updated_at_src:new Date(NOW-((k*7)%200)*864e5).toISOString(),is_open:true,source_flags:"sms_app",updated_at:new Date(NOW).toISOString()})}return {cases:cs,server_time:new Date().toISOString(),snapshot:true};
      case "mailPreviewTargets":case "mailCreateDelivery":window.__mailReqs=(window.__mailReqs||[]);window.__mailReqs.push(req);var mf=req.filter||{};var mm=apps.filter(function(a){if(a.is_test)return false;if(mf.prefectures&&mf.prefectures.indexOf(a.prefecture)<0)return false;if(mf.has_fs_history&&!a.has_fs_history)return false;var ad=new Date(Date.parse(a.applied_at)+9*36e5).toISOString().slice(0,10);if(mf.applied_from&&ad<mf.applied_from)return false;if(mf.applied_to&&ad>mf.applied_to)return false;return true});var sendable=mm.filter(function(a,i){return i%5!==0});var tg=sendable.slice(0,req.top_n||700);return {matched_count:mm.length,sendable_count:sendable.length,target_count:tg.length,excluded:{no_email:mm.length-sendable.length},notes:{},top_n:req.top_n,recommend_count:req.recommend_count,mode:req.mode,preview:tg.slice(0,50).map(function(a){return {applicant_id:a.applicant_id,name:a.name,prefecture:a.prefecture,municipality:a.municipality,job_type:a.job_type,applied_at:a.applied_at,recommended:[],recommended_spare:[]}}),delivery_id:"D1",queued:tg.length};
      case "getCases":case "searchCases":return {items:[],total:0,cases:[]};
      default:return {};
    }
  };
})();
(function(){
  window.__acts=[];
  var f0=window.fetch;
  window.fetch=function(url,opt){
    try{
      if(String(url).indexOf('script.google.com')>=0){
        var req={};try{req=JSON.parse(opt&&opt.body||'{}')}catch(e){}
        window.__acts.push(req.action||JSON.stringify(req).slice(0,80));
        var d=(window.__mock&&window.__mock(req));
        if(d===undefined)d={};
        return new Promise(function(res){setTimeout(function(){res({ok:true,status:200,json:function(){return Promise.resolve({ok:true,data:d})}})},window.__delay||30)});
      }
      if(String(url).indexOf('workers.dev')>=0){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({ok:true})},text:function(){return Promise.resolve('')}})}
    }catch(e){}
    return f0.apply(this,arguments);
  };
})();
