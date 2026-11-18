#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把若干张分解图拼成带百分比刻度的校对小样（2 列），用于人工判读人脸位置。

用法：python scripts/fitness-step-sheet.py <out.png> <base_x.png> ...
刻度为占画面宽/高的百分比，直接写进 fitness-labels.json 的 face 即可（支持小数）。
"""
import sys

from PIL import Image, ImageDraw, ImageFont

CELL = 560
FONT = 'C:/Windows/Fonts/arialbd.ttf'


def main(out, paths, cols=2):
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new('RGB', (CELL * cols, (CELL + 26) * rows), (250, 250, 250))
    d = ImageDraw.Draw(sheet)
    fl = ImageFont.truetype(FONT, 20)
    fs = ImageFont.truetype(FONT, 15)
    for i, p in enumerate(paths):
        im = Image.open(p).convert('RGB')
        im.thumbnail((CELL - 10, CELL - 10), Image.LANCZOS)
        cx, cy = (i % cols) * CELL, (i // cols) * (CELL + 26) + 26
        ox, oy = cx + (CELL - im.size[0]) // 2, cy
        sheet.paste(im, (ox, oy))
        w, h = im.size
        for k in range(1, 10):
            x = ox + int(w * k / 10)
            y = oy + int(h * k / 10)
            d.line([(x, oy), (x, oy + h)], fill=(0, 255, 255), width=1)
            d.line([(ox, y), (ox + w, y)], fill=(0, 255, 255), width=1)
            d.text((x - 8, oy + 2), str(k * 10), font=fs, fill=(255, 255, 0))
            d.text((ox + 2, y - 16), str(k * 10), font=fs, fill=(0, 255, 255))
        d.text((cx + 4, cy - 24), p.split('/')[-1].replace('base_', '').replace('.png', ''), font=fl, fill=(200, 30, 0))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
