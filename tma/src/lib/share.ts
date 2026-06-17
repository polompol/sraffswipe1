import type { Vacancy } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { share } from "@/telegram/sdk";

const BOT = import.meta.env.VITE_BOT_USERNAME ?? "staffswipe_bot";

/** Поделиться сменой через Telegram (виральный рост через deep-link). */
export function shareVacancy(v: Vacancy): void {
  const link = `https://t.me/${BOT}?startapp=vac_${v.id}`;
  const text = `Смена «${STAFF_ROLE_LABELS[v.role]}» в «${v.companyName}» — ${v.rate} ₽. Зацени в StaffSwipe!`;
  share(link, text);
}
