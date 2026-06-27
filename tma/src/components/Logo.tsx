/** Фирменный знак StaffSwipe — два уголка-пазла, готовых сомкнуться (метафора
 * мэтча двух сторон). Монохром: цвет задаётся через `color`. */
export function Logo({
  size = 28,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <path
        d="M52 56 V144 M52 56 H86 M52 144 H86 M86 56 V90 H72 V110 H86 V144"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M148 56 V144 M148 56 H114 M148 144 H114 M114 56 V90 H128 V110 H114 V144"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
