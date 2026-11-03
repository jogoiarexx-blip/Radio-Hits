#!/usr/bin/env python3
"""Testes unitários reais: grade musical estática, variada, determinística."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from programar_radio import programar

tracks=[]
for genre, artists in {
    "Rock":["Toto","Toto","ACDC","ACDC","Skillet","Skillet","Foo Fighters"],
    "Hip Hop":["50 Cent","50 Cent","50 Cent","Akon","Nelly"],
    "Anos 80 e 90":["Madonna","Tears for Fears","Celine Dion","Toto"],
    "Música Religiosa":["Frei Gilson","Frei Gilson","Frei Gilson","Fraternidade"],
    "Dance":["Vengaboys","Vengaboys","Ice MC","Stevie B"],
}.items():
    for i, artist in enumerate(artists):
        tracks.append({"id":f"{genre}-{i}","genre":genre,"artist":artist})
assert len(tracks)==24
original=[t["id"] for t in tracks]
one=programar(tracks)
two=programar(list(reversed(tracks)))
assert [t["id"] for t in one]==[t["id"] for t in two], "independência da ordem de chegada"
assert [t["id"] for t in programar(tracks)]==[t["id"] for t in one], "grade estável"
assert len(one)==len(tracks)
assert set(t["id"] for t in one)==set(original), "não perder músicas"
assert [t["id"] for t in tracks]==original, "não alterar biblioteca original"
assert not any(one[i]["artist"]==one[i-1]["artist"] for i in range(1,len(one))), "artistas repetidos imediatamente"
assert not any(one[i]["genre"]==one[i-1]["genre"]==one[i-2]["genre"] for i in range(2,len(one))), "três gêneros consecutivos"
assert programar([])==[]
assert len(programar([{"id":"sola","artist":"A","genre":"Rock"}]))==1
assert len(programar([{"id":str(i),"artist":"A","genre":"Rock"} for i in range(5)]))==5, "deve tolerar catálogo homogêneo"
try:
    programar([{"id":"dup"},{"id":"dup"}])
    raise AssertionError("ID duplicado precisa bloquear publicação")
except ValueError:
    pass
# Regressão: adicionar sete Rocks a uma biblioteca diversificada não pode
# forçar todos os últimos Rocks a tocarem colados no fim do ciclo.
stress=[]
distribution={
    "Rock":34,
    "Anos 80 e 90":28,
    "Hip Hop":17,
    "Malhação Internacional 2003":16,
    "Outros":7,
    "Música Religiosa":6,
    "Dance":5,
    "Românticas":3,
    "Pop":2,
    "Clássicos":2,
    "Country":2,
    "MPB":1,
}
for genre, n in distribution.items():
    for i in range(n):
        # Artistas distintos isolam o teste da distribuição de gênero.
        stress.append({"id":f"{genre}:{i}","genre":genre,"artist":f"Artista {genre} {i}"})
order=programar(stress)
assert len(order)==len(stress)
assert len({x["id"] for x in order})==len(stress)
assert not any(order[i]["genre"]==order[i-1]["genre"]==order[i-2]["genre"]
               for i in range(2,len(order))), "grade com bloco triplo no cenário de 34 Rocks"
assert [x["id"] for x in order]==[x["id"] for x in programar(list(reversed(stress)))]
print("GRADE OK: permutação estável, gêneros dispersos com 34 Rocks, artistas e IDs únicos.")
