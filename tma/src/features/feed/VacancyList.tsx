import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SwipeDirection, Vacancy } from "@/types/domain";
import { PAY_METHOD_SHORT, STAFF_ROLE_LABELS } from "@/types/domain";
import { fmtTime, isUrgentShift, plural, rateLabel, shiftDayLabel } from "@/lib/format";
import { shareVacancy } from "@/lib/share";
import { addFavorite, listFavoriteIds, removeFavorite } from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { ReportSheet } from "@/components/ReportSheet";
import { IconFire, IconShare, IconWarning, IconBookmark } from "@/components/Icons";
import { haptic } from "@/telegram/sdk";

/** Миниатюра 64×64 с фолбэком: бренд-градиент+инициал, поверх — фото (если
 *  загрузилось). Битая ссылка не оставляет пустой квадрат. */
function Thumb({ src, initial }: { src?: string; initial: string }) {
  const [ok, setOk] = useState(!!src);
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 14,
        flex: "none",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,.9)",
        fontWeight: 800,
        fontSize: 24,
        background: "var(--grad-brand)",
      }}
    >
      {!ok && initial}
      {src && (
        <img
          src={src}
          alt=""
          onError={() => setOk(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: ok ? 1 : 0,
            transition: "opacity .3s ease",
          }}
        />
      )}
    </div>
  );
}

/** Список-вид ленты — альтернатива свайпу для тех, кто любит просматривать. */
export function VacancyList({
  items,
  onAct,
  hideSkip = false,
}: {
  items: Vacancy[];
  // Возвращает true, если по отклику стоит показать тост «Отклик отправлен»
  // (успех и НЕ мэтч — при мэтче всплывает оверлей, тост не нужен). При ошибке
  // или мэтче — ничего/false, чтобы не показать ложный успех до ответа сервера.
  onAct: (v: Vacancy, dir: SwipeDirection) => void | boolean | Promise<void | boolean>;
  hideSkip?: boolean; // в избранном «Пропустить» бессмысленна — прячем
}) {
  const [reportId, setReportId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: favIds } = useQuery({ queryKey: ["fav-ids"], queryFn: listFavoriteIds });
  const saved = new Set(favIds ?? []);

  async function toggleFav(id: string) {
    haptic("light");
    const isSaved = saved.has(id);
    try {
      if (isSaved) {
        await removeFavorite(id);
        toast("Убрано из избранного", "success");
      } else {
        await addFavorite(id);
        toast("Сохранено в избранное", "success");
      }
      qc.invalidateQueries({ queryKey: ["fav-ids"] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
    } catch {
      toast("Не удалось сохранить", "error");
    }
  }

  return (
    <div className="stagger" style={{ display: "grid", gap: 12 }}>
      {items.map((v) => (
        <div key={v.id} className="card fade-up">
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <Thumb src={v.interiorPhotoUrl} initial={(v.companyName || "С").charAt(0)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Заголовку — вся ширина строки. Иконки закладки и «поделиться»
                  перенесены вниз: в одной строке с ними название сжималось до
                  54px и рвалось по слогам на четыре строки. */}
              <div className="row" style={{ gap: 6 }}>
                <b
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {v.companyName}
                </b>
                {isUrgentShift(v.date) && (
                  <span className="tag pulse" style={{ flex: "none", color: "var(--gold)", borderColor: "var(--gold)" }}><IconFire size={12} /> Сегодня</span>
                )}
              </div>
              <div className="muted" style={{ marginTop: 2 }}>
                {STAFF_ROLE_LABELS[v.role]} · {rateLabel(v.rate, v.rateType)}
                {(v.headcount ?? 1) > 1 &&
                  ` · набрано ${(v.headcount ?? 1) - (v.slotsLeft ?? 0)} из ${v.headcount}`}
              </div>
              <div className="muted">
                {shiftDayLabel(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}
                {typeof v.distanceKm === "number" ? ` · ${v.distanceKm.toFixed(1)} км` : ""}
              </div>
            </div>
          </div>
          {/* Чипы — на всю ширину карточки, а не в узкой колонке справа от
              фото. Там на них оставалось 276px, и каждый вставал на свою
              строку: три чипа съедали три строки и карточка выглядела
              сломанной. Подписи заодно короче — теперь помещаются в одну. */}
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {v.payMethod && (
              <span className="tag" style={{ color: "var(--super-text)", borderColor: "var(--super)", fontSize: 13 }}>
                {PAY_METHOD_SHORT[v.payMethod]}
              </span>
            )}
            {!!v.employerShiftsDone && (
              <span className="tag" style={{ color: "var(--muted)", borderColor: "var(--border)", fontSize: 13 }}>
                {v.employerShiftsDone}{" "}
                {plural(v.employerShiftsDone, "смена", "смены", "смен")} закрыто
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {!hideSkip && (
              <button
                className="btn secondary"
                style={{ minHeight: 44 }}
                onClick={() => onAct(v, "dislike")}
              >
                Пропустить
              </button>
            )}
            <button
              className="btn"
              style={{ minHeight: 44 }}
              onClick={async () => {
                if (await onAct(v, "like")) toast("Отклик отправлен", "success");
              }}
            >
              Откликнуться
            </button>
          </div>
          <div className="row" style={{ marginTop: 4, gap: 4 }}>
            <button
              className="icon-btn"
              aria-label={saved.has(v.id) ? "Убрать из избранного" : "В избранное"}
              aria-pressed={saved.has(v.id)}
              style={{ color: saved.has(v.id) ? "var(--gold)" : "var(--muted)" }}
              onClick={() => toggleFav(v.id)}
            >
              <IconBookmark size={18} filled={saved.has(v.id)} />
            </button>
            <button
              className="icon-btn"
              aria-label="Поделиться сменой"
              style={{ color: "var(--muted)" }}
              onClick={() => shareVacancy(v)}
            >
              <IconShare size={18} />
            </button>
            <span className="spacer" />
            <button
              // Кнопка была ~39px высотой — ниже минимальных 44px для пальца.
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, minHeight: 44, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 5 }}
              onClick={() => setReportId(v.id)}
            >
              <IconWarning size={13} /> Пожаловаться
            </button>
          </div>
        </div>
      ))}
      {reportId && (
        <ReportSheet
          targetType="vacancy"
          targetId={reportId}
          onClose={() => setReportId(null)}
        />
      )}
    </div>
  );
}
