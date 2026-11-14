#!/usr/bin/env python3
"""AAC-LC 32 kbps mono, exclusivo para modo econômico do site; preserva originais."""
from __future__ import annotations
import concurrent.futures, json, shutil, subprocess, sys
from pathlib import Path
from urllib.parse import unquote

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/"dist"
MAX_BYTES=950*1024*1024

def jobs():
    data=json.loads((DIST/"catalogo.json").read_text(encoding="utf-8"))
    entries=[]
    for song in data["tracks"]:
        if song.get("isJingle"):continue
        original=unquote(song["src"]).removeprefix("./")
        reduced=unquote(song.get("lowSrc","")).removeprefix("./")
        if not original.startswith("musicas/") or not reduced.startswith("musicas-leves/"):
            raise ValueError("Origem/variante invalida "+str(song.get("id")))
        src=(DIST/original).resolve()
        dst=(DIST/reduced).resolve()
        if not src.is_relative_to((DIST/"musicas").resolve()) or not dst.is_relative_to((DIST/"musicas-leves").resolve()):
            raise ValueError("Path fora das pastas autorizadas")
        if not src.is_file():raise FileNotFoundError(src)
        entries.append((src,dst))
    if len({dst for _,dst in entries})!=len(entries):
        raise ValueError("Colisao em nome de arquivo de audio leve")
    return entries

def encode(item):
    src,dst=item
    dst.parent.mkdir(parents=True,exist_ok=True)
    temp=dst.with_suffix(".part.m4a")
    args=["ffmpeg","-nostdin","-hide_banner","-loglevel","error","-y",
          "-i",str(src),"-map","0:a:0","-vn","-sn","-dn",
          "-c:a","aac","-b:a","32k","-ac","1","-ar","44100",
          "-movflags","+faststart",str(temp)]
    try:
        subprocess.run(args,check=True,timeout=300)
        if not temp.exists() or temp.stat().st_size<2048:
            raise RuntimeError("Edicao leve vazia: "+str(src))
        temp.replace(dst)
    finally:
        temp.unlink(missing_ok=True)
    return src.stat().st_size,dst.stat().st_size

def main():
    entries=jobs()
    if "--verify-only" in sys.argv:
        for _,dst in entries:
            if not dst.is_file() or dst.stat().st_size<2048:
                raise SystemExit("Faixa compacta ausente: "+str(dst))
        print(f"AUDIO LEVE OK: {len(entries)} musicas presentes.")
        return
    if shutil.which("ffmpeg") is None:raise SystemExit("FFmpeg nao instalado")
    print(f"Produzindo {len(entries)} AAC-LC em 32 kbps mono.",flush=True)
    original=compact=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for a,b in pool.map(encode,entries):
            original+=a;compact+=b
    total=sum(x.stat().st_size for x in DIST.rglob("*") if x.is_file())
    print(f"AUDIO LEVE: {original/2**20:.1f} para {compact/2**20:.1f} MiB; site total {total/2**20:.1f} MiB.",flush=True)
    if total>MAX_BYTES:
        raise SystemExit("Publicacao excederia o limite seguro de 950 MiB do Pages.")
    for _,dst in entries:
        if not dst.is_file():raise RuntimeError("Incompleto: "+str(dst))

if __name__=="__main__":main()
