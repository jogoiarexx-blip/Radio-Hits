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

assert generator.VOICE=="pt-BR-FranciscaNeural"
assert len(generator.VARIANTS)==3
assert len({x['filename'] for x in generator.VARIANTS})==3
assert all(x['bpm']>=120 for x in generator.VARIANTS)

hashes=set()
measurements=[]
for variant in generator.VARIANTS:
    FILE=ROOT/"vinhetas"/variant['filename']
    assert FILE.is_file() and FILE.stat().st_size>60_000, f"MP3 ausente: {FILE}"
    probe=subprocess.run(
        ["ffprobe","-v","error","-show_entries",
         "format=duration:stream=codec_name,sample_rate,channels",
         "-of","json",str(FILE)],capture_output=True,text=True,check=True)
    info=json.loads(probe.stdout)
    seconds=float(info['format']['duration'])
    stream=info['streams'][0]
    assert 6 <= seconds <= 30, f"Vinheta fora de 6–30s: {FILE}, {seconds}"
    assert stream['codec_name']=='mp3' and int(stream['sample_rate'])==44100
    assert stream['channels']==2
    import hashlib
    digest=hashlib.sha256(FILE.read_bytes()).hexdigest()
    assert digest not in hashes, "Vinhetas não podem repetir o mesmo áudio"
    hashes.add(digest)
    pcm=subprocess.run(
        ['ffmpeg','-v','error','-i',str(FILE),
         '-f','f32le','-acodec','pcm_f32le','-ac','2','-ar','44100','-'],
        capture_output=True,check=True).stdout
    samples=np.frombuffer(pcm,dtype='<f4').reshape((-1,2))
    assert len(samples)>6*44100
    assert np.isfinite(samples).all(), "Áudio inválido"
    peak=float(np.max(np.abs(samples)))
    rms=float(np.sqrt(np.mean(samples**2)))
    assert .09<peak<=.91, f"Pico incorreto: {FILE}, {peak}"
    assert .016<rms<.4, f"Volume incorreto: {FILE}, {rms}"
    stereo_diff=float(np.sqrt(np.mean((samples[:,0]-samples[:,1])**2)))
    assert stereo_diff>.0012, f"Base musical estéreo ausente: {FILE}"
    block=int(.5*44100)
    chunk_rms=[float(np.sqrt(np.mean(samples[i:i+block]**2)))
               for i in range(0,len(samples)-block,block)]
    assert sum(v>.014 for v in chunk_rms)>=9, f"Vinheta com falha de áudio: {FILE}"
    measurements.append({
        'name':variant['name'],'seconds':round(seconds,3),
        'peakDbFS':round(20*math.log10(peak),2),
        'rmsDbFS':round(20*math.log10(rms),2),
        'stereoDiff':round(stereo_diff,4)
    })
print(json.dumps({'status':'OK','voice':generator.VOICE,'variants':measurements},ensure_ascii=False))
