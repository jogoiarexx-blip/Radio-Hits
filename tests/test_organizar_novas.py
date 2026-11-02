#!/usr/bin/env python3
"""Tests real Git-style moves with fixture binary files, without touching music."""
from __future__ import annotations
import json, tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from organizar_novas import RULES, match, organize, normalized

assert len(RULES) == 35
assert len({r[0] for r in RULES}) == 35
for key, folder, genre, title, artist in RULES:
    assert match(key + ".mp3") is not None, key
assert match("Madonna - Papa Don't Preach (Official Video) [HD].m4a")[1] == "as melhores 80 e 90"
assert match("Vengaboys - Boom, Boom, Boom, Boom-new.mp3")[1] == "dance"
assert match("Eros Ramazzotti e Tina Turner - Cosas de la Vida (Can't Stop Thinking of You).m4a")[1] == "as melhores 80 e 90"
assert match("Joan Osborne - One Of Us (Official Music Video).m4a")[1] == "rock"
assert match("Whitesnake - Is This Love.mp3")[1] == "rock"
assert match("desconhecido.mp3") is None

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    music=root / "musicas"
    incoming=music / "novas-do-rar"
    incoming.mkdir(parents=True)
    (incoming / "INXS - By My Side.m4a").write_bytes(b"identidade-alfa")
    (incoming / "Vengaboys - Boom, Boom, Boom, Boom-new.mp3").write_bytes(b"identidade-beta")
    (incoming / "nao sei musica.mp3").write_bytes(b"nao alterar")
    (incoming / "Rick Astley - Never Gonna Give You Up.m4a").write_bytes(b"conflito")
    (music / "as melhores 80 e 90").mkdir()
    (music / "as melhores 80 e 90" / "Rick Astley - Never Gonna Give You Up.m4a").write_bytes(b"original-intocavel")
    metadata={"novas-do-rar/INXS - By My Side.m4a":{"artist":"INXS","downloadAllowed":True},
              "antigo.mp3":{"title":"Antigo"}}
    (music / "metadados.json").write_text(json.dumps(metadata))
    (music / "volume-perfis.json").write_text(json.dumps({"tracks":{
        "novas-do-rar/INXS - By My Side.m4a":{"sha256":"abcd","lufs":-15.2}
    }}))
    result=organize(root)
    assert len(result["moved"])==2, result
    assert len(result["unknown"])==1 and len(result["conflicts"])==1, result
    assert (music / "rock" / "INXS - By My Side.m4a").read_bytes()==b"identidade-alfa"
    assert (music / "dance" / "Vengaboys - Boom, Boom, Boom, Boom-new.mp3").read_bytes()==b"identidade-beta"
    assert (incoming / "nao sei musica.mp3").exists()
    assert (incoming / "Rick Astley - Never Gonna Give You Up.m4a").read_bytes()==b"conflito"
    assert (music / "as melhores 80 e 90" / "Rick Astley - Never Gonna Give You Up.m4a").read_bytes()==b"original-intocavel"
    after=json.loads((music/"metadados.json").read_text())
    assert after["rock/INXS - By My Side.m4a"]["genre"]=="Rock"
    assert after["rock/INXS - By My Side.m4a"]["downloadAllowed"] is False
    assert after["antigo.mp3"]["title"]=="Antigo"
    assert "novas-do-rar/INXS - By My Side.m4a" not in after
    volumes=json.loads((music/"volume-perfis.json").read_text())["tracks"]
    assert "rock/INXS - By My Side.m4a" in volumes
    assert "novas-do-rar/INXS - By My Side.m4a" not in volumes
    repeat=organize(root)
    assert not repeat["moved"], "deve ser idempotente"

print("ORGANIZAR NOVAS OK: 35 regras, arquivos intactos, categorias, metadados, volume e conflitos.")
