/* 取り込みのテスト: 住所から市区町村を読み取る・時差つき日時を日本時間に直す。
   使い方: node tools/v8test/import.js   (puppeteer-core と Chrome が必要。名前・電話はすべて架空) */
const pp=require('puppeteer-core'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.join(__dirname,'..','..');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':p.endsWith('.json')?'application/json':'text/html; charset=utf-8'});r.end(fs.readFileSync(f))}).listen(8770);
  const br=await pp.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const pg=await br.newPage();pg.on('dialog',d=>d.dismiss());const res=[];const A=(c,m)=>res.push((c?'OK  ':'NG  ')+m);pg.on('pageerror',e=>res.push('PAGEERR '+e.message));
  await pg.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname,'mock.js'),'utf8'));
  await pg.goto('http://localhost:8770/#/import',{waitUntil:'domcontentloaded'});await sleep(3000);
  await pg.evaluate(async()=>{window._r639Towns=await (await fetch('/town_coords.json')).json()});
  const sp=(a,h)=>pg.evaluate((a,h)=>r800.splitAddress(a,h),a,h||'');
  const eq=(got,pref,muni,rest,label)=>A(got&&got.pref===pref&&got.muni===muni&&got.rest===rest,label+' → '+JSON.stringify(got));
  eq(await sp('京都府京都市伏見区深草西浦町1-2-3'),'京都府','京都市伏見区','深草西浦町1-2-3','京都市の区');
  eq(await sp('京都府京田辺市田辺中央4丁目3-3'),'京都府','京田辺市','田辺中央4丁目3-3','市');
  eq(await sp('京都府相楽郡精華町光台1-7'),'京都府','相楽郡精華町','光台1-7','郡つき');
  eq(await sp('奈良県王寺町久度2-2-1'),'奈良県','北葛城郡王寺町','久度2-2-1','郡を省いた住所は正式名に');
  eq(await sp('奈良県大和郡山市北郡山町248-4'),'奈良県','大和郡山市','北郡山町248-4','大和郡山市 (「郡」を含む市)');
  eq(await sp('大阪府大阪市北区梅田1-1-3 大阪駅前第3ビル 12階'),'大阪府','大阪市北区','梅田1-1-3 大阪駅前第3ビル 12階','建物名の空白は残す');
  eq(await sp('大阪府堺市堺区南瓦町3-1'),'大阪府','堺市堺区','南瓦町3-1','堺市の区');
  eq(await sp('兵庫県神戸市中央区加納町6-5-1'),'兵庫県','神戸市中央区','加納町6-5-1','神戸市の区');
  eq(await sp('〒600-8216　京都府 京都市下京区 東塩小路町９０１'),'京都府','京都市下京区','東塩小路町901','郵便番号・空白・全角数字');
  eq(await sp('和歌山県和歌山市七番丁23'),'和歌山県','和歌山市','七番丁23','位置表に無い府県 (和歌山)');
  eq(await sp('東京都町田市森野2-2-22'),'東京都','町田市','森野2-2-22','関東の市 (町を含む)');
  eq(await sp('神奈川県横浜市青葉区市ケ尾町31-4'),'神奈川県','横浜市青葉区','市ケ尾町31-4','関東の区つきの市');
  eq(await sp('京都市左京区下鴨半木町1','京都府'),'京都府','京都市左京区','下鴨半木町1','住所に府県が無く、府県の列がある');
  eq(await sp('大阪府泉北郡泉北郡忠岡町忠岡東1-2-3'),'大阪府','泉北郡忠岡町','忠岡東1-2-3','郡が2回書かれた住所');
  eq(await sp('大阪府大阪市'),'大阪府','大阪市','','区が書かれていない市');
  A(await sp('三重県四日市市諏訪町1-5')===null,'対象外の府県は読み取らない (これまでどおりの扱い)');
  A(await sp('')===null&&await sp('京都府')===null,'空・府県だけの住所は読み取らない');
  const tz=v=>pg.evaluate(v=>r800.tzToJst(v),v);
  A(await tz('2026-11-24T04:36:00Z')==='2026-11-24 13:36','時差つき (Z) → 日本時間');
  A(await tz('2026-11-23T15:10:00.000Z')==='2026-11-24 00:10','時差つき: 日付をまたぐ');
  A(await tz('2026-11-24T13:36:00+09:00')==='2026-11-24 13:36','日本時間の時差つきはそのまま');
  A(await tz('2026/11/24 04:36')==='2026/11/24 04:36'&&await tz('2026-11-24')==='2026-11-24'&&await tz('090-1234-5678')==='090-1234-5678','時差の印が無い日時・日付・電話番号は変えない');
  // CSVの形で通す: 住所が1つの列 (全文) だけのとき
  const out=await pg.evaluate(()=>{
    var rows=[['氏名','電話番号','生年月日','住所','職種','応募日時','会社名'],
      ['試験 花子','090-0000-0001','1990/01/02','京都府京都市伏見区深草西浦町1-2-3','介護職','2026-11-24T04:36:00Z','ファーストスタッフィング'],
      ['試験 次郎','090-0000-0002','1985/05/06','奈良県王寺町久度2-2-1 コーポ101','看護師','2026/11/25 10:20','ファーストスタッフィング'],
      ['試験 三郎','090-0000-0003','1980/07/08','三重県四日市市諏訪町1-5','介護職','2026/11/25 11:00','ファーストスタッフィング']];
    var m=mapRows(rows,'x');return {m:m.map(function(o){return {muni:o.municipality,pref:o.prefecture||'',at:o.applied_at}}),s:m.map(function(o){var x=importRowToServer(o);return {pref:x.prefecture,muni:x.municipality,rest:x.address_rest,area:x.area,at:x.applied_at,lat:x.lat,lon:x.lon}})};
  });
  A(out.s[0].pref==='京都府'&&out.s[0].muni==='京都市伏見区'&&out.s[0].rest==='京都府京都市伏見区深草西浦町1-2-3'&&out.s[0].area==='kansai','CSV (府県の列なし): 市区町村が入り、住所の残りはこれまでと同じ形 (全文) '+JSON.stringify(out.s[0]));
  A(Math.abs(out.s[0].lat-34.93)<0.08&&Math.abs(out.s[0].lon-135.76)<0.08,'CSV: 緯度経度が無い人は、住所から位置を求めて送る ('+out.s[0].lat+','+out.s[0].lon+')');
  A(out.s[0].at==='2026-11-24T13:36','CSV: 時差つきの応募日時は日本時間で入る ('+out.s[0].at+')');
  A(out.s[1].muni==='北葛城郡王寺町'&&out.s[1].rest==='奈良県王寺町久度2-2-1 コーポ101'&&out.s[1].at==='2026-11-25T10:20','CSV: 郡を省いた住所・時差の印なしの日時 '+JSON.stringify(out.s[1]));
  A(out.s[2].muni===''&&out.s[2].pref===''&&out.s[2].rest==='三重県四日市市諏訪町1-5','CSV: 対象外の府県の行は、これまでと同じ形のまま '+JSON.stringify(out.s[2]));
  // refo.link の形: 「住所(市区町村)」は空の列、「住所(都道府県)」「緯度」「経度」あり
  const refo=await pg.evaluate(()=>{var rows=[['会社名','ステータス','応募日','電話番号','住所','住所(都道府県)','住所(市区町村)','住所(町名番地)','氏名','生年月日','緯度','経度','職種詳細'],
      ['ファーストスタッフィング株式会社','接触待ち','2026-11-24 04:36','09000000011','京都府京都市伏見区深草西浦町1-2-3','京都府','','','F_試験 花子','1990-01-02 00:00:00','34.951234','135.771234','介護士'],
      ['ファーストスタッフィング株式会社','接触待ち','2026-11-24 10:46','09000000012','奈良県王寺町','奈良県','','','A_試験 次郎','1985-05-06 00:00:00','','','看護師']];
    var m=mapRows(rows,'x');return m.map(function(o){var x=importRowToServer(o);return {pref:x.prefecture,muni:x.municipality,rest:x.address_rest,at:x.applied_at,lat:x.lat,lon:x.lon,area:x.area}})});
  A(refo[0].muni==='京都市伏見区'&&refo[0].rest==='京都市伏見区深草西浦町1-2-3'&&refo[0].pref==='京都府'&&refo[0].at==='2026-11-24T04:36','refo.linkの形: 市区町村が入り、住所の残りは今日の取り込みと同じ形 (府県だけ外す)・時刻はそのまま '+JSON.stringify(refo[0]));
  A(refo[0].lat===34.951234&&refo[0].lon===135.771234,'refo.linkの形: CSVの緯度経度をそのまま使う');
  A(refo[1].muni==='北葛城郡王寺町'&&refo[1].rest==='王寺町'&&Math.abs(refo[1].lat-34.59)<0.05&&Math.abs(refo[1].lon-135.70)<0.05,'refo.linkの形: 緯度経度が無い人は市区町村の位置を入れる '+JSON.stringify(refo[1]));
  const det=await pg.evaluate(()=>apiCall({action:'getApplicant',applicant_id:'X'}).then(function(){var f=window.__mock;window.__mock=function(q){return q.action==='getApplicant'?{applicant:{applicant_id:q.applicant_id,prefecture:'京都府',municipality:q.applicant_id==='B'?'':'京都市伏見区',address_rest:'京都市伏見区深草西浦町1-2-3'}}:f(q)};return Promise.all([apiCall({action:'getApplicant',applicant_id:'G'}),apiCall({action:'getApplicant',applicant_id:'B'})]).then(function(r){window.__mock=f;return r.map(function(x){return x.applicant.address_rest})})}));
  A(det[0]==='深草西浦町1-2-3'&&det[1]==='京都市伏見区深草西浦町1-2-3','求職者詳細: 住所の重なりは表示のときだけ外す (市区町村が空の人はそのまま) '+JSON.stringify(det));
  // 市区町村の列がすでにある CSV は変えない
  const keep=await pg.evaluate(()=>{var m=mapRows([['氏名','電話番号','都道府県','市区町村','住所','職種','応募日'],['試験 四郎','090-0000-0004','大阪府','吹田市','江坂町1-2-3','介護','2026/11/26']],'x');var x=importRowToServer(m[0]);return {muni:x.municipality,rest:x.address_rest,pref:x.prefecture}});
  A(keep.muni==='吹田市'&&keep.rest==='江坂町1-2-3'&&keep.pref==='大阪府','市区町村の列がある CSV は、これまでどおり '+JSON.stringify(keep));
  // 位置表が読めなかったとき (通信できないなど) でも、形で読む
  const fb=await pg.evaluate(()=>{window._r639Towns=null;return [r800.splitAddress('京都府京都市伏見区深草1-2'),r800.splitAddress('奈良県北葛城郡王寺町久度2-2-1'),r800.splitAddress('奈良県大和郡山市北郡山町248-4')]});
  A(fb[0]&&fb[0].muni==='京都市伏見区'&&fb[1]&&fb[1].muni==='北葛城郡王寺町'&&fb[2]&&fb[2].muni==='大和郡山市','位置表が無くても、形で読める '+JSON.stringify(fb.map(x=>x&&x.muni)));
  console.log(res.join('\n'));const ng=res.filter(r=>!/^OK/.test(r)).length;console.log(ng?'\n'+ng+' 件が NG':'\nすべて OK');
  await br.close();srv.close();process.exit(ng?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
