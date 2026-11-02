#!/usr/bin/env python3
"""Confere 100% dos áudios, vinheta e sequenciamento UTC da rádio."""
from pathlib import Path
from urllib.parse import unquote
import json
ROOT=Path(__file__).resolve().parents[1]
MUSIC=ROOT/'musicas'
AUDIO={'.mp3','.ogg','.m4a','.wav','.flac','.aac','.opus'}
expected={'./musicas/'+p.relative_to(MUSIC).as_posix() for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in AUDIO}
data=json.loads((ROOT/'catalogo.json').read_text(encoding='utf-8'))
tracks=data['tracks']
songs=[t for t in tracks if not t.get('isJingle')]
jingles=[t for t in tracks if t.get('isJingle')]
actual={unquote(t['src']) for t in songs}
missing=sorted(expected-actual)
extra=sorted(actual-expected)
bad=[t.get('src') for t in tracks if not t.get('id') or not t.get('title') or float(t.get('duration') or 0)<=0]
order=data['radioOrder']
ids={t['id'] for t in tracks}
expected_order=[]
for i,song in enumerate(songs,1):
    expected_order.append(song['id'])
    if i%5==0:
        expected_order.append('vinheta-radio-hits-%03d' % (i//5))
jingle_path=ROOT/'vinhetas/radio-hits-cada-5.mp3'
jingle_ok=jingle_path.is_file() and jingle_path.stat().st_size>30000
jingle_ok=jingle_ok and len(jingles)==len(songs)//5
jingle_ok=jingle_ok and all(t.get('src')=='./vinhetas/radio-hits-cada-5.mp3'
    and t.get('downloadAllowed') is False and t.get('genre')=='Vinheta' for t in jingles)
print(f'Verificação: {len(expected)} arquivos, {len(songs)} músicas e {len(jingles)} vinhetas por ciclo.')
for src in missing: print('AUSENTE:',src)
for src in extra: print('INEXISTENTE:',src)
for src in bad: print('DADOS INVALIDOS:',src)
if missing or extra or bad or len(actual)!=len(songs) or not jingle_ok \
    or order!=expected_order or len(ids)!=len(tracks):
    raise SystemExit('Falha: músicas, vinhetas ou ordem da rádio inválidos')
