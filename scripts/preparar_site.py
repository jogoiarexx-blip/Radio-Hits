#!/usr/bin/env python3
"""Constrói a pasta dist/ usada pelo GitHub Pages."""
from __future__ import annotations
from pathlib import Path
import shutil, subprocess, sys, os, json, re

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
subprocess.run([sys.executable,str(ROOT/'scripts'/'gerar_catalogo.py')],check=True)
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
for item in ['index.html','dj.html','catalogo.json','sw.js','manifest.webmanifest','.nojekyll']:
    shutil.copy2(ROOT/item,DIST/item)
revision=(os.environ.get('GITHUB_SHA') or 'local')[:12]
index=DIST/'index.html'
html=index.read_text(encoding='utf-8')
html=html.replace('<head>','<head>\n  <meta name="radiohits-revision" content="'+revision+'">',1)
index.write_text(html,encoding='utf-8')
(DIST/'app-version.json').write_text(json.dumps({'revision':revision},ensure_ascii=False)+'\n',encoding='utf-8')
worker=DIST/'sw.js'
code=worker.read_text(encoding='utf-8')
code=re.sub(r"const CACHE = 'radio-hits-shell-v\d+';",
            "const CACHE = 'radio-hits-shell-v26-"+revision+"';",code,count=1)
worker.write_text(code,encoding='utf-8')
# As demonstracoes desativadas ficam preservadas no Git, mas nao sao enviadas
# ao GitHub Pages nem entram na conversao AAC para consumo economico.
metadata=json.loads((ROOT/'musicas'/'metadados.json').read_text(encoding='utf-8'))
disabled={name for name,info in metadata.items() if isinstance(info,dict) and info.get('enabled') is False}
default_ignore=shutil.ignore_patterns('metadados.json','volume-perfis.json','*.md','*.py','__pycache__')
def ignore_inactive(folder,names):
    ignored=set(default_ignore(folder,names))
    path=Path(folder)
    try: relative=path.relative_to(ROOT/'musicas')
    except ValueError: return ignored
    for filename in names:
        rel=(relative/filename).as_posix()
        if rel in disabled:
            ignored.add(filename)
    return ignored
for folder in ['css','js','assets','musicas','vinhetas']:
    shutil.copytree(ROOT/folder,DIST/folder,ignore=ignore_inactive)
size=sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file())
print(f'Site gerado com {size/1024/1024:.2f} MiB: {DIST}')
if size > 950*1024*1024:
    raise SystemExit('ERRO: perto do limite de 1 GB do GitHub Pages. Reduza o número de faixas.')
