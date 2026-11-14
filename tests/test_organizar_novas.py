#!/usr/bin/env python3
"""Tests real Git-style moves with fixture binary files, without touching music."""
from __future__ import annotations
import json, tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from organizar_novas import RULES, match, organize, normalized

assert len(RULES) >= 88
assert len({r[0] for r in RULES}) == len(RULES)
for key, folder, genre, title, artist in RULES:
    assert match(key + ".mp3") is not None, key
assert match("Madonna - Papa Don't Preach (Official Video) [HD].m4a")[1] == "as melhores 80 e 90"
assert match("Vengaboys - Boom, Boom, Boom, Boom-new.mp3")[1] == "dance"
assert match("Eros Ramazzotti e Tina Turner - Cosas de la Vida (Can't Stop Thinking of You).m4a")[1] == "as melhores 80 e 90"
assert match("Joan Osborne - One Of Us (Official Music Video).m4a")[1] == "rock"
assert match("Whitesnake - Is This Love.mp3")[1] == "rock"
assert match("Shania Twain - You’re Still The One (Official Music Video)-new.mp3")[1] == "country"
assert match("Europe - The Final Countdown (Official Video).m4a")[1] == "rock"
assert match("Goo Goo Dolls – Iris [Official Music Video] [4K Remaster].m4a")[1] == "rock"
assert match("skillet Hero.m4a")[1] == "rock"
assert match("Starship - Nothing's Gonna Stop Us Now (Official Music Video) [HD].m4a")[1] == "as melhores 80 e 90"
assert match("Richard Marx - Right Here Waiting (Official Music Video).m4a")[1] == "romanticas"
assert match("Acalma minha tempestade   Frei Gilson ao vivo (360º).m4a")[1] == "religiosas"
assert match("Deixa Deus sonhar em ti (com Bruna Ramos)   Frei Gilson ao vivo (360º).m4a")[1] == "religiosas"
assert match("Eu Seguirei (Ao Vivo).m4a")[4] is None
assert match("Eu Te Levantarei.m4a")[4] is None
assert match("Terra Seca   DVD Não Vou Desistir   Fraternidade São João Paulo II.m4a")[1] == "religiosas"
assert match("Tu és o centro (com Bruna Ramos)   Frei Gilson ao vivo (360º).m4a")[1] == "religiosas"
for filename in (
    "AC DC - Back In Black (Official 4K Video).mp3",
    "In The End Official HD Music Video - Linkin Park.mp3",
    "Pearl Jam-Last Kiss [uvjTo-hRD5c].mp3",
    "Pink Floyd - Another Brick In The Wall, Part Two (Official Music Video).mp3",
    "Red Hot Chili Peppers - By The Way Official Music Video.mp3",
    "Seether - Broken ft. Amy Lee.mp3",
    "System Of A Down - Lonely Day (Official HD Video).mp3",
):
    rule=match(filename)
    assert rule is not None and rule[1]=="rock" and rule[2]=="Rock", (filename,rule)

# Garantir que "Maniac" nao seja confundida com a musica-tema "What a Feeling".
assert match("Michael Sembello - Maniac (From Flashdance ) (Official Audio).mp3")[3] == "Maniac"
assert match("Flashdance • What a Feeling • Irene Cara-new.mp3")[3] == "Flashdance... What a Feeling"
for filename, folder, genre, title, artist, year, key in [["Bon Jovi - Wanted Dead Or Alive (Official Music Video).mp3","rock","Rock","Wanted Dead or Alive","Bon Jovi",1986,"bon jovi wanted dead or alive"],["Eric Carmen - Hungry Eyes (Official HD Video).mp3","romanticas","Românticas","Hungry Eyes","Eric Carmen",1987,"eric carmen hungry eyes"],["Europe - Carrie (Official Video).mp3","rock","Rock","Carrie","Europe",1986,"europe carrie"],["Guns N Roses - Don t Cry.mp3","rock","Rock","Don't Cry","Guns N' Roses",1991,"guns n roses don t cry"],["Guns N Roses - Patience.mp3","rock","Rock","Patience","Guns N' Roses",1988,"guns n roses patience"],["Kansas - Carry On Wayward Son (Official Audio).mp3","rock","Rock","Carry On Wayward Son","Kansas",1976,"kansas carry on wayward son"],["Kenny Loggins - Danger Zone (Official Video - Top Gun).mp3","as melhores 80 e 90","Anos 80 e 90","Danger Zone","Kenny Loggins",1986,"kenny loggins danger zone"],["Kenny Loggins - Footloose (Official Video).mp3","as melhores 80 e 90","Anos 80 e 90","Footloose","Kenny Loggins",1984,"kenny loggins footloose"],["Kim Carnes - Bette Davis Eyes.mp3","as melhores 80 e 90","Anos 80 e 90","Bette Davis Eyes","Kim Carnes",1981,"kim carnes bette davis eyes"],["Limahl - Never Ending Story (Official Music Video).mp3","as melhores 80 e 90","Anos 80 e 90","The NeverEnding Story","Limahl",1984,"limahl never ending story"],["Men At Work - Down Under (Official HD Video).mp3","as melhores 80 e 90","Anos 80 e 90","Down Under","Men at Work",1981,"men at work down under"],["Simple Minds - Don t You (Forget About Me).mp3","as melhores 80 e 90","Anos 80 e 90","Don't You (Forget About Me)","Simple Minds",1985,"simple minds don t you"],["Skillet - _Rise_ lyric video [b3jQ0tFqG_0].mp3","rock","Rock","Rise","Skillet",2013,"skillet rise"],["Slow Ride- Foghat (Full Version) [GcCNcgoyG_0].mp3","rock","Rock","Slow Ride (Full Version)","Foghat",1975,"slow ride foghat"]]:
    found=match(filename)
    assert found is not None and found[1:5]==(folder,genre,title,artist),(filename,found)

spiderbait=match("Spiderbait - Black Betty (Official Video) [nU1VfYYKMDk].mp3")
assert spiderbait[1:5] == ("rock", "Rock", "Black Betty", "Spiderbait")
assert match("desconhecido.mp3") is None

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    music=root / "musicas"
    incoming=music / "novas-do-rar"
    incoming.mkdir(parents=True)
    (incoming / "INXS - By My Side.m4a").write_bytes(b"identidade-alfa")
    (root / "Avicii - Levels.mp3").write_bytes(b"faixa-root")
    (music / "Skillet - Monster (Official Video).m4a").write_bytes(b"identidade-terceira")
    (music / "Richard Marx - Right Here Waiting (Official Music Video).m4a").write_bytes(b"identidade-quarta")
    (music / "horizonte-azul.mp3").write_bytes(b"original-do-projeto")
    (music / "AC DC - Back In Black (Official 4K Video).mp3").write_bytes(b"rock-acdc-original")
    (music / "In The End Official HD Music Video - Linkin Park.mp3").write_bytes(b"rock-linkin-original")
    (music / "Eu Te Levantarei.m4a").write_bytes(b"arquivo-religioso")
    (music / "Acalma minha tempestade   Frei Gilson ao vivo (360º).m4a").write_bytes(b"outro-religioso")
    (music / "Sem Artista - Musica Desconhecida.m4a").write_bytes(b"desconhecida-na-raiz")
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
    assert len(result["moved"])==9, result
    assert len(result["unknown"])==2 and len(result["conflicts"])==1, result
    assert (music / "rock" / "INXS - By My Side.m4a").read_bytes()==b"identidade-alfa"
    assert (music / "dance" / "Avicii - Levels.mp3").read_bytes()==b"faixa-root"
    assert (music / "rock" / "Skillet - Monster (Official Video).m4a").read_bytes()==b"identidade-terceira"
    assert (music / "romanticas" / "Richard Marx - Right Here Waiting (Official Music Video).m4a").read_bytes()==b"identidade-quarta"
    assert (music / "religiosas" / "Eu Te Levantarei.m4a").read_bytes()==b"arquivo-religioso"
    assert (music / "religiosas" / "Acalma minha tempestade   Frei Gilson ao vivo (360º).m4a").read_bytes()==b"outro-religioso"
    assert (music / "rock" / "AC DC - Back In Black (Official 4K Video).mp3").read_bytes()==b"rock-acdc-original"
    assert (music / "rock" / "In The End Official HD Music Video - Linkin Park.mp3").read_bytes()==b"rock-linkin-original"
    assert (music / "horizonte-azul.mp3").read_bytes()==b"original-do-projeto"
    assert (music / "Sem Artista - Musica Desconhecida.m4a").read_bytes()==b"desconhecida-na-raiz"
    assert not any("horizonte-azul" in f for f in result["unknown"])
    assert (music / "dance" / "Vengaboys - Boom, Boom, Boom, Boom-new.mp3").read_bytes()==b"identidade-beta"
    assert (incoming / "nao sei musica.mp3").exists()
    assert (incoming / "Rick Astley - Never Gonna Give You Up.m4a").read_bytes()==b"conflito"
    assert (music / "as melhores 80 e 90" / "Rick Astley - Never Gonna Give You Up.m4a").read_bytes()==b"original-intocavel"
    after=json.loads((music/"metadados.json").read_text())
    assert after["rock/INXS - By My Side.m4a"]["genre"]=="Rock"
    assert after["rock/INXS - By My Side.m4a"]["downloadAllowed"] is False
    assert after["antigo.mp3"]["title"]=="Antigo"
    assert after["rock/AC DC - Back In Black (Official 4K Video).mp3"]["artist"]=="AC/DC"
    assert after["rock/AC DC - Back In Black (Official 4K Video).mp3"]["downloadAllowed"] is False
    assert after["rock/In The End Official HD Music Video - Linkin Park.mp3"]["genre"]=="Rock"
    assert after["religiosas/Eu Te Levantarei.m4a"]["genre"] == "Música Religiosa"
    assert "artist" not in after["religiosas/Eu Te Levantarei.m4a"]
    assert after["religiosas/Acalma minha tempestade   Frei Gilson ao vivo (360º).m4a"]["artist"] == "Frei Gilson"
    assert "novas-do-rar/INXS - By My Side.m4a" not in after
    volumes=json.loads((music/"volume-perfis.json").read_text())["tracks"]
    assert "rock/INXS - By My Side.m4a" in volumes
    assert "novas-do-rar/INXS - By My Side.m4a" not in volumes
    repeat=organize(root)
    assert not repeat["moved"], "deve ser idempotente"

print("ORGANIZAR NOVAS OK: regras únicas, raiz e pasta temporaria, integridade, metadados, volume e conflitos.")
