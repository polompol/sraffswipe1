// In-memory mock — приложение открывается в Telegram без backend.
// Структура совпадает с backend/app/schemas.py.

import type {
  AppRole,
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
    headcount: 4,
    slotsLeft: 2,
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
    age: 27,
    city: "Москва",
    district: "Басманный",
    lat: 55.765,
    lng: 37.67,
    roles: ["waiter", "hostess"],
    medBook: "yes",
    selfEmployed: true,
    inn: "771298765432",
    experienceTags: ["medBook", "english", "experienced", "selfEmployed"],
    rating: 4.9,
    photoUrls: [photo("photo-1494790108377-be9c29b29330")],
    about: "Опыт в fine dining, английский B2.",
    availableToday: true,
    shiftsTotal: 12,
    shiftsAttended: 12,
    employersTotal: 5,
  },
  {
    id: "s3",
    name: "Иван",
    age: 24,
    city: "Москва",
    district: "Тверской",
    lat: 55.768,
    lng: 37.601,
    roles: ["cook", "dishwasher"],
    medBook: "expired",
    selfEmployed: false,
    experienceTags: ["experienced"],
    rating: 4.4,
    photoUrls: [photo("photo-1500648767791-00dcc994a43e")],
    about: "Холодный и горячий цех, опыт 2 года.",
    shiftsTotal: 4,
    shiftsAttended: 3,
    employersTotal: 2,
  },
];

// Одна готовая смена в демо-режиме. Без неё «Мэтчи», «Смены» и чат были
// пустыми до первого свайпа — то есть при показе приложения заведению
// половина продукта просто не показывалась.
const DEMO_MATCH_ID = "demo-match";
const matches: MatchModel[] = [
  {
    id: DEMO_MATCH_ID,
    employerId: "emp1",
    vacancyId: "vac1",
    status: "confirmed",
    confirmedBySeeker: true,
    confirmedByEmployer: true,
    companyName: "Кофейня «Дрова»",
    companyPhotoUrl: photo("photo-1554118811-1e0d58224f24"),
    seekerName: "Мария",
    role: "barista",
    checkinCode: "482915",
    seekerCheckedIn: false,
    employerCheckedIn: false,
    shiftPay: 2800,
    shiftDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    shiftStart: 8 * 60,
    shiftEnd: 16 * 60,
  },
  // Вчерашняя закрытая смена: без неё в демо-режиме не увидеть ни акта, ни
  // кнопки «Мне не заплатили» — то есть половины экрана «Мои смены».
  {
    id: "demo-match-done",
    employerId: "emp2",
    vacancyId: "vac2",
    status: "completed",
    confirmedBySeeker: true,
    confirmedByEmployer: true,
    companyName: "Бар «Полночь»",
    companyPhotoUrl: photo("photo-1514933651103-005eec06c04b"),
    seekerName: "Мария",
    role: "bartender",
    checkinCode: null,
    seekerCheckedIn: true,
    employerCheckedIn: true,
    checkedIn: true,
    shiftPay: 4500,
    shiftDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    shiftStart: 20 * 60,
    shiftEnd: 4 * 60,
  },
];
/** Время демо-сообщения: «столько-то минут назад» от запуска.
 *
 *  Демо-данные должны выглядеть как живая переписка, а не как всё написанное
 *  в одну секунду: время в чате теперь видно.
 */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

const messagesByMatch: Record<string, Message[]> = {
  [DEMO_MATCH_ID]: [
    {
      id: "demo-m1",
      senderId: "system",
      text: "Взаимно! Смена: Кофейня «Дрова». Договоритесь о деталях.",
      isSystem: true,
      createdAt: minutesAgo(173),
    },
    {
      id: "demo-m2",
      senderId: "emp1",
      text: "Здравствуйте! Готовы выйти завтра к 8:00?",
      isSystem: false,
      createdAt: minutesAgo(166),
    },
    {
      id: "demo-m3",
      senderId: "me",
      text: "Да, буду. Что взять с собой?",
      isSystem: false,
      createdAt: minutesAgo(159),
    },
    {
      id: "demo-m4",
      senderId: "system",
      text:
        "Смена подтверждена ✓ Дальше ничего нажимать не нужно: через 12 часов " +
        "после окончания она закроется сама. Если смена не состоится — нажмите " +
        "«Смена не состоялась», и комиссии не будет.",
      isSystem: true,
      createdAt: minutesAgo(152),
    },
  ],
};
// Верификация компании по ИНН в моке всегда «не подтверждено»: бейдж
// «Проверен» ставит DaData на живом сервере.
const employerVerified = false;

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
  if (!vac) {
    // Заведение позвало кандидата. В демо-режиме встречный лайк считаем
    // состоявшимся: иначе экран «Взаимно!» со стороны заведения нельзя
    // увидеть вообще, а это половина сквозного пути продукта.
    const seeker = SEEKERS.find((x) => x.id === targetId);
    if (!seeker) return Promise.resolve({ matched: false });
    // Смену подбираем по должности человека — как это делает сервер. Иначе в
    // демо получалось «Мария выйдет на смену · Бариста», хотя на её карточке
    // написано «Официант».
    const mine =
      VACANCIES.find((v) => seeker.roles.includes(v.role)) ?? VACANCIES[0];
    const m: MatchModel = {
      id: uid(),
      employerId: mine.employerId,
      vacancyId: mine.id,
      status: "matched",
      confirmedBySeeker: false,
      confirmedByEmployer: false,
      companyName: mine.companyName,
      companyPhotoUrl: mine.companyPhotoUrl,
      seekerName: seeker.name,
      role: mine.role,
      shiftDate: mine.date,
      shiftStart: mine.startTime,
      shiftEnd: mine.endTime,
    };
    matches.unshift(m);
    messagesByMatch[m.id] = [
      {
        id: uid(),
        senderId: "system",
        text: `Взаимно! Смена: ${mine.companyName}. Договоритесь о деталях.`,
        isSystem: true,
        createdAt: minutesAgo(145),
      },
    ];
    return Promise.resolve({
      matched: true,
      matchId: m.id,
      vacancyId: mine.id,
      role: mine.role,
      shiftDate: mine.date,
      shiftStart: mine.startTime,
      shiftEnd: mine.endTime,
    });
  }
  const match: MatchModel = {
    id: uid(),
    employerId: vac.employerId,
    vacancyId: vac.id,
    status: "matched",
    confirmedBySeeker: false,
    confirmedByEmployer: false,
    companyName: vac.companyName,
    companyPhotoUrl: vac.companyPhotoUrl,
    seekerName: "Мария",
    role: vac.role,
    shiftDate: vac.date,
    shiftStart: vac.startTime,
    shiftEnd: vac.endTime,
  };
  matches.unshift(match);
  messagesByMatch[match.id] = [
    {
      id: uid(),
      senderId: "system",
      text: `Взаимно! Смена: ${vac.companyName}. Договоритесь о деталях.`,
      isSystem: true,
      createdAt: minutesAgo(138),
    },
    {
      id: uid(),
      senderId: vac.employerId,
      text: "Здравствуйте! Готовы выйти на смену?",
      isSystem: false,
      createdAt: minutesAgo(131),
    },
  ];
  return Promise.resolve({
    matched: true,
    matchId: match.id,
    vacancyId: vac.id,
    role: vac.role,
    shiftDate: vac.date,
    shiftStart: vac.startTime,
    shiftEnd: vac.endTime,
  });
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
    senderId: "me",
    text,
    isSystem: false,
    createdAt: minutesAgo(124),
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
    senderId: "system",
    text: "Смена подтверждена ✅. Сформирован акт для самозанятого.",
    isSystem: true,
    createdAt: minutesAgo(117),
  });
  return Promise.resolve({ ...m });
}

/** Служебное сообщение в чат демо-мэтча. */
function sysMessage(matchId: string, text: string): void {
  (messagesByMatch[matchId] ??= []).push({
    id: uid(),
    senderId: "system",
    text,
    isSystem: true,
    createdAt: minutesAgo(110),
  });
}

/* Отмена, часы и перенос смены в демо-режиме.
 *
 * Все четыре действия раньше вызывали confirmShift: нажимаешь «Не смогу
 * выйти», получаешь тост «Смена отменена» — и тут же в переписке появляется
 * «Смена подтверждена ✅», а кнопка гаснет в «Смена подтверждена ✓». Показать
 * такое заведению нельзя. */
export function cancelShift(matchId: string, reason = ""): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  m.status = "cancelled";
  sysMessage(matchId, `Смена отменена${reason ? `. Причина: ${reason}` : ""}.`);
  return Promise.resolve({ ...m });
}

export function setActualHours(
  matchId: string,
  minutes: number,
  note = "",
): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  const hours = (minutes / 60).toFixed(1);
  sysMessage(
    matchId,
    `Заведение указало фактическую длительность: ${hours} ч.` +
      (note ? ` Комментарий: ${note}` : ""),
  );
  return Promise.resolve({ ...m });
}

export function proposeReschedule(
  matchId: string,
  date: string,
): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  sysMessage(matchId, `Заведение предлагает перенести смену на ${date}.`);
  return Promise.resolve({ ...m });
}

export function answerReschedule(
  matchId: string,
  accept: boolean,
): Promise<MatchModel> {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return Promise.reject(new Error("not found"));
  sysMessage(
    matchId,
    accept ? "Работник согласился на перенос." : "Работник отказался от переноса.",
  );
  return Promise.resolve({ ...m });
}

/** Заменить мэтч в списке НОВЫМ объектом.
 *
 *  Демо-данные раньше правились на месте: `m.status = ...`. TanStack Query
 *  сравнивает пришедший ответ со своим кэшем вглубь, а это был один и тот же
 *  объект — то есть «ничего не изменилось», и экран не перерисовывался.
 *  Заведение жало «Подтвердить выход», карточка не менялась, и было непонятно,
 *  сработало или нет. На живом сервере такого нет: там каждый ответ новый.
 */
function patchMatch(
  matchId: string,
  change: (m: MatchModel) => void,
): MatchModel | null {
  const i = matches.findIndex((x) => x.id === matchId);
  if (i < 0) return null;
  const next = { ...matches[i] };
  change(next);
  matches[i] = next;
  return next;
}

export function markNotHeld(matchId: string, reason = ""): Promise<MatchModel> {
  const m = patchMatch(matchId, (x) => { x.status = "expired"; });
  if (!m) return Promise.reject(new Error("not found"));
  sysMessage(
    matchId,
    `Смена отмечена как несостоявшаяся${reason ? `. Причина: ${reason}` : ""}. ` +
      "Комиссия не начислена.",
  );
  return Promise.resolve({ ...m });
}

export function markAttendance(matchId: string, attended: boolean): Promise<void> {
  patchMatch(matchId, (m) => {
    if (attended) {
      m.employerCheckedIn = true;
      if (m.seekerCheckedIn) {
        m.status = "completed";
        m.checkedIn = true;
      }
      // Молчание = смена состоялась, а явное подтверждение её закрывает:
      // код прихода после этого не нужен и с карточки уходит.
      m.checkinCode = null;
    } else if (m.seekerCheckedIn) {
      m.disputed = true; // конфликт
    }
  });
  return Promise.resolve();
}
export function checkinShift(
  matchId: string,
  body: { code: string },
): Promise<MatchModel> {
  const cur = matches.find((x) => x.id === matchId);
  if (!cur) return Promise.reject(new Error("not found"));
  const byCode = !!body.code && body.code.trim() === (cur.checkinCode ?? "123456");
  if (!byCode) return Promise.reject(new Error("bad checkin"));
  const m = patchMatch(matchId, (x) => {
    x.seekerCheckedIn = true;
    if (x.employerCheckedIn) {
      x.status = "completed";
      x.checkedIn = true;
    }
  });
  return Promise.resolve(m as MatchModel);
}
export function disputeShift(matchId: string, _note: string): Promise<MatchModel> {
  void _note;
  const m = patchMatch(matchId, (x) => { x.disputed = true; });
  if (!m) return Promise.reject(new Error("not found"));
  return Promise.resolve(m);
}

const invited = 2;

const meProfile: Me = {
  id: "me",
  role: "seeker",
  name: "Алексей",
  rating: 4.8,
  tgUsername: "alexey",
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

export function updateVacancy(id: string, input: VacancyInput): Promise<Vacancy> {
  const i = VACANCIES.findIndex((v) => v.id === id);
  if (i < 0) return Promise.reject(new Error("Смена не найдена"));
  const v: Vacancy = {
    ...VACANCIES[i]!,
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
    lat: input.lat ?? 0,
    lng: input.lng ?? 0,
    address: input.address ?? "",
    city: input.city ?? "",
  };
  VACANCIES[i] = v;
  return Promise.resolve(v);
}

export function deleteVacancy(id: string): Promise<void> {
  const i = VACANCIES.findIndex((v) => v.id === id);
  if (i >= 0) VACANCIES.splice(i, 1);
  return Promise.resolve();
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
  district?: string;
  roles?: string[];
  about?: string;
  experience_tags?: string[];
  photo_url?: string;
  self_employed?: boolean;
  inn?: string;
  company_name?: string;
}): Promise<Me> {
  // Серверный 18+ имитируем и в mock, чтобы UI-поток совпадал с backend.
  if (patch.birth_date) {
    const y = new Date(patch.birth_date).getFullYear();
    if (new Date().getFullYear() - y < 18) {
      return Promise.reject(new Error("Сервис доступен только с 18 лет"));
    }
  }
  // Применяем ВСЕ поля. Раньше сохранялись только имя и город: в демо можно
  // было заполнить анкету целиком, нажать «Сохранить» и вернуться к пустым
  // должностям, пустому району и той же полоске «Профиль готов на 70%».
  if (patch.name !== undefined) meProfile.name = patch.name;
  if (patch.company_name !== undefined) meProfile.name = patch.company_name;
  if (patch.birth_date !== undefined) meProfile.birthDate = patch.birth_date;
  if (patch.city !== undefined) meProfile.city = patch.city;
  if (patch.district !== undefined) meProfile.district = patch.district;
  if (patch.roles !== undefined) meProfile.roles = patch.roles;
  if (patch.about !== undefined) meProfile.about = patch.about;
  if (patch.experience_tags !== undefined) {
    meProfile.experienceTags = patch.experience_tags;
  }
  if (patch.photo_url !== undefined) meProfile.photoUrl = patch.photo_url;
  if (patch.self_employed !== undefined) {
    meProfile.selfEmployed = patch.self_employed;
  }
  if (patch.inn !== undefined) meProfile.inn = patch.inn;
  return Promise.resolve({ ...meProfile });
}

export function fetchReferral(): Promise<ReferralInfo> {
  return Promise.resolve({
    code: "ref_me",
    link: "https://t.me/staffswipe_bot?startapp=ref_me",
    invited,
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
    targetInfo: "Официант · Ресторан «Грядка» · 300 ₽",
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
  {
    id: "rep3",
    targetType: "match",
    targetId: "m13",
    targetInfo: "переписка по мэтчу",
    reason: "other",
    text: "Спор по смене (работник): Не заплатили за смену",
    status: "open",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    dispute: {
      worker: "Мария",
      venue: "Кофейня «Дрова»",
      shiftWhen: "Бариста ·\u00a015 августа, 08:00–16:00",
      checkedInByCode: true,
      venueMarkedAttended: false,
      notHeldBy: "",
      payRub: 2800,
      commission: "к оплате",
      status: "completed",
    },
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
    completedShifts: 121,
  });
}
export function fetchAdminReports(status = "open") {
  const list =
    status === "all" ? adminReports : adminReports.filter((r) => r.status === "open");
  return Promise.resolve([...list]);
}
/** Демо-переписка по спору — чтобы экран оператора было на чём смотреть. */
export function fetchDisputeChat(_matchId: string) {
  return Promise.resolve([
    {
      id: "d1", who: "Система", side: "system" as const,
      text: "Смена подтверждена ✓", at: "16.08 12:04",
    },
    {
      id: "d2", who: "Кофейня «Дрова»", side: "employer" as const,
      text: "Приходите к десяти, спросите Олю", at: "16.08 18:20",
    },
    {
      id: "d3", who: "Мария", side: "seeker" as const,
      text: "Поняла, буду", at: "16.08 18:22",
    },
    {
      id: "d4", who: "Мария", side: "seeker" as const,
      text: "Я на месте, но здесь закрыто и никто не отвечает",
      at: "17.08 09:58",
    },
  ]);
}

export function fetchJobsHealth() {
  return Promise.resolve([
    { id: "reminders", title: "Напоминания о сменах", lastRun: "2026-08-29", daysAgo: 0, stale: false },
    { id: "aftershift", title: "Вопрос про вчерашние смены", lastRun: "2026-08-29", daysAgo: 0, stale: false },
    { id: "settle", title: "Закрытие смен и комиссия", lastRun: "2026-08-29", daysAgo: 0, stale: false },
    { id: "unfilled", title: "Смены без людей", lastRun: "2026-08-28", daysAgo: 1, stale: false },
    { id: "reconcile", title: "Сверка платежей", lastRun: "2026-08-29", daysAgo: 0, stale: false },
  ]);
}

export function fetchRevenue() {
  return Promise.resolve({
    commissionAccruedRub: 12400,
    commissionPaidRub: 9100,
    commissionPendingRub: 3300,
    commissionWrittenOffRub: 0,
    shiftsBilled: 31,
    topupsRub: 18000,
    topupsCardRub: 12000,
    topupsManualRub: 6000,
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
      username: "drova", blocked: false, warnings: 0, balanceRub: 1500,
    },
    {
      id: "seek1", role: "seeker" as const, name: "Мария", username: null,
      blocked: false, warnings: 1, balanceRub: 0,
    },
  ];
  const ql = q.trim().toLowerCase();
  return Promise.resolve(
    ql ? all.filter((u) => u.name.toLowerCase().includes(ql)) : all,
  );
}
export function fetchRepeatPairs() {
  return Promise.resolve([
    { employer: "Кофейня «Дрова»", worker: "Мария", shifts: 4 },
    { employer: "Бар «Полночь»", worker: "Алексей", shifts: 2 },
  ]);
}

export function settleShifts(): Promise<number> {
  return Promise.resolve(1);
}

export function sendShiftReminders(): Promise<number> {
  return Promise.resolve(3);
}

export function askAfterShift(): Promise<number> {
  return Promise.resolve(2);
}

export function sendUnfilledAlerts(): Promise<number> {
  return Promise.resolve(1);
}

export function reconcilePayments(): Promise<number> {
  return Promise.resolve(0);
}

export function fetchCancelStats() {
  return Promise.resolve([
    {
      ownerId: "seek1", name: "Мария", role: "seeker" as const,
      cancels: 4, lateCancels: 3, noShows: 1, notHeld: 2,
    },
    {
      ownerId: "emp1", name: "Кофейня «Дрова»", role: "employer" as const,
      cancels: 2, lateCancels: 0, noShows: 0,
    },
  ]);
}

export function writeOffCommission(): Promise<number> {
  return Promise.resolve(1960);
}

export function adminRefundWallet(): Promise<number> {
  return Promise.resolve(500);
}

export function fetchPayments() {
  return Promise.resolve([
    {
      id: "p1", ownerId: "emp1", sku: "wallet_topup", provider: "yookassa",
      amount: 5000, currency: "RUB", status: "paid",
      createdAt: "2026-08-06T10:15:00Z",
    },
  ]);
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
    docsAvailable: true,
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
export function adminLogoutAll(_ownerId: string): Promise<void> {
  void _ownerId;
  return Promise.resolve();
}
export function adminEraseAccount(
  _ownerId: string,
): Promise<Record<string, number>> {
  void _ownerId;
  return Promise.resolve({ "свайпы": 0, "избранное": 0, "сообщения": 0 });
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
export function fetchBlocked() {
  return Promise.resolve([...adminBlocked]);
}
export function urgentPing(_vacancyId: string): Promise<number> {
  return Promise.resolve(7); // демо: «позвали 7 свободных рядом»
}

export function fetchMyWorkers() {
  return Promise.resolve([
    { id: "s2", name: "Мария", rating: 4.9, availableToday: true, shiftsTotal: 12, shiftsAttended: 12, employersTotal: 5 },
    { id: "s3", name: "Иван", rating: 4.4, availableToday: false, shiftsTotal: 4, shiftsAttended: 3, employersTotal: 2 },
  ]);
}

export function inviteWorker(_userId: string): Promise<boolean> {
  return Promise.resolve(true);
}

export function fetchApplicants() {
  const v = VACANCIES[0];
  return Promise.resolve(
    SEEKERS.map((s) => ({
      id: s.id,
      name: s.name,
      age: s.age ?? null,
      district: s.district,
      roles: s.roles as string[],
      medBook: s.medBook as string,
      rating: s.rating,
      photoUrls: s.photoUrls ?? [],
      about: s.about ?? "",
      availableToday: !!s.availableToday,
      shiftsTotal: s.shiftsTotal ?? 0,
      shiftsAttended: s.shiftsAttended ?? 0,
      employersTotal: s.employersTotal ?? 0,
      vacancyId: v.id,
      vacancyRole: v.role as string,
      vacancyDate: v.date,
      vacancyStart: v.startTime,
      vacancyEnd: v.endTime,
    })),
  );
}

export function verifyEmployer(inn: string): Promise<VerifyResult> {
  const ok = /^\d{10,12}$/.test(inn);
  return Promise.resolve({
    found: ok,
    verified: ok && employerVerified,
    name: ok ? "ООО «Кофейня Дрова»" : "",
    ogrn: ok ? "1167746000000" : "",
    address: ok ? "Москва, ул. Льва Толстого, 16" : "",
    hint: ok
      ? employerVerified
        ? ""
        : "Данные подтянуты. Бейдж «Проверен» появится после сверки."
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

export function adminVerifyEmployer(
  _employerId: string,
  verified: boolean,
): Promise<boolean> {
  return Promise.resolve(verified);
}

export function fetchCities(): Promise<{ name: string; tz: string }[]> {
  return Promise.resolve([
    { name: "Москва", tz: "Europe/Moscow" },
    { name: "Санкт-Петербург", tz: "Europe/Moscow" },
    { name: "Казань", tz: "Europe/Moscow" },
    { name: "Екатеринбург", tz: "Asia/Yekaterinburg" },
    { name: "Новосибирск", tz: "Asia/Novosibirsk" },
    { name: "Владивосток", tz: "Asia/Vladivostok" },
  ]);
}
