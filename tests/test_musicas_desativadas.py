#!/usr/bin/env python3
"""As seis demos originais ficam no Git, mas nao no catalogo nem no site."""
import json
from pathlib import Path
from urllib.parse import unquote

root=Path(__file__).resolve().parents[1]
music=root/"musicas"
demos={
    "horizonte-azul.mp3","cidade-neon.mp3","calma-de-outubro.mp3",
    "entre-ondas.mp3","rota-noturna.mp3","sol-de-vidro.mp3",
}
meta=json.loads((music/"metadados.json").read_text(encoding="utf-8"))
catalog=json.loads((root/"catalogo.json").read_text(encoding="utf-8"))
tracks=catalog["tracks"]
sources={unquote(t["src"]) for t in tracks if not t.get("isJingle")}
ids={t["id"] for t in tracks}
for filename in demos:
    assert (music/filename).is_file(), "Demo nao deve ser apagada: "+filename
    assert meta[filename]["enabled"] is False, "Demo reativada sem autorizacao: "+filename
    assert "./musicas/"+filename not in sources, "Demo voltou a biblioteca: "+filename
    assert filename.rsplit(".",1)[0] not in ids, "Demo voltou a radio: "+filename

disabled={filename for filename, info in meta.items()
          if isinstance(info,dict) and info.get("enabled") is False}
assert demos.issubset(disabled)
active=[t for t in tracks if not t.get("isJingle")]
assert len(active)>=150, "Biblioteca principal foi reduzida por engano"
assert all(t.get("artist")!="Pulso Originals" for t in active), "Faixa demonstrativa ainda visivel"
assert len(catalog["radioOrder"])==len(tracks)
assert len({t["id"] for t in tracks})==len(tracks)
print(f"DEMOS DESATIVADAS OK: {len(demos)} preservadas no Git, {len(active)} músicas ativas.")
