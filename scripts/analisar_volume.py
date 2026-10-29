#!/usr/bin/env python3
"""Mede um trecho de cada faixa via FFmpeg EBU R128 e calcula atenuação conservadora.

Os MP3/M4A originais não são alterados. Nunca amplifica nem introduz clipping:
o player ajusta apenas o volume por música. O resultado é uma ESTIMATIVA,
pois a medição abrange um trecho, não necessariamente a faixa toda.
"""
from __future__ import annotations
import concurrent.futures
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
        return relative, old, False
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
            return relative, {"sha256": digest, "error": "trecho sem nível válido"}, True
        return relative, {
            "sha256": digest, "lufs": parsed[0], "truePeakDbfs": parsed[1],
            "sampleSeconds": round(sample, 2)
        }, True
    except (OSError, subprocess.TimeoutExpired) as error:
        return relative, {"sha256": digest, "error": type(error).__name__}, True

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
