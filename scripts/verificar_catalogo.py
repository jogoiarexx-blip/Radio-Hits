#!/usr/bin/env python3
"""Impede publicações com músicas omitidas do catálogo."""
from pathlib import Path
from urllib.parse import unquote
import json
ROOT=Path(__file__).resolve().parents[1]
MUSIC=ROOT/'musicas'
AUDIO={'.mp3','.ogg','.m4a','.wav','.flac','.aac','.opus'}
expected={'./musicas/'+p.relative_to(MUSIC).as_posix() for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in AUDIO}
data=json.loads((ROOT/'catalogo.json').read_text(encoding='utf-8'))
tracks=data['tracks']
actual={unquote(t['src']) for t in tracks}
missing=sorted(expected-actual)
extra=sorted(actual-expected)
bad=[t['src'] for t in tracks if not t.get('id') or not t.get('title') or float(t.get('duration') or 0)<=0]
print(f'Verificação: {len(expected)} arquivos de áudio, {len(tracks)} músicas no catálogo, {len(missing)} ausentes.')
for src in missing: print('AUSENTE:',src)
for src in extra: print('INEXISTENTE:',src)
for src in bad: print('DADOS INVALIDOS:',src)
if missing or extra or bad or len(actual)!=len(tracks):
    raise SystemExit('Falha: catálogo incompleto ou duplicado')
