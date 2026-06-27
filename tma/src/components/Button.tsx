import type { ButtonHTMLAttributes, ReactNode } from "react";
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

const SIZE: Record<Size, { minHeight: number; padding: string; font: number }> = {
  sm: { minHeight: 40, padding: "0 14px", font: 14 },
  md: { minHeight: 48, padding: "0 18px", font: 15 },
  lg: { minHeight: 54, padding: "0 20px", font: 16 },
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
  ...rest
}: Props) {
  const s = SIZE[size];
  const isDisabled = disabled || loading;

  async function handle() {
    if (isDisabled) return;
    haptic("light");
    await onClick?.();
  }

  return (
    <button
      type="button"
      className={`ui-btn ui-btn--${variant}`}
      disabled={isDisabled}
      aria-busy={loading}
      onClick={handle}
      style={{
        width: block ? "100%" : "auto",
        minHeight: s.minHeight,
        padding: s.padding,
        fontSize: s.font,
      }}
      {...rest}
    >
      {loading ? (
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
