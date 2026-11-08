#!/usr/bin/env python3
"""Confere a correspondencia entre originais e edicoes leves."""
from pathlib import Path
from urllib.parse import unquote
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/"catalogo.json").read_text(encoding="utf-8"))
songs=[x for x in data["tracks"] if not x.get("isJingle")]
names=set()
for song in songs:
    source=unquote(song["src"]).removeprefix("./")
    light=unquote(song["lowSrc"]).removeprefix("./")
    assert source.startswith("musicas/"),source
    assert light.startswith("musicas-leves/"),light
    assert light.endswith(".m4a"),light
    assert light.removeprefix("musicas-leves/")==source.removeprefix("musicas/").rsplit(".",1)[0]+".m4a"
    assert light not in names,light
    names.add(light)
print(f"VARIANTES LEVES OK: {len(songs)} fontes diferentes, URLs sem colisoes.")
