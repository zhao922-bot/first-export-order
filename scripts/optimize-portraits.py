"""Re-encode portraits losslessly; no resizing, repainting or pixel changes.

Run with Python + Pillow (WebP support). The checked-in WebP assets are used
directly by Vite; end users and production builds do not need Python.
"""
from pathlib import Path
from hashlib import sha256
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
directory = root / 'public' / 'assets' / 'portraits'
report = []
for name in ('cast-v1', 'lin-expressions-v1', 'cast-thinking-v1'):
    source = directory / (name + '.png')
    destination = directory / (name + '.webp')
    with Image.open(source) as original:
        rgba = original.convert('RGBA')
        rgba.save(destination, 'WEBP', lossless=True, exact=True, method=6)
        with Image.open(destination) as encoded:
            if encoded.convert('RGBA').tobytes() != rgba.tobytes():
                raise ValueError(f'Pixel mismatch: {name}')
        report.append({
            'source': source.name,
            'webp': destination.name,
            'width': rgba.width,
            'height': rgba.height,
            'rgbaSha256': sha256(rgba.tobytes()).hexdigest(),
            'pngBytes': source.stat().st_size,
            'webpBytes': destination.stat().st_size,
            'webpSha256': sha256(destination.read_bytes()).hexdigest(),
        })
        print(f'{name}: {source.stat().st_size} -> {destination.stat().st_size} bytes; identical RGBA')
(directory / 'encoding-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
