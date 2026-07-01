import { useEffect, useState } from "react";

export interface Geo {
  lat: number;
  lng: number;
}

/** Геолокация устройства для ленты «смены рядом». Спрашиваем один раз, кешируем
 *  в localStorage (мгновенно при следующем заходе). Отказ/недоступность — тихо:
 *  лента просто работает без расстояния (сортировка по ставке/дате остаётся). */
export function useGeo(enabled = true): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(() => {
    try {
      const raw = localStorage.getItem("ss_geo");
      return raw ? (JSON.parse(raw) as Geo) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g: Geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeo(g);
        try {
          localStorage.setItem("ss_geo", JSON.stringify(g));
        } catch {
          /* приватный режим — не критично */
        }
      },
      () => {
        /* отказ/ошибка — работаем без геолокации */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, [enabled]);

  return geo;
}
