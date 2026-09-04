import { Logo } from "@/components/Logo";
import { IconCards, IconFilter, IconList } from "@/components/Icons";
import { haptic } from "@/telegram/sdk";

/**
 * Шапка ленты: значок, вопрос экрана и две кнопки — вид и фильтры.
 *
 * На низких экранах ужимается (см. .feed-head в index.css): место на телефоне
 * принадлежит карточке, а не логотипу — своё название человек и так знает.
 */
export function FeedHeader({
  isSeeker,
  view,
  onView,
  activeFilterCount,
  onFilters,
}: {
  isSeeker: boolean;
  /** Вид ленты: карточками или списком. У заведения переключателя нет. */
  view: "swipe" | "list";
  onView: (next: "swipe" | "list") => void;
  activeFilterCount: number;
  onFilters: () => void;
}) {
  return (
    <div className="row feed-head" style={{ marginBottom: 6, gap: 4 }}>
      <span aria-hidden className="feed-logo">
        <Logo size={24} color="var(--on-brand)" />
      </span>
      {/* Именно h1: это главный экран приложения, и заголовка первого уровня
          на нём не было вовсе — скринридер не мог назвать страницу. Класс .h2
          оставляем: он задаёт размер, а не уровень.

          Заголовок отвечает на вопрос, с которым человек открыл приложение, а
          не повторяет название сервиса: оно и так стоит слева значком. У ролей
          вопросы разные — «какие смены доступны» и «кто свободен», — и экраны
          не должны выглядеть одинаково. */}
      <h1 className="h2 feed-title">
        {isSeeker ? "Смены рядом" : "Кто свободен"}
      </h1>
      {isSeeker && (
        <button
          className="icon-btn"
          // Тише фильтров: вид переключают редко, а фильтры — каждый день.
          style={{ color: "var(--muted)" }}
          aria-label={view === "swipe" ? "Показать списком" : "Показать карточками"}
          onClick={() => {
            onView(view === "swipe" ? "list" : "swipe");
            haptic("light");
          }}
        >
          {view === "swipe" ? <IconList size={22} /> : <IconCards size={22} />}
        </button>
      )}
      <button
        className="icon-btn"
        // Число включённых условий нарисовано значком поверх иконки, но
        // aria-label его перекрывал: вслух читалось просто «Фильтры», и
        // сколько их включено — было не узнать.
        aria-label={
          activeFilterCount > 0 ? `Фильтры, включено: ${activeFilterCount}` : "Фильтры"
        }
        style={{ color: activeFilterCount ? "var(--gold)" : undefined }}
        onClick={onFilters}
      >
        <IconFilter size={22} />
        {activeFilterCount > 0 && <span className="icon-badge">{activeFilterCount}</span>}
      </button>
    </div>
  );
}
