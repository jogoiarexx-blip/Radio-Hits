#!/usr/bin/env python3
"""Mede um trecho de cada faixa via FFmpeg EBU R128 e calcula atenuação conservadora.

Os MP3/M4A originais não são alterados. Nunca amplifica nem introduz clipping:
o player ajusta apenas o volume por música. O resultado é uma ESTIMATIVA,
pois a medição abrange um trecho, não necessariamente a faixa toda.
"""
from __future__ import annotations
import concurrent.futures
import array
import statistics
import sys
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MUSIC = ROOT / "musicas"
FILE = MUSIC / "volume-perfis.json"
AUDIO = {".mp3", ".m4a", ".ogg", ".opus", ".wav", ".flac", ".aac"}
SAMPLE_SECONDS = 35
WORKERS = 4

def parse_ebur128(log: str):
    summary = log.rsplit("Summary:", 1)[-1]
    matched = re.search(r"Integrated loudness:\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", summary)
    peak = re.search(r"True peak:\s*Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS", summary)
    if not matched:
        return None
    lufs = float(matched.group(1))
    tp = float(peak.group(1)) if peak else None
    if not math.isfinite(lufs) or lufs < -65 or lufs > 5:
        return None
    return round(lufs, 2), (round(tp, 2) if tp is not None else None)

def target_lufs(values):
    if len(values) < 5:
        return -16.0
    ordered = sorted(values)
    # Aproxima o volume das músicas menos agressivas, mas não silencia a rádio.
    percentile = ordered[round((len(ordered) - 1) * 0.25)]
    return round(min(-13.0, max(-19.0, percentile)), 2)

def attenuation_db(measured, target):
    return round(max(-10.0, min(0.0, float(target) - float(measured))), 2)

def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as audio:
        for piece in iter(lambda: audio.read(1024 * 1024), b""):
            digest.update(piece)
    return digest.hexdigest()

def scan_file(path, old):
    relative = path.relative_to(MUSIC).as_posix()
    digest = file_hash(path)
    if old.get("sha256") == digest and "lufs" in old:
        if "djIntroSec" in old and "djEnergyCueSec" in old:
            return relative, old, False
        return relative, {**old,
                          "djIntroSec": old["djIntroSec"] if "djIntroSec" in old else detect_intro_silence(path),
                          "djEnergyCueSec": detect_energy_cue(path)}, True
    try:
        from mutagen import File
        audio = File(path)
        duration = float(audio.info.length) if audio and audio.info else 0.0
    except Exception:
        duration = 0.0
    sample = min(SAMPLE_SECONDS, max(5.0, duration))
    # Trecho central, evitando o fade-in e também o fade-out.
    offset = max(0.0, (duration - sample) / 2)
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-loglevel", "info",
        "-ss", str(round(offset, 2)), "-i", str(path),
        "-t", str(round(sample, 2)), "-map", "0:a:0", "-vn", "-sn",
        "-af", "ebur128=peak=true", "-f", "null", "-"
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=100)
        parsed = parse_ebur128(result.stderr)
        if result.returncode or parsed is None:
            return relative, {"sha256": digest, "djIntroSec": detect_intro_silence(path), "djEnergyCueSec": detect_energy_cue(path), "error": "trecho sem nível válido"}, True
        return relative, {
            "sha256": digest, "djIntroSec": detect_intro_silence(path), "djEnergyCueSec": detect_energy_cue(path), "lufs": parsed[0], "truePeakDbfs": parsed[1],
            "sampleSeconds": round(sample, 2)
        }, True
    except (OSError, subprocess.TimeoutExpired) as error:
        return relative, {"sha256": digest, "djIntroSec": detect_intro_silence(path), "djEnergyCueSec": detect_energy_cue(path), "error": type(error).__name__}, True

def parse_intro_silence(log: str):
    """Conservative DJ cue: skip only measurable digital/near-digital silence at start.

    Does not try to identify vocals, musical intros or beat downbeats.
    """
    start = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", log)
    end = re.search(r"silence_end:\s*(\d+(?:\.\d+)?)", log)
    if not start or not end:
        return 0.0
    first = float(start.group(1))
    finish = float(end.group(1))
    if abs(first) > .12 or not .7 <= finish <= 9.0:
        return 0.0
    return round(min(8.0, max(0.0, finish - .15)), 2)


def detect_intro_silence(path: Path):
    """At most the first 12 seconds decoded once per file hash; fallback is zero."""
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-loglevel", "info",
        "-i", str(path), "-t", "12", "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-af", "silencedetect=noise=-42dB:d=0.30", "-f", "null", "-"
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=35)
        return parse_intro_silence(result.stderr) if result.returncode == 0 else 0.0
    except (OSError, subprocess.TimeoutExpired):
        return 0.0



def energy_cue_from_levels(levels, interval=0.5):
    """Find the first sustained rise of energy after a low-energy intro.

    This is a *candidate* DJ cue, not true beat/vocal recognition.
    Returns zero when evidence is weak, too early or too late.
    """
    if interval <= 0 or len(levels) < int(16 / interval):
        return 0.0
    start = max(1, int(1.0 / interval))
    end = min(len(levels), int(4.0 / interval))
    baseline = statistics.median(levels[start:end])
    if not math.isfinite(baseline) or baseline > -19:
        return 0.0
    threshold = max(-27.0, baseline + 9.0)
    lo = int(4.0 / interval)
    hi = min(len(levels) - 5, int(24.0 / interval))
    for i in range(lo, hi):
        window = levels[i:i + 5]
        if sum(value >= threshold for value in window) < 4:
            continue
        if max(window) < -21 or statistics.median(window) - baseline < 9:
            continue
        before = levels[max(0, i - 6):i]
        if before and statistics.median(before) > threshold - 4:
            continue
        return round(max(0.0, i * interval - 0.15), 2)
    return 0.0


def detect_energy_cue(path: Path):
    """Decode max 32 seconds at 8 kHz mono; keep only one timestamp."""
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(path), "-t", "32", "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-ac", "1", "-ar", "8000", "-f", "s16le", "-"
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=65)
        if result.returncode:
            return 0.0
        samples = array.array("h")
        samples.frombytes(result.stdout[:len(result.stdout) // 2 * 2])
        if sys.byteorder != "little":
            samples.byteswap()
        chunk = 4000
        levels = []
        for i in range(0, len(samples) - chunk + 1, chunk):
            power = sum(v * v for v in samples[i:i + chunk]) / (chunk * 32768 ** 2)
            levels.append(10 * math.log10(max(power, 1e-12)))
        return energy_cue_from_levels(levels)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return 0.0


def main():
    if not shutil.which("ffmpeg"):
        raise SystemExit("FFmpeg não instalado: não é possível medir o volume.")
    old = json.loads(FILE.read_text(encoding="utf-8")) if FILE.exists() else {}
    cache = old.get("tracks", {}) if isinstance(old, dict) else {}
    paths = sorted(p for p in MUSIC.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO)
    profiles = {}
    scans = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        jobs = [pool.submit(scan_file, path, cache.get(path.relative_to(MUSIC).as_posix(), {})) for path in paths]
        for job in concurrent.futures.as_completed(jobs):
            rel, profile, is_scan = job.result()
            profiles[rel] = profile
            scans += int(is_scan)
    valid = [p["lufs"] for p in profiles.values() if isinstance(p.get("lufs"), (int, float))]
    target = target_lufs(valid)
    for info in profiles.values():
        if "lufs" in info:
            info["gainDb"] = attenuation_db(info["lufs"], target)
    report = {"version": 1, "method": "EBU R128 35s central; apenas atenuação", "targetLufs": target,
              "tracks": dict(sorted(profiles.items()))}
    FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    quiet = sum(1 for p in profiles.values() if p.get("gainDb", 0) == 0 and "lufs" in p)
    print(f"VOLUME: {len(paths)} arquivos; {len(valid)} medidos; {scans} novos; alvo {target} LUFS; {quiet} sem atenuação.")
    for name, info in sorted(profiles.items()):
        if "error" in info:
            print("AVISO: análise indisponível:", name, info["error"])
    if len(valid) < len(paths) * 0.9:
        raise SystemExit("Medição insuficiente: menos de 90% dos arquivos válidos.")

if __name__ == "__main__":
    main()
