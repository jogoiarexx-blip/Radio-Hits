#!/usr/bin/env python3
"""Curadoria musical determinística: mesma programação para todos os ouvintes.

A biblioteca mantém sua ordem original; apenas radioOrder é rearranjado.
O algoritmo não usa aleatoriedade do cliente. Penaliza artistas próximos,
gêneros repetidos e coloca gravações de demonstração espalhadas pelo ciclo.
"""
from __future__ import annotations
import hashlib
from collections import Counter


def _key(track):
    return str(track.get("id", ""))


def programar(musicas: list[dict]) -> list[dict]:
    """Retorna uma permutação determinística, sem perder nem repetir nenhuma faixa."""
    if len({_key(s) for s in musicas}) != len(musicas):
        raise ValueError("Existem IDs duplicados no catálogo")
    if any(not _key(s) for s in musicas):
        raise ValueError("Música sem ID")
    remaining = list(musicas)
    result = []
    counts = Counter(s.get("genre") or "Outros" for s in remaining)
    while remaining:
        recent = result[-4:]
        last_artist = {str(t.get("artist") or "").casefold() for t in recent}
        last_genres = [str(t.get("genre") or "Outros") for t in recent]
        def score(song):
            genre = str(song.get("genre") or "Outros")
            artist = str(song.get("artist") or "").casefold()
            artist_penalty = int(bool(artist) and artist in last_artist)
            genre_penalty = int(bool(last_genres) and last_genres[-1] == genre)
            three_penalty = int(len(last_genres)>=2 and last_genres[-2:] == [genre,genre])
            recent_penalty = last_genres.count(genre)
            # Evita colocar o mesmo artista muito próximo, depois diversifica gênero.
            tie = hashlib.sha256(("radiohits-grade-v1|" + _key(song)).encode()).hexdigest()
            return (artist_penalty, three_penalty, genre_penalty,
                    recent_penalty, -counts[genre], tie)
        winner = min(remaining, key=score)
        remaining.remove(winner)
        result.append(winner)
        counts[str(winner.get("genre") or "Outros")] -= 1
    return result


if __name__ == "__main__":
    print("Use programar(musicas) em scripts/gerar_catalogo.py")
