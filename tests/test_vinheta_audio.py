#!/usr/bin/env python3
"""Verificações de integridade e mixagem da vinheta feminina original."""
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import gerar_vinheta as generator

FILE=ROOT/"vinhetas/radio-hits-cada-5.mp3"
assert generator.VOICE=="pt-BR-FranciscaNeural", "Locução precisa ser feminina e brasileira"
assert generator.BPM>=120, "O instrumental precisa ter uma batida animada"
assert FILE.is_file() and FILE.stat().st_size>60000, "MP3 não gerado"
probe=subprocess.run(
    ["ffprobe","-v","error","-show_entries",
     "format=duration:stream=codec_name,sample_rate,channels",
     "-of","json",str(FILE)],capture_output=True,text=True,check=True)
info=json.loads(probe.stdout)
seconds=float(info["format"]["duration"])
stream=info["streams"][0]
assert 6 <= seconds <= 30, f"Duração incompatível com a grade da rádio: {seconds}"
assert stream["codec_name"]=="mp3"
assert int(stream["sample_rate"])==44100
assert stream["channels"]==2, "Fundo musical precisa ser estéreo"
pcm=subprocess.run(
    ["ffmpeg","-v","error","-i",str(FILE),
     "-f","f32le","-acodec","pcm_f32le","-ac","2","-ar","44100","-"],
    capture_output=True,check=True).stdout
samples=np.frombuffer(pcm,dtype="<f4").reshape((-1,2))
assert len(samples)>6*44100
assert np.isfinite(samples).all()
peak=float(np.max(np.abs(samples)))
rms=float(np.sqrt(np.mean(samples**2)))
assert .09<peak<=.91, f"Pico fora do padrão: {peak:.4f}"
assert .016<rms<.4, f"Volume inesperado: {rms:.4f}"
# Uma base original estéreo (pan de synth/hihat) não pode colapsar em mono.
stereo_diff=float(np.sqrt(np.mean((samples[:,0]-samples[:,1])**2)))
assert stereo_diff>.0012, f"Instrumental estéreo não detectado: {stereo_diff:.4f}"
# Pelo menos nove dos blocos de 0.5s têm áudio efetivo; evita gerar
# uma vinheta vazia com apenas o efeito de entrada.
block=int(.5*44100)
block_rms=[float(np.sqrt(np.mean(samples[i:i+block]**2)))
           for i in range(0,len(samples)-block,block)]
assert sum(v>.014 for v in block_rms)>=9, "Áudio muito curto ou com trechos silenciosos"
print(json.dumps({
    "status":"OK", "voice":generator.VOICE, "bpm":generator.BPM,
    "durationSeconds":round(seconds,3), "peakDbFS":round(20*math.log10(peak),2),
    "rmsDbFS":round(20*math.log10(rms),2),
    "stereoDifference":round(stereo_diff,4)
},ensure_ascii=False))
