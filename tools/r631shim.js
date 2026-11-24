/* 9.2.0 中継の切り替え: Cloudflare Worker (KV) → 社外アカウントの GAS 中継。
   既存コードは CONFIG.RELAY_URL (Cloudflare) 宛てに fetch しているので、ここで宛先を差し替える。
   - 文脈の取得: まず GAS 中継。見つからなければ Cloudflare (移行前に発行された古いリンク用)。
   - 回答 / 配信停止: 文脈を取れた側へ送る。GAS が unknown_token なら Cloudflare へ。 */
(function(){
  var GAS="https://script.google.com/macros/s/AKfycbwN6DZ81c5uPRVe7lrH5kg9ikW8zR3JFxKcSUd6TCctWEiuU_0fI1RDGn8fBeyjI2fF/exec";
  var CF="https://kansai-form-relay.career-line-bot.workers.dev";
  var orig=window.fetch; if(!orig||orig._r631)return;
  var src={}; try{src=JSON.parse(sessionStorage.getItem("r631src")||"{}")||{}}catch(e){src={}}
  function mark(tk,v){src[tk]=v;try{sessionStorage.setItem("r631src",JSON.stringify(src))}catch(e){}}
  function resp(j){var st=(j&&j.ok===false)?(j.status||(/not_found|unknown/.test(String(j.error))?404:400)):200;
    return new Response(JSON.stringify(j),{status:st,headers:{"Content-Type":"application/json"}})}
  function gasGet(path,tk){return orig.call(window,GAS+"?path="+path+"&token="+encodeURIComponent(tk),{method:"GET",credentials:"omit"}).then(function(r){return r.json()})}
  function gasPost(obj){return orig.call(window,GAS,{method:"POST",credentials:"omit",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(obj)}).then(function(r){return r.json()})}
  function f(input,init){
    var url=typeof input==="string"?input:(input&&input.url)||"";
    if(url.indexOf(CF)!==0)return orig.apply(window,arguments);
    var rest=url.slice(CF.length), args=arguments;
    var m=rest.match(/^\/(form-context|sms-launch)\?token=([^&]*)/);
    if(m){
      var path=m[1], tk=decodeURIComponent(m[2]);
      if(src[tk]==="cf")return orig.apply(window,args);
      return gasGet(path,tk).then(function(j){
        if(j&&j.ok){mark(tk,"gas");return resp(j)}
        if(j&&/not_found/.test(String(j.error))){return orig.apply(window,args).then(function(r){if(r&&r.ok)mark(tk,"cf");return r})}
        return resp(j);
      },function(){return orig.apply(window,args)});
    }
    var p=rest.match(/^\/(submit|optout)(?:$|\?)/);
    if(p){
      var body={}; try{body=JSON.parse(init&&init.body||"{}")||{}}catch(e){body={}}
      var tk2=String(body.token||"");
      if(src[tk2]==="cf")return orig.apply(window,args);
      var obj={}; Object.keys(body).forEach(function(k){obj[k]=body[k]}); obj.path=p[1];
      return gasPost(obj).then(function(j){
        if(j&&j.ok===false&&/unknown_token/.test(String(j.error)))return orig.apply(window,args);
        return resp(j);
      },function(){return orig.apply(window,args)});
    }
    return orig.apply(window,args);
  }
  f._r631=true; window.fetch=f;
})();
