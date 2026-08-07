/**
 * Ссылки на юридические документы (152-ФЗ).
 *
 * По умолчанию открываются страницы, которые собираются из `docs/legal/*.md`
 * рядом с приложением (`npm run legal` перед сборкой), — отдельный хостинг не
 * нужен, и галочка «принимаю оферту» никогда не ссылается в пустоту.
 * Через env можно указать свои адреса, если документы лежат на сайте компании.
 */
export const OFFER_URL = import.meta.env.VITE_OFFER_URL || "legal/offer.html";
export const PRIVACY_URL =
  import.meta.env.VITE_PRIVACY_URL || "legal/privacy.html";
export const TERMS_URL = import.meta.env.VITE_TERMS_URL || "legal/terms.html";

export const LEGAL_LINKS = [
  { title: "Публичная оферта", href: OFFER_URL },
  { title: "Политика обработки персональных данных", href: PRIVACY_URL },
  { title: "Правила сервиса", href: TERMS_URL },
];
