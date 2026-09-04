/**
 * Кто сейчас отвечает за кнопку «Назад».
 *
 * Раньше кнопку показывал и прятал каждый экран сам, и открытая поверх него
 * шторка про неё не знала: человек жал «назад» при открытых фильтрах — и
 * уходил с экрана целиком, а шторка оставалась висеть над новым.
 *
 * Обработчики лежат стопкой: нажатие достаётся верхнему, то есть самому
 * свежему окну. Сняли шторку — «назад» снова принадлежит экрану. Кнопка
 * прячется, только когда стопка опустела.
 *
 * Логика вынесена из telegram/sdk.ts отдельно, потому что она чистая: в
 * браузере Telegram нет, а проверить порядок обработчиков нужно.
 */
export interface BackButtonPort {
  show(): void;
  hide(): void;
  /** Подписка на нажатие; возвращает функцию отписки. */
  onClick(handler: () => void): () => void;
}

export function createBackStack(port: BackButtonPort) {
  const stack: Array<() => void> = [];
  let off: (() => void) | null = null;

  function sync(): void {
    off?.();
    off = null;
    if (stack.length === 0) {
      port.hide();
      return;
    }
    port.show();
    off = port.onClick(() => stack[stack.length - 1]?.());
  }

  /** Повесить свой обработчик поверх. Возвращает функцию, снимающую его. */
  return function push(handler: () => void): () => void {
    stack.push(handler);
    sync();
    let done = false;
    return () => {
      // Дважды снимать нельзя: React в строгом режиме вызывает уборку
      // эффекта повторно, и второй вызов снёс бы чужой обработчик.
      if (done) return;
      done = true;
      const i = stack.lastIndexOf(handler);
      if (i >= 0) stack.splice(i, 1);
      sync();
    };
  };
}
