// Доменные типы — зеркало backend (app/schemas.py) и Flutter (lib/data/models).

export type AppRole = "seeker" | "employer";

export type StaffRole =
  | "waiter"
  | "waiter_assistant"
  | "barista"
  | "cook"
  | "dishwasher"
  | "hostess"
  | "bartender"
  | "hookah"
  | "florist"
  | "administrator"
  | "courier"
  | "cleaner";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  waiter: "Официант",
  waiter_assistant: "Помощник официанта",
  barista: "Бариста",
  cook: "Повар",
  dishwasher: "Посудомой",
  hostess: "Хостес",
  bartender: "Бармен",
  hookah: "Кальянщик",
  florist: "Флорист",
  administrator: "Администратор",
  courier: "Курьер",
  cleaner: "Уборщик",
};

export type MedBookStatus = "yes" | "no" | "expired";

export const MED_BOOK_LABELS: Record<MedBookStatus, string> = {
  yes: "Есть",
  no: "Нет",
  expired: "Просрочена",
};

export type SwipeDirection = "like" | "superlike" | "dislike";

export type RateType = "perHour" | "perShift";

export const RATE_SUFFIX: Record<RateType, string> = {
  perHour: "₽/час",
  perShift: "₽/смена",
};

// Как и когда платит заведение — снимает страх «вдруг кинут».
export type PayMethod = "cash" | "card" | "transfer";

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  cash: "Наличными в день смены",
  card: "На карту в день смены",
  transfer: "Перевод после смены",
};

export const PAY_METHOD_SHORT: Record<PayMethod, string> = {
  cash: "Нал в день смены",
  card: "На карту в день",
  transfer: "Перевод после",
};

// Чаевые: их платят гости, не заведение. Поле информационное — но цепляет.
export type TipsMode = "none" | "individual" | "shared";

export const TIPS_LABELS: Record<TipsMode, string> = {
  none: "Без чаевых",
  individual: "Чаевые себе",
  shared: "Чаевые поровну",
};

// Короткая подпись для бейджа на карточке (none — не показываем).
export const TIPS_BADGE: Record<TipsMode, string> = {
  none: "",
  individual: "Чаевые — вам",
  shared: "Чаевые — поровну",
};

export type MatchStatus = "matched" | "confirmed" | "completed";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  matched: "Мэтч",
  confirmed: "Смена подтверждена",
  completed: "Завершено",
};

export type ExperienceTag =
  | "medBook"
  | "experienced"
  | "english"
  | "cashRegister"
  | "selfEmployed";

export const EXPERIENCE_TAG_LABELS: Record<ExperienceTag, string> = {
  medBook: "Медкнижка",
  experienced: "Опыт > 2 лет",
  english: "Английский",
  cashRegister: "Работа с кассой",
  selfEmployed: "Самозанятый",
};

export interface AvailabilitySlot {
  weekday: number; // 1..7
  start: number; // минуты от полуночи
  end: number;
}

export interface Seeker {
  id: string;
  name: string;
  birthDate: string; // ISO yyyy-mm-dd
  city: string;
  district: string;
  lat: number;
  lng: number;
  roles: StaffRole[];
  medBook: MedBookStatus;
  selfEmployed: boolean;
  inn?: string | null;
  experienceTags: ExperienceTag[];
  availableSlots: AvailabilitySlot[];
  rating: number;
  photoUrls: string[];
  about: string;
  availableToday?: boolean;
}

export interface Vacancy {
  id: string;
  employerId: string;
  companyName: string;
  companyPhotoUrl: string;
  role: StaffRole;
  date: string; // ISO yyyy-mm-dd
  startTime: number;
  endTime: number;
  rate: number;
  rateType: RateType;
  payMethod?: PayMethod;
  tips?: TipsMode;
  description: string;
  requireMedBook: boolean;
  requireExperience: boolean;
  lat: number;
  lng: number;
  address: string;
  city: string;
  interiorPhotoUrl: string;
  employerVerified: boolean;
  status: string;
  boosted?: boolean;
  distanceKm?: number;
  // Доверие к заведению (видно ДО отклика).
  employerRating?: number;
  employerShiftsDone?: number;
  employerPaysOnTime?: boolean;
}

export interface MatchModel {
  id: string;
  seekerId: string;
  employerId: string;
  vacancyId: string;
  status: MatchStatus;
  confirmedBySeeker: boolean;
  confirmedByEmployer: boolean;
  companyName?: string;
  companyPhotoUrl?: string;
  role?: StaffRole;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  isSystem: boolean;
  timestamp: string;
}

// --- Монетизация / entitlements ---

export type Plan = "free" | "pro" | "business";

export interface Entitlements {
  plan: Plan;
  planRenewsAt?: string | null;
  superlikeBalance: number;
  boostBalance: number;
  seekerPremium: boolean;
  employerVerified: boolean;
}

export interface PriceItem {
  id: string;
  title: string;
  subtitle: string;
  priceStars?: number; // XTR
  priceRub?: number; // ₽ (ЮKassa)
  badge?: string;
}
