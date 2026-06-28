"""Наполнение БД демо-данными. Запуск: python -m app.seed"""
from .db import SessionLocal, init_db
from .models import Employer, User, Vacancy


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.query(Employer).count() > 0:
            print("Данные уже есть, пропускаю.")
            return
        emp = Employer(
            phone="+74951112233",
            company_name="Кофейня «Дрова»",
            inn="7701234567",
            ogrn="1167746000000",
            address="Москва, ул. Льва Толстого, 16",
            lat=55.7340,
            lng=37.5870,
            verified=True,
            contact_phone="+74951112233",
            photo_url="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=900&q=80",
            rating=4.7,
        )
        db.add(emp)
        db.flush()
        db.add_all(
            [
                Vacancy(
                    employer_id=emp.id,
                    role="barista",
                    date="2026-06-16",
                    start_time=8 * 60,
                    end_time=16 * 60,
                    rate=350,
                    rate_type="perHour",
                    pay_method="card",
                    description="Бариста на утреннюю смену.",
                    require_med_book=True,
                    lat=55.7340,
                    lng=37.5870,
                    address="ул. Льва Толстого, 16",
                    interior_photo_url="https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=900&q=80",
                ),
                Vacancy(
                    employer_id=emp.id,
                    role="dishwasher",
                    date="2026-06-18",
                    start_time=10 * 60,
                    end_time=18 * 60,
                    rate=2800,
                    rate_type="perShift",
                    pay_method="cash",
                    description="Посудомойщик на выходные.",
                    lat=55.7340,
                    lng=37.5870,
                    address="ул. Льва Толстого, 16",
                    interior_photo_url="https://images.unsplash.com/photo-1581349485608-9469926a8e5e?w=900&q=80",
                ),
            ]
        )
        db.add_all(
            [
                User(
                    phone="+79991112233",
                    name="Мария",
                    birth_date="1998-09-03",
                    city="Москва",
                    district="Басманный",
                    lat=55.7650,
                    lng=37.6700,
                    roles="waiter,hostess",
                    med_book="yes",
                    self_employed=True,
                    inn="771298765432",
                    experience_tags="medBook,english,experienced,selfEmployed",
                    available_today=True,
                    rating=4.9,
                    photo_urls="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&q=80",
                    about="Опыт в fine dining, английский B2.",
                ),
                User(
                    phone="+79992223344",
                    name="Иван",
                    birth_date="2002-01-20",
                    city="Москва",
                    district="Тверской",
                    lat=55.7680,
                    lng=37.6010,
                    roles="cook,dishwasher",
                    med_book="expired",
                    self_employed=False,
                    experience_tags="experienced",
                    rating=4.4,
                    photo_urls="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=900&q=80",
                    about="Холодный и горячий цех, опыт 2 года.",
                ),
            ]
        )
        db.commit()
        print("Демо-данные добавлены.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
