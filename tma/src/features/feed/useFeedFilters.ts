import { useEffect, useRef, useState } from "react";
import type { FeedFilters } from "@/api/endpoints";
import { todayISO } from "@/lib/format";
import { LS } from "@/lib/storage";

/**
 * Условия ленты: что сейчас выбрано, как это менять и сколько условий включено.
 *
 * Логика жила прямо в FeedPage вперемешку с разметкой: чтение города из
 * хранилища, подстановка города из анкеты, переключатель «Сегодня», подсчёт
 * включённых условий. Проверить это было нельзя никак — только открыв
 * приложение и потыкав пальцем.
 */

/** Сколько условий включено — по нему рисуется значок на кнопке фильтров. */
export function countActiveFilters(f: FeedFilters, isSeeker: boolean): number {
  const keys: Array<keyof FeedFilters> = isSeeker
    ? ["role", "city", "min_rate", "date_from", "rate_type",
       "no_med_book", "tips_only", "verified_only"]
    : ["role", "district", "available_today", "reliable_only"];
  return keys.reduce((n, k) => n + (f[k] ? 1 : 0), 0);
}

/** Включён ли быстрый фильтр «Сегодня». */
export function isTodayOnly(f: FeedFilters): boolean {
  const today = todayISO();
  return f.date_from === today && f.date_to === today;
}

/** Включить или снять «Сегодня», не трогая остальные условия. */
export function toggleTodayFilter(f: FeedFilters): FeedFilters {
  if (!isTodayOnly(f)) {
    return { ...f, date_from: todayISO(), date_to: todayISO() };
  }
  const { date_from: _from, date_to: _to, ...rest } = f;
  void _from;
  void _to;
  return rest;
}

export function useFeedFilters(isSeeker: boolean, profileCity?: string) {
  const [filters, setFilters] = useState<FeedFilters>(() => {
    const c = localStorage.getItem(LS.city);
    return c ? { city: c } : {};
  });

  // Город по умолчанию — из анкеты соискателя, чтобы человек из другого
  // города видел свою ленту, а не чужую. Ровно один раз: иначе снятый
  // человеком город возвращался бы сам.
  const cityDefaulted = useRef(localStorage.getItem(LS.city) != null);
  useEffect(() => {
    if (!isSeeker || cityDefaulted.current || !profileCity) return;
    cityDefaulted.current = true;
    setFilters((f) => ({ ...f, city: profileCity }));
  }, [isSeeker, profileCity]);

  /** Применить набор условий целиком. Город переживает перезапуск. */
  function apply(next: FeedFilters): void {
    if (next.city) localStorage.setItem(LS.city, next.city);
    else localStorage.removeItem(LS.city);
    setFilters(next);
  }

  return {
    filters,
    apply,
    /** Снять одно условие, не трогая остальные. */
    clear: (key: keyof FeedFilters) => {
      const next = { ...filters };
      delete next[key];
      apply(next);
    },
    toggleToday: () => apply(toggleTodayFilter(filters)),
    todayOnly: isTodayOnly(filters),
    activeCount: countActiveFilters(filters, isSeeker),
  };
}
