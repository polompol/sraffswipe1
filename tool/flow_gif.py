#!/usr/bin/env python3
"""Анимированное демо потока StaffSwipe (кримсон-тема): лента → свайп → мэтч →
чат → подтверждение → создание вакансии. Рендер кадров на PIL, сборка в GIF.

Запуск: python tool/flow_gif.py  →  mockups/flow.gif
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
CRIM_S = (185, 72, 90)
GOLD = (199, 162, 75)
BG = (246, 241, 234)
CARD = (255, 255, 255)
INK = (32, 27, 24)
MUTED = (139, 128, 120)
LINE = (236, 228, 217)
WHITE = (255, 255, 255)
SKIP = (139, 128, 120)
W, H = 300, 600


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


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def T(d, xy, s, f, fill=INK, a="la"):
    d.text(xy, s, font=f, fill=fill, anchor=a)


def pill(d, x, y, s, f, fg, bg, pad=10, h=None):
    w = d.textlength(s, font=f)
    ph = h or (f.size + 9)
    rr(d, [x, y, x + w + pad * 2, y + ph], ph / 2, fill=bg)
    T(d, (x + pad, y + ph / 2), s, f, fg, "lm")
    return w + pad * 2


def paste_round(base, im, x, y, r):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=r, fill=255)
    base.paste(im, (x, y), m)


def status(d):
    T(d, (16, 12), "9:41", F(12, True), INK)
    d.text((W - 16, 12), "▮▮▮", font=F(11), fill=INK, anchor="ra")


def brand(d, x, y, sz=18):
    T(d, (x, y), "Staff", F(sz, True), INK, "lm")
    w = d.textlength("Staff", font=F(sz, True))
    T(d, (x + w, y), "Swipe", F(sz, True), CRIM, "lm")
    # бейдж-логотип слева
    rr(d, [x - 30, y - 11, x - 8, y + 11], 7, fill=CRIM)
    d.polygon([(x - 22, y - 6), (x - 16, y - 6), (x - 19, y),
               (x - 14, y), (x - 23, y + 7), (x - 20, y), (x - 25, y)], fill=WHITE)


def tabbar(d, active):
    d.line([0, H - 52, W, H - 52], fill=LINE)
    labels = ["Лента", "Мэтчи", "Тарифы", "Профиль"]
    for i, lb in enumerate(labels):
        cx = W / 8 + i * W / 4
        on = i == active
        T(d, (cx, H - 30), lb, F(11, on), CRIM if on else MUTED, "mm")
        if on:
            d.ellipse([cx - 3, H - 44, cx + 3, H - 38], fill=CRIM)


# ---------- экраны ----------

def feed_base(card=True):
    """Лента без верхней карточки (для анимации) либо со статичной."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    brand(d, 50, 44)
    T(d, (W - 16, 44), "★", F(17), CRIM, "rm")
    T(d, (16, 66), "Смены · ", F(11), MUTED)
    wlbl = d.textlength("Смены · ", font=F(11))
    T(d, (16 + wlbl, 66), "Москва · 5", F(11, True), CRIM)
    # кнопки действий
    ay = H - 86
    for cx, r, col, g, gs in [(W * 0.30, 26, SKIP, "×", 26),
                              (W * 0.5, 21, GOLD, "★", 18),
                              (W * 0.70, 26, CRIM, "♥", 24)]:
        d.ellipse([cx - r, ay - r, cx + r, ay + r], fill=CARD, outline=col, width=2)
        T(d, (cx, ay), g, F(gs, True), col, "mm")
    T(d, (W / 2, ay + 36), "× пропустить   ★ срочно   ♥ отклик", F(10), MUTED, "mm")
    tabbar(d, 0)
    if card:
        im.paste(card_layer(), (12, 84), card_layer())
    return im


def card_layer(role="Бариста", name="Кофейня «Дрова»", rate="350 ₽/час",
               addr="ул. Льва Толстого, 16", grad=(CRIM_S, CRIM_D)):
    w, h = W - 24, 364
    lay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    base = Image.new("RGB", (w, h), CARD)
    bd = ImageDraw.Draw(base)
    # фото-градиент сверху
    ph = vgrad(w, 196, grad[0], grad[1])
    base.paste(ph, (0, 0))
    bd = ImageDraw.Draw(base)
    pill(bd, 12, 12, "✓ Проверен", F(11, True), CRIM, (255, 255, 255))
    pill(bd, w - 76, 12, "Boost", F(11, True), (58, 44, 0), GOLD)
    T(bd, (14, 150), name, F(19, True), WHITE)
    # тело
    pill(bd, 14, 214, role, F(12, True), WHITE, CRIM)
    T(bd, (w - 14, 220), rate, F(16, True), INK, "ra")
    T(bd, (14, 252), addr, F(11.5), MUTED)
    T(bd, (14, 276), "Завтра · 08:00–16:00", F(11.5), MUTED)
    x = 14
    for t in ["Медкнижка", "Без опыта", "Питание"]:
        tw = bd.textlength(t, font=F(10.5)) + 16
        rr(bd, [x, 300, x + tw, 322], 8, outline=LINE)
        T(bd, (x + 8, 311), t, F(10.5), MUTED, "lm")
        x += tw + 7
    # скруглить углы карточки
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w, h], radius=20, fill=255)
    lay.paste(base, (0, 0), m)
    ImageDraw.Draw(lay).rounded_rectangle([0, 0, w - 1, h - 1], radius=20, outline=LINE, width=1)
    return lay


def match_screen():
    im = vgrad(W, H, CRIM, CRIM_D)
    d = ImageDraw.Draw(im)
    status(d)
    # конфетти
    import random
    random.seed(7)
    cols = [GOLD, CRIM_S, WHITE, (224, 105, 124)]
    for k in range(40):
        x = random.randint(8, W - 8)
        y = random.randint(60, 360)
        s = random.randint(4, 8)
        d.rounded_rectangle([x, y, x + s, y + s], radius=2, fill=cols[k % 4])
    T(d, (W / 2, 210), "ЭТО МЭТЧ", F(13), (240, 220, 224), "mm")
    T(d, (W / 2, 250), "Смена ваша!", F(34, True), WHITE, "mm")
    # два кружка-аватара
    for cx in (W / 2 - 46, W / 2 + 46):
        d.ellipse([cx - 34, 300, cx + 34, 368], fill=(233, 200, 205), outline=WHITE, width=3)
    T(d, (W / 2 - 46, 334), "Я", F(24, True), CRIM, "mm")
    T(d, (W / 2 + 46, 334), "★", F(24, True), CRIM, "mm")
    T(d, (W / 2, 400), "Кофейня «Дрова» — договоритесь в чате", F(12), (240, 225, 228), "mm")
    rr(d, [34, 436, W - 34, 482], 13, fill=WHITE)
    T(d, (W / 2, 459), "Открыть чат", F(15, True), CRIM, "mm")
    rr(d, [34, 494, W - 34, 538], 13, outline=(235, 200, 206), width=2)
    T(d, (W / 2, 516), "Листать дальше", F(14), WHITE, "mm")
    return im


def chat_screen(nmsgs=3, confirmed=False):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    T(d, (16, 44), "‹ Назад", F(13, True), CRIM, "lm")
    T(d, (W / 2, 44), "Кофейня «Дрова»", F(14, True), INK, "mm")
    rr(d, [16, 66, W - 16, 100], 12, outline=CRIM, width=2)
    T(d, (W / 2, 83), "✓ Подтвердить смену", F(13, True), CRIM, "mm")
    msgs = [
        ("sys", "Это мэтч! Смена «Кофейня «Дрова»». Договоритесь о деталях."),
        ("you", "Здравствуйте! Готовы выйти завтра на утро?"),
        ("me", "Да, всё подходит!"),
        ("you", "Отлично, ждём вас! Адрес в карточке."),
    ]
    if confirmed:
        msgs = msgs + [("sys", "Смена подтверждена ✓. Сформирован акт для самозанятого.")]
    y = 120
    for kind, text in msgs[: nmsgs + (1 if confirmed else 0)]:
        lines = wrap(d, text, F(12.5), W - 110)
        bw = max(d.textlength(ln, font=F(12.5)) for ln in lines) + 22
        bh = len(lines) * 18 + 14
        if kind == "sys":
            rr(d, [(W - (W - 60)) / 2, y, (W + (W - 60)) / 2, y + bh], 10, fill=(238, 230, 222))
            for i, ln in enumerate(lines):
                T(d, (W / 2, y + 14 + i * 18), ln, F(11.5), MUTED, "mm")
        elif kind == "me":
            x1 = W - 16 - bw
            rr(d, [x1, y, W - 16, y + bh], 13, fill=CRIM)
            for i, ln in enumerate(lines):
                T(d, (x1 + 11, y + 11 + i * 18), ln, F(12.5), WHITE)
        else:
            rr(d, [16, y, 16 + bw, y + bh], 13, fill=CARD, outline=LINE)
            for i, ln in enumerate(lines):
                T(d, (27, y + 11 + i * 18), ln, F(12.5), INK)
        y += bh + 10
    # поле ввода
    rr(d, [16, H - 92, W - 64, H - 56], 18, fill=CARD, outline=LINE)
    T(d, (30, H - 74), "Сообщение…", F(12.5), MUTED, "lm")
    d.ellipse([W - 56, H - 94, W - 16, H - 54], fill=CRIM)
    T(d, (W - 36, H - 74), "➤", F(15), WHITE, "mm")
    return im


def create_screen():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    T(d, (16, 44), "Новая смена", F(18, True), INK, "lm")
    T(d, (16, 70), "Заполни — отклики придут за минуты", F(11), MUTED)
    T(d, (16, 96), "Кого ищете", F(11), MUTED)
    roles = [("Бариста", 1), ("Кальянщик", 0), ("Флорист", 0),
             ("Бармен", 0), ("Курьер", 0)]
    x, yy = 16, 116
    for lb, on in roles:
        tw = d.textlength(lb, font=F(12, True)) + 20
        if x + tw > W - 16:
            x = 16
            yy += 36
        rr(d, [x, yy, x + tw, yy + 30], 15, fill=CRIM if on else CARD, outline=CRIM if on else LINE)
        T(d, (x + tw / 2, yy + 15), lb, F(12, True), WHITE if on else INK, "mm")
        x += tw + 7
    yy += 50

    def field(label, value, yy):
        T(d, (16, yy), label, F(11), MUTED)
        rr(d, [16, yy + 16, W - 16, yy + 52], 11, fill=CARD, outline=LINE)
        T(d, (30, yy + 34), value, F(13), INK, "lm")
        return yy + 64
    yy = field("Город", "Москва", yy)
    yy = field("Адрес", "ул. Тверская, 1", yy)
    yy = field("Ставка, ₽", "400", yy)
    rr(d, [16, H - 78, W - 16, H - 38], 13, fill=CRIM)
    T(d, (W / 2, H - 58), "Опубликовать вакансию", F(14, True), WHITE, "mm")
    return im


def pricing_screen():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    T(d, (16, 44), "Тарифы", F(18, True), INK, "lm")
    T(d, (16, 70), "Для заведений — больше откликов", F(11), MUTED)
    plans = [("Free", "0 ₽", "1 активная вакансия", False),
             ("Pro", "1 990 ₽", "Безлимит · 10 boost · приоритет", True),
             ("Business", "4 990 ₽", "Всё из Pro · 30 boost · верификация", False)]
    y = 96
    for name, price, sub, best in plans:
        rr(d, [16, y, W - 16, y + 70], 14, fill=CARD,
           outline=CRIM if best else LINE, width=2 if best else 1)
        T(d, (28, y + 16), name, F(15, True), INK, "lm")
        if best:
            pill(d, 28 + d.textlength(name, font=F(15, True)) + 8, y + 8,
                 "ХИТ", F(10, True), WHITE, CRIM)
        T(d, (W - 28, y + 16), price, F(15, True), CRIM, "rm")
        T(d, (28, y + 44), sub, F(11), MUTED, "lm")
        y += 82
    rr(d, [16, y + 4, W - 16, y + 44], 13, fill=CRIM)
    T(d, (W / 2, y + 24), "Оформить Pro", F(14, True), WHITE, "mm")
    T(d, (W / 2, y + 62), "Boost и супер-лайки — за Telegram Stars ★",
      F(10), MUTED, "mm")
    return im


def profile_screen():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    T(d, (16, 44), "Профиль", F(18, True), INK, "lm")
    rr(d, [16, 70, W - 16, 128], 14, fill=CARD, outline=LINE)
    d.ellipse([28, 82, 64, 118], fill=(236, 205, 210))
    T(d, (46, 100), "А", F(20, True), CRIM, "mm")
    T(d, (76, 90), "Алексей", F(16, True), INK, "lm")
    T(d, (76, 112), "★ 4.8 · 🔥 3 дня подряд".replace("🔥", ""), F(11), MUTED, "lm")
    # тариф
    rr(d, [16, 140, W - 16, 196], 14, fill=CARD, outline=LINE)
    T(d, (28, 158), "Тариф: Free", F(14, True), INK, "lm")
    rr(d, [W - 104, 150, W - 28, 180], 9, fill=CRIM)
    T(d, (W - 66, 165), "Улучшить", F(12, True), WHITE, "mm")
    T(d, (28, 182), "супер-лайки: 1 · boost: 0", F(11), MUTED, "lm")
    # рефералы
    rr(d, [16, 208, W - 16, 286], 14, fill=CARD, outline=LINE)
    T(d, (28, 224), "Пригласить друзей", F(14, True), INK, "lm")
    T(d, (28, 248), "За каждого по ссылке — 3 супер-лайка", F(10.5), MUTED, "lm")
    rr(d, [28, 264, W - 28, 280], 8, fill=CRIM)
    T(d, (W / 2, 272), "Поделиться приглашением", F(11, True), WHITE, "mm")
    # тёмная тема
    rr(d, [16, 298, W - 16, 346], 14, fill=CARD, outline=LINE)
    T(d, (28, 322), "Тёмная тема", F(13, True), INK, "lm")
    rr(d, [W - 78, 312, W - 28, 336], 12, fill=CRIM)
    d.ellipse([W - 50, 314, W - 30, 334], fill=WHITE)
    # админ
    rr(d, [16, 358, W - 16, 398], 13, outline=CRIM, width=2)
    T(d, (W / 2, 378), "🛡 Админ-панель".replace("🛡", "▣"), F(13, True), CRIM, "mm")
    return im


def admin_screen():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    status(d)
    T(d, (16, 42), "Админ-панель", F(18, True), INK, "lm")
    stats = [("128", "Юзеры"), ("34", "Вакансии"), ("940", "Лайки"),
             ("410", "Мэтчи"), ("1", "Жалобы"), ("12", "Подписки")]
    gw = (W - 32 - 16) / 3
    for i, (val, lb) in enumerate(stats):
        cx = 16 + (i % 3) * (gw + 8)
        cy = 70 + (i // 3) * 66
        rr(d, [cx, cy, cx + gw, cy + 58], 12, fill=CARD, outline=LINE)
        T(d, (cx + gw / 2, cy + 22), val, F(19, True), GOLD, "mm")
        T(d, (cx + gw / 2, cy + 44), lb, F(10), MUTED, "mm")
    T(d, (16, 214), "Жалобы", F(14, True), INK, "lm")
    rr(d, [16, 234, W - 16, 312], 12, fill=CARD, outline=LINE)
    T(d, (28, 250), "Фейк", F(13, True), INK, "lm")
    T(d, (W - 28, 250), "vacancy · vac3", F(10), MUTED, "rm")
    T(d, (28, 272), "Похоже на обман — просят предоплату", F(10.5), MUTED, "lm")
    rr(d, [28, 288, 150, 304], 8, outline=CRIM, width=1)
    T(d, (89, 296), "Закрыть жалобу", F(10.5, True), CRIM, "mm")
    T(d, (16, 330), "Активные подписки", F(14, True), INK, "lm")
    subs = [("Кофейня «Дрова»", "PRO"), ("Бар «Полночь»", "BUSINESS")]
    y = 352
    for name, plan in subs:
        rr(d, [16, y, W - 16, y + 46], 12, fill=CARD, outline=LINE)
        T(d, (28, y + 23), name, F(12.5, True), INK, "lm")
        pill(d, W - 28 - d.textlength(plan, font=F(10, True)) - 20, y + 13,
             plan, F(10, True), CRIM, (247, 235, 237))
        y += 56
    return im


def wrap(d, text, f, maxw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ---------- рамка телефона ----------

def frame(im):
    b = 11
    out = Image.new("RGB", (W + b * 2, H + b * 2), (20, 16, 14))
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W, H], radius=34, fill=255)
    ImageDraw.Draw(out).rounded_rectangle([2, 2, W + b * 2 - 2, H + b * 2 - 2], radius=44,
                                          outline=(64, 48, 42), width=2)
    out.paste(im, (b, b), m)
    # «чёлка»
    ImageDraw.Draw(out).rounded_rectangle(
        [(out.width - 90) / 2, b, (out.width + 90) / 2, b + 16], radius=8, fill=(20, 16, 14))
    return out


# ---------- сборка анимации ----------

frames = []
durs = []


def add(im, ms):
    frames.append(frame(im).convert("P", palette=Image.ADAPTIVE))
    durs.append(ms)


def slide(a, b, n=6, ms=40):
    """b въезжает справа поверх a."""
    for k in range(1, n + 1):
        t = ease(k / n)
        comp = Image.new("RGB", (W, H), BG)
        comp.paste(a, (int(-W * t), 0))
        comp.paste(b, (int(W * (1 - t)), 0))
        add(comp, ms)


def fade(a, b, n=6, ms=40):
    for k in range(1, n + 1):
        add(Image.blend(a, b, ease(k / n)), ms)


# 1) лента — пауза
feed = feed_base(card=True)
base_nocard = feed_base(card=False)
add(feed, 1100)

# 2) свайп вправо: карточка уезжает с поворотом + штамп «ХОЧУ»
card = card_layer()
for k in range(1, 9):
    t = ease(k / 8)
    fr = base_nocard.copy()
    lay = card.rotate(-16 * t, expand=True, resample=Image.BICUBIC)
    sd = ImageDraw.Draw(lay)
    # штамп
    st = Image.new("RGBA", (140, 56), (0, 0, 0, 0))
    sdd = ImageDraw.Draw(st)
    sdd.rounded_rectangle([2, 2, 138, 54], radius=12, outline=CRIM, width=5)
    sdd.text((70, 28), "ХОЧУ", font=F(26, True), fill=CRIM, anchor="mm")
    st = st.rotate(12, expand=True)
    lay.alpha_composite(st, (10, 20))
    fr.paste(lay, (12 + int(W * 0.95 * t), 84 - 10 + int(40 * t)), lay)
    add(fr, 45)

# 3) мэтч (fade-in поверх ленты без карточки)
match = match_screen()
fade(base_nocard, match, n=6, ms=45)
add(match, 1300)

# 4) переход в чат
chat1 = chat_screen(nmsgs=2)
slide(match, chat1, n=6, ms=40)
add(chat1, 800)
add(chat_screen(nmsgs=3), 900)
add(chat_screen(nmsgs=4), 1100)

# 5) подтверждение смены
conf = chat_screen(nmsgs=4, confirmed=True)
add(conf, 1500)

# 6) переход к созданию вакансии (роль «заведение»)
create = create_screen()
slide(conf, create, n=6, ms=40)
add(create, 1700)

# 7) возврат к ленте (плавно), GIF зациклится
fade(create, feed, n=6, ms=45)
add(feed, 600)

path = os.path.join(OUT, "flow.gif")
frames[0].save(path, save_all=True, append_images=frames[1:], duration=durs,
               loop=0, optimize=False, disposal=2)
print("saved", path, len(frames), "frames")

# Статичная раскадровка (PNG) — обзор всего проекта (там, где GIF не играет).
panels = [("Лента", feed_base(True)), ("Мэтч", match_screen()),
          ("Чат + акт", chat_screen(4, confirmed=True)),
          ("Новая вакансия", create_screen()),
          ("Тарифы", pricing_screen()), ("Профиль", profile_screen()),
          ("Админ-панель", admin_screen())]
fr = [frame(p) for _, p in panels]
cw, ch, pad, cap = fr[0].width, fr[0].height, 24, 36
board = Image.new("RGB", (len(fr) * cw + pad * (len(fr) + 1), ch + cap + pad * 2),
                  (40, 30, 32))
bdd = ImageDraw.Draw(board)
for i, (label, _) in enumerate(panels):
    x = pad + i * (cw + pad)
    board.paste(fr[i], (x, cap + pad))
    bdd.text((x + cw / 2, pad + 10), label, font=F(20, True), fill=WHITE, anchor="mm")
board.save(os.path.join(OUT, "storyboard.png"))
print("saved storyboard.png", board.size)

# Отдельный крупный скрин админ-панели.
frame(admin_screen()).save(os.path.join(OUT, "admin.png"))
print("saved admin.png")

# Отдельные крупные скрины каждого экрана (для показа).
for _name, _scr in [
    ("screen_feed", feed_base(True)),
    ("screen_match", match_screen()),
    ("screen_chat", chat_screen(4, confirmed=True)),
    ("screen_create", create_screen()),
    ("screen_pricing", pricing_screen()),
    ("screen_profile", profile_screen()),
]:
    frame(_scr).save(os.path.join(OUT, f"{_name}.png"))
print("saved individual screens")
