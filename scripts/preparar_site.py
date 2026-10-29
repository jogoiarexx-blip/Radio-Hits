#!/usr/bin/env python3
"""Constrói a pasta dist/ usada pelo GitHub Pages."""
from __future__ import annotations
from pathlib import Path
import shutil, subprocess, sys

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
subprocess.run([sys.executable,str(ROOT/'scripts'/'gerar_catalogo.py')],check=True)
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
for item in ['index.html','catalogo.json','sw.js','manifest.webmanifest','.nojekyll']:
    shutil.copy2(ROOT/item,DIST/item)
for folder in ['css','js','assets','musicas']:
    shutil.copytree(ROOT/folder,DIST/folder,ignore=shutil.ignore_patterns('metadados.json','volume-perfis.json','*.md','*.py','__pycache__'))
size=sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file())
print(f'Site gerado com {size/1024/1024:.2f} MiB: {DIST}')
if size > 950*1024*1024:
    raise SystemExit('ERRO: perto do limite de 1 GB do GitHub Pages. Reduza o número de faixas.')
