"""Гео-утилиты. В проде на больших объёмах — PostGIS (ST_DWithin/индексы)."""
import math


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Расстояние по формуле гаверсинуса, км."""
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
