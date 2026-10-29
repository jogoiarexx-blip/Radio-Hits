#!/usr/bin/env python3
"""Gera catalogo.json a partir dos áudios na pasta musicas/, sem API ou servidor.

Duração real obtida por mutagen (`pip install mutagen`) ou ffprobe.
Para evitar sincronização incorreta da rádio, arquivos sem duração válida são ignorados.
"""
from __future__ import annotations
import json, re, shutil, subprocess, sys, unicodedata
from pathlib import Path

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
    # EasyID3/MP4/tags podem representar o titulo e artista de formas diferentes.
    try:
        for name in (key, 'TIT2' if key == 'title' else 'TPE1'):
            value = data.tags.get(name)
            if value:
                if isinstance(value, list): return str(value[0]).strip()
                if hasattr(value, 'text'): return str(value.text[0]).strip()
                return str(value).strip()
    except (TypeError, KeyError, AttributeError, IndexError):
        return None
    return None


def filename_info(stem):
    name=re.sub(r'(?i)(?:[ _-]*new)
    metadata=json.loads(META.read_text(encoding='utf-8')) if META.exists() else {}
    if not isinstance(metadata,dict): raise ValueError('musicas/metadados.json precisa ser um objeto JSON')
    files=[p for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS]
    files.sort(key=lambda p:(0 if p.relative_to(MUSIC).as_posix() in metadata else 1,
        list(metadata.keys()).index(p.relative_to(MUSIC).as_posix()) if p.relative_to(MUSIC).as_posix() in metadata else p.relative_to(MUSIC).as_posix().lower()))
    tracks=[]
    ids=set()
    for path in files:
        rel=path.relative_to(MUSIC).as_posix()
        meta=metadata.get(rel,{})
        if not isinstance(meta,dict): meta={}
        seconds=duration(path)
        if seconds is None:
            print(f'AVISO: sem duração (faixa ignorada): {rel}. Instale mutagen ou ffprobe.',file=sys.stderr)
            continue
        base=slugify(rel.rsplit('.',1)[0]); ident=base; i=2
        while ident in ids:
            ident=f'{base}-{i}'; i+=1
        ids.add(ident)
        fallback_title,fallback_artist=filename_info(path.stem)
        try:
            from mutagen import File
            tags=File(path,easy=True)
        except (ImportError,OSError,ValueError,AttributeError):
            tags=None
        title=str(meta.get('title') or tag_value(tags,'title') or fallback_title).strip()
        artist=str(meta.get('artist') or tag_value(tags,'artist') or fallback_artist or 'Artista independente').strip()
        genre=str(meta.get('genre') or (path.relative_to(MUSIC).parts[0] if len(path.relative_to(MUSIC).parts)>1 else 'Outros')).strip()
        cover=str(meta.get('cover') or './assets/capas/padrao.svg')
        # Keep paths relative to GitHub Pages subdirectory; quote every component.
        from urllib.parse import quote
        source='./musicas/'+ '/'.join(quote(part) for part in path.relative_to(MUSIC).parts)
        tracks.append({'id':ident,'title':title,'artist':artist,'genre':genre,'duration':seconds,'src':source,'cover':cover,'year':meta.get('year',2026)})
    result={'name':'Radio Hits','version':1,'tracks':tracks,'radioOrder':[t['id'] for t in tracks]}
    target=ROOT/'catalogo.json'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Catálogo gerado: {len(tracks)} faixas / {sum(t["duration"] for t in tracks):.1f}s no total. -> {target}')

if __name__=='__main__': main()
,'',stem).strip()
    name=re.sub(r'(?i)\\s*[\\(\\[]\\s*(?:official|high quality|lyrics?|visualizer|music video)[^\\)\\]]*[\\)\\]]','',name).strip()
    name=re.sub(r'(?i)\\s*[-–]\\s*(?:high quality|official)[^–-]*
    metadata=json.loads(META.read_text(encoding='utf-8')) if META.exists() else {}
    if not isinstance(metadata,dict): raise ValueError('musicas/metadados.json precisa ser um objeto JSON')
    files=[p for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS]
    files.sort(key=lambda p:(0 if p.relative_to(MUSIC).as_posix() in metadata else 1,
        list(metadata.keys()).index(p.relative_to(MUSIC).as_posix()) if p.relative_to(MUSIC).as_posix() in metadata else p.relative_to(MUSIC).as_posix().lower()))
    tracks=[]
    ids=set()
    for path in files:
        rel=path.relative_to(MUSIC).as_posix()
        meta=metadata.get(rel,{})
        if not isinstance(meta,dict): meta={}
        seconds=duration(path)
        if seconds is None:
            print(f'AVISO: sem duração (faixa ignorada): {rel}. Instale mutagen ou ffprobe.',file=sys.stderr)
            continue
        base=slugify(rel.rsplit('.',1)[0]); ident=base; i=2
        while ident in ids:
            ident=f'{base}-{i}'; i+=1
        ids.add(ident)
        title=str(meta.get('title') or path.stem.replace('_',' ').replace('-',' ').title()).strip()
        artist=str(meta.get('artist') or 'Artista independente').strip()
        genre=str(meta.get('genre') or 'Outros').strip()
        cover=str(meta.get('cover') or './assets/capas/padrao.svg')
        # Keep paths relative to GitHub Pages subdirectory; quote every component.
        from urllib.parse import quote
        source='./musicas/'+ '/'.join(quote(part) for part in path.relative_to(MUSIC).parts)
        tracks.append({'id':ident,'title':title,'artist':artist,'genre':genre,'duration':seconds,'src':source,'cover':cover,'year':meta.get('year',2026)})
    result={'name':'Radio Hits','version':1,'tracks':tracks,'radioOrder':[t['id'] for t in tracks]}
    target=ROOT/'catalogo.json'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Catálogo gerado: {len(tracks)} faixas / {sum(t["duration"] for t in tracks):.1f}s no total. -> {target}')

if __name__=='__main__': main()
,'',name).strip()
    if ' - ' in name:
        artist,title=name.split(' - ',1)
        if artist and title: return title.strip(),artist.strip()
    return name or stem, None


def main():
    metadata=json.loads(META.read_text(encoding='utf-8')) if META.exists() else {}
    if not isinstance(metadata,dict): raise ValueError('musicas/metadados.json precisa ser um objeto JSON')
    files=[p for p in MUSIC.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS]
    files.sort(key=lambda p:(0 if p.relative_to(MUSIC).as_posix() in metadata else 1,
        list(metadata.keys()).index(p.relative_to(MUSIC).as_posix()) if p.relative_to(MUSIC).as_posix() in metadata else p.relative_to(MUSIC).as_posix().lower()))
    tracks=[]
    ids=set()
    for path in files:
        rel=path.relative_to(MUSIC).as_posix()
        meta=metadata.get(rel,{})
        if not isinstance(meta,dict): meta={}
        seconds=duration(path)
        if seconds is None:
            print(f'AVISO: sem duração (faixa ignorada): {rel}. Instale mutagen ou ffprobe.',file=sys.stderr)
            continue
        base=slugify(rel.rsplit('.',1)[0]); ident=base; i=2
        while ident in ids:
            ident=f'{base}-{i}'; i+=1
        ids.add(ident)
        title=str(meta.get('title') or path.stem.replace('_',' ').replace('-',' ').title()).strip()
        artist=str(meta.get('artist') or 'Artista independente').strip()
        genre=str(meta.get('genre') or 'Outros').strip()
        cover=str(meta.get('cover') or './assets/capas/padrao.svg')
        # Keep paths relative to GitHub Pages subdirectory; quote every component.
        from urllib.parse import quote
        source='./musicas/'+ '/'.join(quote(part) for part in path.relative_to(MUSIC).parts)
        tracks.append({'id':ident,'title':title,'artist':artist,'genre':genre,'duration':seconds,'src':source,'cover':cover,'year':meta.get('year',2026)})
    result={'name':'Radio Hits','version':1,'tracks':tracks,'radioOrder':[t['id'] for t in tracks]}
    target=ROOT/'catalogo.json'
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Catálogo gerado: {len(tracks)} faixas / {sum(t["duration"] for t in tracks):.1f}s no total. -> {target}')

if __name__=='__main__': main()
