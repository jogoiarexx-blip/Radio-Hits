#!/usr/bin/env python3
"""Certifica imagens SVG, marca, artes de categoria e capas do catálogo."""
from pathlib import Path
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
CATALOG = json.loads((ROOT / 'catalogo.json').read_text(encoding='utf-8'))
REQUIRED = (
  'assets/branding/radio-hits-mark.svg',
  'assets/branding/hero-radio-hits.svg',
  'assets/capas/genero-80-90.svg',
  'assets/capas/genero-rock.svg',
  'assets/capas/genero-hiphop.svg',
  'assets/capas/genero-malhacao.svg',
  'assets/capas/genero-radio-hits.svg',
  'assets/favicon.svg',
)
errors=[]
for item in REQUIRED:
    if not (ROOT / item).is_file(): errors.append('Asset obrigatório faltando: ' + item)
svgs=list(ASSETS.rglob('*.svg'))
for path in svgs:
    try:
        root=ET.parse(path).getroot()
        if root.tag != '{http://www.w3.org/2000/svg}svg':
            errors.append('Elemento raiz inválido: '+str(path))
    except ET.ParseError as e: errors.append(f'SVG inválido: {path} -> {e}')
for track in CATALOG['tracks']:
    cover=track.get('cover','')
    if not cover.startswith('./assets/'):
        errors.append(f'Capa fora de assets/: {track.get("id")}: {cover}')
        continue
    if not (ROOT / cover[2:]).is_file():
        errors.append(f'Capa inexistente: {track.get("id")}: {cover}')
required_genre_art={
    'Rock':'genero-rock.svg',
    'Hip Hop':'genero-hiphop.svg',
    'Anos 80 e 90':'genero-80-90.svg',
    'Malhação Internacional 2003':'genero-malhacao.svg',
}
for t in CATALOG['tracks']:
    expected=required_genre_art.get(t.get('genre'))
    if expected and not t['cover'].endswith('/'+expected):
        errors.append(f'Arte de gênero incorreta: {t["id"]}')
print(f'Assets: {len(svgs)} SVGs válidos; {len(CATALOG["tracks"])} capas resolvidas; {len(errors)} erros.')
for e in errors: print('ERRO:', e)
if errors: raise SystemExit(1)
