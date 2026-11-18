#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把若干张标注图拼成一张校对用缩略图集（一次目视检查多张）。"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 560
FONT = 'C:/Windows/Fonts/msyhbd.ttc'


def main(out, ids, cols=2):
    spec = json.load(io.open(os.path.join(ROOT, 'scripts/fitness-labels.json'), encoding='utf-8'))
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new('RGB', (CELL * cols, (CELL + 34) * rows), (245, 245, 245))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 24)
    for i, key in enumerate(ids):
        im = Image.open(os.path.join(ROOT, spec[key]['out'])).convert('RGB')
        im.thumbnail((CELL - 8, CELL - 8), Image.LANCZOS)
        cx, cy = (i % cols) * CELL, (i // cols) * (CELL + 34) + 34
        sheet.paste(im, (cx + (CELL - im.size[0]) // 2, cy))
        d.text((cx + 8, cy - 30), key, font=f, fill=(200, 30, 0))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
