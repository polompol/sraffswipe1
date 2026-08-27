import { useEffect, useState } from "react";

export interface Geo {
  lat: number;
  lng: number;
}

/** Геолокация устройства для ленты «смены рядом».
 *
 * Точные координаты намеренно НЕ сохраняем в localStorage: это чувствительные
 * данные о местоположении устройства, а для работы текущего экрана достаточно
 * держать их в памяти до закрытия Mini App. После нового запуска Telegram
 * браузер снова запросит позицию по обычному разрешению геолокации.
 * Отказ/недоступность — тихо: лента просто работает без расстояния.
 */
export function useGeo(enabled = true): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g: Geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeo(g);
      },
      () => {
        /* отказ/ошибка — работаем без геолокации */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, [enabled]);

  return geo;
}
