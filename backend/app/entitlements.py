"""Общие помощники по правам пользователя (денежный баланс, флаги)."""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Entitlement


def ensure(db: Session, owner_id: str) -> Entitlement:
    """Гарантировать строку прав БЕЗ коммита.

    Отдельно от get_or_create, потому что коммит в середине денежной операции
    фиксирует всё, что висит в сессии, — и разрывает её на две части. Именно
    так терялись пополнения: запись «оплачено» успевала зафиксироваться, а
    зачисление на баланс — нет. Здесь только flush: строка появляется в
    транзакции, но фиксируется вместе со всем остальным.
    """
    ent = db.get(Entitlement, owner_id)
    if ent is None:
        ent = Entitlement(owner_id=owner_id)
        db.add(ent)
        db.flush()
    return ent


def get_or_create(db: Session, owner_id: str) -> Entitlement:
    """То же, но с коммитом. Для обычных чтений, вне денежных транзакций."""
    ent = db.get(Entitlement, owner_id)
    if ent is None:
        ent = Entitlement(owner_id=owner_id)
        db.add(ent)
        try:
            db.commit()
        except IntegrityError:
            # Два одновременных запроса от одного человека (открыл приложение
            # и сразу нажал что-то) оба видели «строки нет» и оба пытались её
            # создать. Второй падал на первичном ключе — и человек получал
            # 500 на ровном месте, при первом же входе. Значит строку уже
            # создал сосед: откатываемся и берём её.
            db.rollback()
            ent = db.get(Entitlement, owner_id)
            if ent is None:
                raise
            return ent
        db.refresh(ent)
    return ent


# Тарифов и лимитов на число вакансий нет и не планируется: модель — комиссия
# с закрытой смены. Значит сервису ВЫГОДНО, чтобы заведение вешало как можно
# больше смен, и ограничивать публикацию было бы стрельбой себе в ногу.
