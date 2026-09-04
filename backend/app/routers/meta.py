"""Справочные данные для приложения: список городов."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..cities import CITIES

router = APIRouter(tags=["meta"])


class CityOut(BaseModel):
    name: str
    tz: str  # часовой пояс — приложению для показа времени смены


@router.get("/cities", response_model=list[CityOut])
def list_cities() -> list[CityOut]:
    """Города, в которых работает сервис.

    Приложение показывает этот список выбором, а не полем ввода. Это не
    придирка к оформлению: со свободным вводом «Санкт-Петербург», «СПб» и
    «Питер» становились тремя разными городами, и люди из одного города
    переставали видеть друг друга — молча, без единой ошибки.

    Список отдаём с сервера, а не держим копию в приложении: две копии
    неизбежно разъезжаются, и разъехавшийся город — это снова пустая лента.
    """
    return [CityOut(name=n, tz=tz) for n, tz in CITIES]
