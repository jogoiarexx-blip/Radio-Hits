#!/usr/bin/env python3
"""Cria a vinheta ORIGINAL Radio Hits: voz feminina pt-BR + instrumental pop.

Voz sintetizada; não imita locutor humano identificado. A trilha instrumental
é composta matematicamente aqui, sem samples, músicas de terceiros ou IA musical.
Requer Python >=3.10, edge-tts, numpy, ffmpeg e ffprobe.
Saída compatível com a grade UTC existente: vinhetas/radio-hits-cada-5.mp3
"""
from __future__ import annotations

import asyncio
import json
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "vinhetas" / "radio-hits-cada-5.mp3"
VOICE = "pt-BR-FranciscaNeural"
TEXT = (
    "É sucesso atrás de sucesso! Você tá na Rádio Hits! "
    "Música boa, energia lá em cima! Rádio Hits... a sua frequência musical!"
)
SAMPLE_RATE = 44100
BPM = 128


async def voice_track(target: Path) -> None:
    import edge_tts
    await edge_tts.Communicate(TEXT, VOICE, rate="+11%", pitch="+4Hz").save(str(target))


def duration(path: Path) -> float:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True)
    return float(proc.stdout.strip())


def original_instrumental(path: Path, seconds: float) -> None:
    """Beat dançante original: 128 BPM, acordes Am–F–C–G, baixo, palmas e synth.

    É tudo gerado por osciladores e ruído pseudoaleatório determinístico;
    não incorpora samples, loops gravados ou áudio externo.
    """
    import numpy as np
    sr = SAMPLE_RATE
    length = int(math.ceil(seconds * sr))
    mix = np.zeros((length, 2), dtype=np.float64)
    rng = np.random.default_rng(20261102)
    beat = 60 / BPM
    bar = beat * 4

    def add(start: float, samples, pan: float = 0.5) -> None:
        n0 = max(0, int(round(start * sr)))
        if n0 >= length:
            return
        mono = np.asarray(samples, dtype=np.float64)
        count = min(len(mono), length - n0)
        if count <= 0:
            return
        mix[n0:n0 + count, 0] += mono[:count] * math.sqrt(1 - pan)
        mix[n0:n0 + count, 1] += mono[:count] * math.sqrt(pan)

    def tone(freq: float, at: float, span: float, amplitude: float,
             decay: float = 4.0, pan: float = 0.5) -> None:
        n = int(span * sr)
        if n < 3:
            return
        t = np.arange(n, dtype=np.float64) / sr
        sound = (np.sin(2 * np.pi * freq * t)
                 + 0.19 * np.sin(4 * np.pi * freq * t)
                 + 0.07 * np.sin(6 * np.pi * freq * t))
        env = (1 - np.exp(-t * 120)) * np.exp(-decay * t)
        tail = min(n, int(sr * 0.045))
        env[-tail:] *= np.linspace(1, 0, tail)
        add(at, amplitude * sound * env, pan)

    # Progressão leve e positiva. Cada acorde dura um compasso.
    chords = [
        (220.00, 261.63, 329.63),   # Lá menor
        (174.61, 220.00, 261.63),   # Fá maior
        (196.00, 261.63, 329.63),   # Dó maior (inversão)
        (196.00, 246.94, 293.66),  # Sol maior
    ]
    for nbar in range(int(math.ceil(seconds / bar))):
        beginning = nbar * bar
        chord = chords[nbar % len(chords)]
        for j, hz in enumerate(chord):
            # Sustentação ambiente discreta (não encobre a voz).
            tone(hz, beginning, min(bar + 0.14, seconds - beginning), .047, .55,
                 .38 + j * .12)
        for n8 in range(8):
            at = beginning + n8 * beat / 2
            if at >= seconds:
                break
            tone(chord[(n8 * 2 + 1) % 3] * 2, at, .22, .036, 11,
                 .25 if n8 % 2 else .74)

    # Baixo pulsante e bateria eletrônica 4/4.
    for count in range(int(math.ceil(seconds / beat))):
        at = count * beat
        chord = chords[(count // 4) % len(chords)]
        bass_hz = chord[0] / 2
        tone(bass_hz, at + .022, min(.37, seconds - at), .15, 5.8, .5)

        kick_duration = min(.28, seconds - at)
        n = int(kick_duration * sr)
        t = np.arange(n, dtype=np.float64) / sr
        kick_phase = 2 * np.pi * (72 * t + 68 * (1 - np.exp(-29 * t)) / 29)
        kick = np.sin(kick_phase) * np.exp(-19 * t) * .38
        add(at, kick)

        if count % 4 in (1, 3):
            n = int(min(.18, seconds - at) * sr)
            t = np.arange(n, dtype=np.float64) / sr
            noise = rng.standard_normal(n)
            noise[1:] -= .7 * noise[:-1].copy()
            clap = noise * np.exp(-26 * t) * .08
            add(at, clap, .55)

    # Hi-hat entre as batidas, com panorama sutil.
    for k in range(int(math.ceil(seconds / (beat / 2)))):
        at = k * beat / 2
        n = int(min(.09, seconds - at) * sr)
        if n <= 1:
            continue
        t = np.arange(n) / sr
        noise = rng.standard_normal(n)
        noise[1:] -= noise[:-1].copy() * .8
        add(at, noise * np.exp(-52 * t) * (.023 if k % 2 else .018),
            .34 if k % 2 else .66)

    # Assinatura melódica exclusiva: sobe na abertura e encerra com brilho.
    hook = [(659.25, 0.0), (783.99, .23), (880.0, .47),
            (1046.5, .71), (880.0, .95)]
    for hz, at in hook:
        if at < seconds:
            tone(hz, at, min(.38, seconds - at), .050, 7.5, .62)
    tone(1046.50, max(0, seconds - .67), .55, .067, 4, .48)

    # Entradas/saídas naturais; normalização é somente do instrumental.
    count_in = min(length, int(sr * .09))
    mix[:count_in] *= np.linspace(0, 1, count_in)[:, None]
    count_out = min(length, int(sr * .57))
    mix[-count_out:] *= np.linspace(1, 0, count_out)[:, None]
    peak = float(np.max(np.abs(mix)))
    if peak <= .0001:
        raise RuntimeError("Instrumental gerado sem áudio")
    mix *= min(1.0, .68 / peak)
    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())


def main() -> None:
    for command in ("ffmpeg", "ffprobe"):
        if not shutil.which(command):
            raise SystemExit("Ferramenta necessária ausente: " + command)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="radiohits_feminina_") as dirname:
        raw = Path(dirname) / "locucao_feminina.mp3"
        backing = Path(dirname) / "trilha_original.wav"
        asyncio.run(voice_track(raw))
        if not raw.is_file() or raw.stat().st_size < 9000:
            raise RuntimeError("A locução feminina não foi gerada")
        length_voice = duration(raw)
        length_music = max(8.0, length_voice + .76)
        if not 5 <= length_voice <= 26 or length_music > 30:
            raise RuntimeError("Locução muito longa para uma vinheta curta")
        original_instrumental(backing, length_music)
        # A voz começa aos 270ms. Sidechain: instrumental abaixa
        # automaticamente durante a fala e sobe nos espaços entre frases.
        # Limiter e filtro passa-altas protegem inteligibilidade e evitam clipping.
        filters = (
            "[0:a]aformat=sample_rates=44100:channel_layouts=stereo,"
            "highpass=f=95,acompressor=threshold=0.10:ratio=2.6:attack=8:release=110,"
            "volume=1.35,adelay=270|270[voz];"
            "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,"
            "volume=0.62[base];"
            "[base][voz]sidechaincompress=threshold=0.065:ratio=9:"
            "attack=12:release=270[musica];"
            "[musica][voz]amix=inputs=2:duration=longest:normalize=0,"
            "alimiter=limit=0.89[out]"
        )
        proc = [
            "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(raw), "-i", str(backing),
            "-filter_complex", filters,
            "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k",
            "-ar", "44100", "-ac", "2", str(OUTPUT)
        ]
        subprocess.run(proc, check=True)
    length = duration(OUTPUT)
    if not 6 <= length <= 30 or OUTPUT.stat().st_size < 60_000:
        raise RuntimeError("Vinheta com duração ou tamanho incorretos")
    print(json.dumps({
        "file": str(OUTPUT.relative_to(ROOT)),
        "voice": VOICE,
        "style": "pop animado 128 BPM, música original, voz feminina em primeiro plano",
        "durationSeconds": round(length, 3),
        "bytes": OUTPUT.stat().st_size, "text": TEXT
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
