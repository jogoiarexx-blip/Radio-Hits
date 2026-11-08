#!/usr/bin/env python3
"""Confere 100% dos áudios, vinheta e sequenciamento UTC da rádio."""
from pathlib import Path
from urllib.parse import unquote
import json, hashlib, os
from programar_radio import programar
ROOT=Path(__file__).resolve().parents[1]
MUSIC=ROOT/'musicas'
metadata=json.loads((MUSIC/'metadados.json').read_text(encoding='utf-8'))
disabled={name for name,record in metadata.items() if isinstance(record,dict) and record.get('enabled') is False}
AUDIO={'.mp3','.ogg','.m4a','.wav','.flac','.aac','.opus'}
# Mesma função usada pelo gerador: não divergir ao julgar áudios ilegíveis.
from gerar_catalogo import duration
expected=set()
unreadable=[]
for p in MUSIC.rglob('*'):
    if not p.is_file() or p.suffix.lower() not in AUDIO:
        continue
    relative=p.relative_to(MUSIC).as_posix()
    if relative in disabled: continue
    src='./musicas/'+relative
    if duration(p) is None:
        unreadable.append(src)
    else:
        expected.add(src)
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
for i,song in enumerate(programar(songs),1):
    expected_order.append(song['id'])
    if i%5==0:
        expected_order.append('vinheta-radio-hits-%03d' % (i//5))
files=['radio-hits-cada-5.mp3','radio-hits-alto-astral.mp3','radio-hits-classicos.mp3']
jingle_ok=all((ROOT/'vinhetas'/file).is_file() and
    (ROOT/'vinhetas'/file).stat().st_size>60000 for file in files)
jingle_ok=jingle_ok and len(jingles)==len(songs)//5
jingle_ok=jingle_ok and all(
    t['src']=='./vinhetas/'+files[i%3]
    and t.get('downloadAllowed') is False
    and t.get('genre')=='Vinheta'
    and 6<=float(t['duration'])<=30
    for i,t in enumerate(jingles))
schedule=data.get('radioSchedule') or {}
by_id={t['id']:t for t in tracks}
fingerprint=[[id,round(by_id[id]['duration']*1000)] for id in order if id in by_id]
revision=hashlib.sha256(json.dumps(fingerprint,separators=(',',':')).encode()).hexdigest()[:16]
schedule_ok=(schedule.get('revision')==revision
    and schedule.get('epochMs')==1767225600000
    and schedule.get('songCount')==len(songs)
    and schedule.get('jingleCount')==len(jingles))
print(f'Verificação: {len(expected)} faixas ativas, {len(disabled)} desativadas, {len(songs)} músicas e {len(jingles)} vinhetas por ciclo; revisão {revision}.')
for src in unreadable: print('ARQUIVO DE AUDIO ILEGIVEL (fora da grade):',src)
summary_file=os.environ.get('GITHUB_STEP_SUMMARY')
if summary_file:
    with open(summary_file, 'a', encoding='utf-8') as report:
        report.write('## Auditoria da biblioteca Radio Hits\\n\\n')
        report.write(f'- Músicas decodificáveis e catalogadas: **{len(songs)}**\\n')
        report.write(f'- Áudios ilegíveis mantidos fora da rádio: **{len(unreadable)}**\\n')
        report.write(f'- Ausentes no catálogo: **{len(missing)}**\\n')
        for src in unreadable:
            report.write('- Reenviar ou corrigir: `' + src.replace('`', '') + '`\\n')
        report.write('\\nÁudios ilegíveis não são considerados certificados.\\n')
for src in missing: print('AUSENTE:',src)
for src in extra: print('INEXISTENTE:',src)
for src in bad: print('DADOS INVALIDOS:',src)
if missing or extra or bad or len(actual)!=len(songs) or not jingle_ok \
    or order!=expected_order or len(ids)!=len(tracks) or not schedule_ok:
    raise SystemExit('Falha: músicas, vinhetas ou ordem da rádio inválidos')
