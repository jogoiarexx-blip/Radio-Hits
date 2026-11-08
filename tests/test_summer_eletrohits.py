#!/usr/bin/env python3
"""Confere integridade da pasta Summer EletroHits sem mover audios."""
from pathlib import Path
from urllib.parse import unquote
import json

root=Path(__file__).resolve().parents[1]
folder=root/"musicas"/"Summer EletroHits"
audio={".mp3",".m4a",".ogg",".opus",".wav",".flac",".aac"}
assert folder.is_dir(), "Pasta Summer EletroHits ausente"
files={p.relative_to(root).as_posix() for p in folder.rglob("*")
       if p.is_file() and p.suffix.lower() in audio}
assert len(files)>=15, "As 15 musicas da colecao original devem permanecer"

metadata=json.loads((root/"musicas"/"metadados.json").read_text(encoding="utf-8"))
catalog=json.loads((root/"catalogo.json").read_text(encoding="utf-8"))
songs=[song for song in catalog["tracks"] if not song.get("isJingle")]
found=[t for t in songs if unquote(t["src"]).startswith("./musicas/Summer EletroHits/")]
paths={"./"+s for s in files}
assert len(found)==len(files), "Todas as faixas da pasta precisam entrar no catalogo"
assert {unquote(t["src"]) for t in found}==paths, "Audio Summer ausente ou caminho inesperado"
assert len({t["id"] for t in found})==len(found), "IDs duplicados na colecao Summer"
for track in found:
    assert track["genre"]=="Summer EletroHits", track["src"]
    assert track["downloadAllowed"] is False, track["src"]
    assert track["artist"] and track["title"], track["src"]
    filename=unquote(track["src"]).split("/Summer EletroHits/",1)[1]
    info=metadata.get("Summer EletroHits/"+filename)
    if info is not None:
        assert track["id"]==info.get("id"), ("ID alterado",filename)
        assert track["artist"]==info["artist"], ("Artista alterado",filename)
        assert track["title"]==info["title"], ("Titulo alterado",filename)
print(f"SUMMER OK: {len(found)} musicas, pasta preservada, IDs e metadados validos.")
