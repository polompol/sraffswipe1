// Нижняя граница оплаты смены. Держится в паре с backend/app/schemas.py —
// там она обязательна к соблюдению, здесь нужна, чтобы человек узнал об
// ошибке до того, как заполнит форму до конца. Смысл границы: смена за
// бесценок — не предложение работы, а способ бесплатно накрутить репутацию
// парой сговорившихся аккаунтов (за неё не берётся комиссия).
export const MIN_RATE_PER_HOUR = 100;
export const MIN_RATE_PER_SHIFT = 500;

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

// Семейства ролей («ёлочка») — группируем 12 ролей в 4 понятных блока.
export type RoleFamily = "hall" | "bar" | "kitchen" | "house";

export const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  hall: "Зал",
  bar: "Бар",
  kitchen: "Кухня",
  house: "Хозяйство",
};

export const ROLE_FAMILIES: Record<RoleFamily, StaffRole[]> = {
  hall: ["waiter", "waiter_assistant", "hostess", "administrator"],
  bar: ["barista", "bartender", "hookah"],
  kitchen: ["cook", "dishwasher"],
  house: ["cleaner", "courier", "florist"],
};

export const ROLE_FAMILY_ORDER: RoleFamily[] = ["hall", "bar", "kitchen", "house"];

export type MedBookStatus = "yes" | "no" | "expired";

export const MED_BOOK_LABELS: Record<MedBookStatus, string> = {
  yes: "Есть",
  no: "Нет",
  expired: "Просрочена",
};

export type SwipeDirection = "like" | "dislike";

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

// Короткие подписи для чипов в списке. Слово «смены» убрано — оно и так
// понятно из контекста, а вот КОГДА платят («в день» / «после») — главное
// отличие способов, его сокращать нельзя.
export const PAY_METHOD_SHORT: Record<PayMethod, string> = {
  cash: "Наличными в день",
  card: "На карту в день",
  transfer: "Переводом после",
};

// Чаевые: их платят гости, не заведение. Поле информационное — но цепляет.
export type TipsMode = "none" | "individual" | "shared";

export const TIPS_LABELS: Record<TipsMode, string> = {
  none: "Без чаевых",
  individual: "Чаевые себе",
  shared: "Чаевые поровну",
};

// Подписи для формы публикации: там над ними уже стоит заголовок «Чаевые —
// их платят гости», и слово «чаевые» повторялось четыре раза подряд.
export const TIPS_CHOICE: Record<TipsMode, string> = {
  none: "Не будет",
  individual: "Себе",
  shared: "Поровну",
};

// Короткая подпись для плашки на карточке (none — не показываем).
// Тире убрано: в колонке шириной в половину карточки оно уводило слово на
// вторую строку — «Чаевые — / поровну». Смысла тире не добавляло.
export const TIPS_BADGE: Record<TipsMode, string> = {
  none: "",
  individual: "Чаевые вам",
  shared: "Чаевые поровну",
};

export type MatchStatus = "matched" | "confirmed" | "completed" | "cancelled" | "expired";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  matched: "Совпало",
  confirmed: "Смена подтверждена",
  completed: "Смена закрыта",
  cancelled: "Отменена",
  expired: "Не состоялась",
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
  // Возраст числом приходит с сервера. Дату рождения в публичную ленту не
  // отдаём вовсе: она о человеке говорит больше, чем нужно заведению.
  age?: number | null;
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
  shiftsTotal?: number; // надёжность: всего подтверждённых смен
  shiftsAttended?: number; // из них вышел
  employersTotal?: number; // со сколькими РАЗНЫМИ заведениями работал
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
  /** Сколько человек нужно на смену (по умолчанию 1). */
  headcount?: number;
  /** Сколько мест ещё свободно. */
  slotsLeft?: number;
  requireMedBook: boolean;
  requireExperience: boolean;
  lat: number;
  lng: number;
  address: string;
  city: string;
  interiorPhotoUrl: string;
  employerVerified: boolean;
  status: string;
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
  /** Имя работника: его показывают ЗАВЕДЕНИЮ. Соискателю в этой же строке
   *  показывается название заведения — сторона видит того, с кем договорилась,
   *  а не саму себя. */
  seekerName?: string;
  role?: StaffRole;
  checkinCode?: string | null; // виден только заведению (помощник)
  checkedIn?: boolean; // смена закрыта (обе стороны подтвердили)
  /** Предложенный перенос: дата и время, если заведение его предложило. */
  rescheduleDate?: string;
  rescheduleStart?: number | null;
  rescheduleEnd?: number | null;
  /** Фактическая длительность смены в минутах, если она отличалась. */
  actualMinutes?: number | null;
  seekerCheckedIn?: boolean;
  employerCheckedIn?: boolean;
  disputed?: boolean;
  shiftPay?: number; // оплата смены, ₽ — для празднования дохода при закрытии
  /** Когда смена. Раньше приложение не знало о ней ничего, кроме названия
   *  заведения: человек открывал чат и не видел, на какой день и час он
   *  вообще договорился. По этим же полям видно, какие действия ещё уместны. */
  shiftDate?: string;
  shiftStart?: number;
  shiftEnd?: number;
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


export interface PriceItem {
  id: string;
  title: string;
  subtitle: string;
  priceRub?: number; // ₽ (ЮKassa)
  badge?: string;
}
