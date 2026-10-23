"""Delivery encoding of existing art; keep geometry and alpha, retain lossless originals.

This is deliberately a lossy colour encoding (quality 90), NOT pixel-identical.
No drawing, pose edits, resizing or generative content. Review at rendered size.
"""
from pathlib import Path
from hashlib import sha256
import json
from PIL import Image

directory = Path(__file__).resolve().parents[1] / 'public/assets/portraits'
report = []
for name in ('cast-v1', 'lin-expressions-v1', 'cast-thinking-v1'):
    source = directory / (name + '.png')
    destination = directory / (name + '-delivery.webp')
    with Image.open(source) as original:
        rgba = original.convert('RGBA')
        rgba.save(destination, 'WEBP', quality=90, method=6, exact=True)
        with Image.open(destination) as encoded:
            actual = encoded.convert('RGBA')
            assert actual.size == rgba.size
            assert actual.getchannel('A').tobytes() == rgba.getchannel('A').tobytes()
        report.append(dict(source=source.name, delivery=destination.name, quality=90,
                           width=rgba.width, height=rgba.height, bytes=destination.stat().st_size,
                           sha256=sha256(destination.read_bytes()).hexdigest(),
                           alphaSha256=sha256(rgba.getchannel('A').tobytes()).hexdigest()))
        print(destination.name, destination.stat().st_size)
(directory / 'delivery-report.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
