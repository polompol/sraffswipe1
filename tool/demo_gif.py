#!/usr/bin/env python3
"""Собирает анимированный GIF-демо из готовых экранов TMA (mockups/tma_*.png).

Запуск: сначала `python tool/tma_mockups.py` (генерит экраны), потом этот скрипт.
Результат: landing/assets/demo.gif + landing/assets/overview.png.
"""
import os
import shutil

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(__file__))
MOCK = os.path.join(ROOT, "mockups")
OUT = os.path.join(ROOT, "landing", "assets")
os.makedirs(OUT, exist_ok=True)

SCREENS = ["tma_feed", "tma_filters", "tma_match", "tma_pricing", "tma_funnel", "tma_profile"]

frames = []
target_h = 760
for name in SCREENS:
    p = os.path.join(MOCK, f"{name}.png")
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB")
    w = int(im.width * target_h / im.height)
    im = im.resize((w, target_h))
    # фон-подложка под единый размер кадра
    canvas = Image.new("RGB", (460, target_h + 20), (244, 238, 228))
    canvas.paste(im, ((460 - w) // 2, 10))
    frames.append(canvas)

if frames:
    frames[0].save(
        os.path.join(OUT, "demo.gif"),
        save_all=True,
        append_images=frames[1:],
        duration=1100,
        loop=0,
        optimize=True,
    )
    print("saved landing/assets/demo.gif", len(frames), "frames")

# Обзор для секции «как это выглядит».
src = os.path.join(MOCK, "tma_overview.png")
if os.path.exists(src):
    shutil.copy(src, os.path.join(OUT, "overview.png"))
    print("copied overview.png")
