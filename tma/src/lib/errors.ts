/**
 * Понятный текст ошибки сервера — одно место на всё приложение.
 *
 * Раньше каждый экран доставал `response.data.detail` и показывал как есть.
 * Для наших собственных отказов это строка по-русски, и всё было хорошо. Но
 * при ошибке проверки полей (422) FastAPI кладёт в `detail` СПИСОК объектов
 * вида `{loc, msg, type}`. Такой «текст» уходил в setError и дальше в разметку —
 * React не умеет рисовать объекты и роняет весь экран белым полем. Человек
 * вместо «проверьте дату рождения» терял страницу целиком.
 */

// Поля, которые человек реально заполняет руками, — по-русски.
const FIELD_RU: Record<string, string> = {
  name: "имя",
  birth_date: "дата рождения",
  city: "город",
  district: "район",
  roles: "должности",
  experience_tags: "отметки об опыте",
  inn: "ИНН",
  about: "о себе",
  photo_url: "фото",
  company_name: "название заведения",
  role: "должность",
  date: "дата смены",
  start_time: "начало смены",
  end_time: "конец смены",
  rate: "ставка",
  headcount: "сколько людей",
  address: "адрес",
  description: "описание",
  text: "текст",
  amount_rub: "сумма",
  minutes: "длительность",
};

interface FieldError {
  loc?: (string | number)[];
  msg?: string;
}

function fromFieldErrors(items: FieldError[]): string | null {
  const first = items[0];
  if (!first) return null;
  // loc = ["body", "roles", 0] — берём имя поля, служебное "body" пропускаем.
  const field = (first.loc ?? []).find(
    (x) => typeof x === "string" && x !== "body" && x !== "query",
  );
  const human = typeof field === "string" ? FIELD_RU[field] : undefined;
  // Свои сообщения из схем написаны по-русски — их и показываем.
  const msg = (first.msg ?? "").replace(/^Value error,\s*/, "");
  const russian = /[А-Яа-яЁё]/.test(msg) ? msg : "";
  if (human && russian) return `${russian} (поле «${human}»)`;
  if (human) return `Проверьте поле «${human}» — значение не подходит.`;
  return russian || null;
}

/** Текст ошибки для показа человеку. Никогда не возвращает объект. */
export function apiError(e: unknown, fallback = "Что-то пошло не так"): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const text = fromFieldErrors(detail as FieldError[]);
    if (text) return text;
  }
  // Некоторые отказы приходят объектом {code, message} — например конфликт смен.
  if (detail && typeof detail === "object") {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  const status = (e as { response?: { status?: number } })?.response?.status;
  if (status === 429) return "Слишком часто — подождите немного и повторите.";
  if (status && status >= 500) return "Сервер не отвечает. Попробуйте ещё раз.";
  if (!status) return "Нет связи с сервером. Проверьте интернет.";
  return fallback;
}
