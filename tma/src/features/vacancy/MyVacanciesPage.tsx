import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  deleteVacancy,
  fetchMyVacancies,
  urgentPing,
} from "@/api/endpoints";
import { fmtDate, fmtTime, plural, rateLabel } from "@/lib/format";
import { apiError } from "@/lib/errors";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { haptic, confirmAction } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { IconFire, IconCalendar, IconEdit, IconWarning } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

export function MyVacanciesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["my-vacancies"],
    queryFn: fetchMyVacancies,
  });
  async function doRemove(id: string, title: string) {
    if (!(await confirmAction(`Снять смену «${title}» с публикации?`, "Снять"))) return;
    haptic("warning");
    try {
      await deleteVacancy(id);
      toast("Смена снята", "success");
      qc.invalidateQueries({ queryKey: ["my-vacancies"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e) {
      haptic("error");
      // 409 — по смене уже откликнулись: сервер объясняет, почему нельзя.
      toast(apiError(e, "Не удалось снять смену"), "error");
    }
  }

  async function doUrgent(id: string) {
    haptic("medium");
    try {
      const n = await urgentPing(id);
      toast(n > 0 ? `Пингнули ${n} доступных рядом` : "Сейчас рядом нет доступных", "success");
    } catch {
      toast("Не удалось отправить", "error");
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 8 }}>
        <h1 className="h1" style={{ margin: 0 }}>Мои смены</h1>
        <span className="spacer" />
        <Button size="sm" block={false} onClick={() => nav("/vacancy/new")}>
          + Смена
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <button
          className="tag"
          style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
          onClick={() => nav("/applicants")}
        >
          Кто откликнулся
        </button>
        <button
          className="tag"
          style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
          onClick={() => nav("/workers")}
        >
          Мои работники
        </button>
      </div>

      {/* Раньше новое заведение видело заголовок и пустоту — непонятно,
          что делать дальше. Теперь экран сам ведёт к размещению смены. */}
      {data && data.length === 0 && (
        <EmptyState
          fill
          icon={<IconCalendar size={34} />}
          title="Смен пока нет"
          text="Разместите первую смену — она появится в ленте у работников рядом, и пойдут отклики."
          action={
            <Button block={false} onClick={() => nav("/vacancy/new")}>
              + Разместить смену
            </Button>
          }
        />
      )}

      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((v) => (
          <div key={v.id} className="card">
            <b>{STAFF_ROLE_LABELS[v.role]}</b>
            <div className="muted" style={{ marginTop: 6 }}>
              {fmtDate(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {rateLabel(v.rate, v.rateType)}
            </div>
            <div className="muted">{v.address}</div>
            {/* Главный вопрос заведения к своей смене — набрал ли я людей.
                Ответа на него на экране не было вообще: чтобы понять, закрыта
                ли смена, приходилось идти в «Кто откликнулся» и считать. */}
            {(() => {
              const need = v.headcount ?? 1;
              const left = v.slotsLeft ?? need;
              const taken = need - left;
              const full = left <= 0;
              return (
                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 700,
                    fontSize: 14,
                    color: full ? "var(--success)" : "var(--gold)",
                  }}
                >
                  {full
                    ? "Все места закрыты ✓"
                    : `Набрано ${taken} из ${need} · ищем ещё ${left} ${plural(left, "человека", "человек", "человек")}`}
                </div>
              );
            })()}
            {/* Сетка, а не ряд с переносом: кнопки разной ширины переносились
                по-своему в каждой карточке, и одинаковые смены выглядели
                по-разному. Две ровные колонки читаются как таблица. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 8,
                marginTop: 10,
              }}
            >
              <button
                className="tag"
                style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
                onClick={() => nav("/vacancy/new", { state: { prefill: v } })}
              >
                <IconCalendar size={13} /> Повторить
              </button>
              <button
                className="tag"
                style={{ cursor: "pointer", borderColor: "var(--like)", color: "var(--like)" }}
                onClick={() => doUrgent(v.id)}
              >
                <IconFire size={13} /> Позвать людей
              </button>
              {/* Исправить и снять — пока по смене нет отклика. После отклика
                  сервер ответит 409 и объяснит: условия уже согласованы. */}
              <button
                className="tag"
                style={{ cursor: "pointer", borderColor: "var(--border-strong)", color: "var(--text)" }}
                onClick={() => nav("/vacancy/new", { state: { edit: v } })}
              >
                <IconEdit size={13} /> Исправить
              </button>
              <button
                className="tag"
                // Тихая: снимают смену редко, а красным она звала не меньше,
                // чем «Повторить», и стояла с ней в одном ряду. Подтверждение
                // всё равно спрашивается отдельно.
                style={{ cursor: "pointer", borderColor: "var(--border-strong)", color: "var(--muted)" }}
                onClick={() => doRemove(v.id, STAFF_ROLE_LABELS[v.role])}
              >
                <IconWarning size={13} /> Снять
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
