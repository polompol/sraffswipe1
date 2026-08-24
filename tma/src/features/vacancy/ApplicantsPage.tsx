import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApplicants, sendSwipe, type Applicant } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";
import { reliabilityText } from "@/lib/reliability";
import { dec1, shiftWhen } from "@/lib/format";
import { apiError } from "@/lib/errors";
import { MED_BOOK_LABELS, STAFF_ROLE_LABELS } from "@/types/domain";
import type { MedBookStatus, StaffRole } from "@/types/domain";
import { IconBell, IconBolt, IconCalendar, IconStar } from "@/components/Icons";

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
      // Смена передаётся явно: на карточке написано, на какую именно человек
      // откликнулся, и мэтч должен получиться ровно по ней.
      const res = await sendSwipe(
        a.id, "user", take ? "like" : "dislike", take ? a.vacancyId : undefined,
      );
      qc.invalidateQueries({ queryKey: ["applicants"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      if (take && res.matched) {
        qc.invalidateQueries({ queryKey: ["matches"] });
        toast("Взяли! Открылся чат — напишите, во сколько прийти", "success");
        if (res.matchId) nav(`/chat/${res.matchId}`);
        return;
      }
      toast(take ? "Взяли на смену" : "Отказали. Передумаете — можно взять позже", "success");
    } catch (e) {
      haptic("error");
      toast(apiError(e, "Не получилось — попробуйте ещё раз"), "error");
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Кто откликнулся</h1>
        {!!data?.length && (
          <p className="muted" style={{ margin: "0 0 14px" }}>
            Эти люди сами выбрали вашу смену. Ответьте — и сразу откроется чат.
          </p>
        )}

        {isLoading && <SkeletonList />}
        {isError && <ErrorBox onRetry={() => refetch()} />}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <EmptyState
            fill
            icon={<IconBell size={34} />}
            title="Откликов пока нет"
            text="Здесь появятся те, кто выбрал вашу смену. Пока тихо — поднимите ставку или позовите людей сами."
            action={<Button onClick={() => nav("/vacancy/my")}>Мои смены</Button>}
          />
        )}

        <div className="stagger stack stack-lg">
          {data?.map((a) => (
            <div key={a.id} className="card">
              {/* Ряд переносится, а длинные слова рвутся: у людей бывают
                  двойные фамилии, и на узком экране имя наезжало на бейдж. */}
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                {/* Лицо человека. В ленте заведение видит фотографию, а в
                    списке откликов до сих пор были одни буквы — при том, что
                    решение «беру или нет» принимают именно здесь. */}
                <Avatar src={a.photoUrls?.[0]} name={a.name} />
                <span style={{ flex: "1 1 50%", minWidth: 0 }}>
                  <b style={{ fontSize: "var(--text-md)", overflowWrap: "anywhere" }}>
                    {a.name}
                    {a.age ? `, ${a.age}` : ""}
                  </b>
                  {/* Отказ больше не прячет человека навсегда: он сам выбрал
                      вашу смену, а свайп влево легко сделать случайно. */}
                  {a.declined && (
                    <span
                      className="tag"
                      style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--muted)", borderColor: "var(--border)" }}
                    >
                      вы отказали
                    </span>
                  )}
                  <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 2 }}>
                    {a.rating > 0 ? (
                      <><IconStar size={12} /> {dec1(a.rating)}</>
                    ) : "Новичок"}
                    {a.district ? ` · ${a.district}` : ""}
                    {a.shiftsTotal > 0
                      ? ` · ${reliabilityText(a.shiftsTotal, a.shiftsAttended, a.employersTotal)}`
                      : ""}
                  </div>
                </span>
                {a.availableToday && (
                  <span
                    className="tag"
                    style={{ flex: "none", color: "var(--gold)", borderColor: "var(--gold)" }}
                  >
                    <IconBolt size={12} /> может сегодня
                  </span>
                )}
              </div>

              {/* На какую смену откликнулись: у заведения их обычно несколько,
                  и без этой строки непонятно, кого и куда брать. */}
              {/* Это подпись, а не кнопка: рамка-пилюля в фирменном цвете
                  выглядела ровно как «Беру на смену» под ней, и по строке
                  жали, ожидая перехода на смену. Теперь — просто строка с
                  иконкой. */}
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  color: "var(--gold)",
                  fontWeight: 700,
                  fontSize: "var(--text-base)",
                }}
              >
                <IconCalendar size={13} />
                {STAFF_ROLE_LABELS[a.vacancyRole as StaffRole] ?? a.vacancyRole}
                {" ·\u00a0"}
                <span style={{ whiteSpace: "nowrap" }}>
                  {shiftWhen({
                    shiftDate: a.vacancyDate,
                    shiftStart: a.vacancyStart,
                    shiftEnd: a.vacancyEnd,
                  })}
                </span>
              </div>

              {a.about && (
                <p className="muted" style={{ margin: "10px 0 0", fontSize: "var(--text-sm)" }}>
                  {a.about}
                </p>
              )}
              <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-xs)" }}>
                Медкнижка: {MED_BOOK_LABELS[a.medBook as MedBookStatus] ?? a.medBook}
                {a.roles.length > 0 &&
                  ` · ${a.roles
                    .map((r) => STAFF_ROLE_LABELS[r as StaffRole] ?? r)
                    .join(", ")}`}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Button onClick={() => answer(a, true)}>
                  {a.declined ? "Всё-таки беру" : "Беру на смену"}
                </Button>
                {!a.declined && (
                  <Button variant="ghost" onClick={() => answer(a, false)}>
                    Не подходит
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
