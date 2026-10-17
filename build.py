"""Build index.html: one self-contained page from src/ and data/.
Run from the project folder:  python3 build.py
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent
src = data = root
esc = lambda s: s.replace('</', '<\\/')
t = (src / 'template.html').read_text()
page = (t.replace('{{DATA}}', esc(json.dumps(json.loads((data / 'catalog.json').read_text()), indent=1)))
          .replace('{{STUDENTS}}', esc(json.dumps(json.loads((data / 'students.json').read_text()), indent=1)))
          .replace('{{SAMPLE}}', esc((data / 'sample-audit.txt').read_text()))
          .replace('{{COURSES}}', esc((data / 'courselist.json').read_text()))
          .replace('{{ENGINE}}', (src / 'engine.js').read_text())
          .replace('{{UI}}', (src / 'ui.js').read_text())
          .replace('{{VIEWS}}', (src / 'views.js').read_text()))
html = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>' + page + '</body></html>')
(root / 'index.html').write_text(html)
print('Wrote index.html', round(len(html) / 1e6, 2), 'MB')
