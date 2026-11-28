/* 8.0.1 起動を速く: 同じ内容の問い合わせが同時に出たら、1回にまとめる (読み取りだけ・返事が来るまでの間だけ)。
   起動時は「接続確認」が4回、「回答の読み込み」「送信待ちの確認」が2回ずつ同時に出ていた。
   書き込みが1つでも通ったら、まとめるのをやめて取り直す (書き込み前の古い返事を使わない)。 */
(function(){try{
  if(typeof postJson_!=="function")return;
  var READ={ping:1,getResponses:1,getResponseSummary:1,getSendQueueStats:1},infl={},p0=postJson_;
  var copy=function(j){try{return (typeof structuredClone==="function")?structuredClone(j):JSON.parse(JSON.stringify(j))}catch(e){return j}};
  postJson_=function(req){
    var a=req&&req.action,k="";
    if(!a||!READ[a]){if(a&&!/^(get|search|list|ng|preview|mailPreview)/.test(String(a)))infl={};return p0.apply(this,arguments)}
    try{k=JSON.stringify(req)}catch(e){return p0.apply(this,arguments)}
    if(infl[k])return infl[k].then(copy);
    var cur=infl,p=p0.apply(this,arguments),done=function(){if(cur[k]===p)delete cur[k]};
    infl[k]=p;p.then(done,done);
    return p;
  };
  window._r800Dedupe=true;
}catch(e){}})();
