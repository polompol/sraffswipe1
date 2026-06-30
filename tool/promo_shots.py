#!/usr/bin/env python3
"""Превью для продвижения: (1) шеринг-карточка успеха для сторис,
(2) мокап чата с ботом (как он реально работает: /start, кнопка, уведомления,
оплата). Палитра — фирменная кримсон + слоновая кость. Без эмодзи (рисуем).

Запуск: python tool/promo_shots.py  →  mockups/promo_*.png
"""
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)
FD = "/usr/share/fonts/truetype/dejavu"

CRIM = (165, 28, 48)
CRIM_D = (126, 19, 34)
GOLD = (195, 154, 58)
IVORY = (239, 231, 211)
CARD = (255, 253, 248)
INK = (36, 31, 27)
MUTED = (138, 128, 115)
LINE = (228, 217, 194)
WHITE = (255, 255, 255)
BUBBLE = (255, 255, 255)


def F(s, b=False):
    name = "DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"
    return ImageFont.truetype(os.path.join(FD, name), int(s))


def rr(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)


def T(d, xy, s, f, fill=INK, a="la"):
    d.text(xy, s, font=f, fill=fill, anchor=a)


def vgrad(w, h, a, b):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return im


def logo(d, cx, cy, sz, color=WHITE):
    """Знак-пазл (два уголка) — фирменный логотип."""
    w = max(2, sz // 8)
    s = sz // 2
    for dx in (-s, -s // 3):
        d.line([(cx + dx, cy - s), (cx + dx, cy + s)], fill=color, width=w)
    d.line([(cx - s, cy - s), (cx, cy - s)], fill=color, width=w)
    d.line([(cx - s, cy + s), (cx, cy + s)], fill=color, width=w)
    d.line([(cx + s // 3, cy - s), (cx + s, cy - s)], fill=color, width=w)
    d.line([(cx + s // 3, cy + s), (cx + s, cy + s)], fill=color, width=w)
    d.line([(cx + s, cy - s), (cx + s, cy + s)], fill=color, width=w)


# ---------- 1. Шеринг-карточка успеха (сторис 9:16) ----------
def share_card():
    W, H = 720, 1280
    im = vgrad(W, H, CRIM_D, GOLD)
    d = ImageDraw.Draw(im)

    # лого + бренд сверху
    logo(d, 80, 110, 56)
    T(d, (130, 92), "Staff", F(40, True), WHITE, "lm")
    w = d.textlength("Staff", font=F(40, True))
    T(d, (130 + w, 92), "Swipe", F(40, True), (245, 225, 200), "lm")

    # суть
    T(d, (60, 360), "Я зарабатываю", F(40), (250, 240, 235))
    T(d, (60, 410), "на сменах в общепите", F(40), (250, 240, 235))

    # большая сумма (вписываем по ширине)
    amount = "18 400 ₽"
    fs = 110
    while d.textlength(amount, font=F(fs, True)) > W - 120 and fs > 70:
        fs -= 4
    T(d, (60, 540), amount, F(fs, True), WHITE)
    T(d, (66, 690), "за месяц · 7 смен закрыто", F(34), (250, 238, 230))

    # пилюли-факты (прозрачная заливка + белая обводка, белый текст)
    facts = ["Смены рядом", "Оплата в день", "Без посредников"]
    y = 786
    for s in facts:
        fw = d.textlength(s, font=F(30, True))
        rr(d, [60, y, 60 + fw + 56, y + 64], 32, outline=WHITE, width=3)
        T(d, (88, y + 32), s, F(30, True), WHITE, "lm")
        y += 86

    # футер — призыв + бот
    rr(d, [60, H - 230, W - 60, H - 90], 28, fill=(255, 255, 255))
    T(d, (W / 2, H - 185), "Найди свою смену за пару минут", F(30, True), CRIM, "mm")
    rr(d, [120, H - 150, W - 120, H - 112], 19, fill=CRIM)
    T(d, (W / 2, H - 131), "t.me/shiftyworkbot", F(26, True), WHITE, "mm")
    return im


# ---------- 2. Мокап чата с ботом ----------
def bubble(d, x, y, lines, f, maxw, pad=22, fill=BUBBLE, fg=INK, foot=None):
    widths = [d.textlength(ln, font=f) for ln in lines]
    bw = min(maxw, max(widths) + pad * 2)
    lh = f.size + 8
    bh = pad * 2 + lh * len(lines) + (24 if foot else 0)
    rr(d, [x, y, x + bw, y + bh], 18, fill=fill)
    for i, ln in enumerate(lines):
        T(d, (x + pad, y + pad + i * lh), ln, f, fg)
    if foot:
        T(d, (x + pad, y + bh - 30), foot, F(20), MUTED)
    return y + bh + 14


def bot_chat():
    W, H = 720, 1280
    im = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(im)

    # шапка чата
    rr(d, [0, 0, W, 96], 0, fill=CARD)
    d.line([0, 96, W, 96], fill=LINE)
    d.ellipse([24, 24, 72, 72], fill=CRIM)
    logo(d, 48, 48, 30)
    T(d, (88, 34), "StaffSwipe", F(28, True), INK)
    T(d, (88, 64), "бот · онлайн", F(20), MUTED)

    f = F(22)
    y = 120
    # /start
    rr(d, [W - 220, y, W - 24, y + 52], 16, fill=CRIM)
    T(d, (W - 122, y + 26), "/start", F(22, True), WHITE, "mm")
    y += 70

    y = bubble(d, 24, y, [
        "StaffSwipe — смены в общепите",
        "за один свайп.",
        "Нажмите кнопку ниже:",
    ], f, 520, foot="9:41")
    # кнопка web_app
    rr(d, [24, y, 360, y + 56], 14, fill=CRIM)
    T(d, (192, y + 28), "Открыть StaffSwipe", F(24, True), WHITE, "mm")
    y += 56 + 22

    # уведомления (как реально шлёт notify)
    y = bubble(d, 24, y, [
        "Вас снова зовут на смену",
        "в «Кофейня Дрова»",
    ], f, 520, foot="вчера")
    y = bubble(d, 24, y, [
        "Срочно нужен человек:",
        "официант · 300 ₽ · Никольская, 10",
    ], f, 540, foot="сегодня 12:30")
    y = bubble(d, 24, y, [
        "Свежие смены рядом:",
        "• бариста · 350 ₽ · сегодня",
        "• бармен · 4500 ₽ · завтра",
    ], f, 540, foot="сегодня 09:00")
    y = bubble(d, 24, y, [
        "Оплата прошла ✓ Права начислены.",
        "Возвращайтесь в приложение.",
    ], f, 540, fill=(244, 235, 222), foot="сегодня 13:05")
    return im


def main():
    share_card().save(os.path.join(OUT, "promo_share.png"))
    bot_chat().save(os.path.join(OUT, "promo_bot.png"))
    print("Готово: mockups/promo_share.png, mockups/promo_bot.png")


if __name__ == "__main__":
    main()
