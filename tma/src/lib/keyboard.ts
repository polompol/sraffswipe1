/** Экранная клавиатура: сколько экрана она сейчас закрывает.
 *
 *  Панель ввода в чате приклеена к низу окна (`position: fixed`). Когда
 *  открывается клавиатура, поведение зависит от системы, и оба варианта плохи
 *  по-своему:
 *
 *  • на айфоне окно не уменьшается — клавиатура просто наезжает сверху, и
 *    поле ввода вместе с кнопкой «Отправить» оказывается ПОД ней. Человек
 *    печатает вслепую и не видит, куда нажать;
 *  • на андроиде окно обычно уменьшается само, но в Telegram это зависит от
 *    версии вебвью, и полагаться на это нельзя.
 *
 *  Меряем разницу между окном и видимой его частью (`visualViewport`) и
 *  кладём её в переменную `--kb`. Панель ввода поднимается ровно на столько,
 *  на сколько её накрыло. Если браузер этого не умеет — переменная остаётся
 *  нулём, и всё работает как раньше.
 */
export function watchKeyboard(): () => void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return () => {};

  const apply = (): void => {
    // Насколько низ видимой области выше низа окна. При закрытой клавиатуре
    // это ноль (или пара точек из-за округления — их отбрасываем).
    const hidden = window.innerHeight - (vv.height + vv.offsetTop);
    const px = hidden > 8 ? Math.round(hidden) : 0;
    document.documentElement.style.setProperty("--kb", `${px}px`);
  };

  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    document.documentElement.style.removeProperty("--kb");
  };
}
