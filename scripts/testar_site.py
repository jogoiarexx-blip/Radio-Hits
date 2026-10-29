#!/usr/bin/env python3
"""Smoke test offline: valida estrutura, faixas, catálogo e referências locais."""
from __future__ import annotations
import json, re, subprocess
from pathlib import Path
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1]
content=json.loads((ROOT/'catalogo.json').read_text(encoding='utf-8'))
assert content['version']==1
assert len(content['tracks'])>=1
assert len(content['radioOrder'])==len(content['tracks'])
assert len({t['id'] for t in content['tracks']})==len(content['tracks'])
for t in content['tracks']:
    assert t['duration']>1,(t['id'],t['duration'])
    for key in ('src','cover'):
        assert t[key].startswith('./'), (t['id'],key)
        target=ROOT/unquote(t[key][2:])
        assert target.exists(), (t['id'],target)
        assert target.stat().st_size>0, (t['id'],target)
    assert t['id'] in content['radioOrder']
html=(ROOT/'index.html').read_text(encoding='utf-8')
for ident in ('player-play','station-play','audio','search','modal','all-tracks','view-radio','view-explorar','view-playlists','view-favoritos'):
    assert f'id="{ident}"' in html, ident
js=ROOT/'js/app.js'
r=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
assert r.returncode==0,r.stderr
assert (ROOT/'.github/workflows/publicar.yml').exists()
print(f'OK: {len(content["tracks"])} faixas, {len(content["radioOrder"])} slots de rádio, áudio e capas encontrados, HTML/JS válidos.')
