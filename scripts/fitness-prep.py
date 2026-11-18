#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""健身图批量预处理：补掉平台水印 + 生成逐线标号的测点图。

用法：
  python scripts/fitness-prep.py <id>=<源图路径> [...]
产出：
  _fitness_img/base_<id>.png   母版（无水印，供 fitness-annotate.py 使用）
  _fitness_img/grid_<id>.png   测点图（每 100px 一条线，线旁标注原图坐标）
"""
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_fitness_img')
FONT = 'C:/Windows/Fonts/arialbd.ttf'


def patch_watermark(im):
    """平台水印固定在右下角，用其正上方的同尺寸区域覆盖（背景为纯色墙时无缝）。"""
    W, H = im.size
    w = int(W * 0.22)
    h = int(H * 0.055)
    x0, y0 = W - w, H - h
    patch = im.crop((x0, y0 - h - 2, W, y0 - 2)).resize((w, h), Image.LANCZOS)
    im.paste(patch, (x0, y0))
    return im


def make_grid(im, out, step=100):
    g = im.copy()
    d = ImageDraw.Draw(g)
    W, H = g.size
    f = ImageFont.truetype(FONT, 26)
    for x in range(step, W, step):
        d.line([(x, 0), (x, H)], fill=(0, 255, 255), width=1)
        d.text((x + 3, 4), str(x), font=f, fill=(255, 255, 0))
    for y in range(step, H, step):
        d.line([(0, y), (W, y)], fill=(0, 255, 255), width=1)
        d.text((5, y - 30), str(y), font=f, fill=(0, 255, 255))
    g.save(out)


def make_zoom(im, out, box=None, step=50, maxw=1180):
    """居中裁出动作区域并放大，每条线的坐标数字直接标在线旁。"""
    W, H = im.size
    if box is None:
        box = (int(W * 0.18), int(H * 0.10), int(W * 0.82), int(H * 0.92))
    cw, ch = box[2] - box[0], box[3] - box[1]
    s = min(2.0, maxw / float(cw))
    g = im.crop(box).resize((int(cw * s), int(ch * s)), Image.LANCZOS)
    d = ImageDraw.Draw(g)
    f = ImageFont.truetype(FONT, 24)
    x = (box[0] // step + 1) * step
    while x < box[2]:
        xx = (x - box[0]) * s
        d.line([(xx, 0), (xx, g.size[1])], fill=(0, 255, 255), width=1)
        d.text((xx + 2, 2), str(x), font=f, fill=(255, 255, 0))
        x += step
    y = (box[1] // step + 1) * step
    while y < box[3]:
        yy = (y - box[1]) * s
        d.line([(0, yy), (g.size[0], yy)], fill=(0, 255, 255), width=1)
        d.text((2, yy - 26), str(y), font=f, fill=(0, 255, 255))
        y += step
    g.save(out)


if __name__ == '__main__':
    for arg in sys.argv[1:]:
        key, src = arg.split('=', 1)
        im = Image.open(src).convert('RGB')
        im = patch_watermark(im)
        im.save(os.path.join(OUT, 'base_%s.png' % key))
        make_zoom(im, os.path.join(OUT, 'zoom_%s.png' % key))
        print('ok', key, im.size)
