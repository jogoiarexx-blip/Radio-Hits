#!/usr/bin/env python3
"""Organiza músicas novas da raiz e novas-do-rar por gênero sem reencodar.

Execução local: python scripts/organizar_novas.py
Apenas arquivos reconhecidos são movidos. Desconhecidos ficam onde estão.
"""
from __future__ import annotations

import json
import shutil
import unicodedata
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIO = {".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac", ".aac"}

# Regra pelo título: classificação musical, não apenas pela década.
# Formato: (identificador do título, pasta de destino, gênero, título, artista).
RULES = [
    ("take on me", "as melhores 80 e 90", "Anos 80 e 90", "Take On Me", "a-ha"),
    ("trevo", "mpb", "MPB", "Trevo (Tu)", "ANAVITÓRIA"),
    ("don t dream it s over", "rock", "Rock", "Don't Dream It's Over", "Crowded House"),
    ("can t help falling in love", "classicos", "Clássicos", "Can't Help Falling in Love", "Elvis Presley"),
    ("suspicious minds", "classicos", "Clássicos", "Suspicious Minds", "Elvis Presley"),
    ("cosas de la vida", "as melhores 80 e 90", "Anos 80 e 90", "Cosas de la Vida (Can't Stop Thinking of You)", "Eros Ramazzotti e Tina Turner"),
    ("flashdance", "as melhores 80 e 90", "Anos 80 e 90", "Flashdance... What a Feeling", "Irene Cara"),
    ("glory of love", "romanticas", "Românticas", "Glory of Love", None),
    ("mmmbop", "as melhores 80 e 90", "Anos 80 e 90", "MMMBop", "Hanson"),
    ("think about the way", "dance", "Dance", "Think About the Way", "Ice MC"),
    ("by my side", "rock", "Rock", "By My Side", "INXS"),
    ("i m yours", "pop", "Pop", "I'm Yours", "Jason Mraz"),
    ("one of us", "rock", "Rock", "One of Us", "Joan Osborne"),
    ("self control", "as melhores 80 e 90", "Anos 80 e 90", "Self Control", "Laura Branigan"),
    ("forever after all", "country", "Country", "Forever After All", "Luke Combs"),
    ("papa don t preach", "as melhores 80 e 90", "Anos 80 e 90", "Papa Don't Preach", "Madonna"),
    ("rude", "reggae", "Reggae", "Rude", "MAGIC!"),
    ("coco jamboo", "dance", "Dance", "Coco Jamboo", "Mr. President"),
    ("torn", "as melhores 80 e 90", "Anos 80 e 90", "Torn", "Natalie Imbruglia"),
    ("bizarre love triangle", "as melhores 80 e 90", "Anos 80 e 90", "Bizarre Love Triangle", "New Order"),
    ("those eyes", "pop", "Pop", "Those Eyes", "New West"),
    ("it s a sin", "as melhores 80 e 90", "Anos 80 e 90", "It's a Sin", "Pet Shop Boys"),
    ("under the bridge", "rock", "Rock", "Under the Bridge", "Red Hot Chili Peppers"),
    ("never gonna give you up", "as melhores 80 e 90", "Anos 80 e 90", "Never Gonna Give You Up", "Rick Astley"),
    ("run to me", "romanticas", "Românticas", "Run to Me", None),
    ("maria magdalena", "as melhores 80 e 90", "Anos 80 e 90", "(I'll Never Be) Maria Magdalena", "Sandra"),
    ("you re still the one", "country", "Country", "You're Still the One", "Shania Twain"),
    ("sara", "rock", "Rock", "Sara", "Starship"),
    ("valerie", "rock", "Rock", "Valerie", "Steve Winwood"),
    ("spring love", "dance", "Dance", "Spring Love", "Stevie B"),
    ("everybody wants to rule the world", "as melhores 80 e 90", "Anos 80 e 90", "Everybody Wants to Rule the World", "Tears for Fears"),
    ("un break my heart", "as melhores 80 e 90", "Anos 80 e 90", "Un-Break My Heart", "Toni Braxton"),
    ("boom boom boom boom", "dance", "Dance", "Boom, Boom, Boom, Boom!!", "Vengaboys"),
    ("shalala lala", "dance", "Dance", "Shalala Lala", "Vengaboys"),
    ("is this love", "rock", "Rock", "Is This Love", "Whitesnake"),
    ("europe the final countdown", "rock", "Rock", "The Final Countdown", "Europe"),
    ("foreigner i want to know what love is", "rock", "Rock", "I Want to Know What Love Is", "Foreigner"),
    ("goo goo dolls iris", "rock", "Rock", "Iris", "Goo Goo Dolls"),
    ("metallica nothing else matters", "rock", "Rock", "Nothing Else Matters", "Metallica"),
    ("nirvana smells like teen spirit", "rock", "Rock", "Smells Like Teen Spirit", "Nirvana"),
    ("richard marx right here waiting", "romanticas", "Românticas", "Right Here Waiting", "Richard Marx"),
    ("skillet awake and alive", "rock", "Rock", "Awake and Alive", "Skillet"),
    ("skillet monster", "rock", "Rock", "Monster", "Skillet"),
    ("skillet hero", "rock", "Rock", "Hero", "Skillet"),
    ("starship nothing s gonna stop us now", "as melhores 80 e 90", "Anos 80 e 90", "Nothing's Gonna Stop Us Now", "Starship"),
    ("survivor eye of the tiger", "rock", "Rock", "Eye of the Tiger", "Survivor"),
]


def normalized(value: str) -> str:
    # Aspas curvas no nome (ex.: You’re) devem separar palavras,
    # não colar "youre" e impedir reconhecimento da música.
    value = value.translate(str.maketrans({"\u2019": "'", "\u2018": "'", "\u02bc": "'", "\u201b": "'"}))
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", value))


def match(filename: str):
    name = normalized(Path(filename).stem)
    hits = [rule for rule in RULES if rule[0] in name]
    # Exige correspondência única. Não faz inferência para arquivo ambíguo.
    return hits[0] if len(hits) == 1 else None


def organize(root: Path = ROOT):
    music = root / "musicas"
    source = music / "novas-do-rar"
    # Aceita uploads tanto na pasta de entrada quanto na raiz de musicas/.
    # A raiz contém também as seis faixas demonstrativas do projeto; elas
    # não serão movidas porque só trabalhamos com regras explícitas.
    candidates = []
    if source.exists():
        candidates.extend(p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO)
    candidates.extend(p for p in music.iterdir() if p.is_file() and p.suffix.lower() in AUDIO)
    if not candidates:
        return {"moved": [], "unknown": [], "conflicts": [], "counts": {}}
    metadata_path = music / "metadados.json"
    profiles_path = music / "volume-perfis.json"
    metadata = json.loads(metadata_path.read_text("utf-8")) if metadata_path.exists() else {}
    profiles = json.loads(profiles_path.read_text("utf-8")) if profiles_path.exists() else {}
    if not isinstance(metadata, dict) or not isinstance(profiles, dict):
        raise ValueError("Metadados ou perfis inválidos")
    profile_tracks = profiles.get("tracks", {})
    moved, unknown, conflicts = [], [], []
    for file in sorted(candidates):
        rel = file.relative_to(music).as_posix()
        rule = match(file.name)
        if rule is None:
            # Os seis MP3 originais do projeto ficam na raiz; não tratá-los
            # como uploads não reconhecidos.
            if file.parent != music:
                unknown.append(rel)
            continue
        _, folder, genre, title, artist = rule
        destination = music / folder / file.name
        new_rel = destination.relative_to(music).as_posix()
        # Não sobrescrever outro arquivo, mesmo com nomes iguais.
        if destination.exists() or new_rel in metadata:
            conflicts.append({"from": rel, "to": new_rel})
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(file), str(destination))
        original = metadata.pop(rel, {})
        original = original if isinstance(original, dict) else {}
        updated = dict(original)
        updated["title"] = title
        if artist is not None:
            updated["artist"] = artist
        updated["genre"] = genre
        updated.setdefault("cover", "./assets/capas/padrao.svg")
        updated["downloadAllowed"] = False
        metadata[new_rel] = updated
        if rel in profile_tracks:
            profile_tracks[new_rel] = profile_tracks.pop(rel)
        moved.append({"from": rel, "to": new_rel, "genre": genre, "title": title})
    if moved:
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if profiles_path.exists():
            profiles_path.write_text(json.dumps(profiles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = dict(sorted(Counter(m["genre"] for m in moved).items()))
    result = {"moved": moved, "unknown": unknown, "conflicts": conflicts, "counts": counts}
    print("ORGANIZAR NOVAS:", len(moved), "movidas,", len(unknown), "não reconhecidas,", len(conflicts), "conflitos")
    for m in moved: print("MOVIDA:", m["from"], "=>", m["to"])
    for path in unknown: print("REVISAR:", path)
    for c in conflicts: print("CONFLITO (mantido):", c["from"], "=>", c["to"])
    return result


if __name__ == "__main__":
    organize()
