#!/usr/bin/env python3
"""tools/r800.js と tools/r800.css を index.html の末尾 (</body> の直前) に差し込む。何度実行しても同じ結果になる。
   python3 tools/build_r800.py          … 差し込む
   python3 tools/build_r800.py --check  … 差し込み済みの内容が tools/ の中身と同じか確かめるだけ (違えば終了コード1)"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
js = (root / "tools" / "r800.js").read_text(encoding="utf-8").rstrip("\n")
css = (root / "tools" / "r800.css").read_text(encoding="utf-8").rstrip("\n")
assert "</script" not in js.lower()
block = '<style id="r800css">\n' + css + '\n</style>\n<script id="r800">' + js + '</script>\n'
if "--check" in sys.argv:
    ok = block in html
    print("r800: index.html と tools/ の内容は" + ("同じです" if ok else "違います (python3 tools/build_r800.py を実行してください)"))
    sys.exit(0 if ok else 1)
html = re.sub(r'<style id="r800css">.*?</script>\n', '', html, flags=re.S)
i = html.rindex("</body>")
(root / "index.html").write_text(html[:i] + block + html[i:], encoding="utf-8")
print("r800 inserted:", len(block), "chars")
