"""DaData: подсказки адресов и проверка организации по ИНН/ОГРН.

Без DADATA_TOKEN — graceful-degradation (пустой результат), чтобы dev/демо
работали без ключа.
"""
import json
import urllib.request

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..config import settings
from ..security import current_principal

router = APIRouter(prefix="/dadata", tags=["dadata"])

_SUGGEST = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest"


def _post(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Token {settings.dadata_token}",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
        return json.loads(resp.read())


class AddressItem(BaseModel):
    value: str
    lat: float | None = None
    lng: float | None = None


@router.get("/address", response_model=list[AddressItem])
def suggest_address(q: str, _p: dict = Depends(current_principal)):
    if not settings.dadata_token or len(q) < 3:
        return []
    try:
        data = _post(f"{_SUGGEST}/address", {"query": q, "count": 6})
    except Exception:  # noqa: BLE001
        return []
    out: list[AddressItem] = []
    for s in data.get("suggestions", []):
        d = s.get("data", {})
        lat = float(d["geo_lat"]) if d.get("geo_lat") else None
        lng = float(d["geo_lon"]) if d.get("geo_lon") else None
        out.append(AddressItem(value=s.get("value", ""), lat=lat, lng=lng))
    return out


class PartyOut(BaseModel):
    found: bool
    name: str = ""
    inn: str = ""
    ogrn: str = ""
    address: str = ""


@router.get("/party", response_model=PartyOut)
def check_party(inn: str, _p: dict = Depends(current_principal)):
    if not settings.dadata_token:
        return PartyOut(found=False)
    try:
        data = _post(f"{_SUGGEST}/party", {"query": inn, "count": 1})
    except Exception:  # noqa: BLE001
        return PartyOut(found=False)
    items = data.get("suggestions", [])
    if not items:
        return PartyOut(found=False)
    d = items[0].get("data", {})
    return PartyOut(
        found=True,
        name=items[0].get("value", ""),
        inn=d.get("inn", ""),
        ogrn=d.get("ogrn", ""),
        address=(d.get("address") or {}).get("value", ""),
    )
