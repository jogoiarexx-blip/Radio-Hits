#!/usr/bin/env python3
"""Gera catalogo.json a partir dos áudios na pasta musicas/, sem API ou servidor.

Duração real obtida por mutagen (`pip install mutagen`) ou ffprobe.
Para evitar sincronização incorreta da rádio, arquivos sem duração válida são ignorados.
"""
from __future__ import annotations
import json, re, shutil, subprocess, sys, unicodedata, hashlib
from programar_radio import programar
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
MUSIC = ROOT / 'musicas'
META = MUSIC / 'metadados.json'
EXTENSIONS = {'.mp3', '.m4a', '.ogg', '.opus', '.wav', '.flac', '.aac'}


def duration(path: Path):
    try:
        from mutagen import File
        data = File(path)
        if data and data.info and float(data.info.length) > 0:
            return round(float(data.info.length), 3)
    except (ImportError, OSError, ValueError, AttributeError):
        pass
    if shutil.which('ffprobe'):
        result = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],capture_output=True,text=True)
        try:
            value=float(result.stdout.strip())
            return round(value,3) if value > 0 else None
        except (ValueError,TypeError): pass
    return None


def slugify(value):
    value = unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-') or 'faixa'


def tag_value(data, key):
    if data is None or data.tags is None:
        return None
    try:
        for name in (key, 'TIT2' if key == 'title' else 'TPE1'):
            value = data.tags.get(name)
            if value:
                if isinstance(value, list):
                    return str(value[0]).strip()
                if hasattr(value, 'text'):
                    return str(value.text[0]).strip()
                return str(value).strip()
    except (TypeError, KeyError, AttributeError, IndexError):
        return None
    return None


def filename_info(stem):
    name = re.sub(r'(?i)(?:[ _-]*new)$', '', stem).strip()
    name = re.sub(r'(?i)\s*[\(\[]\s*(?:official|high quality|lyrics?|visualizer|music video)[^\)\]]*[\)\]]', '', name).strip()
    name = re.sub(r'(?i)\s*[-–]\s*(?:high quality|official)[^–-]*$', '', name).strip()
    if ' - ' in name:
        artist, title = name.split(' - ', 1)
        if artist and title:
            return title.strip(), artist.strip()
    return name or stem, None


def main():
    metadata=json.loads(META.read_text(encoding='utf-8')) if META.exists() else {}
    if not isinstance(metadata,dict): raise ValueError('musicas/metadados.json precisa ser um objeto JSON')
    profile_file=MUSIC / 'volume-perfis.json'
    volume_profiles=json.loads(profile_file.read_text(encoding='utf-8')).get('tracks',{}) if profile_file.exists() else {}
    files=[p for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS]
    positions={path:i for i,path in enumerate(metadata)}
    files.sort(key=lambda p:(0,positions[p.relative_to(MUSIC).as_posix()]) if p.relative_to(MUSIC).as_posix() in positions
               else (1,p.relative_to(MUSIC).as_posix().lower()))
    tracks=[]
    ids=set()
    for path in files:
        rel=path.relative_to(MUSIC).as_posix()
        meta=metadata.get(rel,{})
        if not isinstance(meta,dict): meta={}
        # A faixa pode permanecer fisicamente no Git, mas nao participa do app.
        if meta.get('enabled') is False:
            print(f'FAIXA DESATIVADA (fora da biblioteca e da radio): {rel}')
            continue
        seconds=duration(path)
        if seconds is None:
            print(f'AVISO: sem duração (faixa ignorada): {rel}. Instale mutagen ou ffprobe.',file=sys.stderr)
            continue
        base=slugify(rel.rsplit('.',1)[0])
        explicit=meta.get('id')
        if explicit is not None:
            if not isinstance(explicit,str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',explicit):
                raise ValueError(f'ID explícito inválido: {rel}')
            if explicit in ids:
                raise ValueError(f'ID explícito duplicado: {explicit} ({rel})')
            ident=explicit
        else:
            ident=base
            i=2
            while ident in ids:
                ident=f'{base}-{i}'; i+=1
        ids.add(ident)
        fallback_title, fallback_artist = filename_info(path.stem)
        try:
            from mutagen import File
            tags = File(path, easy=True)
        except (ImportError, OSError, ValueError, AttributeError):
            tags = None
        title = str(meta.get('title') or tag_value(tags, 'title') or fallback_title).strip()
        artist = str(meta.get('artist') or tag_value(tags, 'artist') or fallback_artist or 'Artista independente').strip()
        genre = str(meta.get('genre') or (path.relative_to(MUSIC).parts[0] if len(path.relative_to(MUSIC).parts)>1 else 'Outros')).strip()
        cover=str(meta.get('cover') or './assets/capas/padrao.svg')
        # Capas temáticas originais para faixas comerciais sem capa licenciada.
        # Preserva capas específicas das faixas independentes e não altera radioOrder.
        genre_art={
            'Anos 80 e 90':'./assets/capas/genero-80-90.svg',
            'Rock':'./assets/capas/genero-rock.svg',
            'Hip Hop':'./assets/capas/genero-hiphop.svg',
            'Malhação Internacional 2003':'./assets/capas/genero-malhacao.svg',
        }
        if cover == './assets/capas/padrao.svg':
            cover=genre_art.get(genre,'./assets/capas/genero-radio-hits.svg')
        # Keep paths relative to GitHub Pages subdirectory; quote every component.
        source='./musicas/'+ '/'.join(quote(part) for part in path.relative_to(MUSIC).parts)
        # A edicao compacta e gerada apenas no Pages. Originais nao mudam.
        low_source='./musicas-leves/'+ '/'.join(quote(part) for part in path.relative_to(MUSIC).with_suffix('.m4a').parts)
        loudness=volume_profiles.get(rel,{})
        gain=max(-10.0,min(0.0,float(loudness.get('gainDb') or 0.0)))
        # Ponto opcional e conservador de entrada, exclusivo do DJ automático.
        # Não altera a duração, a URL nem a programação da rádio.
        estimated_intro=float(loudness.get('djIntroSec') or 0.0)
        dj_intro=round(estimated_intro,2) if 0.7<=estimated_intro<=8.0 else 0.0
        estimated_energy=float(loudness.get('djEnergyCueSec') or 0.0)
        dj_energy=round(estimated_energy,2) if 4.0<=estimated_energy<=24.0 else 0.0
        tracks.append({'id':ident,'title':title,'artist':artist,'genre':genre,'duration':seconds,'src':source,'lowSrc':low_source,'cover':cover,'year':meta.get('year',2026),'downloadAllowed':meta.get('downloadAllowed') is True,
                       'gainDb':gain,'loudnessLufs':loudness.get('lufs'),'djIntroSec':dj_intro,'djEnergyCueSec':dj_energy})
    # A cada 5 músicas, alternar determinística e ciclicamente
    # três vinhetas femininas. IDs continuam exclusivos e estáveis.
    # O relógio UTC usa durações exatas de cada MP3 (incluindo VBR padding).
    jingle_options = [
        ('radio-hits-cada-5.mp3', 'Energia'),
        ('radio-hits-alto-astral.mp3', 'Alto astral'),
        ('radio-hits-classicos.mp3', 'Clássicos'),
    ]
    jingle_seconds = {}
    for filename, _ in jingle_options:
        asset = ROOT / 'vinhetas' / filename
        if not asset.is_file():
            raise SystemExit(f'Vinheta ausente: {asset}')
        measured = duration(asset)
        if measured is None or not 6 <= measured <= 30:
            raise SystemExit(f'Duração inválida na vinheta: {filename}')
        jingle_seconds[filename] = measured
    ordered_songs = programar(tracks)
    radio_order = []
    jingles = []
    for song_number, track in enumerate(ordered_songs, 1):
        radio_order.append(track['id'])
        if song_number % 5 == 0:
            jingle_number = song_number // 5
            filename, label = jingle_options[(jingle_number - 1) % len(jingle_options)]
            jingle_id = f'vinheta-radio-hits-{jingle_number:03d}'
            jingles.append({
                'id': jingle_id, 'title': f'Rádio Hits • {label}',
                'artist': 'Rádio Hits', 'genre': 'Vinheta',
                'isJingle': True, 'duration': jingle_seconds[filename],
                'src': './vinhetas/' + filename,
                'cover': './assets/capas/genero-radio-hits.svg',
                'year': 2026, 'downloadAllowed': False, 'gainDb': 0.0,
                'loudnessLufs': None,
            })
            radio_order.append(jingle_id)
    by_id = {t['id']: t for t in tracks+jingles}
    # Identifica explicitamente uma grade. Mesmo ID, ordem e durações
    # resultam sempre na mesma revisão em navegador e Media3.
    fingerprint = [[id, round(by_id[id]['duration'] * 1000)] for id in radio_order]
    revision = hashlib.sha256(json.dumps(fingerprint,separators=(',',':')).encode()).hexdigest()[:16]
    epoch_ms = 1767225600000  # 2026-01-01T00:00:00Z; compatível com Android.
    result={'name':'Radio Hits','version':4,'tracks':tracks+jingles,'radioOrder':radio_order,
            'radioSchedule':{'revision':revision,'epochMs':epoch_ms,
                             'strategy':'curadoria-deterministica-v1',
                             'songCount':len(tracks),'jingleCount':len(jingles)}}
    target=ROOT/'catalogo.json'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Catálogo gerado: {len(tracks)} músicas + {len(jingles)} entradas de vinheta / {sum(t["duration"] for t in tracks+jingles):.1f}s de rádio. -> {target}')

if __name__=='__main__': main()
