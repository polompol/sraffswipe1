import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { haptic } from "@/telegram/sdk";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  onClick?: () => void | Promise<void>;
}

// Высота — не меньше 44px даже у самой маленькой кнопки: это общепринятая
// минимальная зона, в которую уверенно попадает палец. Маленькая была 40px,
// то есть «почти попадает» — а промах по кнопке в приложении, где всё
// решается быстрым нажатием, человек читает как «не сработало» и жмёт ещё раз.
// Размер шрифта берётся из общей шкалы (theme.css), поэтому кнопки растут
// вместе со всем интерфейсом в крупном режиме.
const SIZE: Record<Size, { minHeight: number; padding: string; font: string }> = {
  sm: { minHeight: 44, padding: "0 14px", font: "var(--text-sm)" },
  md: { minHeight: 48, padding: "0 18px", font: "var(--text-base)" },
  lg: { minHeight: 54, padding: "0 20px", font: "var(--text-md)" },
};

/** Единая кнопка: варианты, размеры, loading-спиннер, haptic, мин. 44px тач. */
export function Button({
  variant = "primary",
  size = "lg",
  loading = false,
  block = true,
  icon,
  children,
  disabled,
  onClick,
  style,
  ...rest
}: Props) {
  const s = SIZE[size];
  // Внутренний «running» — авто-защита от двойных нажатий: пока async-обработчик
  // не завершился, кнопка заблокирована и крутит спиннер (важно для оплаты).
  const [running, setRunning] = useState(false);
  const busy = loading || running;
  const isDisabled = disabled || busy;

  async function handle() {
    if (isDisabled) return;
    haptic("light");
    try {
      setRunning(true);
      await onClick?.();
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      type="button"
      className={`ui-btn ui-btn--${variant}`}
      disabled={isDisabled}
      aria-busy={busy}
      onClick={handle}
      // Внешний style ДОПОЛНЯЕТ размеры, а не заменяет их: раньше он шёл через
      // {...rest} после style и затирал minHeight — кнопка с внешним стилем
      // схлопывалась по высоте иконки и теряла минимальную зону тапа.
      style={{
        width: block ? "100%" : "auto",
        minHeight: s.minHeight,
        padding: s.padding,
        fontSize: s.font,
        ...style,
      }}
      {...rest}
    >
      {busy ? (
        <span className="ui-spinner" aria-hidden />
      ) : (
        <>
          {icon && <span className="ui-btn__icon">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
