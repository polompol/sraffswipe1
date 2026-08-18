import { useEffect, useState } from "react";

/**
 * Включён ли «крупный режим» (регулировка в профиле, для слабого зрения).
 *
 * Нужен не для размеров — их поднимает сама шкала в CSS, — а для решений о
 * КОМПОНОВКЕ. Пример, ради которого хук и появился: на карточке смены без
 * фото сумма показывается огромными цифрами поверх карточки. В крупном
 * режиме весь остальной текст тоже вырастает, содержимое перестаёт помещаться
 * в карточку фиксированной высоты, и крупная сумма начинает налезать на
 * название заведения. В этом режиме сумма показывается обычной строкой в теле
 * карточки — ничего не теряется, всё помещается.
 */
export function useLargeMode(): boolean {
  const read = () =>
    typeof document !== "undefined" && document.body.dataset.large === "1";
  const [large, setLarge] = useState(read);
  useEffect(() => {
    // Режим переключают в настройках — атрибутом на <body>. Следим за ним,
    // иначе экран, открытый до переключения, останется в старой компоновке.
    const observer = new MutationObserver(() => setLarge(read()));
    observer.observe(document.body, {
      attributes: true, attributeFilter: ["data-large"],
    });
    return () => observer.disconnect();
  }, []);
  return large;
}
