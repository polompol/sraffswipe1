#!/usr/bin/env python3
"""Рекламный вертикальный GIF (9:16) для рилсов/сторис StaffSwipe.

Крупный текст-призыв + мини-демо свайпа и мэтча в кримсон-теме.
Город меняется одной строкой (CITY) — пересобери под нужный город.

Запуск: python tool/reel_gif.py  →  mockups/reel.gif
"""
import os

from PIL import Image, ImageDraw, ImageFont

CITY = "Москве"  # ← поменяй на свой город (в предложном падеже: «в Москве», «в Казани»)
BOT = "@staffswipe_bot"  # ← username твоего бота

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)
FD = "/usr/share/fonts/truetype/dejavu"


def F(s, b=True):
    name = "DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"
    return ImageFont.truetype(os.path.join(FD, name), int(s))


CRIM = (158, 27, 50)
CRIM_D = (110, 18, 34)
CRIM_S = (185, 72, 90)
GOLD = (210, 170, 80)
BG = (246, 241, 234)
CARD = (255, 255, 255)
INK = (32, 27, 24)
MUTED = (139, 128, 120)
LINE = (236, 228, 217)
WHITE = (255, 255, 255)
W, H = 360, 640


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ease(t):
    return t * t * (3 - 2 * t)


def vgrad(w, h, a, b):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        c = lerp(a, b, y / max(1, h - 1))
        for x in range(w):
            px[x, y] = c
    return im


def rr(d, box, r, **k):
    d.rounded_rectangle(box, radius=r, **k)


def T(d, xy, s, f, fill=WHITE, a="mm"):
    d.text(xy, s, font=f, fill=fill, anchor=a)


def crim_bg():
    return vgrad(W, H, CRIM, CRIM_D)


def confetti(d, seed=1, n=34, ytop=40, ybot=600):
    import random
    random.seed(seed)
    cols = [GOLD, CRIM_S, WHITE, (224, 130, 145)]
    for k in range(n):
        x = random.randint(8, W - 8)
        y = random.randint(ytop, ybot)
        s = random.randint(4, 9)
        d.rounded_rectangle([x, y, x + s, y + s], radius=2, fill=cols[k % 4])


def logo(d, cx, cy, sz=34):
    """Бейдж-молния + StaffSwipe."""
    half = sz * 1.55
    T(d, (cx, cy), "Staff", F(sz), WHITE, "mm")
    sw = d.textlength("Staff", font=F(sz))
    T(d, (cx + sw, cy), "Swipe", F(sz), (255, 210, 200), "lm")
    # сдвинем «Staff» влево, чтобы по центру было всё слово
    return half


def mini_card(role="Бариста", name="Кофейня «Дрова»", rate="350 ₽/час"):
    w, h = 250, 300
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    base = Image.new("RGB", (w, h), CARD)
    bd = ImageDraw.Draw(base)
    base.paste(vgrad(w, 165, CRIM_S, CRIM_D), (0, 0))
    bd = ImageDraw.Draw(base)
    rr(bd, [12, 12, 104, 36], 12, fill=WHITE)
    T(bd, (58, 24), "✓ Проверен", F(12), CRIM, "mm")
    T(bd, (14, 132), name, F(18), WHITE, "lm")
    rr(bd, [14, 184, 14 + bd.textlength(role, font=F(13)) + 20, 212], 14, fill=CRIM)
    T(bd, (24, 198), role, F(13), WHITE, "lm")
    T(bd, (w - 14, 198), rate, F(16), INK, "rm")
    T(bd, (14, 234), "Завтра · 08:00–16:00", F(12, False), MUTED, "lm")
    x = 14
    for t in ["Медкнижка", "Без опыта"]:
        tw = bd.textlength(t, font=F(11, False)) + 16
        rr(bd, [x, 258, x + tw, 280], 8, outline=LINE)
        T(bd, (x + tw / 2, 269), t, F(11, False), MUTED, "mm")
        x += tw + 8
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w, h], radius=20, fill=255)
    lay.paste(base, (0, 0), m)
    return lay


frames, durs = [], []


def add(im, ms):
    frames.append(im.convert("P", palette=Image.ADAPTIVE, colors=128))
    durs.append(ms)


# Сцена 1 — хук
for hold in range(1):
    im = crim_bg()
    d = ImageDraw.Draw(im)
    confetti(d, 2, 20, 40, 200)
    T(d, (W / 2, 210), "РАБОТА", F(54), WHITE)
    T(d, (W / 2, 278), "НА СЕГОДНЯ", F(44), (255, 214, 205))
    rr(d, [W / 2 - 150, 330, W / 2 + 150, 392], 16, fill=WHITE)
    T(d, (W / 2, 361), "за один свайп", F(26), CRIM)
    T(d, (W / 2, 440), "официант · бариста · бармен", F(17, False), (245, 220, 224))
    T(d, (W / 2, 466), "кальянщик · флорист · курьер", F(17, False), (245, 220, 224))
    add(im, 1500)

# Сцена 2 — боль/выгода
im = crim_bg()
d = ImageDraw.Draw(im)
T(d, (W / 2, 250), "Без резюме.", F(40), WHITE)
T(d, (W / 2, 310), "Без собеседований.", F(34), WHITE)
T(d, (W / 2, 392), "Открыл Telegram —", F(22), (245, 220, 224))
T(d, (W / 2, 424), "и листаешь смены рядом", F(22), (245, 220, 224))
add(im, 1500)

# Сцена 3 — свайп
card = mini_card()
cx0, cy0 = (W - 250) // 2, 150
for k in range(0, 9):
    im = crim_bg()
    d = ImageDraw.Draw(im)
    T(d, (W / 2, 70), "СВАЙПНИ ВПРАВО →", F(28), WHITE)
    t = ease(k / 8)
    lay = card.rotate(-14 * t, expand=True, resample=Image.BICUBIC)
    if k >= 2:
        st = Image.new("RGBA", (150, 60), (0, 0, 0, 0))
        sd = ImageDraw.Draw(st)
        sd.rounded_rectangle([2, 2, 148, 58], radius=12, outline=WHITE, width=5)
        sd.text((75, 30), "ХОЧУ", font=F(28), fill=WHITE, anchor="mm")
        lay.alpha_composite(st.rotate(10, expand=True), (12, 24))
    im.paste(lay, (cx0 + int(W * t), cy0 + int(60 * t)), lay)
    T(d, (W / 2, 540), "лайкнул смену — отклик ушёл", F(18, False), (245, 220, 224))
    add(im, 70 if k else 500)

# Сцена 4 — мэтч
im = crim_bg()
d = ImageDraw.Draw(im)
confetti(d, 5, 40, 40, 420)
T(d, (W / 2, 150), "ЭТО МЭТЧ", F(24), (255, 214, 205))
T(d, (W / 2, 215), "Смена твоя!", F(50), WHITE)
for cx in (W / 2 - 60, W / 2 + 60):
    d.ellipse([cx - 42, 280, cx + 42, 364], fill=(236, 205, 210), outline=WHITE, width=4)
T(d, (W / 2 - 60, 322), "Я", F(30), CRIM)
T(d, (W / 2 + 60, 322), "★", F(30), CRIM)
T(d, (W / 2, 430), "Договорились в чате —", F(22), (245, 220, 224))
T(d, (W / 2, 462), "и ты на смене", F(22), (245, 220, 224))
add(im, 1600)

# Сцена 5 — деньги/скорость
im = crim_bg()
d = ImageDraw.Draw(im)
T(d, (W / 2, 230), "Смена сегодня —", F(34), WHITE)
T(d, (W / 2, 290), "деньги сегодня", F(34), (255, 214, 205))
rr(d, [W / 2 - 140, 350, W / 2 + 140, 408], 16, fill=GOLD)
T(d, (W / 2, 379), "средний отклик 7 минут", F(19), (60, 40, 0))
add(im, 1500)

# Сцена 6 — CTA
im = crim_bg()
d = ImageDraw.Draw(im)
confetti(d, 9, 18, 40, 150)
# центрируем логотип
full = "StaffSwipe"
fw = d.textlength("Staff", font=F(40)) + d.textlength("Swipe", font=F(40))
sx = W / 2 - fw / 2
T(d, (sx, 210), "Staff", F(40), WHITE, "lm")
T(d, (sx + d.textlength("Staff", font=F(40)), 210), "Swipe", F(40), (255, 210, 200), "lm")
T(d, (W / 2, 280), f"Подработка в {CITY}", F(26), WHITE)
rr(d, [W / 2 - 160, 340, W / 2 + 160, 404], 16, fill=WHITE)
T(d, (W / 2, 372), "Открой в Telegram ↑", F(22), CRIM)
T(d, (W / 2, 446), BOT, F(24), (255, 220, 214))
T(d, (W / 2, 500), "ссылка в шапке профиля", F(18, False), (240, 215, 220))
add(im, 2400)

path = os.path.join(OUT, "reel.gif")
frames[0].save(path, save_all=True, append_images=frames[1:], duration=durs,
               loop=0, optimize=False, disposal=2)
print("saved", path, len(frames), "frames", os.path.getsize(path) // 1024, "KB")
