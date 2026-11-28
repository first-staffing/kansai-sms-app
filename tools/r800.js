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
                       ※ 求職者のデータを端末に保存することはしない (これまでどおり、開いている間だけ持つ)
 8. ピックアップを待たせない (8.0.2) … (2026-11-28 ユーザー指示「長いかな読み込み？」「smsは150名リスト出しといて」)
                       関西全体は約7,800名 (名簿8ページ)。ピックアップは全員分の名簿がそろうまで待っていた。
                       京都・奈良の人だけを別に取りに行き、そろった時点でピックアップと150名の一覧を出す。
                       全員分の名簿は 4ページ同時に取りに行く (これまでは 2〜3ページずつ)
 9. 取り込みの直し (8.0.4) … (2026-11-28 ユーザー指示「京都府の後の住所ない」「これ治して」)
                       CSVに「市区町村」の列が無く、住所が1つの列 (全文) のとき、市区町村が空のまま入っていた。
                       住所から市区町村を読み取って入れる (関西5府県は国交省の位置表の市区町村名と照合。ほかは形で読む)。
                       時差つきの日時 (末尾が Z や +00:00) は日本時間に直してから取り込む
                       (8.0.5) refo.link の CSV は「住所(市区町村)」の列が空で、「緯度」「経度」の列がある。
                       ・緯度・経度は CSV の値を使う。無い人は住所から位置表で求める
                       ・住所の残り (address_rest) は、これまでと同じ形 (府県だけ外した形) のまま送る。
                         すでに入っている人は、サーバーが「空の市区町村は埋めない・違う住所は上書きする」作りなので、
                         切り詰めた住所を送ると、市区町村が空のまま住所だけ短くなって市区町村が分からなくなる。
                         サーバー側の入れ直し (tools/muni_fix_server.gs) が済んだら、切り詰めた形に切り替える */
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
  var sentNow={}; /* 開いている間に送信済みにした人 (あとから届いた名簿にも反映する) */

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
      try{if(arguments[1])sentNow[id]=1;else delete sentNow[id]}catch(e){}
      try{if(arguments[1]){var iso=new Date().toISOString(),td8=today();[applicants.find(function(x){return x.id===id}),(typeof r6161FindApplicant_==="function")?r6161FindApplicant_(id):null].forEach(function(p){if(p){p.sms_last_sent_at=iso;p.last_sms_at=td8}})}}catch(e){}
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
  var isRe=function(a){ /* 再登録: 前にSMSを送ったあとで、もう一度応募してきた人。「まだ送っていない」に出す */
    try{
      if(!a||!a.sms_sent)return false;
      var ds=daysSince(lastSent(a)),da=daysSince(appliedOf(a));
      return ds!=null&&da!=null&&da<ds;
    }catch(e){return false}
  };
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
  /* 既定は「応募が新しい順」(2026-11-28 ユーザー指示)。「おすすめ順」は押した人だけ */
  var sortMode=function(){return LSG("r800sort","new")==="smart"?"smart":"new"};
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
          var a=list[i],un=(!a.sms_sent||isRe(a))&&!isStop(a),fo=isFollow(a)&&!isRe(a);
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
      try{if(listOn()&&!F.sent){var v=viewOf();if(v==="unsent"){if(!rosterReady())f.sms_state="unsent"}else if(v==="follow")f.sms_state="sent"}}catch(e){}
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
        if(!localMode()&&!rosterReady()&&!(knReady()&&pk)){h+='<p class="r800note warn">京都・奈良の名簿と案件を読み込み中です。終わると自動で150人が並びます。</p>';knLoad();clearTimeout(decorateList._tm);decorateList._tm=setTimeout(function(){try{if((location.hash||"").indexOf("#/list")===0&&F.r8view==="pick"&&!rosterReady())route()}catch(e){}},1500)}
      }
      else if(v==="follow")h+='<p class="r800note">初回SMSを送って'+FOLLOW_MIN+'〜'+FOLLOW_MAX+'日たち、まだ回答がない人です。送ってからの日数が短い順に並べています。</p>';
      else if(state.mode==="first"){
        var sm=sortMode();
        h+='<div class="r800sort"><span>並び順</span><button type="button" aria-pressed="'+(sm==="new")+'" onclick="r800Sort(\'new\')">応募が新しい順</button><button type="button" aria-pressed="'+(sm==="smart")+'" onclick="r800Sort(\'smart\')">おすすめ順</button></div>';
        if(sm==="smart")h+='<p class="r800note">応募が新しい人・近くに案件が多い人が上、送信済みの人は下に並びます。</p>';
      }
      if(!localMode()&&!rosterReady()&&v!=="pick"&&(v||sortMode()==="smart"))h+='<p class="r800note warn">全員分の名簿を読み込み中です。終わると、全員の中から並べ直します。</p>';
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
        if(isRe(a))bits.unshift('<span class="r800tag hot">再登録（前回の送信より後に応募）</span>');
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

  /* ---- 7. 反響一覧 (#/hankyo): 回答が来た人を新しい順に並べ、その場で電話・対応状況の変更ができる ---- */
  var HK={tab:LSG("r800hkTab","open"),who:LSG("r800hkWho","all"),n:40,sync:0,busy:false,err:""};
  var isHankyo=function(){return (location.hash||"").indexOf("#/hankyo")===0};
  var hkAgo=function(v){
    var t=Date.parse(v);if(!isFinite(t))return "";
    var m=Math.floor((Date.now()-t)/60000);
    if(m<1)return "たった今";if(m<60)return m+"分前";
    var h=Math.floor(m/60);if(h<24)return h+"時間前";
    var d=Math.floor(h/24);if(d<31)return d+"日前";
    return String(v).slice(0,10);
  };
  var hkWhen=function(v){
    try{var d=new Date(v);if(isNaN(d.getTime()))return "";var f=function(n){return (n<10?"0":"")+n};return (d.getMonth()+1)+"/"+d.getDate()+" "+f(d.getHours())+":"+f(d.getMinutes())}catch(e){return ""}
  };
  var hkSt=function(r){try{return respStatus(r)}catch(e){return r&&r.handled?"handled":"unhandled"}};
  var hkMine=function(r){
    try{var em=currentOpEmail(),nm=currentOpName();return (!!em&&r.sender===em)||(!!nm&&r.sender_name===nm)}catch(e){return false}
  };
  var hkPerson=function(id){
    var a=null;
    try{a=(typeof r6161FindApplicant_==="function")?r6161FindApplicant_(id):null}catch(e){}
    if(!a){try{a=applicants.find(function(x){return x.id===id})||null}catch(e){}}
    return a;
  };
  var hkCaseName=function(id){
    try{var c=(typeof CASES!=="undefined"?CASES:[]).find(function(x){return String(x.id)===String(id)});if(c)return String(c.facility||c.facility_name||c.title||c.name||id)+(c.municipality?"（"+c.municipality+"）":"")}catch(e){}
    return String(id);
  };
  var hkPhoneWish=function(r){
    var out=[];
    try{
      if(r.phone_anytime)out.push("いつでも");
      if(r.phone_dates&&r.phone_dates.length)out.push(r.phone_dates.map(hkDateLabel).join("・"));
      var bs=hkBands(r);if(bs.length)out.push(bs.join("・"));
      if(!out.length&&r.phone_consult)out.push(r.phone_consult);
      if(!out.length&&r.phone_date_hint)out.push(r.phone_date_hint);
    }catch(e){}
    return out.join(" ／ ");
  };
  var hkSync=function(force){
    try{
      if(!CONFIG.API_URL||typeof syncResponsesFromServer!=="function"||HK.busy)return;
      /* サーバーにつながる前に読むと、端末に残っている見本の回答と混ざる。つながってから読む */
      if(!window._r6ServerMode){clearTimeout(HK.wait);HK.wait=setTimeout(function(){if(isHankyo())renderHankyo()},700);return}
      if(!force&&HK.ok&&Date.now()-HK.sync<45000)return;
      HK.busy=true;HK.err="";HK.sync=Date.now();
      var fin=function(res){HK.busy=false;if(res&&res.ok)HK.ok=true;else HK.err="反響を読み込めませんでした。「更新」を押してください";if(isHankyo())renderHankyo(true)};
      syncResponsesFromServer().then(fin,function(){fin(null)});
    }catch(e){HK.busy=false}
  };
  window.r800HkTab=function(t){HK.tab=t;HK.n=40;LSS("r800hkTab",t);renderHankyo(true)};
  window.r800HkWho=function(w){HK.who=w;HK.n=40;LSS("r800hkWho",w);renderHankyo(true)};
  window.r800HkMore=function(){HK.n+=40;renderHankyo(true)};
  window.r800HkReload=function(){hkSync(true);renderHankyo(true)};
  window.r800HkSet=function(id,st){try{setResponseStatus(id,st)}catch(e){}};
  window.r800HkOpen=function(id){
    try{
      if(!applicants.find(function(x){return x.id===id})){var a=hkPerson(id);if(a)applicants.push(a)}
      if(!applicants.find(function(x){return x.id===id})){try{showToast("応募者データを読み込み中です。少し待ってからもう一度お試しください","warn")}catch(e){}try{r616WarmRoster_(false)}catch(e){}return}
      openDetail(id);
    }catch(e){}
  };
  var HKBAND={morning:"午前（9〜12時）",daytime:"昼（12〜15時）",evening:"夕方（15〜18時）",night:"夜（18〜21時）"};
  var hkBands=function(r){try{return (r.phone_bands||[]).map(function(b){return HKBAND[b]||String(b)}).filter(Boolean)}catch(e){return []}};
  var hkDateLabel=function(v){
    var m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v||""));if(!m)return String(v||"");
    var d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    return Number(m[2])+"/"+Number(m[3])+"（"+"日月火水木金土".charAt(d.getDay())+"）";
  };
  var hkNextDate=function(r){ /* 電話の希望日のうち、今日以降でいちばん近い日 */
    try{var td=today();var ds=(r.phone_dates||[]).map(function(x){return String(x).slice(0,10)}).filter(function(x){return /^\d{4}-\d{2}-\d{2}$/.test(x)&&x>=td}).sort();return ds[0]||""}catch(e){return ""}
  };
  var HKH={morning:[9,12],daytime:[12,15],evening:[15,18],night:[18,21]};
  /* 電話の約束: {s,e,day,late,today}。今日以降の希望日があればいちばん近い日、過ぎた日しか無ければいちばん新しい日 */
  var hkDue=function(r){
    try{
      var ds=(r.phone_dates||[]).map(function(x){return String(x).slice(0,10)}).filter(function(x){return /^\d{4}-\d{2}-\d{2}$/.test(x)}).sort();
      var bs=(r.phone_bands||[]).filter(function(b){return HKH[b]});
      if(!ds.length)return null; /* 日にちの指定が無い人は、約束としては扱わない */
      var td=today(),up=ds.filter(function(x){return x>=td})[0],day=up||ds[ds.length-1];
      var sh=9,eh=21;if(bs.length){sh=24;eh=0;bs.forEach(function(b){sh=Math.min(sh,HKH[b][0]);eh=Math.max(eh,HKH[b][1])})}
      var p=day.split("-"),s=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),sh).getTime(),e=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]),eh).getTime();
      return {s:s,e:e,day:day,late:Date.now()>e,today:day===td,label:hkDateLabel(day)+(bs.length?" "+bs.map(function(b){return HKBAND[b]}).join("・"):"")};
    }catch(e){return null}
  };
  var hkRank=function(r){ /* 並び順: 約束の時間を過ぎた人 → 今日の約束 → 約束なし (新しい順) → 明日以降の約束 */
    if(hkSt(r)==="handled")return [2,0];
    var d=hkDue(r);
    if(!d)return [2,0];
    if(d.late)return [0,d.s];
    if(d.today)return [1,d.s];
    return [3,d.s];
  };
  var hkFacility=function(id){
    try{var c=(typeof CASES!=="undefined"?CASES:[]).find(function(x){return String(x.id)===String(id)});if(!c)return "";var p=null;try{p=publicCaseItem(c)}catch(e){}return String((p&&p.facility)||c.facility||"")}catch(e){return ""}
  };
  /* 反響の中身に合わせた文面: 選んだ案件へのお礼 + 電話の希望に合わせた予告 (希望が無ければ都合を聞く) */
  var hkSmsBody=function(a,r){
    r=r||{};
    var nm="";try{nm=smsRecipientName(a&&a.name)}catch(e){nm=String(a&&a.name||"")}
    var op="";try{op=String(currentOpName()||"").replace(/\s+/g,"")}catch(e){}
    var ids=(r.selected_case_ids&&r.selected_case_ids.length)?r.selected_case_ids:[],fac="";
    for(var i=0;i<ids.length&&!fac;i++)fac=hkFacility(ids[i]);
    var L=[];
    if(nm)L.push(nm+"様");
    L.push("株式会社ファーストスタッフィングの"+(op||"担当")+"です。");
    if(fac)L.push("「"+fac+"」"+(ids.length>1?"などの求人":"の求人")+"にご興味をお持ちいただき、ありがとうございます。");
    else if(r.intent==="見学希望")L.push("見学のご希望をいただき、ありがとうございます。");
    else L.push("ご回答いただき、ありがとうございます。");
    var d=hkNextDate(r),bands=hkBands(r),when=(d?hkDateLabel(d):"")+(bands.length?(d?"の":"")+bands.join("・"):"");
    var topic=r.intent==="見学希望"?"見学の日程について、":"お仕事の詳細について、";
    if(when)L.push(topic+"ご希望の"+when+"にお電話いたします。ご都合が変わりましたら、このSMSにご返信ください。");
    else if(r.phone_anytime)L.push(topic+"のちほどお電話いたします。ご都合の悪い時間帯がありましたら、このSMSにご返信ください。");
    else L.push(topic+"お電話でご案内したいので、ご都合の良い日時をこのSMSにご返信いただけますでしょうか。");
    return L.join("\n");
  };
  var hkPhone=function(id,el,done){ /* 電話番号が手元に無い人は、取りに行ってから進む */
    var a=hkPerson(id),ph=String(a&&a.phone||"").replace(/[^0-9+]/g,"");
    if(/\d{9,}/.test(ph))return done(ph,a);
    if(!(window._r6ServerMode&&typeof apiCall==="function")){try{showToast("電話番号が未登録です","warn")}catch(e){}return}
    if(el){if(el.getAttribute("data-r8busy"))return;el.setAttribute("data-r8busy","1")}
    apiCall({action:"getApplicant",applicant_id:id}).then(function(res){
      if(el)el.removeAttribute("data-r8busy");
      var det=(res&&(res.applicant||res))||{},p2=String(det.phone||"").replace(/[^0-9+]/g,"");
      if(!/\d{9,}/.test(p2)){try{showToast("電話番号が未登録です","warn")}catch(e){}return}
      var b=hkPerson(id);try{if(b)b.phone=String(det.phone||"")}catch(e){}
      done(p2,b||{name:det.name||""});
    },function(){if(el)el.removeAttribute("data-r8busy");try{showToast("電話番号を取得できませんでした。もう一度お試しください","warn")}catch(e){}});
  };
  /* 電話・SMSを押したら、未対応の人は「対応中」に移す (手を付けた人と、まだの人を分けて取りこぼさない) */
  var hkTouch=function(rid){
    try{
      if(!rid)return;
      setTimeout(function(){
        try{
          var r=(state.responses||[]).find(function(x){return x.id===rid});
          if(!r||hkSt(r)!=="unhandled")return;
          setResponseStatus(rid,"in_progress");
          try{showToast("「対応中」に移しました")}catch(e){}
        }catch(e){}
      },600);
    }catch(e){}
  };
  window.r800HkCall=function(id,el,rid){try{hkPhone(id,el,function(ph){location.href="tel:"+ph;hkTouch(rid)})}catch(e){}};
  window.r800HkSms=function(id,el,rid){
    try{
      var r=null;try{r=(state.responses||[]).find(function(x){return x.id===rid})||null}catch(e){}
      hkPhone(id,el,function(ph,a){
        var href=smsLink(ph,hkSmsBody(a,r));
        try{if(window.r659Note&&hkPerson(id))window.r659Note(id,{follow:true,k:"hankyo",t:"反響へのSMS"})}catch(e){}
        if(typeof r615NavigateSms_==="function")r615NavigateSms_(href);else location.href=href;
        hkTouch(rid);
      });
    }catch(e){}
  };
  var hkIdle=function(r){ /* 何日動いていないか: 対応中は「対応中にした日」から、未対応は「反響が来た日」から */
    try{var t=Date.parse((hkSt(r)==="in_progress"&&r.status_at)?r.status_at:r.at);return isFinite(t)?Math.floor((Date.now()-t)/DAY):0}catch(e){return 0}
  };
  var hkCard=function(r){
    var a=hkPerson(r.applicant_id),st=hkSt(r),id=esc8(r.id),aid=esc8(r.applicant_id);
    var nm=a&&a.name?String(a.name):(r.applicant_name||"");
    var age=null;try{age=a&&a.birth_date?ageOf(a.birth_date):null}catch(e){}
    var where=a?[a.prefecture||"",a.municipality||""].join(""):"";
    var jt=a&&a.job_type?String(a.job_type):"";jt=({kaigo:"介護",kango:"看護"})[jt]||jt;
    var sub=[age!=null?age+"歳":"",where,jt].filter(Boolean).join("・");
    var stLabel=st==="handled"?"対応済み":(st==="in_progress"?"対応中":"未対応");
    var who=st==="in_progress"&&r.status_by?"（"+r.status_by+"）":(st==="handled"&&r.handled_by?"（"+r.handled_by+"）":"");
    var ch="";try{ch=respChannelLabel(r)}catch(e){}
    var cases=(r.selected_case_ids&&r.selected_case_ids.length?r.selected_case_ids:(r.selected_cases||[])).slice(0,4).map(hkCaseName);
    var more=((r.selected_case_ids||[]).length>4)?" ほか"+((r.selected_case_ids||[]).length-4)+"件":"";
    var line=function(k,v){return v?'<div class="r800hkl"><span>'+k+'</span><b>'+esc8(v)+'</b></div>':""};
    var exp=[r.experience_band||r.experience||"",r.qualification||""].filter(Boolean).join("／");
    var due=st!=="handled"?hkDue(r):null,dueHtml="";
    if(due)dueHtml='<div class="r800hkd'+(due.late?" late":(due.today?" today":""))+'">'+(due.late?"電話の約束の時間を過ぎています：":(due.today?"今日電話する約束：":"電話の約束："))+esc8(due.label)+'</div>';
    var btn="";
    if(st!=="handled"){
      btn+='<button type="button" class="primary" onclick="r800HkCall(\''+aid+'\',this,\''+id+'\')">電話する</button>';
      btn+='<button type="button" class="primary" onclick="r800HkSms(\''+aid+'\',this,\''+id+'\')">SMSを送る</button>';
      if(st==="unhandled")btn+='<button type="button" onclick="r800HkSet(\''+id+'\',\'in_progress\')">対応中にする</button>';
      else btn+='<button type="button" onclick="r800HkSet(\''+id+'\',\'unhandled\')">未対応に戻す</button>';
      btn+='<button type="button" onclick="r800HkSet(\''+id+'\',\'handled\')">対応済みにする</button>';
    }else btn+='<button type="button" onclick="r800HkSet(\''+id+'\',\'unhandled\')">未対応に戻す</button>';
    btn+='<button type="button" onclick="r800HkOpen(\''+aid+'\')">詳細</button>';
    return '<article class="card r800hk st-'+st+'" data-resp="'+id+'">'+
      '<div class="r800hkh"><div><b class="r800hkn">'+esc8(nm||"（名前を読み込み中）")+(nm?" 様":"")+'</b>'+(sub?'<span class="r800hks">'+esc8(sub)+'</span>':'')+'</div>'+
      '<div class="r800hkt"><b>'+esc8(hkAgo(r.at))+'</b><span>'+esc8(hkWhen(r.at))+'</span></div></div>'+
      '<div class="r800hkb"><span class="badge '+(st==="unhandled"?"warn":"")+'">'+stLabel+esc8(who)+'</span>'+(st!=="handled"&&hkIdle(r)>=1?'<span class="badge r800hkold">'+hkIdle(r)+'日そのまま</span>':'')+(r.intent?'<span class="badge">'+esc8(r.intent)+'</span>':'')+(ch?'<span class="badge">'+esc8(ch)+'</span>':'')+(r.sender_name?'<span class="badge">送信: '+esc8(r.sender_name)+'</span>':'')+'</div>'+
      dueHtml+
      line("気になる案件",cases.join("、")+more)+
      line("電話の希望",hkPhoneWish(r))+
      line("見学の希望",r.tour)+line("面談の希望",r.interview)+line("入職できる日",r.start)+
      line("経験・資格",exp)+line("希望時給",r.desired_rate_band)+
      (r.free?'<p class="r800hkf">'+esc8(r.free)+'</p>':'')+
      '<div class="flex r800hka">'+btn+'</div></article>';
  };
  var renderHankyo=function(noSync){
    try{
      var app=document.getElementById("app");if(!app)return;
      if(!noSync)hkSync(false);
      if(window._r6ServerMode&&!rosterReady()){try{r616WarmRoster_(false)}catch(e){}clearTimeout(HK.poll);HK.poll=setTimeout(function(){if(isHankyo()&&rosterReady())renderHankyo(true)},2500)}
      var srv=false;try{srv=!localMode()}catch(e){}
      var ready=!srv||HK.ok; /* 本番では、サーバーから読めるまで何も出さない (見本の回答を本物のように見せない) */
      var all=ready?(state.responses||[]).filter(function(r){return r&&r.id}):[];
      var base=HK.who==="me"?all.filter(hkMine):all;
      var cnt={open:0,doing:0,done:0,all:base.length};
      base.forEach(function(r){var s=hkSt(r);if(s==="handled")cnt.done++;else if(s==="in_progress")cnt.doing++;else cnt.open++});
      var rows=base.filter(function(r){var s=hkSt(r);return HK.tab==="all"||(HK.tab==="open"&&s==="unhandled")||(HK.tab==="doing"&&s==="in_progress")||(HK.tab==="done"&&s==="handled")});
      var late=0,tdy=0,rk={};
      rows.forEach(function(r){var k=hkRank(r);rk[r.id]=k;if(k[0]===0)late++;else if(k[0]===1)tdy++});
      rows.sort(function(x,y){var a=rk[x.id],b=rk[y.id];if(a[0]!==b[0])return a[0]-b[0];if(a[0]!==2&&a[1]!==b[1])return a[1]-b[1];return String(y.at||"").localeCompare(String(x.at||""))});
      var tabs=[["open","未対応",cnt.open],["doing","対応中",cnt.doing],["done","対応済み",cnt.done],["all","すべて",cnt.all]];
      var h='<h2>反響一覧</h2>'+
        '<div class="tabs r800tabs">'+tabs.map(function(t){return '<button type="button" aria-pressed="'+(HK.tab===t[0])+'" onclick="r800HkTab(\''+t[0]+'\')">'+t[1]+' '+num(t[2])+'</button>'}).join("")+'</div>'+
        '<div class="r800hkw"><div class="tabs">'+[["all","全員の分"],["me","自分が送った分"]].map(function(t){return '<button type="button" aria-pressed="'+(HK.who===t[0])+'" onclick="r800HkWho(\''+t[0]+'\')">'+t[1]+'</button>'}).join("")+'</div>'+
        '<button type="button" class="r800hkr" onclick="r800HkReload()">'+(HK.busy?"読み込み中…":"更新")+'</button></div>'+
        (HK.err?'<p class="r800note">'+esc8(HK.err)+'</p>':'')+
        ((late||tdy)&&HK.tab!=="done"?'<p class="r800hkdue">電話の約束：'+(late?'<b class="late">時間を過ぎた人 '+late+'名</b>':'')+(late&&tdy?'／':'')+(tdy?'<b>今日 '+tdy+'名</b>':'')+'（上から順に並べています）</p>':'')+
        (HK.tab==="done"||HK.tab==="all"?'<p class="r800note">対応済みは最近の100件までを表示します。</p>':'');
      if(!rows.length)h+='<div class="card"><p>'+(!ready?(HK.err?"読み込めませんでした。":"読み込み中です…"):"該当する反響はありません。")+'</p></div>';
      else{
        h+=rows.slice(0,HK.n).map(hkCard).join("");
        if(rows.length>HK.n)h+='<p><button type="button" class="r800hkm" onclick="r800HkMore()">さらに表示（残り'+num(rows.length-HK.n)+'件）</button></p>';
      }
      h+='<p><a href="#/">← 目次へ</a></p>';
      var y=window.scrollY||0;app.innerHTML=h;if(noSync){try{window.scrollTo(0,y)}catch(e){}}
    }catch(e){try{console.warn("r800 hankyo",e)}catch(_){}}
  };

  /* ---- ホーム: 今日やること + 反響への入口 ---- */
  var CNTK="r800cnt";
  var homeCounts=function(){ /* 一覧の上のボタンと同じ数え方。名簿が届く前は、前回の数を出しておく */
    var out={unsent:null,follow:null,stale:false};
    try{
      var items=rosterItems();
      if(!items&&localMode())items=nonTestApplicants().filter(function(a){return a.area===state.area});
      if(items){
        respIds();var u=0,f=0;
        items.forEach(function(a){if(!a||a.is_test)return;if(!a.sms_sent||isRe(a)){if(!isStop(a))u++}else if(isFollow(a))f++});
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
          var ep=document.querySelector(".r800pick");
          if(ep&&!ep.getAttribute("data-ok")){var ph=pickHtml();if(ph.indexOf('data-ok="1"')>=0||(ep.hidden&&ph.indexOf("hidden")<0))ep.outerHTML=ph}
          if(rosterReady()&&casesReady()){var el=document.querySelector(".r800home");if(el)el.outerHTML=todoHtml();ep=document.querySelector(".r800pick");if(ep)ep.outerHTML=pickHtml();return}
          if(window._r6ServerMode&&!document.hidden&&homeTries%3===0){try{r616WarmRoster_(false)}catch(e){}}
          if(++homeTries<240)homeTm=setTimeout(tick,700);
        }catch(e){}
      },700);
    }catch(e){}
  };
  var stuckHtml8=function(){ /* 手を付けたまま止まっている反響・過ぎた電話の約束 (サーバーから読めた回答だけで数える) */
    try{
      var ok=localMode()||(window._r6ServerMode&&window._respSync&&window._respSync.ok);
      if(!ok)return "";
      var stuck=0,late=0;
      (state.responses||[]).forEach(function(r){if(!r||!r.id)return;var s=hkSt(r);if(s==="handled")return;if(s==="in_progress"&&hkIdle(r)>=2)stuck++;var d=hkDue(r);if(d&&d.late)late++});
      if(!stuck&&!late)return "";
      return '<button type="button" class="r800stuck" onclick="r800HkGo(\''+(late?"open":"doing")+'\')">'+(late?'<span>電話の約束を過ぎた反響 <b>'+late+'件</b></span>':'')+(stuck?'<span>対応中のまま2日以上 <b>'+stuck+'件</b></span>':'')+'<i>反響一覧で見る ›</i></button>';
    }catch(e){return ""}
  };
  window.r800HkGo=function(t){try{HK.tab=(t==="doing"?"doing":"open");HK.n=40;LSS("r800hkTab",HK.tab);location.hash="#/hankyo";setTimeout(function(){try{route()}catch(e){}},0)}catch(e){}};
  var todoHtml=function(){
    try{
      var hc=homeCounts(),open=null;
      try{var rs=window._r6RespSummary;if(rs&&typeof rs.open_count==="number")open=rs.open_count;else if(rs&&typeof rs.unhandled_count==="number")open=rs.unhandled_count;else if(localMode())open=(state.responses||[]).filter(function(r){return r&&!r.handled}).length}catch(e){}
      var tile=function(label,n,unit,act,cls){return '<button type="button" class="r800todo'+(cls?" "+cls:"")+'" onclick="'+act+'"><span>'+label+'</span><b>'+(n==null?"…":num(n))+'<small>'+(n==null?"":unit)+'</small></b></button>'};
      return '<div class="r800home"><h2 class="r633h">今日やること</h2><div class="r800todos">'+
        tile("まだ送っていない",hc.unsent,"名","r800View('unsent')")+
        tile("追いSMSの対象",hc.follow,"名","r800View('follow')",hc.follow?"hot":"")+
        tile("反響の未対応",open,"件","location.hash='#/hankyo'",open?"hot":"")+'</div>'+
        stuckHtml8()+
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
          h=h.replace('<a href="#/responses">回答一覧</a>','<a href="#/hankyo">反響一覧</a><a href="#/stats">反響の割合</a><a href="#/responses">回答一覧</a>');
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
  /* 京都・奈良の人だけの名簿。全員分 (約7,800名・8ページ) を待たずにピックアップを出すため、別に取りに行く。開いている間だけ持つ */
  var KN={items:null,loading:false,at:0,area:"",failAt:0};
  var knReady=function(){return !!(KN.items&&KN.area===state.area)};
  var srvPut=function(k,v){try{var st=LSG(SRVK,null)||{};st[k]=v;LSS(SRVK,st)}catch(e){}};
  var knDone=function(){ /* そろったら、いま出ている画面に反映する */
    try{
      var h=location.hash||"";
      if(h===""||h==="#"||h==="#/"||h==="#/home"||h.indexOf("#/menu")===0){var ep=document.querySelector(".r800pick");if(ep)ep.outerHTML=pickHtml()}
      else if(h.indexOf("#/list")===0&&F.r8view==="pick")route();
    }catch(e){}
  };
  var knLoad=function(){
    try{
      if(KN.loading||knReady()||rosterReady())return;
      if(typeof apiCall!=="function"||!CONFIG.API_URL||Date.now()-KN.failAt<20000)return;
      var area=state.area,ps=1000,st=LSG(SRVK,null)||{},memo=(st.kn&&st.kn.area===area&&st.kn.size===ps)?st.kn:null;
      KN.loading=true;
      var seen={},items=[],total=null;
      var get=function(p,size){
        return apiCall({action:"searchApplicants",filter:{area:area,prefectures:PICK.prefs.slice()},page:p,page_size:size}).then(function(res){
          var raw=(res&&Array.isArray(res.items))?res.items:[];
          if(res&&typeof res.total==="number")total=res.total;
          raw.forEach(function(it){var a=serverApplicantToLocal(it);if(a&&a.id&&!seen[a.id]){seen[a.id]=1;items.push(a)}});
          return raw.length;
        });
      };
      var early=[],first=get(1,ps);
      if(memo)for(var p=2;p<=Math.min(memo.pages,4);p++)early.push(get(p,ps)); /* 前回のページ数を覚えていれば、最初から同時に取りに行く */
      first.then(function(n){
        var size=(n>0&&n<ps&&total!=null&&total>n)?n:ps,pages=Math.min(60,Math.max(1,Math.ceil((total||0)/size)));
        var todo=[];for(var q=2+(size===ps?early.length:0);q<=pages;q++)todo.push(q);
        var batch=function(){if(!todo.length)return Promise.resolve();var b=todo.splice(0,4);return Promise.all(b.map(function(q){return get(q,size)})).then(batch)};
        return Promise.all(early).then(batch).then(function(){
          KN.loading=false;
          if(state.area!==area)return;
          if(total!=null&&items.length<total*0.98){KN.failAt=Date.now();return} /* 取りこぼしがあれば使わない (全員分の名簿を待つ) */
          KN.items=items;KN.area=area;KN.at=Date.now();
          srvPut("kn",{area:area,size:size,pages:pages});
          knDone();
        });
      }).then(null,function(){KN.loading=false;KN.failAt=Date.now()});
    }catch(e){KN.loading=false}
  };
  var pickSource=function(){ /* ピックアップの元にする名簿: 全員分があればそれ、無ければ京都・奈良だけの名簿 */
    var items=rosterItems();
    if(!items&&knReady())items=KN.items;
    if(!items&&localMode())items=nonTestApplicants().filter(function(a){return a.area===state.area});
    return items||null;
  };
  var pickSeedList=function(){ /* 全員分の名簿が届く前でも、150名の一覧を出せるようにする */
    try{
      if(!(F.r8view==="pick"&&state.mode==="first"&&window._r6ServerMode&&!rosterReady()&&knReady()))return;
      var pk=pickToday();if(!pk)return;
      var by={};KN.items.forEach(function(a){by[a.id]=a});
      var its=pk.sms.map(function(id){return by[id]}).filter(Boolean);
      var saved=applicants,out;applicants=its;
      try{out=filtered().slice()}finally{applicants=saved}
      window._r6ListCache={key:_r6ListKey(),items:out,total:out.length,loading:false,error:""};
    }catch(e){}
  };
  var syncedRoster=null;
  var syncSent=function(){ /* 全員分の名簿があとから届いたら、開いている間に送信済みにした人をそちらにも反映する */
    try{
      var R=window._r616Roster;if(!R||R===syncedRoster||!rosterReady())return;
      syncedRoster=R;
      if(!Object.keys(sentNow).length)return;
      R.items.forEach(function(a){if(sentNow[a.id]&&!a.sms_sent){a.sms_sent=true;a.last_sms_at=today();a.sms_last_sent_at=new Date().toISOString()}});
      ver++;
    }catch(e){}
  };
  var pickMem=null;
  var pickToday=function(){ /* 今日の150人。その日はじめて計算したら、その日は同じ顔ぶれで固定する */
    try{
      var td=today();
      if(pickMem&&pickMem.day===td&&pickMem.area===state.area)return pickMem;
      var st=LSG(PICKK,null);
      if(st&&st.day===td&&st.area===state.area&&Array.isArray(st.sms)&&st.sms.length){pickMem=st;return st}
      var items=pickSource();
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
      var items=pickSource();
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
      try{var so=LSG(SRVK,null)||{};if(!so.own&&!localMode())srvPut("own",1)}catch(e){}
      if(window._r6ServerMode&&!rosterReady()&&!knReady())knLoad();
      var pk=pickToday(),w=mailWindow();
      var sms=pk&&pk.sms.length?pk.sms.length:null,left=sms!=null?pickLeft(pk):null;
      var h='<div class="r800pick"'+(pk?' data-ok="1"':'')+'><h2 class="r633h">今日のピックアップ<small>京都・奈良</small></h2><div class="r800todos">'+
        '<button type="button" class="r800todo pick" onclick="r800View(\'pick\')"><span>SMSを送る人</span><b>'+(sms==null?"…":num(sms))+'<small>'+(sms==null?"":"人")+'</small></b><em>'+(sms==null?"準備中":(left===0?"今日の分は完了":"残り "+num(left)+"人"))+'</em></button>'+
        '<button type="button" class="r800todo pick" onclick="r800Mail()"><span>Gmailを送る人</span><b>'+(w?(w.sent?"済":"約"+num(w.target||Math.round(w.n*w.ratio))):"…")+'<small>'+(w&&!w.sent?"人":"")+'</small></b><em>'+(w?(w.sent?"今日の分は送信済み":"確認して送信"):"準備中")+'</em></button></div>'+
        '<p class="r800note">'+(pk&&pk.sms.length?'新しいBOの近くの人を、BOの取得日が新しい順 → 近い順に選びました（1人につき案件は最大'+PICK.cases+'件）。':(pk?'今日は条件に合う人が見つかりませんでした。':'京都・奈良の名簿と案件を読み込み中です。終わると自動で出ます。'))+'</p></div>';
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
          if(page===1&&typeof tot==="number"&&n>0){var eff=(n<size&&tot>n)?n:size;var st0=LSG(SRVK,null)||{};st0.on=1;st0.roster={area:area,size:eff,pages:Math.ceil(tot/eff)};LSS(SRVK,st0)}
        }catch(e){}},function(){})}catch(e){}
        return p;
      };
    }
  }catch(e){}
  try{if(typeof R617_ROSTER==="object"&&R617_ROSTER&&R617_ROSTER.conc<4)R617_ROSTER.conc=4}catch(e){} /* 名簿は4ページ同時に (約7,800名 = 8ページ) */
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
      if(rs)for(var p=2;p<=Math.min(rs.pages,4);p++)q({action:"searchApplicants",filter:{area:area},page:p,page_size:rs.size});
      if(st.own)knLoad(); /* ピックアップを使う人 (杉本さん) の端末だけ、京都・奈良の名簿も先に取りに行く */
    }catch(e){}
  };

  /* ---- 9. 取り込み: 住所から市区町村を読み取る・時差つきの日時を日本時間に直す ---- */
  var IMP_PREFS=[];try{IMP_PREFS=KANSAI.concat(KANTO)}catch(e){}
  var muniNames={};
  var muniMatch=function(pref,m){ /* m: 府県を除いた住所 (空白なし)。返り値 {name: 正式な市区町村名, used: 住所の先頭から何文字ぶんか} */
    try{
      var T=window._r639Towns,cities=T&&T[pref];
      if(cities){
        var names=muniNames[pref]||(muniNames[pref]=Object.keys(cities).sort(function(a,b){return b.length-a.length}));
        for(var i=0;i<names.length;i++){
          var n=names[i];if(m.indexOf(n)===0)return {name:n,used:n.length};
          var n2=n.replace(/^.+?郡/,"");if(n2!==n&&m.indexOf(n2)===0)return {name:n,used:n2.length}; /* 郡を省いて書いた住所 */
        }
      }
      /* 位置表に無い府県 (和歌山・関東) や、表に当たらなかった住所は、形で読む */
      var r=m.match(/^([^市]{1,5}郡[^市町村]{1,6}[町村])/)||m.match(/^([^市]{1,6}市[^市区町村]{1,5}区)/)||m.match(/^(.{1,7}?市)/)||m.match(/^(.{1,6}?区)/)||m.match(/^(.{1,7}?[町村])/);
      return r?{name:r[1],used:r[1].length}:null;
    }catch(e){return null}
  };
  var splitAddress=function(address,prefHint){ /* 住所 → {pref, muni, rest}。読み取れなければ null */
    try{
      var clean=String(address||"").normalize("NFKC").replace(/^\s*〒?\s*\d{3}-?\d{4}\s*/,"").trim();
      if(!clean)return null;
      var m=clean.replace(/[\s　]+/g,""),pref="",used=0;
      for(var i=0;i<IMP_PREFS.length;i++){if(m.indexOf(IMP_PREFS[i])===0){pref=IMP_PREFS[i];used=pref.length;break}}
      if(!pref){if(prefHint&&IMP_PREFS.indexOf(prefHint)>=0)pref=prefHint;else return null}
      var body=m.slice(used),dup=/^(.{1,5}郡)\1/.exec(body); /* 「泉北郡泉北郡忠岡町」のように郡が2回書かれた住所 */
      if(dup){body=body.slice(dup[1].length);used+=dup[1].length}
      var hit=muniMatch(pref,body);if(!hit||!hit.name)return null;
      used+=hit.used;
      /* 残り (町名・番地・建物名) は、元の空白を残したまま切り出す */
      var k=0,pos=0;for(;pos<clean.length&&k<used;pos++){if(!/[\s　]/.test(clean.charAt(pos)))k++}
      return {pref:pref,muni:hit.name,rest:clean.slice(pos).trim()};
    }catch(e){return null}
  };
  var tzToJst=function(v){ /* 「2026-11-24T04:36:00Z」のような時差つきの日時 → 日本時間の「2026-11-24 13:36」 */
    try{
      if(typeof v!=="string"||v.length<17||v.length>40)return v;
      var m=/^\s*(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})\s*$/i.exec(v);if(!m)return v;
      var off=0;if(!/^z$/i.test(m[7])){var o=/^([+-])(\d{2}):?(\d{2})$/.exec(m[7]);off=(o[1]==="-"?-1:1)*(Number(o[2])*60+Number(o[3]))}
      var t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))-off*60000+JST;if(!isFinite(t))return v;
      var d=new Date(t),p2=function(n){return ("0"+n).slice(-2)};
      return d.getUTCFullYear()+"-"+p2(d.getUTCMonth()+1)+"-"+p2(d.getUTCDate())+" "+p2(d.getUTCHours())+":"+p2(d.getUTCMinutes());
    }catch(e){return v}
  };
  var fixMapped=function(mapped){
    try{
      var n=0;
      (mapped||[]).forEach(function(o){
        if(!o||String(o.municipality||"").trim()||!o.address)return;
        var sp=splitAddress(o.address,String(o.prefecture||""));if(!sp)return;
        o.municipality=sp.muni;n++;
        /* 住所の残りは、これまでの取り込みと同じ形にしておく (府県の列があれば府県だけ外す。無ければ全文) */
        var raw=String(o.address),pf=String(o.prefecture||"");
        o._r8keep=(pf&&raw.indexOf(pf)===0)?raw.slice(pf.length):raw;
        if((o.lat==null||o.lat==="")&&typeof r639Geo_==="function"&&window._r639Towns){
          try{var g=r639Geo_(o.address,sp.pref,sp.muni);if(g&&isFinite(g.lat)&&isFinite(g.lon)){o.lat=Number(g.lat.toFixed(6));o.lon=Number(g.lon.toFixed(6))}}catch(e){}
        }
      });
      window._r800ImportFix={muni:n,at:Date.now()};
    }catch(e){}
    return mapped;
  };
  try{
    var wrapMap=function(fn){return function(rows){
      var args=Array.prototype.slice.call(arguments);
      try{if(Array.isArray(rows))args[0]=rows.map(function(r,i){return (i&&Array.isArray(r))?r.map(tzToJst):r})}catch(e){}
      var mapped=fn.apply(this,args);
      /* CSV の「緯度」「経度」の列をそのまま使う (日本の範囲に入っている値だけ) */
      try{
        var head=(rows[0]||[]).map(function(h){return String(h).replace(/^\uFEFF+/,"").trim()}),li=head.indexOf("緯度"),oi=head.indexOf("経度");
        if(li>=0&&oi>=0&&Array.isArray(mapped)&&mapped.length===rows.length-1){
          mapped.forEach(function(o,i){
            var r=rows[i+1]||[],la=Number(String(r[li]==null?"":r[li]).trim()),lo=Number(String(r[oi]==null?"":r[oi]).trim());
            if(o&&String(r[li]||"").trim()&&isFinite(la)&&isFinite(lo)&&la>20&&la<46&&lo>122&&lo<154){o.lat=Number(la.toFixed(6));o.lon=Number(lo.toFixed(6))}
          });
        }
      }catch(e){}
      return fixMapped(mapped);
    }};
    if(typeof mapRows==="function")mapRows=wrapMap(mapRows);
    if(typeof genericMapRows==="function")genericMapRows=wrapMap(genericMapRows);
    if(typeof importRowToServer==="function"){
      var irs0=importRowToServer;
      importRowToServer=function(r){
        var out=irs0.apply(this,arguments);
        try{if(r&&r._r8keep!=null&&out)out.address_rest=r._r8keep}catch(e){}
        return out;
      };
      if(window.__APP_LOGIC__&&window.__APP_LOGIC__.importRowToServer)window.__APP_LOGIC__.importRowToServer=importRowToServer;
    }
    /* 求職者詳細: 住所の残りに府県・市区町村が重ねて入っている人は、表示のときだけ重なりを外す (データは変えない) */
    var apD=apiCall;
    apiCall=function(req){
      var p=apD.apply(this,arguments);
      if(!req||req.action!=="getApplicant")return p;
      return p.then(function(res){
        try{
          var d=res&&(res.applicant||res);
          if(d&&typeof d.address_rest==="string"&&d.address_rest){
            var rest=d.address_rest.replace(/^\s+/,""),pf=String(d.prefecture||""),mu=String(d.municipality||"");
            if(pf&&rest.indexOf(pf)===0)rest=rest.slice(pf.length);
            if(mu){var mu2=mu.replace(/^.+?郡/,"");if(rest.indexOf(mu)===0)rest=rest.slice(mu.length);else if(mu2!==mu&&rest.indexOf(mu2)===0)rest=rest.slice(mu2.length)}
            d.address_rest=rest;
          }
        }catch(e){}
        return res;
      });
    };
    if(window.__APP_LOGIC__&&window.__APP_LOGIC__.apiCall)window.__APP_LOGIC__.apiCall=apiCall;
    /* 市区町村名の表 (国交省の位置表) を、取り込みの画面を開いた時点・確認を押した時点で読んでおく */
    var loadTowns=function(){try{return (typeof r639Load_==="function")?r639Load_():Promise.resolve(null)}catch(e){return Promise.resolve(null)}};
    if(typeof viewImport==="function"){var vi0=viewImport;viewImport=function(){try{loadTowns()}catch(e){}return vi0.apply(this,arguments)}}
    if(typeof previewImport==="function"){
      var pv0=previewImport;
      previewImport=function(){
        var self=this,args=arguments,go=function(){return pv0.apply(self,args)};
        if(window._r639Towns)return go();
        return Promise.race([loadTowns(),new Promise(function(r){setTimeout(r,6000)})]).then(go,go);
      };
    }
  }catch(e){}

  /* ---- 画面の切り替えに組み込む ----
     画面の切り替え (hashchange) は、いちばん元の route から「viewHome / viewList」を名前で呼ぶ作りなので、そちらに組み込む */
  var syncBody=function(){try{document.body.classList.toggle("r800list",(location.hash||"").indexOf("#/list")===0&&listOn())}catch(e){}};
  try{
    var vh0=viewHome;
    viewHome=function(){
      if(isStats()){syncBody();try{var bb=document.getElementById("bulkBar");if(bb)bb.style.display="none"}catch(e){}return renderStats()}
      if(isHankyo()){syncBody();try{var bh=document.getElementById("bulkBar");if(bh)bh.style.display="none"}catch(e){}return renderHankyo()}
      return vh0.apply(this,arguments);
    };
    var vl0=viewList;
    viewList=function(){
      syncSent();
      pickSeedList();
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
  /* 回答一覧・掘り起こしを直接開いたとき、サーバーにつながる前の見本データのまま残っていた。つながったら描き直す */
  try{
    var bw={k:"",n:0},bwKey=function(){var rs=window._respSync;return (window._r6ServerMode?"1":"0")+"|"+(rs&&rs.ok?rs.at:"")};
    bw.k=bwKey();
    var bwTm=setInterval(function(){
      try{
        if(++bw.n>240){clearInterval(bwTm);return}
        var k=bwKey();if(k===bw.k)return;bw.k=k;
        var h=location.hash||"";if(h.indexOf("#/dig")!==0&&h.indexOf("#/responses")!==0)return;
        var d=document.getElementById("dlg");if(d&&d.open)return;
        var ae=document.activeElement;if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
        route();
      }catch(e){}
    },500);
  }catch(e){}
  window.r800={hkSmsBody:hkSmsBody,isRe:isRe,logSend:logSend,tplInfo:tplInfo,isFollow:isFollow,nearCount:nearCount,scoreOf:scoreOf,counts:function(){return counts},renderStats:renderStats,renderHankyo:renderHankyo,pickToday:pickToday,matchCases:matchCases,mailWindow:mailWindow,isOwner:isOwner,kn:function(){return KN},splitAddress:splitAddress,tzToJst:tzToJst};
  try{warm()}catch(e){}
  try{var h0=String(window._r800Hash0||"");if((h0.indexOf("#/hankyo")===0||h0.indexOf("#/stats")===0)&&(location.hash||"")!==h0)history.replaceState(null,"",h0)}catch(e){}
  try{route()}catch(e){} /* 上の組み込みを、いま出ている画面にも反映する */
}catch(e){try{console.warn("r800",e)}catch(_){}}})();
