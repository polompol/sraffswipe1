// In-memory mock — приложение открывается в Telegram без backend.
// Структура совпадает с backend/app/schemas.py.

import type {
  AppRole,
  Entitlements,
  MatchModel,
  Message,
  Seeker,
  SwipeDirection,
  Vacancy,
} from "@/types/domain";
import type {
  AddressSuggestion,
  AuthResult,
  FeedFilters,
  Me,
  ReferralInfo,
  SavedSearch,
  SwipeResult,
  VerifyResult,
} from "./endpoints";

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`;

const VACANCIES: Vacancy[] = [
  {
    id: "vac1",
    employerId: "emp1",
    companyName: "Кофейня «Дрова»",
    companyPhotoUrl: photo("photo-1554118811-1e0d58224f24"),
    role: "barista",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: 8 * 60,
    endTime: 16 * 60,
    rate: 350,
    rateType: "perHour",
    description:
      "Нужен бариста на утро. Дресс-код: чёрный верх, фартук выдаём. Напитки и обеды бесплатно.",
    requireMedBook: true,
    requireExperience: false,
    lat: 55.734,
    lng: 37.587,
    address: "ул. Льва Толстого, 16",
    interiorPhotoUrl: photo("photo-1559925393-8be0ec4767c8"),
    employerVerified: true,
    status: "active",
    boosted: true,
    distanceKm: 1.6,
  },
  {
    id: "vac2",
    employerId: "emp2",
    companyName: "Бар «Полночь»",
    companyPhotoUrl: photo("photo-1514933651103-005eec06c04b"),
    role: "bartender",
    date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    startTime: 20 * 60,
    endTime: 4 * 60,
    rate: 4500,
    rateType: "perShift",
    description:
      "Срочно бармен на пятницу. Опыт классической барной карты обязателен. Чаевые поровну.",
    requireMedBook: true,
    requireExperience: true,
    lat: 55.76,
    lng: 37.644,
    address: "Покровка, 8",
    interiorPhotoUrl: photo("photo-1572116469696-31de0f17cc34"),
    employerVerified: true,
    status: "active",
    distanceKm: 3.1,
  },
  {
    id: "vac3",
    employerId: "emp3",
    companyName: "Ресторан «Грядка»",
    companyPhotoUrl: photo("photo-1517248135467-4c7edcad34c4"),
    role: "waiter",
    date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: 11 * 60,
    endTime: 23 * 60,
    rate: 300,
    rateType: "perHour",
    description:
      "Официант на банкет. Работа с кассой, знание винной карты — плюс. Униформу даём.",
    requireMedBook: true,
    requireExperience: false,
    lat: 55.757,
    lng: 37.623,
    address: "Никольская, 10",
    interiorPhotoUrl: photo("photo-1424847651672-bf20a4b0982b"),
    employerVerified: false,
    status: "active",
    distanceKm: 2.2,
  },
];

const SEEKERS: Seeker[] = [
  {
    id: "s2",
    name: "Мария",
    birthDate: "1998-09-03",
    city: "Москва",
    district: "Басманный",
    lat: 55.765,
    lng: 37.67,
    roles: ["waiter", "hostess"],
    medBook: "yes",
    selfEmployed: true,
    inn: "771298765432",
    experienceTags: ["medBook", "english", "experienced", "selfEmployed"],
    availableSlots: [{ weekday: 1, start: 600, end: 1080 }],
    rating: 4.9,
    photoUrls: [photo("photo-1494790108377-be9c29b29330")],
    about: "Опыт в fine dining, английский B2.",
  },
  {
    id: "s3",
    name: "Иван",
    birthDate: "2002-01-20",
    city: "Москва",
    district: "Тверской",
    lat: 55.768,
    lng: 37.601,
    roles: ["cook", "dishwasher"],
    medBook: "expired",
    selfEmployed: false,
    experienceTags: ["experienced"],
    availableSlots: [{ weekday: 6, start: 540, end: 1260 }],
    rating: 4.4,
    photoUrls: [photo("photo-1500648767791-00dcc994a43e")],
    about: "Холодный и горячий цех, опыт 2 года.",
  },
];

const matches: MatchModel[] = [];
const messagesByMatch: Record<string, Message[]> = {};
let entitlements: Entitlements = {
  plan: "free",
  superlikeBalance: 1,
  boostBalance: 0,
  seekerPremium: false,
  employerVerified: false,
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function authTelegram(role: AppRole): Promise<AuthResult> {
  return Promise.resolve({ accessToken: "mock", role, userId: "me" });
}

export function fetchFeed(
  role: AppRole,
  filters?: {
    role?: string;
    min_rate?: number;
    date_from?: string;
    rate_type?: string;
    no_med_book?: boolean;
    no_experience?: boolean;
    verified_only?: boolean;
    sort?: string;
  },
): Promise<Vacancy[] | Seeker[]> {
  if (role !== "seeker") return Promise.resolve([...SEEKERS]);
  let list = [...VACANCIES];
  if (filters?.role) list = list.filter((v) => v.role === filters.role);
  if (filters?.min_rate != null) list = list.filter((v) => v.rate >= filters.min_rate!);
  if (filters?.rate_type) list = list.filter((v) => v.rateType === filters.rate_type);
  if (filters?.no_med_book) list = list.filter((v) => !v.requireMedBook);
  if (filters?.no_experience) list = list.filter((v) => !v.requireExperience);
  if (filters?.verified_only) list = list.filter((v) => v.employerVerified);
  if (filters?.date_from) list = list.filter((v) => v.date >= filters.date_from!);
  if (filters?.sort === "rate") list.sort((a, b) => b.rate - a.rate);
  else if (filters?.sort === "date") list.sort((a, b) => a.date.localeCompare(b.date));
  return Promise.resolve(list);
}

export function sendSwipe(
  targetId: string,
  direction: SwipeDirection,
): Promise<SwipeResult> {
  if (direction === "dislike") return Promise.resolve({ matched: false });
  const vac = VACANCIES.find((v) => v.id === targetId);
  if (!vac) return Promise.resolve({ matched: false });
  const match: MatchModel = {
    id: uid(),
    seekerId: "me",
    employerId: vac.employerId,
    vacancyId: vac.id,
    status: "matched",
    confirmedBySeeker: false,
    confirmedByEmployer: false,
    companyName: vac.companyName,
    companyPhotoUrl: vac.companyPhotoUrl,
    role: vac.role,
  };
  matches.unshift(match);
  messagesByMatch[match.id] = [
    {
      id: uid(),
      chatId: match.id,
      senderId: "system",
      text: `Это мэтч! Смена «${vac.companyName}». Договоритесь о деталях.`,
      isSystem: true,
      timestamp: new Date().toISOString(),
    },
    {
      id: uid(),
      chatId: match.id,
      senderId: vac.employerId,
      text: "Здравствуйте! Готовы выйти на смену?",
      isSystem: false,
      timestamp: new Date().toISOString(),
    },
  ];
  return Promise.resolve({ matched: true, matchId: match.id });
}

export function fetchMatches(): Promise<MatchModel[]> {
  return Promise.resolve([...matches]);
}

export function fetchMessages(matchId: string): Promise<Message[]> {
  return Promise.resolve([...(messagesByMatch[matchId] ?? [])]);
}

export function sendMessage(matchId: string, text: string): Promise<Message> {
  const msg: Message = {
    id: uid(),
    chatId: matchId,
    senderId: "me",
    text,
    isSystem: false,
    timestamp: new Date().toISOString(),
  };
  (messagesByMatch[matchId] ??= []).push(msg);
  return Promise.resolve(msg);
}

export function confirmShift(matchId: string): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  m.confirmedBySeeker = true;
  m.status = "confirmed";
  (messagesByMatch[matchId] ??= []).push({
    id: uid(),
    chatId: matchId,
    senderId: "system",
    text: "Смена подтверждена ✅. Сформирован акт для самозанятого.",
    isSystem: true,
    timestamp: new Date().toISOString(),
  });
  return Promise.resolve({ ...m });
}

export function fetchEntitlements(): Promise<Entitlements> {
  return Promise.resolve({ ...entitlements });
}

export function grantMock(patch: Partial<Entitlements>): void {
  entitlements = { ...entitlements, ...patch };
}

const invited = 2;

const meProfile: Me = {
  id: "me",
  role: "seeker",
  name: "Алексей",
  rating: 4.8,
  tgUsername: "alexey",
};

export function fetchMe(): Promise<Me> {
  return Promise.resolve({ ...meProfile });
}

export function updateMe(patch: { name?: string; birth_date?: string }): Promise<Me> {
  // Серверный 18+ имитируем и в mock, чтобы UI-поток совпадал с backend.
  if (patch.birth_date) {
    const y = new Date(patch.birth_date).getFullYear();
    if (new Date().getFullYear() - y < 18) {
      return Promise.reject(new Error("Сервис доступен только с 18 лет"));
    }
  }
  if (patch.name) meProfile.name = patch.name;
  return Promise.resolve({ ...meProfile });
}

export function fetchReferral(): Promise<ReferralInfo> {
  return Promise.resolve({
    code: "ref_me",
    link: "https://t.me/staffswipe_bot?startapp=ref_me",
    invited,
    bonusSuperlikes: 3,
  });
}

export function leaveReview(): Promise<void> {
  return Promise.resolve();
}

export function boostVacancy(vacancyId: string): Promise<void> {
  const vac = VACANCIES.find((v) => v.id === vacancyId);
  if (vac) vac.boosted = true;
  return Promise.resolve();
}

export function verifyEmployer(inn: string): Promise<VerifyResult> {
  const ok = /^\d{10,12}$/.test(inn);
  return Promise.resolve({
    found: ok,
    verified: ok && entitlements.employerVerified,
    name: ok ? "ООО «Кофейня Дрова»" : "",
    ogrn: ok ? "1167746000000" : "",
    address: ok ? "Москва, ул. Льва Толстого, 16" : "",
    hint: ok
      ? entitlements.employerVerified
        ? ""
        : "Данные подтянуты. Бейдж «Проверен» — после оплаты верификации."
      : "Введите корректный ИНН (10–12 цифр).",
  });
}

const savedSearches: SavedSearch[] = [];

export function listSavedSearches(): Promise<SavedSearch[]> {
  return Promise.resolve([...savedSearches]);
}
export function createSavedSearch(
  title: string,
  filters: FeedFilters,
  notify: boolean,
): Promise<SavedSearch> {
  const s: SavedSearch = { id: uid(), title, filters, notify };
  savedSearches.unshift(s);
  return Promise.resolve(s);
}
export function deleteSavedSearch(id: string): Promise<void> {
  const i = savedSearches.findIndex((s) => s.id === id);
  if (i >= 0) savedSearches.splice(i, 1);
  return Promise.resolve();
}

export function suggestAddress(q: string): Promise<AddressSuggestion[]> {
  if (q.length < 3) return Promise.resolve([]);
  return Promise.resolve([
    { value: `Москва, ${q}, 1`, lat: 55.75, lng: 37.61 },
    { value: `Москва, ${q}, 10`, lat: 55.76, lng: 37.62 },
    { value: `Санкт-Петербург, ${q}, 5`, lat: 59.93, lng: 30.34 },
  ]);
}
