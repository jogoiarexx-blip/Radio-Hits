"""Gera seis trilhas INSTRUMENTAIS ORIGINAIS de demonstração (sem samples de terceiros).
Requer numpy e ffmpeg; só é necessário para recriar as demos, não para publicar.
"""
from __future__ import annotations
import json, subprocess, tempfile, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MUS = ROOT / 'musicas'
MUS.mkdir(exist_ok=True)
SR = 22050
SECONDS = 28
TRACKS = [
    ('horizonte-azul', 'Horizonte Azul', 'Pulso Originals', 'Chill', 88, [57, 60, 64, 67], '#78bd94', '#254e47'),
    ('cidade-neon', 'Cidade Néon', 'Pulso Originals', 'Eletrônica', 124, [52, 55, 59, 62], '#da8dff', '#4b2a83'),
    ('calma-de-outubro', 'Calma de Outubro', 'Pulso Originals', 'Lo-fi', 78, [55, 59, 62, 66], '#f0aa71', '#6e3b38'),
    ('entre-ondas', 'Entre Ondas', 'Pulso Originals', 'Ambient', 72, [50, 55, 59, 62], '#6daaf6', '#214a71'),
    ('rota-noturna', 'Rota Noturna', 'Pulso Originals', 'Synthwave', 113, [54, 57, 61, 64], '#ff8988', '#732d57'),
    ('sol-de-vidro', 'Sol de Vidro', 'Pulso Originals', 'Indie', 101, [59, 62, 66, 69], '#e2d87a', '#5c6531'),
]

def hz(midi): return 440 * 2**((midi - 69)/12)

def synth(i, seed):
    slug, title, artist, genre, bpm, notes, accent, background = TRACKS[i]
    rng = np.random.default_rng(seed)
    n = SR * SECONDS
    out = np.zeros(n, dtype=np.float32)
    beat = 60 / bpm
    chord_progress = [0, -3, 2, -5]
    chord_secs = 4 * beat
    # sustained pad, own chord progression per track
    for st in np.arange(0, SECONDS, chord_secs):
        shift = chord_progress[int(st / chord_secs) % len(chord_progress)]
        length = min(chord_secs + .12, SECONDS - st)
        a = int(st * SR); b = min(n, a+int(length*SR))
        tt = np.arange(b-a, dtype=np.float32) / SR
        envelope = np.minimum(1, tt/.45) * np.minimum(1, (length-tt)/.45)
        chord = sum(.5*np.sin(2*np.pi*hz(k+shift-12)*tt+0.13*i) + .15*np.sin(2*np.pi*hz(k+shift)*tt+.21*i) for k in (notes[0], notes[1], notes[2]))
        out[a:b] += chord.astype(np.float32) * envelope * (.082 if genre!='Ambient' else .15)
    # sine-ish bass with subtle saturation
    bass_pattern = [0, 0, 2, 0, 1, 2, 3, 1]
    for j, st in enumerate(np.arange(0,SECONDS,beat)):
        k=notes[bass_pattern[j%8] % 4]-24+chord_progress[(j//4)%4]
        length = min(beat*.87, SECONDS-st)
        a = int(st*SR); b=min(n,a+int(length*SR)); tt=np.arange(b-a,dtype=np.float32)/SR
        env = (1-np.exp(-tt*35))*np.exp(-tt*(2.5 if genre!='Ambient' else 1.2))
        out[a:b] += .24*(np.sin(2*np.pi*hz(k)*tt)+.10*np.sin(2*np.pi*hz(k)*2*tt))*env
    # bright, distinct melodic arpeggio; these notes are made for the demo
    step = beat / 2 if genre not in ('Ambient','Chill') else beat
    motifs = [[0,2,1,3,1,0,2,1], [2,3,1,0,2,1,3,2], [3,1,2,0,1,3,2,0], [0,1,3,2,0,2,3,1], [3,2,0,1,2,0,1,3], [1,3,0,2,3,1,0,2]]
    for j,st in enumerate(np.arange(0,SECONDS,step)):
        k = notes[motifs[i][j%8]] + 12 + chord_progress[(int(st/chord_secs))%4]
        length=min(step*.92, SECONDS-st)
        a=int(st*SR); b=min(n,a+int(length*SR)); tt=np.arange(b-a,dtype=np.float32)/SR
        wave = (np.sin(2*np.pi*hz(k)*tt) + .18*np.sin(2*np.pi*2*hz(k)*tt))
        amp = .09 if genre=='Ambient' else .16
        out[a:b] += (amp * np.exp(-tt*(5 if genre!='Ambient' else 1.8)) * wave).astype(np.float32)
    if genre not in ('Ambient',):
        # procedurally synthesized drums: no sampled audio
        for j, st in enumerate(np.arange(0,SECONDS,beat/2)):
            a=int(st*SR); length=min(int(.25*SR),n-a)
            if length<=0: continue
            tt=np.arange(length,dtype=np.float32)/SR
            if j%2==0:
                phase = 2*np.pi*(48*tt + 65*(1-np.exp(-tt*29))/29)
                kick = .24*np.sin(phase)*np.exp(-tt*25)
                out[a:a+length] += kick.astype(np.float32)
            elif j%4==3:
                snare=rng.normal(0,1,length).astype(np.float32)*np.exp(-tt*24)
                out[a:a+length] += .043*snare
            hats = rng.normal(0,1,min(length,int(.055*SR))).astype(np.float32)
            hh=np.arange(len(hats))/SR
            out[a:a+len(hats)] += hats*np.exp(-hh*87)*(.021 if genre=='Chill' else .034)
    # short, low-level echo for width in mono, radio-friendly volume
    delay=int(.17*SR)
    out[delay:] += .12*out[:-delay].copy()
    fade=np.minimum(1, np.arange(n,dtype=np.float32)/(SR*1.0))*np.minimum(1, (n-np.arange(n,dtype=np.float32))/(SR*1.2))
    out *= fade
    peak=max(float(np.max(np.abs(out))), 0.0001)
    out=np.tanh(out*min(1.45,.72/peak)).astype(np.float32)
    return out

for i,(slug,*_) in enumerate(TRACKS):
    dest=MUS/f'{slug}.mp3'
    wave=synth(i,222+i)
    with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
        import wave as wavefile
        with wavefile.open(temp.name,'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR)
            w.writeframes((np.clip(wave,-1,1)*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',temp.name,'-codec:a','libmp3lame','-b:a','96k','-metadata',f'title={TRACKS[i][1]}','-metadata','artist=Pulso Originals',str(dest)],check=True)
    print(dest.name, dest.stat().st_size)

metadata = {f'{slug}.mp3': {'title':title,'artist':artist,'genre':genre,'cover':f'./assets/capas/{slug}.svg','year':2026} for slug,title,artist,genre,*rest in TRACKS}
(MUS/'metadados.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Designed original SVG cover art. No outside image service, font or license needed.
for i,(slug,title,artist,genre,bpm,notes,color,bg) in enumerate(TRACKS):
    words=title.split(' ')
    if len(words)>1: title_lines=(' '.join(words[:-1]),words[-1])
    else: title_lines=(title,'')
    safe_title = lambda s: s.replace('&','&amp;').replace('<','&lt;')
    cx,cy=252+i*17,245-i*9
    shapes=[
      f'<circle cx="{cx}" cy="{cy}" r="165" stroke="{color}" stroke-opacity=".56" stroke-width="1.5" fill="none"/><circle cx="{cx}" cy="{cy}" r="115" fill="{color}" fill-opacity=".17"/><circle cx="{cx}" cy="{cy}" r="70" fill="{color}" fill-opacity=".44"/>',
      f'<path d="M-80 305 Q155 12 365 190 T620 80" fill="none" stroke="{color}" stroke-width="65" stroke-opacity=".4"/><path d="M-80 365 Q155 72 365 250 T620 140" fill="none" stroke="{color}" stroke-width="15" stroke-opacity=".65"/>',
      ''.join(f'<rect x="{80+k*32}" y="{132+(k*23)%88}" width="16" height="{215-(k*17)%98}" rx="7" fill="{color}" opacity="{.14+(k%4)*.12}"/>' for k in range(12)),
      ''.join(f'<circle cx="{250+(k*33)%250}" cy="{220+(k*39)%150}" r="{120-k*14}" fill="none" stroke="{color}" stroke-width="2" opacity="{.08+k*.06}"/>' for k in range(7)),
      f'<circle cx="256" cy="239" r="167" fill="{color}" opacity=".13"/><path d="M-15 330 300 84 532 325 183 548Z" fill="none" stroke="{color}" opacity=".8" stroke-width="28"/>',
      ''.join(f'<path d="M0 {130+k*38} Q160 {70+k*49} 280 {135+k*29}T530 {80+k*53}" fill="none" stroke="{color}" opacity="{.25+k*.08}" stroke-width="{4+k*2}"/>' for k in range(7))
    ]
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="#10171c"/></linearGradient><pattern id="noise" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".4" fill="#fff" opacity=".17"/></pattern></defs><rect width="512" height="512" fill="url(#a)"/>{shapes[i]}<rect width="512" height="512" fill="url(#noise)"/><path d="M32 44H480" stroke="#fff" opacity=".25"/><text x="32" y="31" font-size="15" font-family="Arial,sans-serif" letter-spacing="3" font-weight="700" fill="#fff">PULSO ORIGINALS</text><text x="32" y="419" font-size="40" font-weight="800" font-family="Arial,sans-serif" letter-spacing="-1" fill="#fff">{safe_title(title_lines[0])}</text><text x="32" y="460" font-size="40" font-weight="800" font-family="Arial,sans-serif" letter-spacing="-1" fill="{color}">{safe_title(title_lines[1])}</text><path d="M32 480H480" stroke="#fff" opacity=".25"/><text x="480" y="498" font-size="11" text-anchor="end" font-family="Arial,sans-serif" fill="#d5dfe1">{genre.upper()} • 001/{i+1:02d}</text></svg>'''
    (ROOT/'assets'/'capas'/f'{slug}.svg').write_text(svg,encoding='utf-8')
print('Generated cover art and original audio.')
