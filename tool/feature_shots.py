#!/usr/bin/env python3
"""Мокапы новых фич StaffSwipe (кримсон-тема): живая лента, срочность,
прозрачность оплаты, доверие заведения, доход в профиле, онбординг-крючок.

Эмодзи не используем (нет в системном шрифте) — иконки рисуем фигурами.
Запуск: python tool/feature_shots.py  →  mockups/feat_*.png
"""
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)
FD = "/usr/share/fonts/truetype/dejavu"


def F(s, b=False):
    name = "DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"
    return ImageFont.truetype(os.path.join(FD, name), int(s))


# Палитра «Crimson»
CRIM = (158, 27, 50)
CRIM_D = (124, 21, 38)
GOLD = (199, 162, 75)
BG = (246, 241, 234)
CARD = (255, 255, 255)
INK = (32, 27, 24)
MUTED = (139, 128, 120)
LINE = (236, 228, 217)
WHITE = (255, 255, 255)
GREEN = (22, 163, 74)
GREEN_BG = (233, 248, 238)
RED = (220, 38, 38)
BLUE = (59, 130, 246)
BLUE_BG = (231, 240, 255)
W, H = 300, 600


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def T(d, xy, s, f, fill=INK, a="la"):
    d.text(xy, s, font=f, fill=fill, anchor=a)


def pill(d, x, y, s, f, fg, bg, pad=9, outline=None):
    w = d.textlength(s, font=f)
    ph = f.size + 9
    rr(d, [x, y, x + w + pad * 2, y + ph], ph / 2, fill=bg, outline=outline, width=1)
    T(d, (x + pad, y + ph / 2), s, f, fg, "lm")
    return w + pad * 2


def check(d, x, y, color, r=7):
    """Зелёный кружок с галочкой — знак доверия."""
    d.ellipse([x, y, x + r * 2, y + r * 2], fill=color)
    cx, cy = x + r, y + r
    d.line([(cx - 3, cy), (cx - 1, cy + 3)], fill=WHITE, width=2)
    d.line([(cx - 1, cy + 3), (cx + 4, cy - 3)], fill=WHITE, width=2)


def status(d):
    T(d, (16, 12), "9:41", F(12, True), INK)
    d.text((W - 16, 12), "▮▮▮", font=F(11), fill=INK, anchor="ra")


def brand(d, x, y, sz=18):
    rr(d, [x - 30, y - 11, x - 8, y + 11], 7, fill=CRIM)
    cx, cy, wd = x - 19, y, 2
    for dx in (-6, -2):
        d.line([(cx + dx, cy - 6), (cx + dx, cy + 6)], fill=WHITE, width=wd)
    d.line([(cx - 6, cy - 6), (cx, cy - 6)], fill=WHITE, width=wd)
    d.line([(cx - 6, cy + 6), (cx, cy + 6)], fill=WHITE, width=wd)
    d.line([(cx + 2, cy - 6), (cx + 6, cy - 6)], fill=WHITE, width=wd)
    d.line([(cx + 2, cy + 6), (cx + 6, cy + 6)], fill=WHITE, width=wd)
    d.line([(cx + 6, cy - 6), (cx + 6, cy + 6)], fill=WHITE, width=wd)
    T(d, (x, y), "Staff", F(sz, True), INK, "lm")
    w = d.textlength("Staff", font=F(sz, True))
    T(d, (x + w, y), "Swipe", F(sz, True), CRIM, "lm")


def tabbar(d, active):
    d.line([0, H - 52, W, H - 52], fill=LINE)
    for i, lb in enumerate(["Лента", "Мэтчи", "Смены", "Профиль"]):
        cx = W / 8 + i * W / 4
        on = i == active
        T(d, (cx, H - 30), lb, F(11, on), CRIM if on else MUTED, "mm")
        if on:
            d.ellipse([cx - 3, H - 44, cx + 3, H - 38], fill=CRIM)


def base():
    im = Image.new("RGB", (W, H), BG)
    return im, ImageDraw.Draw(im)


# ---------- экраны ----------


def screen_feed():
    """Лента: живая активность + чип «Сегодня» + карточка со срочностью,
    прозрачной оплатой и знаком доверия."""
    im, d = base()
    status(d)
    brand(d, 46, 40)
    T(d, (W - 16, 40), "фильтры", F(11), MUTED, "rm")
    T(d, (16, 60), "Смены · Москва · 3", F(11), MUTED)

    # живая лента активности (LiveTicker)
    rr(d, [16, 78, W - 16, 122], 12, fill=GREEN_BG, outline=(150, 220, 175))
    d.ellipse([26, 92, 35, 101], fill=GREEN)
    d.ellipse([23, 89, 38, 104], outline=(150, 220, 175), width=2)
    T(d, (46, 86), "Анна вышла в «Дрова» — 2 800 ₽", F(11.5, True), INK)
    T(d, (46, 102), "17 ищут смену рядом · 3 срочных сегодня", F(10), MUTED)

    # чипы
    pill(d, 16, 132, "Сегодня", F(11, True), WHITE, RED)
    pill(d, 92, 132, "Рядом", F(11), INK, CARD, outline=LINE)

    # карточка вакансии
    cy = 162
    rr(d, [16, cy, W - 16, 540], 16, fill=CARD, outline=LINE)
    rr(d, [16, cy, W - 16, cy + 150], 16, fill=(214, 198, 184))
    d.rectangle([16, cy + 120, W - 16, cy + 150], fill=(214, 198, 184))
    # верхние бейджи на фото
    pill(d, 26, cy + 12, "350 ₽/час", F(10, True), INK, WHITE)
    pill(d, W - 92, cy + 12, "Сегодня", F(10, True), WHITE, RED)
    # тело
    ty = cy + 162
    pill(d, 26, ty, "Бариста", F(10, True), WHITE, CRIM)
    bx = 26 + d.textlength("Бариста", font=F(10, True)) + 26
    rr(d, [bx, ty, bx + 78, ty + 19], 9.5, fill=GREEN_BG, outline=(150, 220, 175))
    check(d, bx + 6, ty + 3, GREEN, 6)
    T(d, (bx + 20, ty + 9), "Платит вовремя", F(9, True), GREEN, "lm")

    T(d, (26, ty + 28), "Кофейня «Дрова»", F(17, True), INK)
    T(d, (26, ty + 50), "Сегодня · 08:00–16:00", F(11), MUTED)
    T(d, (26, ty + 66), "★ 4.7 · 24 смены закрыто", F(11, True), (170, 120, 30))

    # способ оплаты + медкнижка + смета
    py = ty + 88
    w1 = pill(d, 26, py, "Нал в день смены", F(9.5, True), GREEN, GREEN_BG,
              outline=(150, 220, 175))
    pill(d, 26 + w1 + 6, py, "Медкнижка", F(9.5), (150, 110, 30), (250, 244, 228),
         outline=(225, 205, 150))
    pill(d, 26, py + 28, "≈ 2 800 ₽ за смену", F(10, True), GREEN, GREEN_BG,
         outline=(150, 220, 175))

    # нижние действия (кнопки-кружки)
    for i, (c, lab) in enumerate([(MUTED, "✕"), (GOLD, "★"), (GREEN, "♥")]):
        cx = 70 + i * 80
        d.ellipse([cx - 18, 552, cx + 18, 588], outline=c, width=2)
        T(d, (cx, 570), lab, F(15, True), c, "mm")
    return im


def screen_profile():
    """Профиль: доход вместо стрика + тумблер «Готов выйти сегодня»."""
    im, d = base()
    status(d)
    T(d, (16, 40), "Профиль", F(20, True), INK)
    T(d, (W - 16, 42), "Выйти", F(11), MUTED, "rm")

    # шапка профиля
    rr(d, [16, 70, W - 16, 120], 14, fill=CARD, outline=LINE)
    d.ellipse([26, 80, 56, 110], fill=(232, 224, 214))
    T(d, (66, 84), "Алексей", F(15, True), INK)
    T(d, (66, 102), "★ 4.8 · @alexey · 7 смен", F(10.5), MUTED)

    # карточка дохода (градиент кримсон→золото)
    gy = 132
    grad = Image.new("RGB", (W - 32, 78))
    gp = grad.load()
    for x in range(W - 32):
        t = x / (W - 33)
        c = tuple(int(CRIM_D[i] + (GOLD[i] - CRIM_D[i]) * t) for i in range(3))
        for y in range(78):
            gp[x, y] = c
    m = Image.new("L", grad.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 32, 78], radius=14, fill=255)
    im.paste(grad, (16, gy), m)
    T(d, (28, gy + 12), "Заработано через StaffSwipe", F(10.5), (250, 240, 235))
    T(d, (28, gy + 28), "18 400 ₽", F(26, True), WHITE)
    T(d, (28, gy + 60), "7 смен закрыто · так держать", F(10.5), (250, 240, 235))

    # тумблер «Готов выйти сегодня» (ВКЛ)
    ay = 224
    rr(d, [16, ay, W - 16, ay + 56], 14, fill=GREEN_BG, outline=(150, 220, 175))
    T(d, (28, ay + 12), "Готов выйти сегодня", F(12, True), INK)
    T(d, (28, ay + 30), "Ты наверху ленты — зовут первым", F(9.5), MUTED)
    rr(d, [W - 64, ay + 14, W - 28, ay + 36], 11, fill=GREEN)
    d.ellipse([W - 44, ay + 16, W - 28, ay + 34], fill=WHITE)

    # «тебя хотят»
    hy = 292
    rr(d, [16, hy, W - 16, hy + 50], 14, fill=(250, 235, 238), outline=(235, 200, 208))
    T(d, (28, hy + 12), "Тебя хотят: 4", F(12, True), CRIM)
    T(d, (28, hy + 30), "4 заведения лайкнули — листай ленту", F(9.5), MUTED)

    # тариф
    py = 354
    rr(d, [16, py, W - 16, py + 56], 14, fill=CARD, outline=LINE)
    T(d, (28, py + 14), "Тариф: Free", F(12, True), INK)
    T(d, (28, py + 32), "Супер-лайки: 1 · Boost: 0", F(10), MUTED)
    pill(d, W - 96, py + 16, "Улучшить", F(10, True), WHITE, CRIM)

    rr(d, [16, 426, W - 16, 458], 12, fill=CARD, outline=LINE)
    T(d, (W / 2, 442), "Редактировать профиль", F(11, True), INK, "mm")
    rr(d, [16, 466, W - 16, 498], 12, fill=CARD, outline=LINE)
    T(d, (W / 2, 482), "Помощь и поддержка", F(11), MUTED, "mm")

    tabbar(d, 3)
    return im


def screen_onboarding():
    """Онбординг-крючок: ведём с дохода."""
    im, d = base()
    status(d)
    T(d, (W - 16, 40), "Пропустить", F(11), MUTED, "rm")

    # лого крупно
    cx, cy = W / 2, 175
    rr(d, [cx - 45, cy - 45, cx + 45, cy + 45], 24, fill=CRIM)
    wd = 5
    for dx in (-22, -8):
        d.line([(cx + dx, cy - 22), (cx + dx, cy + 22)], fill=WHITE, width=wd)
    d.line([(cx - 22, cy - 22), (cx, cy - 22)], fill=WHITE, width=wd)
    d.line([(cx - 22, cy + 22), (cx, cy + 22)], fill=WHITE, width=wd)
    d.line([(cx + 8, cy - 22), (cx + 22, cy - 22)], fill=WHITE, width=wd)
    d.line([(cx + 8, cy + 22), (cx + 22, cy + 22)], fill=WHITE, width=wd)
    d.line([(cx + 22, cy - 22), (cx + 22, cy + 22)], fill=WHITE, width=wd)

    T(d, (W / 2, 258), "Подработка рядом —", F(17, True), INK, "mm")
    T(d, (W / 2, 280), "от 3 000 ₽ за смену", F(17, True), CRIM, "mm")
    T(d, (W / 2, 312), "Свайпай смены в кафе у дома.", F(11.5), MUTED, "mm")
    T(d, (W / 2, 328), "Первую найдёшь за пару минут.", F(11.5), MUTED, "mm")

    # зелёный пилл-крючок
    s = "Оплата в день смены · без посредников"
    w = d.textlength(s, font=F(10.5, True))
    x0 = (W - w - 24) / 2
    rr(d, [x0, 352, x0 + w + 24, 376], 12, fill=GREEN_BG, outline=(150, 220, 175))
    T(d, (W / 2, 364), s, F(10.5, True), GREEN, "mm")

    T(d, (W / 2, 432), "★ 4.8 · 1 200+ смен закрыто", F(11), MUTED, "mm")
    # точки
    for i in range(3):
        on = i == 0
        x = W / 2 - 20 + i * 16
        if on:
            rr(d, [x - 8, 458, x + 8, 466], 4, fill=CRIM)
        else:
            d.ellipse([x - 4, 458, x + 4, 466], fill=LINE)
    rr(d, [16, 488, W - 16, 528], 12, fill=CRIM)
    T(d, (W / 2, 508), "Далее", F(13, True), WHITE, "mm")
    return im


def storyboard(shots):
    pad, lab = 16, 26
    cols = len(shots)
    sw = W + pad * 2
    bw = sw * cols
    bh = H + pad * 2 + lab
    bo = Image.new("RGB", (bw, bh), (250, 247, 242))
    dd = ImageDraw.Draw(bo)
    titles = ["Лента: живо, срочно, доверие", "Профиль: доход", "Вход: крючок дохода"]
    for i, sh in enumerate(shots):
        x = i * sw + pad
        bo.paste(sh, (x, pad + lab))
        dd.rounded_rectangle(
            [x - 1, pad + lab - 1, x + W, pad + lab + H], radius=18, outline=LINE
        )
        dd.text((x + W / 2, pad + lab / 2), titles[i], font=F(13, True),
                fill=INK, anchor="mm")
    return bo


def main():
    feed = screen_feed()
    profile = screen_profile()
    onb = screen_onboarding()
    feed.save(os.path.join(OUT, "feat_feed.png"))
    profile.save(os.path.join(OUT, "feat_profile.png"))
    onb.save(os.path.join(OUT, "feat_onboarding.png"))
    storyboard([feed, profile, onb]).save(os.path.join(OUT, "feat_storyboard.png"))
    print("Готово: mockups/feat_feed.png, feat_profile.png, "
          "feat_onboarding.png, feat_storyboard.png")


if __name__ == "__main__":
    main()
