/** Единый SVG-иконсет StaffSwipe — чистые штрихи, цвет через currentColor. */
type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
});

export const IconSkip = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const IconLike = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path
      d="M12 20s-7-4.4-9.2-8.6C1.3 8.3 2.8 5 6 5c2 0 3.2 1.2 4 2.4C10.8 6.2 12 5 14 5c3.2 0 4.7 3.3 3.2 6.4C19 15.6 12 20 12 20z"
      fill="currentColor"
    />
  </svg>
);

export const IconSuper = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />
  </svg>
);

export const IconBack = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconFilter = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 6h18M6 12h12M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconSend = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12l16-8-6 16-2.5-6L4 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
  </svg>
);
