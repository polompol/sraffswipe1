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
  VacancyInput,
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
    payMethod: "card",
    tips: "shared",
    description:
      "Нужен бариста на утро. Дресс-код: чёрный верх, фартук выдаём. Напитки и обеды бесплатно.",
    requireMedBook: true,
    requireExperience: false,
    lat: 55.734,
    lng: 37.587,
    address: "ул. Льва Толстого, 16",
    city: "Москва",
    interiorPhotoUrl: photo("photo-1559925393-8be0ec4767c8"),
    employerVerified: true,
    status: "active",
    boosted: true,
    distanceKm: 1.6,
    employerRating: 4.7,
    employerShiftsDone: 24,
    employerPaysOnTime: true,
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
    payMethod: "transfer",
    tips: "individual",
    description:
      "Срочно бармен на пятницу. Опыт классической барной карты обязателен.",
    requireMedBook: true,
    requireExperience: true,
    lat: 55.76,
    lng: 37.644,
    address: "Покровка, 8",
    city: "Москва",
    interiorPhotoUrl: photo("photo-1572116469696-31de0f17cc34"),
    employerVerified: true,
    status: "active",
    distanceKm: 3.1,
    employerRating: 4.6,
    employerShiftsDone: 12,
    employerPaysOnTime: true,
  },
  {
    id: "vac3",
    employerId: "emp3",
    companyName: "Ресторан «Грядка»",
    companyPhotoUrl: photo("photo-1517248135467-4c7edcad34c4"),
    role: "waiter",
    date: new Date().toISOString().slice(0, 10),
    startTime: 11 * 60,
    endTime: 23 * 60,
    rate: 300,
    rateType: "perHour",
    payMethod: "cash",
    description:
      "Официант на банкет. Работа с кассой, знание винной карты — плюс. Униформу даём.",
    requireMedBook: true,
    requireExperience: false,
    lat: 55.757,
    lng: 37.623,
    address: "Никольская, 10",
    city: "Москва",
    interiorPhotoUrl: photo("photo-1424847651672-bf20a4b0982b"),
    employerVerified: false,
    status: "active",
    distanceKm: 2.2,
    employerRating: 0,
    employerShiftsDone: 1,
    employerPaysOnTime: false,
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
    availableToday: true,
    shiftsTotal: 12,
    shiftsAttended: 12,
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
    shiftsTotal: 4,
    shiftsAttended: 3,
  },
];

const matches: MatchModel[] = [];
const messagesByMatch: Record<string, Message[]> = {};
const entitlements: Entitlements = {
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
  filters?: FeedFilters,
): Promise<Vacancy[] | Seeker[]> {
  if (role !== "seeker") {
    let cands = [...SEEKERS];
    if (filters?.role)
      cands = cands.filter((s) => (s.roles as string[]).includes(filters.role!));
    if (filters?.district) {
      const d = filters.district.trim().toLowerCase();
      cands = cands.filter((s) => (s.district || "").trim().toLowerCase() === d);
    }
    if (filters?.available_today) cands = cands.filter((s) => s.availableToday);
    if (filters?.reliable_only)
      cands = cands.filter((s) => (s.shiftsTotal ?? 0) === (s.shiftsAttended ?? 0));
    return Promise.resolve(cands);
  }
  let list = [...VACANCIES];
  if (filters?.role) list = list.filter((v) => v.role === filters.role);
  if (filters?.city) {
    const c = filters.city.trim().toLowerCase();
    list = list.filter((v) => (v.city || "").trim().toLowerCase() === c);
  }
  if (filters?.min_rate != null) list = list.filter((v) => v.rate >= filters.min_rate!);
  if (filters?.rate_type) list = list.filter((v) => v.rateType === filters.rate_type);
  if (filters?.no_med_book) list = list.filter((v) => !v.requireMedBook);
  if (filters?.no_experience) list = list.filter((v) => !v.requireExperience);
  if (filters?.verified_only) list = list.filter((v) => v.employerVerified);
  if (filters?.tips_only) list = list.filter((v) => v.tips && v.tips !== "none");
  if (filters?.date_from) list = list.filter((v) => v.date >= filters.date_from!);
  if (filters?.date_to) list = list.filter((v) => v.date <= filters.date_to!);
  if (filters?.radius_km != null && filters.lat != null)
    list = list.filter((v) => (v.distanceKm ?? 0) <= filters.radius_km!);
  if (filters?.sort === "rate") list.sort((a, b) => b.rate - a.rate);
  else if (filters?.sort === "date") list.sort((a, b) => a.date.localeCompare(b.date));
  else if (filters?.sort === "distance")
    list.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
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

export function fetchMyVacancies(): Promise<Vacancy[]> {
  return Promise.resolve([...VACANCIES]);
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
  m.checkinCode = "123456"; // демо-код прихода
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

export function markAttendance(matchId: string, attended: boolean): Promise<void> {
  const m = matches.find((x) => x.id === matchId);
  if (m) {
    if (attended) {
      m.employerCheckedIn = true;
      if (m.seekerCheckedIn) {
        m.status = "completed";
        m.checkedIn = true;
      }
    } else if (m.seekerCheckedIn) {
      m.disputed = true; // конфликт
    }
  }
  return Promise.resolve();
}
export function checkinShift(
  matchId: string,
  body: { code?: string; lat?: number; lng?: number },
): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  const byCode = !!body.code && body.code.trim() === (m.checkinCode ?? "123456");
  const byGeo = body.lat != null && body.lng != null; // в демо гео всегда «на месте»
  if (!byCode && !byGeo) return Promise.reject(new Error("bad checkin"));
  m.seekerCheckedIn = true;
  if (m.employerCheckedIn) {
    m.status = "completed";
    m.checkedIn = true;
  }
  return Promise.resolve(m);
}
export function disputeShift(matchId: string, _note: string): Promise<MatchModel> {
  void _note;
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  m.disputed = true;
  return Promise.resolve(m);
}

export function fetchEntitlements(): Promise<Entitlements> {
  return Promise.resolve({ ...entitlements });
}

const invited = 2;

const meProfile: Me = {
  id: "me",
  role: "seeker",
  name: "Алексей",
  rating: 4.8,
  tgUsername: "alexey",
  streak: 3,
  city: "Москва",
  incomingLikes: 4,
  earnedRub: 18400,
  shiftsDone: 7,
  availableToday: false,
  profileCompletion: 70,
  birthDate: "2000-04-12",
  roles: ["waiter", "barista"],
  selfEmployed: true,
  inn: "771298765432",
  about: "",
  photoUrl: "",
};

export function createVacancy(input: VacancyInput): Promise<Vacancy> {
  const v: Vacancy = {
    id: uid(),
    employerId: "me",
    companyName: "Моё заведение",
    companyPhotoUrl: "",
    role: input.role as Vacancy["role"],
    date: input.date,
    startTime: input.start_time,
    endTime: input.end_time,
    rate: input.rate,
    rateType: input.rate_type as Vacancy["rateType"],
    payMethod: (input.pay_method as Vacancy["payMethod"]) ?? "cash",
    tips: (input.tips as Vacancy["tips"]) ?? "none",
    description: input.description ?? "",
    requireMedBook: input.require_med_book ?? false,
    requireExperience: false,
    lat: input.lat ?? 0,
    lng: input.lng ?? 0,
    address: input.address ?? "",
    city: input.city ?? "",
    interiorPhotoUrl: "",
    employerVerified: false,
    status: "active",
  };
  VACANCIES.unshift(v);
  return Promise.resolve(v);
}

export function fetchMe(): Promise<Me> {
  return Promise.resolve({ ...meProfile });
}

export function setAvailability(available: boolean): Promise<boolean> {
  meProfile.availableToday = available;
  return Promise.resolve(available);
}

export function updateMe(patch: {
  name?: string;
  birth_date?: string;
  city?: string;
}): Promise<Me> {
  // Серверный 18+ имитируем и в mock, чтобы UI-поток совпадал с backend.
  if (patch.birth_date) {
    const y = new Date(patch.birth_date).getFullYear();
    if (new Date().getFullYear() - y < 18) {
      return Promise.reject(new Error("Сервис доступен только с 18 лет"));
    }
  }
  if (patch.name) meProfile.name = patch.name;
  if (patch.city) meProfile.city = patch.city;
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

export function reportTarget(): Promise<void> {
  return Promise.resolve();
}

const adminReports = [
  {
    id: "rep1",
    targetType: "vacancy",
    targetId: "vac3",
    targetInfo: "waiter · Ресторан «Грядка» · 300₽",
    reason: "fake",
    text: "Похоже на обман — просят предоплату",
    status: "open",
    createdAt: new Date().toISOString(),
  },
  {
    id: "rep2",
    targetType: "match",
    targetId: "m12",
    targetInfo: "переписка по мэтчу",
    reason: "abuse",
    text: "Грубит в чате",
    status: "reviewed",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const adminBlocked = [
  { type: "vacancy", id: "vacX", info: "barista · 200₽ (снята)" },
];

export function fetchAdminOverview() {
  return Promise.resolve({
    users: 128,
    activeVacancies: 34,
    likes: 940,
    matches: 410,
    openReports: adminReports.filter((r) => r.status === "open").length,
    activeSubscriptions: 12,
  });
}
export function fetchAdminReports(status = "open") {
  const list =
    status === "all" ? adminReports : adminReports.filter((r) => r.status === "open");
  return Promise.resolve([...list]);
}
export function fetchRevenue() {
  return Promise.resolve({
    activePro: 8,
    activeBusiness: 3,
    estMonthlyRub: 8 * 1990 + 3 * 4990,
    totalPaidRub: 47230,
    totalStars: 5400,
  });
}
export function resolveReport(id: string): Promise<void> {
  const r = adminReports.find((x) => x.id === id);
  if (r) r.status = "reviewed";
  return Promise.resolve();
}
export function warnReport(id: string): Promise<number> {
  const r = adminReports.find((x) => x.id === id);
  if (r) r.status = "reviewed";
  return Promise.resolve(1);
}
export function fetchInvites(): Promise<Vacancy[]> {
  // Демо: показываем пару смен как «зовущих».
  return Promise.resolve(VACANCIES.slice(0, 2));
}
export function adminSearchUsers(q: string) {
  const all = [
    {
      id: "emp1", role: "employer" as const, name: "Кофейня «Дрова»",
      username: "drova", blocked: false, warnings: 0, plan: "pro",
      boostBalance: 4, superlikeBalance: 0, balanceRub: 1500,
    },
    {
      id: "seek1", role: "seeker" as const, name: "Мария", username: null,
      blocked: false, warnings: 1, plan: "free", boostBalance: 0,
      superlikeBalance: 2, balanceRub: 0,
    },
  ];
  const ql = q.trim().toLowerCase();
  return Promise.resolve(
    ql ? all.filter((u) => u.name.toLowerCase().includes(ql)) : all,
  );
}
export function adminGrant(_ownerId: string, _sku: string): Promise<void> {
  void _ownerId;
  void _sku;
  return Promise.resolve();
}
export function fetchCommissions() {
  return Promise.resolve([
    { employerId: "emp1", company: "Кофейня «Дрова»", shifts: 7, amountRub: 1960 },
    { employerId: "emp2", company: "Бар «Полночь»", shifts: 3, amountRub: 1350 },
  ]);
}
export function settleCommission(_employerId: string): Promise<void> {
  void _employerId;
  return Promise.resolve();
}
export function fetchSources() {
  return Promise.resolve([
    { source: "vk", seekers: 42, employers: 1 },
    { source: "avito", seekers: 17, employers: 0 },
    { source: "rayon_tg", seekers: 9, employers: 3 },
  ]);
}
export function fetchMyCommission() {
  return Promise.resolve({
    pendingRub: 560, pendingShifts: 2, overdue: false, dueDays: 7, pct: 10,
    balanceRub: 1500, topupAvailable: true,
  });
}
export function adminRelink(
  _ownerId: string,
  _newTgId: number,
): Promise<void> {
  void _ownerId;
  void _newTgId;
  return Promise.resolve();
}
export function adminCreditWallet(
  _ownerId: string,
  _amountRub: number,
): Promise<void> {
  void _ownerId;
  void _amountRub;
  return Promise.resolve();
}
export function resolveMatch(_matchId: string, _outcome: string): Promise<void> {
  void _matchId;
  void _outcome;
  return Promise.resolve();
}
export function fetchAdminSubscriptions() {
  return Promise.resolve([
    { ownerId: "emp1", company: "Кофейня «Дрова»", plan: "pro", renewsAt: "2026-07-20" },
    { ownerId: "emp2", company: "Бар «Полночь»", plan: "business", renewsAt: "2026-07-12" },
  ]);
}
export function fetchBlocked() {
  return Promise.resolve([...adminBlocked]);
}
export function cancelSubscription(_ownerId: string): Promise<void> {
  return Promise.resolve();
}

export function boostVacancy(vacancyId: string): Promise<void> {
  const vac = VACANCIES.find((v) => v.id === vacancyId);
  if (vac) vac.boosted = true;
  return Promise.resolve();
}

export function urgentPing(_vacancyId: string): Promise<number> {
  return Promise.resolve(7); // демо: «пингнули 7 доступных рядом»
}

export function fetchMyWorkers() {
  return Promise.resolve([
    { id: "s2", name: "Мария", rating: 4.9, availableToday: true, shiftsTotal: 12, shiftsAttended: 12 },
    { id: "s3", name: "Иван", rating: 4.4, availableToday: false, shiftsTotal: 4, shiftsAttended: 3 },
  ]);
}

export function inviteWorker(_userId: string): Promise<void> {
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

const favorites = new Set<string>();

export function listFavoriteIds(): Promise<string[]> {
  return Promise.resolve([...favorites]);
}
export function listFavorites(): Promise<Vacancy[]> {
  return Promise.resolve(VACANCIES.filter((v) => favorites.has(v.id)));
}
export function addFavorite(id: string): Promise<void> {
  favorites.add(id);
  return Promise.resolve();
}
export function removeFavorite(id: string): Promise<void> {
  favorites.delete(id);
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
