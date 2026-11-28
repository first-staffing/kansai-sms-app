/* 8.0 (2026-11-28 ユーザー指示「12345」「入れた方がいいやつとか入れといて 軽さは維持で UXを徹底強化 バージョン8.0に」)
 このファイルは index.html の <script id="r800"> と同じ内容 (tools/build_r800.py で差し込む)。
 1. 反響の見える化   … #/stats 「反響」画面 (担当者別・応募からの日数別・文面別)
 2. 追いSMSの対象     … 送って3〜30日・反応なしの人を自動で数えて、ワンタップで一覧にする
 3. 送る順番のおすすめ … 応募が新しい人・近くに案件が多い人を上へ。送信済みの人は下へ
 4. 軽さ             … サーバーへの問い合わせは増やさない (名簿と回答は、すでに手元にあるものを使う)
 5. 使い勝手         … 一覧の上の絞り込みを折りたたむ／カードに「応募◯日前・近くに案件◯件・送信◯日前」／
                       ホームに「今日やること」／送信済みチェックが効かないことがある不具合の修正
 6. 今日のピックアップ … (2026-11-28 ユーザー指示「毎日150人くらいピックアップ」「smsは全部の登録元かつ京都奈良限定」
                       「5〜7個くらいピックアップで取得日が一番、2番目に距離」「配信してるしてない・応募日のこだわりない」
                       「gmailは今日の200人とかでボタン押したら送信」「杉本さんの分だけで150人」「この画面(ホーム)に出して」)
                       毎朝 (その日はじめて開いたとき)、京都・奈良の求職者と新しいBOを照らし合わせて、SMS 150人を選ぶ。
                       Gmailは京都・奈良の約200人ぶんの条件を入れてGmail送信の画面を開く (送るのは中身を確認してから)
 7. 起動を速く (8.0.1) … (2026-11-28 ユーザー指示「最高の高速もお願い」)
                       これまでは「接続確認 → その返事を待ってから名簿・回答・一覧を取りに行く」の順だった。
                       前回サーバーにつながっていた端末では、接続確認と同時に取りに行く (返事を1回ぶん待たない)。
                       名簿は1ページ目の返事を待たずに全ページを同時に取りに行く。同時に出ていた接続確認4回は1回にまとめる。
                       ※ 求職者のデータを端末に保存することはしない (これまでどおり、開いている間だけ持つ) */
(function(){try{
  var LSG=function(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}};
  var LSS=function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
  var esc8=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
  var DAY=864e5,JST=9*36e5;
  var jstDay=function(v){ /* 日付文字列 → 日本時間の日付 (YYYY-MM-DD)。分からなければ "" */
    var s=String(v||"");if(!s)return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    var t=Date.parse(s);if(!isFinite(t))return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):"";
    return new Date(t+JST).toISOString().slice(0,10);
  };
  var tdAt=0,tdStr="",tdNum=0;
  var tick=function(){var n=Date.now();if(n-tdAt>30000){tdAt=n;tdStr=new Date(n+JST).toISOString().slice(0,10);tdNum=Math.floor((n+JST)/DAY)}};
  var today=function(){tick();return tdStr};
  /* 日付文字列 → 通し日数。2,000人ぶんを毎回計算し直さないよう覚えておく */
  var dayMemo={},dayMemoN=0;
  var dayNum=function(v){
    var s=String(v||"");if(!s)return null;
    var m=dayMemo[s];if(m!==undefined)return m;
    var d=jstDay(s),n=d?Math.floor(Date.parse(d+"T00:00:00Z")/DAY):null;if(n!=null&&!isFinite(n))n=null;
    if(++dayMemoN>30000){dayMemo={};dayMemoN=0}
    dayMemo[s]=n;return n;
  };
  var daysSince=function(v){var n=dayNum(v);if(n==null)return null;tick();return tdNum-n};
  var ago=function(n){if(n==null)return "";if(n<=0)return "今日";if(n===1)return "昨日";if(n<60)return n+"日前";if(n<730)return Math.round(n/30)+"か月前";return Math.round(n/365)+"年前"};
  var rosterReady=function(){try{return typeof r616RosterReady_==="function"&&r616RosterReady_()}catch(e){return false}};
  var rosterItems=function(){try{if(rosterReady())return window._r616Roster.items}catch(e){}return null};
  /* 8.0.1 修正: 本番では、サーバーにつながる前の一瞬だけ、手元に見本の応募者 (サンプル) が入っている。
     その見本でピックアップや人数を計算して覚えてしまう不具合があったため、
     手元のデータを使うのは「サーバーの設定が無いとき (手元の試験用)」だけにする */
  var localMode=function(){try{if(window._r6ServerMode)return false;return !((typeof r611ServerExpected_==="function")?r611ServerExpected_():(typeof CONFIG!=="undefined"&&CONFIG.API_URL))}catch(e){return false}};
  var casesReady=function(){try{return typeof r617CasesReadyNow_!=="function"||r617CasesReadyNow_()}catch(e){return true}};
  var ver=0; /* 並び・件数の覚え直しの合図 */

  /* ---- 0. サーバーが返している「最後に送った日時・送った人」を捨てずに持つ ---- */
  try{
    var s2l0=serverApplicantToLocal;
    serverApplicantToLocal=function(it){
      var a=s2l0.apply(this,arguments);
      try{
        if(a&&it&&typeof it==="object"){
          var at=String(it.sms_last_sent_at||"");
          if(at){a.sms_last_sent_at=at;if(!a.last_sms_at){var d=jstDay(at);if(d)a.last_sms_at=d}}
          var act=it.activity;
          if(act&&typeof act==="object"){
            var ls=act.last_send;
            if(ls&&ls.at)a._ls={n:String(ls.sender_name||ls.actor_name||""),at:String(ls.at),ch:String(ls.channel||"")};
            if(act.open_response_status)a._orc=1;
          }
        }
      }catch(e){}
      return a;
    };
    if(window.__APP_LOGIC__)window.__APP_LOGIC__.serverApplicantToLocal=serverApplicantToLocal;
  }catch(e){}

  /* ---- 不具合の修正: 一覧の「送信後にチェック」を直接押しても記録されないことがあった
     (サーバーにつないでいる間、一覧の人が手元の配列に居らず、何も起きずに終わっていた) ---- */
  try{
    var mk0=markSms;
    markSms=function(id){
      try{
        if(!applicants.find(function(x){return x.id===id})){
          var a=(typeof r6161FindApplicant_==="function")?r6161FindApplicant_(id):null;
          if(a)applicants.push(a);
          else{try{showToast("応募者データが見つかりません。画面を更新してからもう一度お試しください","warn")}catch(e){}return}
        }
      }catch(e){}
      ver++;
      return mk0.apply(this,arguments);
    };
    if(window.__APP_LOGIC__&&window.__APP_LOGIC__.markSms)window.__APP_LOGIC__.markSms=markSms;
  }catch(e){}
  /* 自動で送信済みにしたときは、下の帯で知らせているので「記録しました」の案内は重ねない */
  try{
    var st0=showToast;
    showToast=function(m){if(window._r800Quiet&&/記録しました/.test(String(m||"")))return;return st0.apply(this,arguments)};
  }catch(e){}

  /* ---- 共通の判定 ---- */
  var respKey=null,respSet={};
  var allResp=null; /* 反響画面で読んだ全回答 (あれば) */
  var respIds=function(){
    var r=(typeof state!=="undefined"&&state&&state.responses)||[];
    var key=r.length+"|"+(allResp?allResp.length:0)+"|"+(r[0]&&r[0].id||"");
    if(key===respKey)return respSet;
    var m={};
    r.forEach(function(x){if(x&&x.applicant_id)m[x.applicant_id]=1});
    if(allResp)allResp.forEach(function(x){if(x&&x.applicant_id)m[x.applicant_id]=1});
    respKey=key;respSet=m;return m;
  };
  var stopCalc=function(a){
    try{if(a.is_test)return true;if(a.mail_optout===true)return true;
      if(statusStage(a.csv_status).terminal)return true;
      if(window.r656IsNg&&window.r656IsNg(a))return true;
      if(typeof isOptoutForSms==="function"&&isOptoutForSms(a))return true}catch(e){}
    return false;
  };
  var isStop=function(a){ /* 送らない人 (配信停止・終了・配信NG・テスト)。同じ人を何度も判定し直さないよう、状態が変わるまで覚えておく */
    if(!a)return true;
    var ng=0;try{ng=(window._r656Ng&&window._r656Ng.loaded)?1:0}catch(e){}
    var k=a.csv_status+"|"+a.app_status+"|"+a.mail_optout+"|"+ng,m=a._r8st;
    if(m&&m.k===k)return m.v;
    var v=stopCalc(a);try{a._r8st={k:k,v:v}}catch(e){}return v;
  };
  var lastSent=function(a){return a?(a.sms_last_sent_at||a.last_sms_at||(a.sms_sent?a.last_contact_at:"")||""):""};
  var FOLLOW_MIN=3,FOLLOW_MAX=30;
  var isFollow=function(a){ /* 追いSMSの対象: 送って3〜30日・回答なし・まだ先へ進んでいない人 */
    try{
      if(!a||!a.sms_sent||a._orc)return false;
      var d=daysSince(lastSent(a));if(d==null||d<FOLLOW_MIN||d>FOLLOW_MAX)return false;
      if(respIds()[a.id])return false;
      if(statusStage(a.csv_status).rank>10)return false;
      if(a.next_contact_date&&a.next_contact_date>today())return false; /* 保留中 */
      return !isStop(a);
    }catch(e){return false}
  };

  /* 近くの案件の数 (同じ職種・募集中・直近3か月・約10km以内)。案件7,000件でも一瞬で数えられるよう、ます目に分けて持つ */
  var grid=null,gridKey="",nearMemo={};
  var buildGrid=function(){
    var key="";try{key=CASES.length+"|"+(CASES[0]&&CASES[0].id)+"|"+(CASES[CASES.length-1]&&CASES[CASES.length-1].id)+"|"+today()}catch(e){return null}
    if(grid&&key===gridKey)return grid;
    var g={},lim=new Date(Date.now()+JST-92*DAY).toISOString().slice(0,10);
    try{
      CASES.forEach(function(c){
        if(!c||c.open===false||c.lat==null||c.lon==null)return;
        if(c.acquired&&String(c.acquired).slice(0,10)<lim)return;
        var k=c.job_type+"|"+Math.floor(c.lat*10)+"|"+Math.floor(c.lon*10);
        (g[k]||(g[k]=[])).push(c.lat,c.lon);
      });
    }catch(e){}
    grid=g;gridKey=key;nearMemo={};return g;
  };
  var nearCount=function(a){
    try{
      if(!a||a.lat==null||a.lon==null)return 0;
      var g=buildGrid();if(!g)return 0;
      var m=nearMemo[a.id];if(m!=null)return m;
      var la=Math.floor(a.lat*10),lo=Math.floor(a.lon*10),n=0,cosv=Math.cos(a.lat*Math.PI/180);
      for(var i=-1;i<=1;i++)for(var j=-1;j<=1;j++){
        var arr=g[a.job_type+"|"+(la+i)+"|"+(lo+j)];if(!arr)continue;
        for(var k=0;k<arr.length;k+=2){
          var dy=(arr[k]-a.lat)*111,dx=(arr[k+1]-a.lon)*111*cosv;
          if(dx*dx+dy*dy<=100){n++;if(n>=20)break}
        }
      }
      nearMemo[a.id]=n;return n;
    }catch(e){return 0}
  };
  var appliedOf=function(a){try{return appliedDay(a)}catch(e){return String(a&&a.applied_at||"").slice(0,10)}};
  var scoreOf=function(a){ /* 大きいほど先に送りたい人 */
    buildGrid();var k=gridKey+"|"+a.applied_at,m=a._r8sc;
    if(m&&m.k===k)return m.v;
    var d=daysSince(appliedOf(a));if(d==null)d=9999;
    var v=100/(1+Math.max(0,d)/7)+Math.min(nearCount(a),8)*4;
    try{a._r8sc={k:k,v:v}}catch(e){}return v;
  };
  var viewOf=function(){ /* いま効いている上のボタン。追いSMSの表示は「追客」タブのときだけ */
    try{var v=F.r8view||"";if(v==="follow"&&state.mode!=="follow")return "";if((v==="unsent"||v==="pick")&&state.mode!=="first")return "";return v}catch(e){return ""}
  };

  /* ---- 並び順と、上のボタン (すべて／まだ送っていない／追いSMSの対象) ---- */
  var sortMode=function(){return LSG("r800sort","smart")==="new"?"new":"smart"};
  var marked={}; /* この画面を開いている間に送信済みにした人 (並びを動かさない・一覧から急に消さない) */
  var listOn=function(){try{return state.mode==="first"||state.mode==="follow"}catch(e){return false}};
  var memo={base:null,key:"",out:null},seed={key:"",n:-1,ord:{}};
  var counts=null; /* {all,unsent,follow,full} */
  try{
    var f0=filtered;
    filtered=function(){
      var list=f0.apply(this,arguments);
      try{
        if(!listOn()||!Array.isArray(list))return list;
        respIds();
        var v=viewOf(),sm=sortMode(),key=v+"|"+sm+"|"+state.mode+"|"+ver+"|"+respKey;
        if(memo.base===list&&memo.key===key)return memo.out;
        /* 名簿から作った一覧 (すでに絞り込み済み) をもう一度通るときは、数え直さず、決めた順番に並べ直すだけにする */
        try{
          if(window._r6ServerMode&&seed.key===key&&seed.n===list.length&&window._r6ListCache&&applicants===window._r6ListCache.items&&rosterReady()){
            var ord=seed.ord,okAll=true;
            for(var q=0;q<list.length;q++){if(ord[list[q].id]==null){okAll=false;break}}
            if(okAll){var srt=list.slice().sort(function(x,y){return ord[x.id]-ord[y.id]});memo={base:list,key:key,out:srt};return srt}
          }
        }catch(e){}
        var c={all:list.length,unsent:0,follow:0,full:false},out=[];
        try{c.full=localMode()||(rosterReady()&&applicants===window._r616Roster.items)}catch(e){}
        for(var i=0;i<list.length;i++){
          var a=list[i],un=!a.sms_sent&&!isStop(a),fo=isFollow(a);
          if(un)c.unsent++;if(fo)c.follow++;
          if(v==="unsent"){if(un||(marked[a.id]&&!marked[a.id].follow))out.push(a)}
          else if(v==="follow"){if(fo||(marked[a.id]&&marked[a.id].follow))out.push(a)}
          else if(v!=="pick")out.push(a);
        }
        if(v==="pick"){ /* 今日のピックアップ: 選んだ順 (BOの取得日が新しい順 → 近い順) のまま並べる */
          var pk=pickToday(),byId={};
          for(var j=0;j<list.length;j++)byId[list[j].id]=list[j];
          if(pk)pk.sms.forEach(function(id){if(byId[id])out.push(byId[id])});
        }
        if(c.full)counts=c; /* 全員分を見ているときだけ、上のボタンの人数を更新する */
        if(v==="follow"){
          out.sort(function(x,y){var dx=daysSince(lastSent(x)),dy=daysSince(lastSent(y));if(dx==null)dx=999;if(dy==null)dy=999;return dx-dy||scoreOf(y)-scoreOf(x)});
        }else if(v==="pick"){
        }else if(sm==="smart"&&state.mode==="first"){
          var tier=function(a){if(a.sms_sent&&!marked[a.id])return 1;return isStop(a)?2:0};
          var dec=out.map(function(a,i){return {a:a,t:tier(a),s:scoreOf(a),i:i}});
          dec.sort(function(x,y){return x.t-y.t||y.s-x.s||x.i-y.i});
          out=dec.map(function(x){return x.a});
        }
        memo={base:list,key:key,out:out};
        if(c.full&&window._r6ServerMode){var om={};for(var z=0;z<out.length;z++)om[out[z].id]=z;seed={key:key,n:out.length,ord:om}}
        return out;
      }catch(e){return list}
    };
    if(window.__APP_LOGIC__&&window.__APP_LOGIC__.filtered)window.__APP_LOGIC__.filtered=filtered;
  }catch(e){}
  /* 名簿がまだ届いていない間 (サーバーから少しずつ取る間) も、送信済みかどうかはサーバー側で絞る */
  try{
    var sf0=serverFilterForList_;
    serverFilterForList_=function(){
      var f=sf0.apply(this,arguments);
      try{if(listOn()&&!F.sent){var v=viewOf();if(v==="unsent")f.sms_state="unsent";else if(v==="follow")f.sms_state="sent"}}catch(e){}
      return f;
    };
  }catch(e){}

  window.r800View=function(v){
    try{
      F.r8view=v||"";state.visible=20;marked={};ver++;
      if(v==="follow")state.mode="follow";else if(v==="unsent"||v==="pick")state.mode="first";
      if((location.hash||"").indexOf("#/list")!==0){location.hash="#/list";setTimeout(function(){try{route()}catch(e){}},0)}
      else{route();try{window.scrollTo(0,0)}catch(e){}}
    }catch(e){}
  };
  window.r800Sort=function(m){LSS("r800sort",m==="new"?"new":"smart");ver++;try{state.visible=20;route()}catch(e){}};
  window.r800Fold=function(){var open=!LSG("r800open",false);LSS("r800open",open);try{document.body.classList.toggle("r800fold",!open)}catch(e){}try{var b=document.getElementById("r800FoldBtn");if(b)b.setAttribute("aria-expanded",open?"true":"false")}catch(e){}};
  try{document.body.classList.toggle("r800fold",!LSG("r800open",false))}catch(e){}

  var activeFilters=function(){ /* いま効いている絞り込みの数 */
    var n=0;try{["pref","muni","job","sent","csv","preset","from","to","startFrom","startTo","furthest"].forEach(function(k){if(F[k])n++});if(F.companies&&F.companies.length)n++;if(F.fsOnly)n++}catch(e){}
    return n;
  };
  var num=function(n){return (n==null)?"":String(n).replace(/\B(?=(\d{3})+(?!\d))/g,",")};
  var decorateList=function(){
    try{
      var app=document.getElementById("app");if(!app)return;
      var on=(location.hash||"").indexOf("#/list")===0&&listOn();
      document.body.classList.toggle("r800list",on);
      if(!on)return;
      if(document.getElementById("r800Bar"))return;
      if(!localMode()&&!rosterReady())counts=null;
      var anchor=app.querySelector(".r618tabs")||app.querySelector("h2");if(!anchor)return;
      var v=viewOf(),c=counts||{};
      var chip=function(val,label,n,cls){return '<button type="button" class="r800chip'+(cls?" "+cls:"")+'" aria-pressed="'+(v===val)+'" onclick="r800View(\''+val+'\')">'+label+(n!=null?'<b>'+num(n)+'</b>':'')+'</button>'};
      var pk=null;try{pk=isOwner()?pickToday():null}catch(e){}
      var h='<div id="r800Bar" class="r800bar">'+
        (pk?'<button type="button" class="r800pickBtn" aria-pressed="'+(v==="pick")+'" onclick="r800View(\''+(v==="pick"?"":"pick")+'\')"><span>今日のピックアップ（京都・奈良）</span><b>'+num(pk.sms.length)+'<small>人</small></b><em>残り '+num(pickLeft(pk))+'人</em></button>':'')+
        '<div class="r800chips">'+
        chip("","すべて",c.all)+chip("unsent","まだ送っていない",c.unsent)+chip("follow","追いSMSの対象",c.follow,(c.follow?"hot":""))+'</div>';
      if(v==="pick"){
        h+='<p class="r800note">新しいBOの近くに住んでいる人を、BOの取得日が新しい順 → 距離が近い順に選んでいます（登録元は問いません・送信済みかどうかも問いません）。直近'+PICK.recentSmsDays+'日以内にSMSを送った人と、この'+PICK.restDays+'日間にピックアップした人は外しています。</p>';
        if(activeFilters())h+='<p class="r800note warn">ほかの絞り込み（エリア・会社など）が効いているため、一部の人だけを表示しています。</p>';
      }
      else if(v==="follow")h+='<p class="r800note">初回SMSを送って'+FOLLOW_MIN+'〜'+FOLLOW_MAX+'日たち、まだ回答がない人です。送ってからの日数が短い順に並べています。</p>';
      else if(state.mode==="first"){
        var sm=sortMode();
        h+='<div class="r800sort"><span>並び順</span><button type="button" aria-pressed="'+(sm==="smart")+'" onclick="r800Sort(\'smart\')">おすすめ順</button><button type="button" aria-pressed="'+(sm==="new")+'" onclick="r800Sort(\'new\')">応募が新しい順</button></div>';
        if(sm==="smart")h+='<p class="r800note">応募が新しい人・近くに案件が多い人が上、送信済みの人は下に並びます。</p>';
      }
      if(!localMode()&&!rosterReady()&&(v||sortMode()==="smart"))h+='<p class="r800note warn">全員分の名簿を読み込み中です。終わると、全員の中から並べ直します。</p>';
      var nf=activeFilters(),open=LSG("r800open",false);
      h+='<button type="button" id="r800FoldBtn" class="r800foldBtn" aria-expanded="'+(open?"true":"false")+'" onclick="r800Fold()"><span>エリア・条件で絞り込む'+(nf?'<em>'+nf+'件 指定中</em>':'')+'</span><i></i></button></div>';
      anchor.insertAdjacentHTML("afterend",h);
    }catch(e){}
  };

  /* カード: 応募からの日数・近くの案件数・送った日と人を1行で */
  try{
    var ch0=cardHtml;
    cardHtml=function(a){
      var h=ch0.apply(this,arguments);
      try{
        if(!a||!listOn()||typeof h!=="string")return h;
        var bits=[],d=daysSince(appliedOf(a));
        if(d!=null)bits.push('<span class="r800tag'+(d<=3?" hot":"")+'">応募 '+ago(d)+'</span>');
        var n=nearCount(a);if(n>0)bits.push('<span class="r800tag">近くに案件 '+(n>=20?"20件以上":n+"件")+'</span>');
        if(a.sms_sent){var sd=daysSince(lastSent(a));var who=(a._ls&&a._ls.n)?"・"+esc8(a._ls.n):"";if(sd!=null)bits.push('<span class="r800tag sent">送信 '+ago(sd)+who+'</span>')}
        if(respIds()[a.id])bits.push('<span class="r800tag ok">回答あり</span>');
        if(F.r8view==="pick"&&state.mode==="first"){
          var mc=matchCases(a);
          if(mc.length)bits.unshift('<span class="r800tag pick">新着BO '+esc8(mdOf(mc[0].acq))+'取得・'+(Math.round(mc[0].d*10)/10)+'km'+(mc.length>1?'（ほか'+(mc.length-1)+'件）':'')+'</span>');
        }
        /* 「最も進んだ状況」が応募の行と同じ内容のときは出さない (1行ぶん詰める) */
        try{var fs=a.furthest_status,la=a.latest_application;if(fs&&la&&fs.company===la.company&&(fs.status===a.csv_status||fs.status===statusStage(a.csv_status).label))h=h.replace(/<p class="keyline">最も進んだ状況：[^<]*<\/p>\s*/,"")}catch(e){}
        if(state.mode==="follow"){ /* 追客カード: 日時を読みやすく・数えられていない「0回」は出さない・呼び名をそろえる */
          h=h.replace(/最終SMS: (\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/,function(_,iso){var t=Date.parse(iso);if(!isFinite(t))return _;var d=new Date(t+JST);return "最終SMS: "+(d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+d.getUTCHours()+":"+("0"+d.getUTCMinutes()).slice(-2)});
          if(!(a.events&&a.events.length))h=h.replace(" ／ 記録回数: 0回","");
          h=h.split(">追客SMSを開く<").join(">追いSMSを開く<").split("追客SMSを開く</a>").join("追いSMSを開く</a>");
        }
        if(bits.length){
          var line='<p class="r800why">'+bits.join("")+'</p>';
          if(h.indexOf('<div class="flex r614main"')>=0)h=h.replace('<div class="flex r614main"',line+'<div class="flex r614main"');
          else h=h.replace(/(<p class="r616applied">[^<]*<\/p>)/,"$1"+line);
        }
      }catch(e){}
      return h;
    };
    if(window.__APP_LOGIC__&&window.__APP_LOGIC__.cardHtml)window.__APP_LOGIC__.cardHtml=cardHtml;
  }catch(e){}

  /* 追いSMSを開いたら、戻ったときに自動で記録する (初回SMSと同じ流れ)。
     一覧に電話番号が届いていない人は、その場で番号を取りに行ってから開く */
  try{
    document.addEventListener("click",function(ev){
      try{
        if(typeof state==="undefined"||state.mode!=="follow")return;
        var an=ev.target&&ev.target.closest?ev.target.closest('a[href^="sms:"]'):null;if(!an)return;
        var card=an.closest("article[data-anchor]");if(!card)return;
        var id=String(card.getAttribute("data-anchor")||"").replace(/^app:/,"");if(!id)return;
        var href=an.getAttribute("href")||"",info={follow:true,k:"follow",t:"追いSMS"};
        if(/^sms:\+?\d{9,}/.test(href)){if(window.r659Note)window.r659Note(id,info);return}
        ev.preventDefault();
        if(!(window._r6ServerMode&&typeof apiCall==="function")){try{showToast("電話番号が未登録のため、SMSを作成できません","warn")}catch(e){}return}
        if(an.getAttribute("data-r8busy"))return;an.setAttribute("data-r8busy","1");
        apiCall({action:"getApplicant",applicant_id:id}).then(function(res){
          an.removeAttribute("data-r8busy");
          var det=(res&&(res.applicant||res))||{},ph=String(det.phone||"").replace(/[^0-9+]/g,"");
          if(!/\d{9,}/.test(ph)){try{showToast("電話番号が未登録のため、SMSを作成できません","warn")}catch(e){}return}
          try{var a=r6161FindApplicant_(id);if(a)a.phone=String(det.phone||"")}catch(e){}
          var nh=href.replace(/^sms:[^&?;]*/,"sms:"+ph);an.setAttribute("href",nh);
          if(window.r659Note)window.r659Note(id,info);
          location.href=nh;
        },function(){an.removeAttribute("data-r8busy");try{showToast("電話番号を取得できませんでした。もう一度お試しください","warn")}catch(e){}});
      }catch(e){}
    },true);
  }catch(e){}

  /* ---- 送った文面の控え (この端末で送った分だけ。反響画面の「文面別」に使う) ---- */
  var LOGK="r800log";
  var hash=function(s){var h=0;s=String(s||"");for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return (h>>>0).toString(36)};
  var tplInfo=function(a){
    try{
      var st=r614FirstBody_(a);if(!st||!st.tpl)return null;
      var body=String(st.tpl.body||""),first="";
      /* 名乗りの行 (宛名の次の行) を見出しにする。文面を変えたら別の文面として数える */
      String(st.body||body).split("\n").some(function(l){l=l.trim();if(!l||/様$/.test(l))return false;first=l;return true});
      return {k:String(st.tpl.id||"")+"."+hash(body+"|"+first),t:(String(st.tpl.title||"初回SMS")+"｜"+first).slice(0,60)};
    }catch(e){return null}
  };
  var logSend=function(id,p){
    try{
      p=p||{};marked[id]={follow:!!p.follow};
      var log=LSG(LOGK,[]);if(!Array.isArray(log))log=[];
      log.push({id:String(id),at:Date.now(),k:String(p.k||"other"),t:String(p.t||"その他")});
      if(log.length>3000)log=log.slice(log.length-3000);
      LSS(LOGK,log);
    }catch(e){}
  };

  /* ---- 1. 反響の画面 (#/stats) ---- */
  var ST={days:LSG("r800days",30),loading:false,at:0,err:""};
  var loadAllResp=function(force){
    try{
      if(!window._r6ServerMode||typeof apiCall!=="function"||!CONFIG.API_URL)return;
      if(ST.loading||(!force&&allResp&&Date.now()-ST.at<5*60000))return;
      ST.loading=true;ST.err="";
      var items=[];
      var step=function(off){
        return apiCall({action:"getResponses",all_senders:true,sort:"recent",limit:500,offset:off}).then(function(res){
          var raw=(res&&Array.isArray(res.items))?res.items:[];
          raw.forEach(function(it){items.push({applicant_id:String(it.applicant_id||""),at:String(it.created_at||""),sender:String(it.sender_email||""),ch:String(it.source_channel||"")})});
          if(raw.length>=500&&off<4500)return step(off+500);
        });
      };
      step(0).then(function(){allResp=items;ST.at=Date.now();ST.loading=false;ver++;if(isStats())renderStats()},function(e){ST.loading=false;ST.err=String(e&&e.message||e);if(isStats())renderStats()});
    }catch(e){ST.loading=false}
  };
  var isStats=function(){return (location.hash||"").indexOf("#/stats")===0};
  var pct=function(a,b){return b?Math.round(a/b*1000)/10:0};
  var rowHtml=function(label,sent,rep,max){
    var p=pct(rep,sent),w=max?Math.max(2,Math.round(p/max*100)):0;
    return '<div class="r800row"><div class="r800rl"><b>'+esc8(label)+'</b><span>送信 '+num(sent)+'名 → 回答 '+num(rep)+'名'+(sent<10?'（少数・参考）':'')+'</span></div><div class="r800rr"><div class="r800track"><i style="width:'+(rep?w:0)+'%"></i></div><strong>'+(sent?p+"%":"—")+'</strong></div></div>';
  };
  var groupHtml=function(title,note,rows){
    if(!rows.length)return "";
    var max=0;rows.forEach(function(r){var p=pct(r.rep,r.sent);if(r.sent>=1&&p>max)max=p});
    return '<div class="card r800card"><h3>'+title+'</h3>'+(note?'<p class="small">'+note+'</p>':'')+rows.map(function(r){return rowHtml(r.label,r.sent,r.rep,max||1)}).join("")+'</div>';
  };
  window.r800Days=function(n){ST.days=n;LSS("r800days",n);renderStats()};
  var renderStats=function(){
    try{
      var app=document.getElementById("app");if(!app)return;
      var items=rosterItems();
      var head='<h2>SMSの反響</h2><div class="tabs r800tabs">'+[[7,"直近7日"],[30,"直近30日"],[0,"全期間"]].map(function(x){return '<button type="button" aria-pressed="'+(ST.days===x[0])+'" onclick="r800Days('+x[0]+')">'+x[1]+'</button>'}).join("")+'</div>';
      if(!items){
        var local=null;try{if(localMode())local=nonTestApplicants().filter(function(a){return a.area===state.area})}catch(e){}
        if(local)items=local;
        else{
          try{r616WarmRoster_(false)}catch(e){}
          app.innerHTML=head+'<div class="card"><p>全員分の名簿を読み込み中です…（数十秒かかることがあります）</p></div><p><a href="#/">← 目次へ</a></p>';
          clearTimeout(ST.poll);ST.poll=setTimeout(function(){if(isStats())renderStats()},1500);
          return;
        }
      }
      loadAllResp(false);
      var resp=respIds(),days=ST.days;
      var inP=function(d){return days===0||(d!=null&&d<days)};
      var tot={sent:0,rep:0},bySender={},byAge={},unknownDate=0,hasSender=false;
      var AGE=[["応募から3日以内に送信",0,3],["4〜30日",4,30],["31〜180日",31,180],["181日以上",181,1e9]];
      items.forEach(function(a){
        if(!a||!a.sms_sent||a.is_test)return;
        var at=lastSent(a),d=daysSince(at);
        if(d==null){unknownDate++;if(days!==0)return}
        else if(!inP(d))return;
        var r=resp[a.id]?1:0;tot.sent++;tot.rep+=r;
        var nm=(a._ls&&a._ls.n)||"";if(nm)hasSender=true;nm=nm||"担当者不明";
        var g=bySender[nm]||(bySender[nm]={label:nm,sent:0,rep:0});g.sent++;g.rep+=r;
        var ad=daysSince(appliedOf(a));
        if(ad!=null&&d!=null){var gap=Math.max(0,ad-d);for(var i=0;i<AGE.length;i++){if(gap>=AGE[i][1]&&gap<=AGE[i][2]){var b=byAge[i]||(byAge[i]={label:AGE[i][0],sent:0,rep:0});b.sent++;b.rep+=r;break}}}
      });
      var senders=Object.keys(bySender).map(function(k){return bySender[k]}).sort(function(x,y){return y.sent-x.sent});
      var ages=Object.keys(byAge).sort().map(function(k){return byAge[k]});
      /* 文面別: この端末の控え × 回答 */
      var log=LSG(LOGK,[]),byTpl={},since=days===0?0:Date.now()-days*DAY,lastOf={};
      if(Array.isArray(log))log.forEach(function(e){if(e&&e.id&&e.at>=since)lastOf[e.id+"|"+e.k]=e});
      var repAt={};(allResp||[]).forEach(function(x){var t=Date.parse(x.at);if(isFinite(t)&&(!repAt[x.applicant_id]||t>repAt[x.applicant_id]))repAt[x.applicant_id]=t});
      Object.keys(lastOf).forEach(function(k){var e=lastOf[k];var g=byTpl[e.k]||(byTpl[e.k]={label:e.t||e.k,sent:0,rep:0});g.sent++;
        var ok=allResp?(repAt[e.id]&&repAt[e.id]>=e.at-36e5):!!resp[e.id];if(ok)g.rep++});
      var tpls=Object.keys(byTpl).map(function(k){return byTpl[k]}).sort(function(x,y){return y.sent-x.sent});
      var h=head;
      h+='<div class="card r800card r800total"><div><span>送信</span><b>'+num(tot.sent)+'<small>名</small></b></div><div><span>回答あり</span><b>'+num(tot.rep)+'<small>名</small></b></div><div><span>反響率</span><b>'+(tot.sent?pct(tot.rep,tot.sent):"—")+'<small>'+(tot.sent?"%":"")+'</small></b></div></div>';
      if(!tot.sent)h+='<div class="card"><p>この期間に送信済みの人がいません。期間を「全期間」にすると、これまでの分を見られます。</p></div>';
      h+=groupHtml("担当者別",hasSender?"":"サーバーから「誰が送ったか」が届いていないため、担当者ごとに分けられていません。",senders);
      h+=groupHtml("応募してから送るまでの日数別","早く送った人ほど反響が高いかどうかを見られます。",ages);
      h+=tpls.length?groupHtml("文面別（この端末から送った分）","8.0以降にこの端末で送った分だけを数えています。名乗りや文面を変えると、別の行として出ます。",tpls)
        :'<div class="card r800card"><h3>文面別（この端末から送った分）</h3><p class="small">まだ記録がありません。8.0以降にこの端末でSMSを送ると、文面ごとの反響がここに出ます。</p></div>';
      h+='<p class="small r800foot">「回答あり」は、フォームなどで回答が1件でも届いた人です（SMSへの直接の返信や電話は含みません）。期間は最後にSMSを送った日で数えています。'+
        (unknownDate&&days===0?'送信日が分からない人が'+num(unknownDate)+'名いて、全期間にだけ含めています。':'')+
        (ST.loading?' 回答を読み込み中…':'')+(ST.err?' 回答の読み込みに失敗しました（'+esc8(ST.err)+'）。':'')+
        (allResp?'':' いまは未対応の回答と最近の対応済み100件までで数えています。')+'</p>'+
        '<p><button type="button" onclick="r800Reload()">最新にする</button>　<a href="#/">← 目次へ</a></p>';
      app.innerHTML=h;
    }catch(e){try{console.warn("r800 stats",e)}catch(_){}}
  };
  window.r800Reload=function(){try{loadAllResp(true);try{r616WarmRoster_(true)}catch(e){}renderStats()}catch(e){}};

  /* ---- ホーム: 今日やること + 反響への入口 ---- */
  var CNTK="r800cnt";
  var homeCounts=function(){ /* 一覧の上のボタンと同じ数え方。名簿が届く前は、前回の数を出しておく */
    var out={unsent:null,follow:null,stale:false};
    try{
      var items=rosterItems();
      if(!items&&localMode())items=nonTestApplicants().filter(function(a){return a.area===state.area});
      if(items){
        respIds();var u=0,f=0;
        items.forEach(function(a){if(!a||a.is_test)return;if(!a.sms_sent){if(!isStop(a))u++}else if(isFollow(a))f++});
        out.unsent=u;out.follow=f;
        if(window._r6ServerMode)LSS(CNTK,{area:state.area,unsent:u,follow:f,day:today()});
      }else{
        var c=LSG(CNTK,null);
        if(c&&c.area===state.area){out.unsent=c.unsent;out.follow=c.follow;out.stale=true}
      }
    }catch(e){}
    return out;
  };
  var homeTm=null,homeTries=0;
  var homeWatch=function(){ /* ホームを開いている間に名簿を先に読んでおく (一覧を開いたときに待たない)。名簿と案件がそろったら数字を出す */
    try{
      if(localMode()||(rosterReady()&&casesReady()))return;
      clearTimeout(homeTm);
      homeTm=setTimeout(function tick(){
        try{
          var h=location.hash||"";if(!(h===""||h==="#"||h==="#/"||h==="#/home"||h.indexOf("#/menu")===0))return;
          if(rosterReady()&&casesReady()){var el=document.querySelector(".r800home");if(el)el.outerHTML=todoHtml();var ep=document.querySelector(".r800pick");if(ep)ep.outerHTML=pickHtml();return}
          if(window._r6ServerMode&&!document.hidden&&homeTries%3===0){try{r616WarmRoster_(false)}catch(e){}}
          if(++homeTries<240)homeTm=setTimeout(tick,700);
        }catch(e){}
      },700);
    }catch(e){}
  };
  var todoHtml=function(){
    try{
      var hc=homeCounts(),open=null;
      try{var rs=window._r6RespSummary;if(rs&&typeof rs.unhandled_count==="number")open=rs.unhandled_count;else if(localMode())open=(state.responses||[]).filter(function(r){return r&&!r.handled}).length}catch(e){}
      var tile=function(label,n,unit,act,cls){return '<button type="button" class="r800todo'+(cls?" "+cls:"")+'" onclick="'+act+'"><span>'+label+'</span><b>'+(n==null?"…":num(n))+'<small>'+(n==null?"":unit)+'</small></b></button>'};
      return '<div class="r800home"><h2 class="r633h">今日やること</h2><div class="r800todos">'+
        tile("まだ送っていない",hc.unsent,"名","r800View('unsent')")+
        tile("追いSMSの対象",hc.follow,"名","r800View('follow')",hc.follow?"hot":"")+
        tile("回答の未対応",open,"件","location.hash='#/responses'",open?"hot":"")+'</div>'+
        (hc.stale?'<p class="r800note">人数は前回開いたときのものです。最新の名簿を読み込み中…</p>':'')+'</div>';
    }catch(e){return ""}
  };
  try{
    if(typeof r633Menu_==="function"){
      var menu0=r633Menu_;
      r633Menu_=function(){
        var h=menu0.apply(this,arguments);
        try{
          h=pickHtml()+todoHtml()+h;homeTries=0;homeWatch();
          h=h.replace('<a href="#/responses">回答一覧</a>','<a href="#/stats">反響を見る</a><a href="#/responses">回答一覧</a>');
        }catch(e){}
        return h;
      };
    }
  }catch(e){}

  /* ---- 6. 今日のピックアップ (京都・奈良) ---- */
  var PICK={prefs:["京都府","奈良県"],sms:150,mail:200,cases:7,radius:20,freshDays:92,restDays:7,recentSmsDays:3};
  var PICKK="r800pick2",MAILK="r800mail2";
  try{localStorage.removeItem("r800pick");localStorage.removeItem("r800mail")}catch(e){} /* 8.0 が見本データで覚えた分を捨てる */
  var mdOf=function(d){var m=/^\d{4}-(\d{2})-(\d{2})/.exec(String(d||""));return m?(Number(m[1])+"/"+Number(m[2])):""};
  var isOwner=function(){ /* 杉本さんの分だけ出す (ほかの担当者が同じ150人に重ねて送らないように) */
    try{
      var pr=window._pingResult,em=String((pr&&pr.activeUserEmail)||"").toLowerCase(),nm="";
      try{nm=pingUserName_(pr)||""}catch(e){}
      if(!nm&&localMode()){try{nm=currentOpName()||""}catch(e){}}
      return /杉本/.test(nm)||/^t-sugimoto@/.test(em);
    }catch(e){return false}
  };
  /* 案件を、職種ごと・約11kmのます目ごとに分けて持つ (近くの案件を一瞬で探すため) */
  var cgrid=null,cgridKey="",matchMemo={};
  var caseGrid=function(){
    buildGrid();
    if(cgrid&&cgridKey===gridKey)return cgrid;
    var g={},lim=new Date(Date.now()+JST-PICK.freshDays*DAY).toISOString().slice(0,10);
    try{
      CASES.forEach(function(c){
        if(!c||c.open===false||c.lat==null||c.lon==null||!c.acquired)return;
        var acq=String(c.acquired).slice(0,10);if(acq<lim)return;
        var k=c.job_type+"|"+Math.floor(c.lat*10)+"|"+Math.floor(c.lon*10);
        (g[k]||(g[k]=[])).push(c);
      });
    }catch(e){}
    cgrid=g;cgridKey=gridKey;matchMemo={};return g;
  };
  var matchCases=function(a){ /* その人に出す案件: 同じ職種・募集中・直近3か月・20km以内。BOの取得日が新しい順 → 近い順に最大7件 */
    try{
      if(!a||a.lat==null||a.lon==null)return [];
      var g=caseGrid(),m=matchMemo[a.id];if(m)return m;
      var la=Math.floor(a.lat*10),lo=Math.floor(a.lon*10),cosv=Math.cos(a.lat*Math.PI/180),out=[],r2=PICK.radius*PICK.radius;
      for(var i=-2;i<=2;i++)for(var j=-3;j<=3;j++){
        var arr=g[a.job_type+"|"+(la+i)+"|"+(lo+j)];if(!arr)continue;
        for(var k=0;k<arr.length;k++){
          var c=arr[k],dy=(c.lat-a.lat)*111,dx=(c.lon-a.lon)*111*cosv,d2=dx*dx+dy*dy;
          if(d2<=r2)out.push({id:c.id,acq:String(c.acquired).slice(0,10),d:Math.sqrt(d2)});
        }
      }
      out.sort(function(x,y){return x.acq<y.acq?1:(x.acq>y.acq?-1:x.d-y.d)});
      out=out.slice(0,PICK.cases);matchMemo[a.id]=out;return out;
    }catch(e){return []}
  };
  var pickMem=null;
  var pickToday=function(){ /* 今日の150人。その日はじめて計算したら、その日は同じ顔ぶれで固定する */
    try{
      var td=today();
      if(pickMem&&pickMem.day===td&&pickMem.area===state.area)return pickMem;
      var st=LSG(PICKK,null);
      if(st&&st.day===td&&st.area===state.area&&Array.isArray(st.sms)&&st.sms.length){pickMem=st;return st}
      var items=rosterItems();
      if(!items&&localMode())items=nonTestApplicants().filter(function(a){return a.area===state.area});
      if(!items)return null;
      if(!localMode()&&!casesReady())return null;
      var hist=(st&&Array.isArray(st.hist))?st.hist.slice():[];
      if(st&&st.day&&st.day!==td&&Array.isArray(st.sms))hist.push({day:st.day,ids:st.sms});
      hist=hist.filter(function(h){var n=daysSince(h.day);return n!=null&&n<PICK.restDays});
      var rest={};hist.forEach(function(h){(h.ids||[]).forEach(function(id){rest[id]=1})});
      var cand=[],noPos=0;
      items.forEach(function(a){
        if(!a||PICK.prefs.indexOf(a.prefecture)<0||isStop(a)||rest[a.id])return;
        if(a.sms_sent){var ds=daysSince(lastSent(a));if(ds!=null&&ds<PICK.recentSmsDays)return}
        if(a.lat==null||a.lon==null){noPos++;return}
        var m=matchCases(a);if(!m.length)return;
        cand.push({id:a.id,acq:m[0].acq,d:m[0].d});
      });
      cand.sort(function(x,y){return x.acq<y.acq?1:(x.acq>y.acq?-1:x.d-y.d)});
      var out={day:td,area:state.area,sms:cand.slice(0,PICK.sms).map(function(x){return x.id}),pool:cand.length,noPos:noPos,hist:hist};
      if(!out.sms.length)return out; /* 0人のときは保存しない (名簿や案件が届ききっていない可能性) */
      LSS(PICKK,out);pickMem=out;return out;
    }catch(e){return null}
  };
  var pickLeft=function(pk){ /* まだ今日SMSを送っていない人数 (この端末の控えで数える) */
    try{
      var done={},t0=Date.parse(today()+"T00:00:00+09:00"),log=LSG(LOGK,[]);
      if(Array.isArray(log))log.forEach(function(e){if(e&&e.at>=t0)done[e.id]=1});
      var n=0;pk.sms.forEach(function(id){if(!done[id])n++});return n;
    }catch(e){return pk.sms.length}
  };
  /* ピックアップした人のフォームには、同じ決め方 (取得日が新しい順 → 近い順) で選んだ案件を載せる */
  try{
    if(typeof r622FiveCases_==="function"){
      var five0=r622FiveCases_;
      r622FiveCases_=function(applicant){
        try{
          if(F.r8view==="pick"&&state.mode==="first"){
            var a=(typeof r619ApplicantFor_==="function"&&r619ApplicantFor_(applicant))||applicant;
            var m=matchCases(a);if(m.length>=5)return m.map(function(x){return x.id});
          }
        }catch(e){}
        return five0.apply(this,arguments);
      };
    }
  }catch(e){}

  /* Gmail: 京都・奈良のファーストスタッフィング登録者を、応募日の新しい方から約200人ずつ順番に送る。
     サーバーは「条件に合う人を応募日の新しい順に上からN人」で宛先を決めるので、毎日同じ人にならないよう、
     応募日の範囲を1日ごとにずらして渡す (最後まで行ったら最初に戻る)。送信そのものは、いつものGmail送信の画面で確認してから */
  var mailWindow=function(){
    try{
      var items=rosterItems();
      if(!items&&localMode())items=nonTestApplicants().filter(function(a){return a.area===state.area});
      if(!items)return null;
      var td=today(),st=LSG(MAILK,null)||{};
      if(st.day===td&&st.area===state.area&&st.from&&st.to)return st;
      var byDay={},days=[];
      items.forEach(function(a){
        if(!a||a.is_test||PICK.prefs.indexOf(a.prefecture)<0||a.mail_optout===true)return;
        var fs=false;try{fs=hasFsHistory(a)}catch(e){fs=!!a.has_fs_history}
        if(!fs)return;
        var d=jstDay(a.applied_at)||appliedOf(a);if(!d)return;
        if(!byDay[d]){byDay[d]=0;days.push(d)}byDay[d]++;
      });
      if(!days.length)return null;
      days.sort().reverse(); /* 新しい日から */
      var ratio=(st.ratio>0.2&&st.ratio<=1)?st.ratio:1; /* 条件に合う人のうち、実際に送れる人 (メールあり) の割合。前回の確認結果から覚える */
      var want=Math.ceil(PICK.mail/ratio),start=0;
      /* 前回の分を送っていれば「その続き」から、送っていなければ「前回と同じところ」から。最後まで行っていたら先頭に戻る */
      var anchor=(st.area===state.area)?(st.sent?st.next:st.to):"";
      if(anchor){for(var i=0;i<days.length;i++){if(days[i]<=anchor){start=i;break}}}
      var n=0,i2=start;
      while(i2<days.length&&n<want){n+=byDay[days[i2]];i2++}
      var out={day:td,area:state.area,to:days[start],from:days[i2-1],n:n,ratio:ratio,next:(i2<days.length?days[i2]:""),sent:false};
      LSS(MAILK,out);return out;
    }catch(e){return null}
  };
  window.r800Mail=function(){
    try{
      var w=mailWindow();if(!w){try{showToast("名簿を読み込み中です。少し待ってからもう一度押してください","warn")}catch(e){}return}
      if(MF.r8prevTop==null)MF.r8prevTop=MF.topN;
      MF.prefs=PICK.prefs.slice();MF.pref="";MF.muni="";MF.munis=[];MF.fsOnly=true;MF.topN=Math.max(w.n,1);
      MF.r8from=w.from;MF.r8to=w.to;
      window._mailTargets=null;window._mailSnapshot=null;
      location.hash="#/mail";
      setTimeout(function(){try{route()}catch(e){}
        setTimeout(function(){try{var b=[].slice.call(document.querySelectorAll("button")).filter(function(x){return (x.textContent||"").trim()==="対象を確認"})[0];if(b)b.click()}catch(e){}},400)},0);
    }catch(e){}
  };
  window.r800MailOff=function(){try{delete MF.r8from;delete MF.r8to;MF.topN=MF.r8prevTop||700;delete MF.r8prevTop;window._mailTargets=null;window._mailSnapshot=null;route()}catch(e){}};
  try{
    var mf0=mailFilterToServer;
    mailFilterToServer=function(mf){
      var f=mf0.apply(this,arguments);
      try{var m=mf||MF;if(m.r8from&&m.r8to){f.applied_from=m.r8from;f.applied_to=m.r8to}}catch(e){}
      return f;
    };
    var ms0=mailSnapshot;
    mailSnapshot=function(){var x=ms0.apply(this,arguments);try{if(MF.r8from||MF.r8to)x+="|r8:"+MF.r8from+"~"+MF.r8to}catch(e){}return x};
    var vm0=viewMail;
    viewMail=function(){
      var r=vm0.apply(this,arguments);
      try{
        if(MF.r8from&&MF.r8to&&!document.getElementById("r800MailNote")){
          var app=document.getElementById("app");
          if(app)app.insertAdjacentHTML("afterbegin",'<div id="r800MailNote" class="card r800mailNote"><b>今日のGmail（京都・奈良）</b><p>ファーストスタッフィング登録者のうち、応募日が '+esc8(MF.r8from)+' 〜 '+esc8(MF.r8to)+' の人が対象です（条件に合う人 '+num(MF.topN)+'人）。下の「対象を確認」で実際に送れる人数を確かめてから「一括送信」を押してください。明日は、この続きの人たちが対象になります。</p><button type="button" onclick="r800MailOff()">この条件を外す</button></div>');
        }
      }catch(e){}
      return r;
    };
    /* 確認結果から「送れる人の割合」を覚える／送信したら、次の日は続きから */
    var ap0=apiCall;
    apiCall=function(req){
      var p=ap0.apply(this,arguments);
      try{
        var f=req&&req.filter,st=LSG(MAILK,null);
        if(st&&f&&f.applied_from===st.from&&f.applied_to===st.to&&req.test!==true){
          if(req.action==="mailPreviewTargets")p.then(function(res){try{if(res&&res.matched_count>0&&typeof res.target_count==="number"){var s2=LSG(MAILK,null);if(s2){s2.ratio=Math.max(0.2,Math.min(1,res.target_count/res.matched_count));s2.target=res.target_count;LSS(MAILK,s2)}}}catch(e){}},function(){});
          if(req.action==="mailCreateDelivery")p.then(function(){try{var s3=LSG(MAILK,null);if(s3){s3.sent=true;LSS(MAILK,s3)}}catch(e){}},function(){});
        }
      }catch(e){}
      return p;
    };
    if(window.__APP_LOGIC__&&window.__APP_LOGIC__.apiCall)window.__APP_LOGIC__.apiCall=apiCall;
  }catch(e){}
  var pickHtml=function(){ /* ホームに出す「今日のピックアップ」 */
    try{
      if(!isOwner())return '<div class="r800pick" hidden></div>'; /* あとで差し替えられるよう、場所だけ置いておく */
      var pk=pickToday(),w=mailWindow();
      var sms=pk&&pk.sms.length?pk.sms.length:null,left=sms!=null?pickLeft(pk):null;
      var h='<div class="r800pick"><h2 class="r633h">今日のピックアップ<small>京都・奈良</small></h2><div class="r800todos">'+
        '<button type="button" class="r800todo pick" onclick="r800View(\'pick\')"><span>SMSを送る人</span><b>'+(sms==null?"…":num(sms))+'<small>'+(sms==null?"":"人")+'</small></b><em>'+(sms==null?"準備中":(left===0?"今日の分は完了":"残り "+num(left)+"人"))+'</em></button>'+
        '<button type="button" class="r800todo pick" onclick="r800Mail()"><span>Gmailを送る人</span><b>'+(w?(w.sent?"済":"約"+num(w.target||Math.round(w.n*w.ratio))):"…")+'<small>'+(w&&!w.sent?"人":"")+'</small></b><em>'+(w?(w.sent?"今日の分は送信済み":"確認して送信"):"準備中")+'</em></button></div>'+
        '<p class="r800note">'+(pk&&pk.sms.length?'新しいBOの近くの人を、BOの取得日が新しい順 → 近い順に選びました（1人につき案件は最大'+PICK.cases+'件）。':(pk?'今日は条件に合う人が見つかりませんでした。':'名簿と案件を読み込み中です。読み込みが終わると自動で出ます。'))+'</p></div>';
      return h;
    }catch(e){return ""}
  };

  /* ---- 7. 起動を速く ---- */
  var SRVK="r800srv";
  try{
    /* 同時に出る同じ問い合わせを1回にまとめる処理は tools/r800early.js (通信の関数のすぐ後ろで読み込む) */
    /* 名簿が何ページあるかを覚えておく (次に開いたとき、全ページを同時に取りに行くため。人数とページ数だけで、中身は保存しない) */
    if(typeof r617FetchRosterPage_==="function"){
      var fp0=r617FetchRosterPage_;
      r617FetchRosterPage_=function(area,page,size){
        var p=fp0.apply(this,arguments);
        try{p.then(function(res){try{
          var n=(res&&Array.isArray(res.items))?res.items.length:0,tot=res&&res.total;
          if(page===1&&typeof tot==="number"&&n>0){var eff=(n<size&&tot>n)?n:size;LSS(SRVK,{on:1,roster:{area:area,size:eff,pages:Math.ceil(tot/eff)}})}
        }catch(e){}},function(){})}catch(e){}
        return p;
      };
    }
  }catch(e){}
  var warm=function(){ /* 前回つながっていた端末だけ。ここで出した問い合わせは、あとから来る同じ問い合わせにそのまま使われる (二重には出ない) */
    try{
      if(!CONFIG.API_URL||typeof apiCall!=="function")return;
      var h=location.hash||"";if(h.indexOf("#/form")===0||h.indexOf("#/optout")===0)return;
      var st=LSG(SRVK,null);if(!st||!st.on)return;
      var q=function(req){try{apiCall(req).then(null,function(){})}catch(e){}};
      var area=state.area,ps=1000;try{ps=R617_ROSTER.pageSize||1000}catch(e){}
      q({action:"getResponses",all_senders:true,handled:false,limit:200,offset:0});
      q({action:"getResponses",all_senders:true,handled:true,sort:"recent",limit:100});
      if(h.indexOf("#/list")===0){try{q({action:"searchApplicants",filter:serverFilterForList_(),page:1,page_size:50})}catch(e){}}
      q({action:"searchApplicants",filter:{area:area},page:1,page_size:ps});
      var rs=(st.roster&&st.roster.area===area)?st.roster:null;
      if(rs)for(var p=2;p<=Math.min(rs.pages,3);p++)q({action:"searchApplicants",filter:{area:area},page:p,page_size:rs.size});
    }catch(e){}
  };

  /* ---- 画面の切り替えに組み込む ----
     画面の切り替え (hashchange) は、いちばん元の route から「viewHome / viewList」を名前で呼ぶ作りなので、そちらに組み込む */
  var syncBody=function(){try{document.body.classList.toggle("r800list",(location.hash||"").indexOf("#/list")===0&&listOn())}catch(e){}};
  try{
    var vh0=viewHome;
    viewHome=function(){
      if(isStats()){syncBody();try{var bb=document.getElementById("bulkBar");if(bb)bb.style.display="none"}catch(e){}return renderStats()}
      return vh0.apply(this,arguments);
    };
    var vl0=viewList;
    viewList=function(){
      var r=vl0.apply(this,arguments);
      decorateList();
      return r;
    };
    window.addEventListener("hashchange",function(){setTimeout(syncBody,0)});
  }catch(e){}
  /* 一覧が別の経路で描き直されたとき (「さらに表示」など) も、上のボタンを保つ */
  try{
    var appEl=document.getElementById("app"),pend8=false;
    if(appEl&&window.MutationObserver){
      new MutationObserver(function(){if(pend8)return;pend8=true;setTimeout(function(){pend8=false;if(!document.getElementById("r800Bar"))decorateList()},60)}).observe(appEl,{childList:true});
    }
  }catch(e){}
  window.r800={logSend:logSend,tplInfo:tplInfo,isFollow:isFollow,nearCount:nearCount,scoreOf:scoreOf,counts:function(){return counts},renderStats:renderStats,pickToday:pickToday,matchCases:matchCases,mailWindow:mailWindow,isOwner:isOwner};
  try{warm()}catch(e){}
  try{route()}catch(e){} /* 上の組み込みを、いま出ている画面にも反映する */
}catch(e){try{console.warn("r800",e)}catch(_){}}})();
