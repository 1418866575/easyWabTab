#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
健身动作写实图的肌群标注渲染器。

输入：一张干净的真实照片（不含任何文字）
输出：照片上叠加中文肌群名 + 曲线箭头 + 靶心圆点

设计约定（全系列统一）：
  - 橙色实底胶囊 = 主要肌群（primary）
  - 白底蓝边胶囊 = 辅助肌群（assist）
  - 细曲线引导线带白色描边，保证在任何背景上都可读
  - 全部尺寸按图片宽度等比缩放，基准宽 1536

用法：修改下方 SPEC 后运行 python scripts/fitness-annotate.py
"""
import io
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_REG = 'C:/Windows/Fonts/msyh.ttc'

SS = 3                       # 超采样倍率，绘制后降采样得到平滑边缘
BASE_W = 1536.0              # 尺寸基准
C_PRIMARY = (240, 74, 22)    # 主要肌群橙
C_ASSIST = (47, 111, 237)    # 辅助肌群蓝
C_ASSIST_TXT = (23, 58, 138)
HL_PRIMARY = (255, 96, 40)    # 高亮色斑：比胶囊更亮更饱和，压在皮肤上才看得出来
HL_ASSIST = (58, 130, 246)
C_INK = (24, 24, 27)


def _font(path, size):
    return ImageFont.truetype(path, max(8, int(round(size))))


def _quad(p0, p1, p2, t):
    u = 1 - t
    return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])


def _bezier(p0, p1, p2, n=90):
    return [_quad(p0, p1, p2, i / (n - 1)) for i in range(n)]


def _pill_anchor(center, target, hw, hh, gap):
    """从胶囊中心朝目标方向，求胶囊边界上的起点（矩形近似）。"""
    dx, dy = target[0] - center[0], target[1] - center[1]
    dist = math.hypot(dx, dy) or 1.0
    ux, uy = dx / dist, dy / dist
    tx = hw / abs(ux) if abs(ux) > 1e-6 else 1e9
    ty = hh / abs(uy) if abs(uy) > 1e-6 else 1e9
    t = min(tx, ty) + gap
    return (center[0] + ux * t, center[1] + uy * t)


def _arrow_head(draw, tip, direction, size, color, outline):
    ux, uy = direction
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    base = (tip[0] - ux * size, tip[1] - uy * size)
    pts = [tip,
           (base[0] + px * size * 0.52, base[1] + py * size * 0.52),
           (base[0] - px * size * 0.52, base[1] - py * size * 0.52)]
    draw.polygon(pts, fill=outline)
    k = 0.74
    tip2 = (tip[0] - ux * size * 0.16, tip[1] - uy * size * 0.16)
    base2 = (base[0] + ux * size * (1 - k) * 0.9, base[1] + uy * size * (1 - k) * 0.9)
    pts2 = [tip2,
            (base2[0] + px * size * 0.52 * k, base2[1] + py * size * 0.52 * k),
            (base2[0] - px * size * 0.52 * k, base2[1] - py * size * 0.52 * k)]
    draw.polygon(pts2, fill=color)


def _soft_blob(canvas, cx, cy, rx, ry, ang, color, strength):
    """在画布上叠一块柔边椭圆色斑，用于标出目标肌群。"""
    pts, n = [], 96
    ca, sa = math.cos(ang), math.sin(ang)
    for i in range(n):
        t = 2 * math.pi * i / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + ex * ca - ey * sa, cy + ex * sa + ey * ca))
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(rx, ry) * 0.50))
    blob = Image.new('RGBA', canvas.size, color + (0,))
    blob.putalpha(mask.point(lambda v: int(v * strength / 255.0)))
    canvas.alpha_composite(blob)


def render(src, out, labels, legend=True, maxw=None, face=None):
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    PX = SS                     # 图片坐标 -> 画布坐标
    U = SS * (W / BASE_W)       # 视觉尺寸单位（字号、线宽等）

    canvas = im.resize((W * SS, H * SS), Image.LANCZOS)

    # ---- 0. 人脸虚化（去个人特征，保留人体与肌肉细节） ----
    if face:
        if max(abs(v) for v in face) <= 1.5:     # 允许用 0-1 的小数比例描述
            face = [face[0] * W, face[1] * H, face[2] * W, face[3] * H]
        fx, fy, frx, fry = [v * PX for v in face]
        blurred = canvas.filter(ImageFilter.GaussianBlur(max(10 * U, frx * 0.42)))
        mask = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(mask).ellipse(
            [fx - frx, fy - fry, fx + frx, fy + fry], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(max(4 * U, frx * 0.14)))
        canvas = Image.composite(blurred, canvas, mask)

    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    f_name = _font(FONT_BOLD, 40 * U)
    f_tag = _font(FONT_REG, 23 * U)
    pad_x, pad_y = 26 * U, 15 * U
    radius = 20 * U
    line_w = 4.0 * U
    halo_w = 9.0 * U
    head_sz = 15 * U
    gap = 10 * U

    # ---- 1. 计算每个标签的胶囊尺寸，供引线起点使用 ----
    boxes = []
    for lb in labels:
        name = lb['text']
        tw = d.textlength(name, font=f_name)
        bw, bh = tw + pad_x * 2, 40 * U + pad_y * 2
        cx, cy = lb['pill'][0] * PX, lb['pill'][1] * PX
        # 胶囊超出画布时回收到边界内，避免被裁切
        m = 8 * U
        cx = min(max(cx, bw / 2 + m), W * SS - bw / 2 - m)
        cy = min(max(cy, bh / 2 + m), H * SS - bh / 2 - m)
        boxes.append({
            'lb': lb, 'cx': cx, 'cy': cy,
            'hw': bw / 2, 'hh': bh / 2, 'bw': bw, 'bh': bh, 'tw': tw,
            'color': C_PRIMARY if lb['role'] == 'primary' else C_ASSIST,
        })

    # ---- 1b. 肌群高亮色斑（教学重点：直接把目标肌肉“点亮”） ----
    for b in boxes:
        lb = b['lb']
        if lb.get('hl') is False:
            continue
        rx, ry = lb.get('hl') or [0.055 * W, 0.045 * H]
        _soft_blob(canvas,
                   lb['target'][0] * PX, lb['target'][1] * PX,
                   rx * PX, ry * PX,
                   math.radians(lb.get('ang', 0)),
                   HL_PRIMARY if lb['role'] == 'primary' else HL_ASSIST,
                   172 if lb['role'] == 'primary' else 150)

    # ---- 2. 引线（先画白色描边，再画彩色线） ----
    for b in boxes:
        tgt = (b['lb']['target'][0] * PX, b['lb']['target'][1] * PX)
        start = _pill_anchor((b['cx'], b['cy']), tgt, b['hw'], b['hh'], gap)
        dist = math.hypot(tgt[0] - start[0], tgt[1] - start[1]) or 1.0
        mx, my = (start[0] + tgt[0]) / 2, (start[1] + tgt[1]) / 2
        nx, ny = -(tgt[1] - start[1]) / dist, (tgt[0] - start[0]) / dist
        bend = dist * 0.14
        ctrl = (mx + nx * bend, my + ny * bend)
        pts = _bezier(start, ctrl, tgt)
        # 收在靶心外沿，留出圆点
        cut = int(len(pts) * 0.965)
        pts = pts[:cut]
        d.line(pts, fill=(255, 255, 255, 205), width=int(halo_w), joint='curve')
    for b in boxes:
        tgt = (b['lb']['target'][0] * PX, b['lb']['target'][1] * PX)
        start = _pill_anchor((b['cx'], b['cy']), tgt, b['hw'], b['hh'], gap)
        dist = math.hypot(tgt[0] - start[0], tgt[1] - start[1]) or 1.0
        mx, my = (start[0] + tgt[0]) / 2, (start[1] + tgt[1]) / 2
        nx, ny = -(tgt[1] - start[1]) / dist, (tgt[0] - start[0]) / dist
        ctrl = (mx + nx * dist * 0.14, my + ny * dist * 0.14)
        pts = _bezier(start, ctrl, tgt)[: int(90 * 0.965)]
        d.line(pts, fill=b['color'] + (255,), width=int(line_w), joint='curve')
        tail, prev = pts[-1], pts[-6]
        _arrow_head(d, tail, (tail[0] - prev[0], tail[1] - prev[1]),
                    head_sz, b['color'] + (255,), (255, 255, 255, 235))

    # ---- 3. 靶心：外发光 + 白环 + 实心点 ----
    glow = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for b in boxes:
        tx, ty = b['lb']['target'][0] * PX, b['lb']['target'][1] * PX
        gd.ellipse([tx - 30 * U, ty - 30 * U, tx + 30 * U, ty + 30 * U],
                   fill=b['color'] + (66,))
    layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(12 * U)))
    for b in boxes:
        tx, ty = b['lb']['target'][0] * PX, b['lb']['target'][1] * PX
        d.ellipse([tx - 11 * U, ty - 11 * U, tx + 11 * U, ty + 11 * U],
                  fill=(255, 255, 255, 250))
        d.ellipse([tx - 7 * U, ty - 7 * U, tx + 7 * U, ty + 7 * U],
                  fill=b['color'] + (255,))

    # ---- 4. 胶囊标签（带柔和投影） ----
    shadow = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for b in boxes:
        sd.rounded_rectangle(
            [b['cx'] - b['hw'], b['cy'] - b['hh'] + 4 * U,
             b['cx'] + b['hw'], b['cy'] + b['hh'] + 4 * U],
            radius=radius, fill=(12, 16, 24, 105))
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(7 * U)))

    for b in boxes:
        x0, y0 = b['cx'] - b['hw'], b['cy'] - b['hh']
        x1, y1 = b['cx'] + b['hw'], b['cy'] + b['hh']
        if b['lb']['role'] == 'primary':
            d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=C_PRIMARY + (255,))
            txt_fill = (255, 255, 255, 255)
        else:
            d.rounded_rectangle([x0, y0, x1, y1], radius=radius,
                                fill=(238, 244, 255, 247),
                                outline=(47, 111, 237, 255), width=int(3 * U))
            txt_fill = C_ASSIST_TXT + (255,)
        asc, desc = f_name.getmetrics()
        ty = b['cy'] - (asc + desc) / 2
        d.text((b['cx'] - b['tw'] / 2, ty), b['lb']['text'],
               font=f_name, fill=txt_fill)

    # ---- 5. 图例 ----
    if legend:
        items = [('主要肌群', C_PRIMARY + (255,), (255, 255, 255, 255)),
                 ('辅助肌群', (238, 244, 255, 247), C_ASSIST_TXT + (255,))]
        rows = []
        for name, fill, ink in items:
            rows.append((name, fill, ink, d.textlength(name, font=f_tag)))
        bw = max(r[3] for r in rows) + 46 * U
        bh = len(rows) * 40 * U + 18 * U
        x0, y0 = 26 * U, 26 * U
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=12 * U,
                            fill=(16, 20, 28, 128))
        cy = y0 + 9 * U
        for name, fill, ink, tw in rows:
            d.ellipse([x0 + 14 * U, cy + 10 * U, x0 + 30 * U, cy + 26 * U],
                      fill=fill, outline=(255, 255, 255, 120), width=int(1.5 * U))
            d.text((x0 + 38 * U, cy + 6 * U), name, font=f_tag, fill=(255, 255, 255, 236))
            cy += 40 * U

    canvas = Image.alpha_composite(canvas, layer)
    tw = min(W, maxw) if maxw else W
    canvas = canvas.resize((tw, int(round(H * tw / float(W)))), Image.LANCZOS).convert('RGB')
    canvas.save(out, quality=90, subsampling=1, optimize=True)
    return out


def render_step(src, out, face=None, caption='', maxw=None):
    """动作分解图：只做人脸虚化 + 角标，不叠肌群标注（避免与主图重复）。"""
    im = Image.open(src).convert('RGBA')
    W, H = im.size
    PX = SS
    U = SS * (W / BASE_W)
    canvas = im.resize((W * SS, H * SS), Image.LANCZOS)

    if face:
        if max(abs(v) for v in face) <= 1.5:     # 允许用 0-1 的小数比例描述
            face = [face[0] * W, face[1] * H, face[2] * W, face[3] * H]
        fx, fy, frx, fry = [v * PX for v in face]
        blurred = canvas.filter(ImageFilter.GaussianBlur(max(10 * U, frx * 0.42)))
        mask = Image.new('L', canvas.size, 0)
        ImageDraw.Draw(mask).ellipse(
            [fx - frx, fy - fry, fx + frx, fy + fry], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(max(4 * U, frx * 0.14)))
        canvas = Image.composite(blurred, canvas, mask)

    if caption:
        layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        f = _font(FONT_BOLD, 32 * U)
        tw = d.textlength(caption, font=f)
        pad_x, pad_y = 20 * U, 11 * U
        bw, bh = tw + pad_x * 2, 32 * U + pad_y * 2
        x0, y0 = 24 * U, 24 * U
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=12 * U,
                            fill=(16, 20, 28, 155))
        asc, desc = f.getmetrics()
        d.text((x0 + pad_x, y0 + (bh - (asc + desc)) / 2), caption,
               font=f, fill=(255, 255, 255, 242))
        canvas = Image.alpha_composite(canvas, layer)

    tw2 = min(W, maxw) if maxw else W
    canvas = canvas.resize((tw2, int(round(H * tw2 / float(W)))), Image.LANCZOS).convert('RGB')
    canvas.save(out, quality=90, subsampling=1, optimize=True)
    return out


if __name__ == '__main__':
    spec_path = sys.argv[1] if len(sys.argv) > 1 else 'scripts/fitness-labels.json'
    root = os.path.dirname(os.path.dirname(os.path.abspath(spec_path)))
    with io.open(spec_path, encoding='utf-8') as fh:
        spec = json.load(fh)
    for key, item in spec.items():
        src = os.path.join(root, item['src'])
        out = os.path.join(root, item['out'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if item.get('mode') == 'step':
            render_step(src, out, item.get('face'), item.get('caption', ''),
                        item.get('maxw'))
        else:
            render(src, out, item['labels'], item.get('legend', True),
                   item.get('maxw'), item.get('face'))
        print('ok', key, '->', out)
