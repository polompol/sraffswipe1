import { Button } from "@/components/Button";
import { IconBell, IconFilter } from "@/components/Icons";

/**
 * Пустая лента: объяснить, почему пусто, и дать следующий шаг.
 *
 * Причины разные, и выходы тоже. У работника пусто на старте — сервису нечего
 * показать сегодня, но он может позвать завтра: главное действие здесь —
 * подписка. У заведения пусто чаще из-за слишком узких условий, и ему нужна
 * кнопка «снять всё» — раньше на этом экране у него не было ни одной кнопки,
 * только совет.
 */
export function FeedEmpty({
  isSeeker,
  city,
  activeFilterCount,
  alerts,
  onResetFilters,
  onOpenFilters,
}: {
  isSeeker: boolean;
  city?: string;
  activeFilterCount: number;
  alerts: { subscribe: () => void | Promise<void>; busy: boolean; done: boolean };
  onResetFilters: () => void;
  onOpenFilters: () => void;
}) {
  return (
    <div className="card feed-empty">
      <div className="feed-empty-icon">
        {isSeeker ? <IconFilter size={34} /> : <IconBell size={34} />}
      </div>
      <h2 className="h2" style={{ marginTop: 12 }}>
        {isSeeker
          ? city
            ? `В городе ${city} пока нет смен`
            : "Вы посмотрели все смены"
          : "Пока никого не нашли"}
      </h2>
      {/* Совет «уберите условия» имеет смысл, только если условия и правда
          включены. Раньше он стоял всегда, и заведение с пустым набором
          фильтров искало сверху то, чего там нет.

          У работника без условий строки нет вовсе: обещание «напишем в бота»
          целиком несёт подпись кнопки прямо под ней — и, в отличие от строки,
          честно меняется после подписки. */}
      <p className="muted">
        {activeFilterCount > 0
          ? "Похоже, условия сверху слишком узкие — попробуйте снять пару"
          : isSeeker
            ? ""
            : "Загляните позже: новые люди отмечаются каждый день"}
      </p>
      {!isSeeker && activeFilterCount > 0 && (
        <Button variant="secondary" style={{ marginTop: 14 }} onClick={onResetFilters}>
          Снять все условия
        </Button>
      )}
      {/* Подписку прятать в пилоте было ошибкой: лента пуста именно на старте,
          и это единственный способ не потерять человека, который пришёл
          первым. Механика работает — незачем её скрывать. */}
      {isSeeker && (
        <Button
          style={{ marginTop: 14 }}
          // Свой флаг нужен и после ответа сервера: кнопка должна остаться
          // выключенной («Будем присылать»), а встроенная защита от двойного
          // нажатия снимается сразу, как только запрос завершился.
          disabled={alerts.busy || alerts.done}
          icon={<IconBell size={18} />}
          onClick={alerts.subscribe}
        >
          {alerts.done ? "Будем присылать" : "Присылать новые смены в бота"}
        </Button>
      )}
      {isSeeker && (
        <Button variant="ghost" style={{ marginTop: 10 }} onClick={onOpenFilters}>
          {city ? "Сменить город" : "Настроить фильтры"}
        </Button>
      )}
    </div>
  );
}
