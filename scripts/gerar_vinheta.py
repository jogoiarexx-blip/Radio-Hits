#!/usr/bin/env python3
"""Gera vinheta ORIGINAL com locução neural pt-BR. Não imita uma pessoa real.

Requer Python >=3.10, edge-tts e ffmpeg/ffprobe. Executar:
    python scripts/gerar_vinheta.py
O arquivo MP3 final será salvo em vinhetas/radio-hits-cada-5.mp3.
"""
import asyncio
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "vinhetas" / "radio-hits-cada-5.mp3"
VOICE = "pt-BR-AntonioNeural"
TEXT = "Rádio Hits! Os sucessos que marcaram época e as músicas que fazem parte da sua história. Rádio Hits: a sua frequência musical!"

async def voice_track(target):
    import edge_tts
    await edge_tts.Communicate(TEXT, VOICE, rate="-2%", pitch="+0Hz").save(str(target))

def duration(path):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return float(p.stdout.strip())

def main():
    for program in ["ffmpeg", "ffprobe"]:
        if not shutil.which(program):
            raise SystemExit("Ferramenta de áudio não disponível: " + program)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="radiohits_vinheta_") as dirname:
        raw = Path(dirname) / "locucao.mp3"
        asyncio.run(voice_track(raw))
        if not raw.exists() or raw.stat().st_size < 9000:
            raise RuntimeError("Locução neural não foi gerada corretamente")
        # Nota de abertura original, sem trilhas ou gravações de terceiros.
        # Entrada da voz aos 300ms, leve compressor e limite anti-clipping.
        command = [
            "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(raw),
            "-f", "lavfi", "-i", "sine=frequency=659.25:sample_rate=44100:duration=0.6",
            "-filter_complex",
            "[1:a]volume=0.055,afade=t=out:st=0.25:d=0.35[n];"
            "[0:a]adelay=300|300,highpass=f=90,acompressor=threshold=0.15:ratio=2:attack=10:release=110[v];"
            "[n][v]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.89[out]",
            "-map", "[out]", "-ar", "44100", "-ac", "2",
            "-c:a", "libmp3lame", "-b:a", "112k", str(OUTPUT)
        ]
        subprocess.run(command, check=True)
    length = duration(OUTPUT)
    if not 5 <= length <= 30 or OUTPUT.stat().st_size < 30000:
        raise RuntimeError("Vinheta com tamanho/duração inesperados: " + str(length))
    print(json.dumps({"file": str(OUTPUT.relative_to(ROOT)), "voice": VOICE,
                      "durationSeconds": round(length, 3), "bytes": OUTPUT.stat().st_size,
                      "text": TEXT}, ensure_ascii=False))

if __name__ == "__main__":
    main()
