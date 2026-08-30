import { useEffect, useState } from "react";

export interface Geo {
  lat: number;
  lng: number;
}

/**
 * Геолокация устройства для ленты «смены рядом».
 *
 * Точные координаты НЕ сохраняем на телефоне. Раньше сохраняли — чтобы при
 * следующем заходе показать расстояния сразу, не дожидаясь спутников. Цена
 * этому оказалась несоразмерной: точка с точностью до дома лежала в браузере
 * бессрочно, переживала выход из аккаунта и досталась бы любому, кто получил
 * доступ к телефону или к содержимому вкладки. Выигрыш был меньше секунды на
 * втором заходе: разрешение на геолокацию браузер помнит сам, поэтому спрашивать
 * человека повторно всё равно не приходится.
 *
 * Отказ и недоступность — тихо: лента просто работает без расстояния,
 * сортировка по ставке и дате остаётся.
 */
export function useGeo(enabled = true): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* отказ/ошибка — работаем без геолокации */
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, [enabled]);

  return geo;
}
