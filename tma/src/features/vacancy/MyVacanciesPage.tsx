import { useState } from "react";
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
import { ErrorBox, SkeletonList } from "@/components/States";
import { Sheet } from "@/components/Sheet";
import type { Vacancy } from "@/types/domain";

export function MyVacanciesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  // Редкие действия по смене — под одной дверью «Ещё».
  const [moreFor, setMoreFor] = useState<Vacancy | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
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
      <h1 className="h1" style={{ marginBottom: 12 }}>Мои смены</h1>
      {/* Главное действие заведения — отдельной строкой во всю ширину.
          Раньше это была маленькая кнопка, прижатая к правому краю рядом с
          заголовком: самое частое действие выглядело самым второстепенным. */}
      <div style={{ marginBottom: 12 }}>
        <Button onClick={() => nav("/vacancy/new")}>
          + Разместить смену
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
          style={{ cursor: "pointer", borderColor: "var(--border-strong)", color: "var(--text)" }}
          onClick={() => nav("/applicants")}
        >
          Кто откликнулся
        </button>
        <button
          className="tag"
          style={{ cursor: "pointer", borderColor: "var(--border-strong)", color: "var(--text)" }}
          onClick={() => nav("/workers")}
        >
          Мои работники
        </button>
      </div>

      {/* При отказе сервера экран был просто дырой: ни объяснения, ни
          «Повторить». У заведения с пятью опубликованными сменами это
          выглядит как «всё пропало». */}
      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}

      {/* Раньше новое заведение видело заголовок и пустоту — непонятно,
          что делать дальше. Теперь экран сам ведёт к размещению смены. */}
      {!isLoading && !isError && data && data.length === 0 && (
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

      <div className="stagger stack stack-lg">
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
                    fontSize: "var(--text-sm)",
                    color: full ? "var(--success)" : "var(--gold)",
                  }}
                >
                  {full
                    ? "Все места закрыты ✓"
                    : `Набрано ${taken} из ${need} · ищем ещё ${left} ${plural(left, "человека", "человек", "человек")}`}
                </div>
              );
            })()}
            {/* ОДНО главное действие на карточку, остальное — под «Ещё».
                Раньше здесь стояли четыре кнопки одного веса сеткой два на
                два: пролистывая пять смен, заведение видело двадцать кнопок и
                не понимало, какая из них нужна сейчас. А нужна почти всегда
                одна: пока людей не набрали — позвать, когда набрали — повторить
                смену на другой день. */}
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {(v.slotsLeft ?? v.headcount ?? 1) > 0 ? (
                <Button variant="secondary" onClick={() => doUrgent(v.id)}>
                  <span className="inline">
                    <IconFire size={16} /> Позвать людей на эту смену
                  </span>
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => nav("/vacancy/new", { state: { prefill: v } })}>
                  <span className="inline">
                    <IconCalendar size={16} /> Повторить смену
                  </span>
                </Button>
              )}
              <button
                onClick={() => setMoreFor(v)}
                style={{
                  minHeight: 44,
                  padding: 0,
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  font: "inherit",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ещё
              </button>
            </div>
          </div>
        ))}
      </div>

      {moreFor && (
        <Sheet title={STAFF_ROLE_LABELS[moreFor.role]} onClose={() => setMoreFor(null)}>
          <div className="stack">
            <Button
              variant="secondary"
              onClick={() => {
                const v = moreFor;
                setMoreFor(null);
                nav("/vacancy/new", { state: { prefill: v } });
              }}
            >
              <span className="inline">
                <IconCalendar size={16} /> Повторить смену на другой день
              </span>
            </Button>
            {/* Исправить и снять — пока по смене нет отклика. После отклика
                сервер ответит 409 и объяснит: условия уже согласованы. */}
            <Button
              variant="secondary"
              onClick={() => {
                const v = moreFor;
                setMoreFor(null);
                nav("/vacancy/new", { state: { edit: v } });
              }}
            >
              <span className="inline">
                <IconEdit size={16} /> Исправить условия
              </span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const v = moreFor;
                setMoreFor(null);
                doRemove(v.id, STAFF_ROLE_LABELS[v.role]);
              }}
            >
              <span className="inline">
                <IconWarning size={16} /> Снять с публикации
              </span>
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
