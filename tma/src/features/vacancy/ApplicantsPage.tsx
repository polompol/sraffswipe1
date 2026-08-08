import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApplicants, sendSwipe, type Applicant } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { fmtDate, fmtTime } from "@/lib/format";
import { MED_BOOK_LABELS, STAFF_ROLE_LABELS } from "@/types/domain";
import type { MedBookStatus, StaffRole } from "@/types/domain";
import { IconBolt, IconCheck, IconCalendar } from "@/components/Icons";

/**
 * «Кто откликнулся» — зеркало экрана «Тебя зовут» у работника.
 *
 * До него у заведения был только счётчик «Новых откликов: 5», который вёл в
 * общую ленту кандидатов: кто именно эти пятеро, приходилось угадывать среди
 * полусотни анкет. А это главный вопрос заведения — кто уже хочет к нам.
 */
export function ApplicantsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["applicants"],
    queryFn: fetchApplicants,
  });

  async function answer(a: Applicant, take: boolean) {
    haptic(take ? "success" : "light");
    try {
      const res = await sendSwipe(a.id, "user", take ? "like" : "dislike");
      qc.invalidateQueries({ queryKey: ["applicants"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      if (take && res.matched) {
        qc.invalidateQueries({ queryKey: ["matches"] });
        toast("Готово! Открылся чат — договоритесь о деталях", "success");
        if (res.matchId) nav(`/chat/${res.matchId}`);
        return;
      }
      toast(take ? "Отклик принят" : "Отклик отклонён", "success");
    } catch (e) {
      haptic("error");
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      toast(detail ?? "Не получилось — попробуйте ещё раз", "error");
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Кто откликнулся</h1>
        <p className="muted" style={{ margin: "0 0 14px" }}>
          Эти люди сами выбрали вашу смену. Ответьте — и сразу откроется чат.
        </p>

        {isLoading && <SkeletonList />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <EmptyState
            icon={<IconCheck size={34} />}
            title="Откликов пока нет"
            text="Как только кто-то выберет вашу смену, он появится здесь. Если смена висит без откликов — поднимите ставку или нажмите «Позвать людей» в списке смен."
          />
        )}

        <div className="stagger" style={{ display: "grid", gap: 12 }}>
          {data?.map((a) => (
            <div key={a.id} className="card">
              <div className="row" style={{ gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 17 }}>
                    {a.name}
                    {a.age ? `, ${a.age}` : ""}
                  </b>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {a.rating > 0 ? `★ ${a.rating.toFixed(1)}` : "Новичок"}
                    {a.district ? ` · ${a.district}` : ""}
                    {a.shiftsTotal > 0
                      ? ` · вышел на ${a.shiftsAttended} из ${a.shiftsTotal} смен`
                      : ""}
                  </div>
                </span>
                {a.availableToday && (
                  <span
                    className="tag"
                    style={{ flex: "none", color: "var(--gold)", borderColor: "var(--gold)" }}
                  >
                    <IconBolt size={12} /> готов сегодня
                  </span>
                )}
              </div>

              {/* На какую смену откликнулись: у заведения их обычно несколько,
                  и без этой строки непонятно, кого и куда брать. */}
              <div
                className="tag"
                style={{
                  marginTop: 10,
                  width: "100%",
                  justifyContent: "flex-start",
                  borderColor: "var(--gold)",
                  color: "var(--gold)",
                }}
              >
                <IconCalendar size={13} />
                {STAFF_ROLE_LABELS[a.vacancyRole as StaffRole] ?? a.vacancyRole}
                {" · "}{fmtDate(a.vacancyDate)}
                {" · "}{fmtTime(a.vacancyStart)}–{fmtTime(a.vacancyEnd)}
              </div>

              {a.about && (
                <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
                  {a.about}
                </p>
              )}
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Медкнижка: {MED_BOOK_LABELS[a.medBook as MedBookStatus] ?? a.medBook}
                {a.roles.length > 0 &&
                  ` · ${a.roles
                    .map((r) => STAFF_ROLE_LABELS[r as StaffRole] ?? r)
                    .join(", ")}`}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Button onClick={() => answer(a, true)}>Беру на смену</Button>
                <Button variant="ghost" onClick={() => answer(a, false)}>
                  Не подходит
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
