// Разбор рекламной метки из ссылки t.me/<bot>?startapp=<param>.
// Для пришедших по кампании (метка src_…) показываем цепляющий экран под
// обещание ролика вместо общего онбординга — конверсия «зритель → пользователь».

import { startParam } from "@/telegram/sdk";

export interface Campaign {
  code: string; // канал/кампания, напр. "shorts_waiter"
  title: string; // крупный хук под обещание видео
  sub: string; // подзаголовок
}

// Пресеты под частые ролики. Ключ — то, что после src_ в ссылке.
// Неизвестная метка → общий денежный хук (тоже работает).
const PRESETS: Record<string, { title: string; sub: string }> = {
  shorts: {
    title: "Ты пришёл с видео 👀",
    sub: "Рядом смены на тысячи рублей прямо сейчас. Свайпни — и забери свою.",
  },
  waiter: {
    title: "Официант? Смена ждёт",
    sub: "Кафе и рестораны рядом ищут людей на завтра. Оплата в день смены.",
  },
  barista: {
    title: "Бариста? Смена рядом",
    sub: "Кофейни у дома ищут смену на утро. Оплата в день смены, без опыта — тоже берут.",
  },
  student: {
    title: "Нужны деньги к выходным?",
    sub: "Подработка в общепите на вечер или выходной. Свайпнул — вышел — получил.",
  },
};

/** Текущая кампания из метки запуска (или null, если пришли не по ссылке). */
export function currentCampaign(): Campaign | null {
  const raw = startParam();
  if (!raw.startsWith("src_")) return null;
  const code = raw.slice(4).toLowerCase().slice(0, 40);
  if (!code) return null;
  // Берём первый известный ключ, встретившийся в метке (src_shorts_waiter → shorts).
  const key = Object.keys(PRESETS).find((k) => code.includes(k));
  const preset = key
    ? PRESETS[key]
    : {
        title: "Подработка рядом — деньги сегодня",
        sub: "Смены в кафе и ресторанах у дома. Оплата в день смены, без посредников.",
      };
  return { code, title: preset.title, sub: preset.sub };
}
