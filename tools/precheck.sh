#!/bin/sh
# 公開前の点検。1つでも NG なら公開しない。  使い方: sh tools/precheck.sh
# (1) index.html / f.html / q.html の中のスクリプトがすべて文法として正しいか
# (2) 応募者フォームの動作テスト (tools/test_form.js)
# (3) 8.0 の部品 (tools/r800.js / r800.css) が index.html に正しく差し込まれているか
#     ※ 担当者アプリの画面の動作テストは別: node tools/v8test/flow.js (Chrome と puppeteer-core が必要)
#     ※ 取り込み (住所から市区町村・時差つき日時) のテストも別: node tools/v8test/import.js
cd "$(dirname "$0")/.." || exit 1
for f in index.html f.html q.html; do
  node -e "
const s=require('fs').readFileSync('$f','utf8');const m=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];let ng=0;
m.forEach((x,i)=>{if(/^<script[^>]*type=\"application\/json\"/.test(x[0]))return;try{new Function(x[1])}catch(e){ng++;console.log('NG $f script',i,e.message)}});
console.log('$f: scripts',m.length,'NG',ng);process.exit(ng?1:0)" || exit 1
done
node tools/test_form.js || exit 1
python3 tools/build_r800.py --check || exit 1
echo "precheck OK"
