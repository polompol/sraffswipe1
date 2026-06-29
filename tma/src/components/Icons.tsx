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

export const IconList = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconCards = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="4" width="14" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
    <path d="M9 4h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconBolt = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor"
      strokeWidth="2" strokeLinejoin="round" fill="none" />
  </svg>
);

// --- Иконки нижнего таб-бара. active=true → залитый вариант (как в iOS). ---
type TabP = P & { active?: boolean };
const sw = 1.9;

export const IconTabFeed = ({ size = 26, active, className }: TabP) => (
  <svg {...base(size)} className={className}>
    {/* стопка карточек — «лента смен» */}
    <rect x="6" y="4" width="12" height="16" rx="3"
      fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={sw} />
    <path d="M9 8h6M9 11h6M9 14h4" stroke={active ? "var(--surface)" : "currentColor"}
      strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const IconTabMatches = ({ size = 26, active, className }: TabP) => (
  <svg {...base(size)} className={className}>
    {/* два пересекающихся кольца — «мэтчи» */}
    <circle cx="9" cy="12" r="5" fill={active ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth={sw} />
    <circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth={sw} />
  </svg>
);

export const IconTabShifts = ({ size = 26, active, className }: TabP) => (
  <svg {...base(size)} className={className}>
    {/* календарь — «смены» */}
    <rect x="4" y="5" width="16" height="15" rx="3"
      fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={sw} />
    <path d="M4 9h16M8 3v4M16 3v4" stroke={active ? "var(--surface)" : "currentColor"}
      strokeWidth={sw} strokeLinecap="round" />
  </svg>
);

export const IconTabVacancies = ({ size = 26, active, className }: TabP) => (
  <svg {...base(size)} className={className}>
    {/* портфель — «вакансии» (для работодателя) */}
    <rect x="3" y="8" width="18" height="12" rx="3"
      fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={sw} />
    <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" />
  </svg>
);

export const IconTabProfile = ({ size = 26, active, className }: TabP) => (
  <svg {...base(size)} className={className}>
    {/* человек — «профиль» */}
    <circle cx="12" cy="8" r="3.6" fill={active ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth={sw} />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"
      fill={active ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" />
  </svg>
);
