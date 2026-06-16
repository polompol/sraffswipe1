// Доменные типы — зеркало backend (app/schemas.py) и Flutter (lib/data/models).

export type AppRole = "seeker" | "employer";

export type StaffRole =
  | "waiter"
  | "barista"
  | "cook"
  | "dishwasher"
  | "hostess"
  | "bartender";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  waiter: "Официант",
  barista: "Бариста",
  cook: "Повар",
  dishwasher: "Посудомой",
  hostess: "Хостес",
  bartender: "Бармен",
};

export const STAFF_ROLE_EMOJI: Record<StaffRole, string> = {
  waiter: "🍽️",
  barista: "☕",
  cook: "👨‍🍳",
  dishwasher: "🧽",
  hostess: "💁",
  bartender: "🍸",
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
}

export interface Employer {
  id: string;
  companyName: string;
  inn: string;
  ogrn: string;
  address: string;
  lat: number;
  lng: number;
  verified: boolean;
  contactPhone: string;
  photoUrl: string;
  rating: number;
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
  description: string;
  requireMedBook: boolean;
  requireExperience: boolean;
  lat: number;
  lng: number;
  address: string;
  interiorPhotoUrl: string;
  employerVerified: boolean;
  status: string;
  boosted?: boolean;
  distanceKm?: number;
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
