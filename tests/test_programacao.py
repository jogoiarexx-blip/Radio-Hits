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
assert len(tracks)==23
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
print("GRADE OK: permutação estável, diversidade, integridade, blocos homogêneos e IDs únicos.")
