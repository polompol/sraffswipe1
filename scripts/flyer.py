#!/usr/bin/env python3
"""Печатная раздатка A5 для обхода заведений.

Зачем: первые кафе приходится набирать ногами — зайти, поговорить с
управляющим и оставить бумажку, чтобы вечером он про тебя вспомнил.
Файл печатается в любом копицентре (A5, обычная бумага 130–170 г).

Запуск (из корня репозитория):

    python scripts/flyer.py --bot staffswipe_bot --contact "Иван, +7 900 000-00-00"

Параметры необязательные: без них останутся пустые места, которые можно
вписать ручкой. QR наклеивается или вставляется отдельно — сделать его для
ссылки t.me/имя_бота можно на любом бесплатном сервисе.
"""
import argparse
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

# Те же цвета, что в приложении: багровый и слоновая кость.
CRIMSON = (165, 28, 48)
IVORY = (239, 231, 211)
INK = (36, 26, 23)
MUTED = (109, 99, 87)
WHITE = (255, 255, 255)

FONTS = Path(__file__).resolve().parent.parent / "backend" / "app" / "fonts"
NL = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

STEPS = [
    ("Публикуете смену", "дата, время, ставка — минута"),
    ("Выбираете человека", "анкеты с опытом и отзывами"),
    ("Он выходит на смену", "вы отмечаете приход — и всё"),
]


def build(bot: str, contact: str, out: Path) -> Path:
    pdf = FPDF(orientation="P", unit="mm", format="A5")  # 148 × 210 мм
    pdf.set_auto_page_break(False)
    pdf.add_font("D", "", str(FONTS / "DejaVuSans.ttf"))
    pdf.add_font("D", "B", str(FONTS / "DejaVuSans-Bold.ttf"))
    pdf.add_page()

    # Фон цвета слоновой кости на всю страницу.
    pdf.set_fill_color(*IVORY)
    pdf.rect(0, 0, 148, 210, style="F")

    # Шапка: багровая плашка с главным обещанием.
    pdf.set_fill_color(*CRIMSON)
    pdf.rect(0, 0, 148, 52, style="F")
    pdf.set_text_color(*IVORY)
    pdf.set_font("D", "B", 23)
    pdf.set_xy(12, 13)
    pdf.multi_cell(124, 11, "Человек на смену\nза час", align="C", **NL)
    pdf.set_font("D", size=9.5)
    pdf.set_xy(12, 39)
    pdf.multi_cell(124, 5, "StaffSwipe · подработка в общепите · Москва",
                   align="C", **NL)

    # Три шага с крупными цифрами — весь продукт на одном экране.
    y = 62
    for i, (title, sub) in enumerate(STEPS, start=1):
        pdf.set_text_color(*CRIMSON)
        pdf.set_font("D", "B", 22)
        pdf.set_xy(14, y - 3)
        pdf.cell(14, 12, str(i))
        pdf.set_text_color(*INK)
        pdf.set_font("D", "B", 12)
        pdf.set_xy(30, y - 2)
        pdf.cell(104, 6, title, **NL)
        pdf.set_text_color(*MUTED)
        pdf.set_font("D", size=9)
        pdf.set_xy(30, y + 5)
        pdf.cell(104, 5, sub, **NL)
        y += 20

    # Главный аргумент в продажах — отдельной плашкой, самой заметной
    # после заголовка: «нет человека — нет денег».
    pdf.set_fill_color(*CRIMSON)
    pdf.rect(12, 122, 124, 28, style="F")
    pdf.set_text_color(*IVORY)
    pdf.set_font("D", "B", 11)
    pdf.set_xy(16, 126)
    pdf.multi_cell(116, 6,
                   "Платите только за вышедшего человека —\n"
                   "10% от смены.\n"
                   "Не вышел — не платите ничего.",
                   align="C", **NL)

    # Место под QR: рамка, чтобы наклейка встала ровно.
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*MUTED)
    pdf.set_line_width(0.3)
    pdf.rect(16, 157, 30, 30, style="DF")
    pdf.set_text_color(*MUTED)
    pdf.set_font("D", size=6.5)
    pdf.set_xy(16, 188)
    pdf.cell(30, 4, "QR — наведите камеру", align="C")

    pdf.set_text_color(*INK)
    pdf.set_font("D", "B", 10)
    pdf.set_xy(52, 158)
    pdf.multi_cell(84, 5, "Открывается прямо в Telegram", **NL)
    pdf.set_font("D", size=8.5)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(52, 165)
    pdf.multi_cell(84, 4.5,
                   "Приложение ставить не нужно,\nрегистрация — минута.",
                   align="L", **NL)
    pdf.set_text_color(*CRIMSON)
    pdf.set_font("D", "B", 10)
    pdf.set_xy(52, 176)
    pdf.cell(84, 5, f"t.me/{bot}" if bot else "t.me/ _______________", **NL)

    # Подпись представителя: бумажку оставляют лично, и по ней перезванивают.
    pdf.set_draw_color(*MUTED)
    pdf.set_line_width(0.2)
    pdf.line(16, 196, 132, 196)
    pdf.set_text_color(*MUTED)
    pdf.set_font("D", size=8)
    pdf.set_xy(16, 197)
    pdf.cell(116, 5, contact or "Кто заходил: ____________________  тел. ____________________")

    pdf.output(str(out))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Раздатка A5 для обхода заведений")
    p.add_argument("--bot", default="", help="username бота без @")
    p.add_argument("--contact", default="", help="имя и телефон представителя")
    p.add_argument("--out", default="flyer.pdf", help="куда сохранить PDF")
    a = p.parse_args()
    path = build(a.bot, a.contact, Path(a.out))
    print(f"Готово: {path.resolve()} — печатать на A5")


if __name__ == "__main__":
    main()
