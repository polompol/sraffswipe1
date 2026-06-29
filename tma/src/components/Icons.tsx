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

// --- Контентные иконки (вместо эмодзи). Все — штрих, currentColor. ---
const S = "currentColor";

export const IconMoney = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="3" stroke={S} strokeWidth="2" />
    <circle cx="12" cy="12" r="2.6" stroke={S} strokeWidth="2" />
    <path d="M5.5 9.5h.01M18.5 14.5h.01" stroke={S} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconPin = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" stroke={S} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.4" stroke={S} strokeWidth="2" />
  </svg>
);

export const IconFire = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3c.5 3-2 4-2 6.5C10 11 11 12 12 12s2-1 2-2.5c1 .8 3 2.7 3 5.5a5 5 0 11-10 0c0-2.4 1.5-4 2.5-5C10 8 9.5 5.5 12 3z"
      stroke={S} strokeWidth="1.9" strokeLinejoin="round" fill="none" />
  </svg>
);

export const IconCheck = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7" stroke={S} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconShield = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l7 3v5c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6l7-3z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke={S} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconMedBook = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" stroke={S} strokeWidth="1.9" />
    <path d="M12 8v6M9 11h6" stroke={S} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconCard = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="5" width="19" height="14" rx="3" stroke={S} strokeWidth="2" />
    <path d="M2.5 9.5h19M6 15h4" stroke={S} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconCash = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" stroke={S} strokeWidth="2" />
    <circle cx="12" cy="12" r="2.5" stroke={S} strokeWidth="2" />
  </svg>
);

export const IconBank = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 10l8-5 8 5M5 10v8M9 10v8M15 10v8M19 10v8M3.5 20.5h17" stroke={S} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconGift = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3.5" y="9" width="17" height="11" rx="2" stroke={S} strokeWidth="1.9" />
    <path d="M3.5 13h17M12 9v11M12 9c-1-3-5-3-5-1s4 1 5 1zm0 0c1-3 5-3 5-1s-4 1-5 1z" stroke={S} strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

export const IconEdit = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 19h3l9-9-3-3-9 9v3z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M13.5 6.5l3 3" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconHelp = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" stroke={S} strokeWidth="1.9" />
    <path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .8-1.5 1.2-1.5 2.5" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
    <path d="M12 17.5h.01" stroke={S} strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export const IconChat = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 5h16v11H8l-4 3.5V5z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
  </svg>
);

export const IconDoc = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3h8l4 4v14H6V3z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M14 3v4h4M9 13h6M9 16h6" stroke={S} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCalendar = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="5" width="16" height="16" rx="2.5" stroke={S} strokeWidth="1.9" />
    <path d="M4 9.5h16M8 3v4M16 3v4" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconBell = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 16V11a6 6 0 1112 0v5l1.5 2.5h-15L6 16z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M10 20a2 2 0 004 0" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconShare = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 15V4m0 0L8 8m4-4l4 4" stroke={S} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12v7h14v-7" stroke={S} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconWarning = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.5l9 16H3l9-16z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M12 10v4M12 17h.01" stroke={S} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconBriefcase = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="8" width="18" height="12" rx="2.5" stroke={S} strokeWidth="1.9" />
    <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2M3 13h18" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

export const IconStore = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 10v9h16v-9M3 5h18l-1 5H4L3 5z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M10 19v-5h4v5" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
  </svg>
);

export const IconCamera = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 8h3l2-2.5h8L18 8h3v11H3V8z" stroke={S} strokeWidth="1.9" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.4" stroke={S} strokeWidth="1.9" />
  </svg>
);

export const IconChevronRight = ({ size = 24, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5l7 7-7 7" stroke={S} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
