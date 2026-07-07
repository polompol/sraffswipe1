import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { boostVacancy, fetchEntitlements, fetchMyVacancies, urgentPing } from "@/api/endpoints";
import { fmtDate, fmtTime, rateLabel } from "@/lib/format";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { haptic } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { IconFire, IconCalendar } from "@/components/Icons";
import { toast } from "@/components/Toast";

export function MyVacanciesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["my-vacancies"],
    queryFn: fetchMyVacancies,
  });
  const { data: ent } = useQuery({
    queryKey: ["entitlements"],
    queryFn: fetchEntitlements,
  });

  async function doBoost(id: string) {
    if ((ent?.boostBalance ?? 0) < 1) {
      nav("/pricing");
      return;
    }
    haptic("success");
    await boostVacancy(id);
    qc.invalidateQueries({ queryKey: ["my-vacancies"] });
    qc.invalidateQueries({ queryKey: ["entitlements"] });
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
        <h1 className="h1" style={{ margin: 0 }}>Мои вакансии</h1>
        <span className="spacer" />
        <Button size="sm" block={false} onClick={() => nav("/vacancy/new")}>
          + Вакансия
        </Button>
      </div>
      <button
        className="tag"
        style={{ cursor: "pointer", marginBottom: 14, borderColor: "var(--gold)", color: "var(--gold)" }}
        onClick={() => nav("/workers")}
      >
        Мои работники — позвать снова
      </button>

      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((v) => (
          <div key={v.id} className="card">
            <div className="row">
              <b>{STAFF_ROLE_LABELS[v.role]}</b>
              <span className="spacer" />
              {v.boosted ? (
                <span className="tag" style={{ color: "var(--super)", borderColor: "var(--super)" }}><IconFire size={12} /> в топе</span>
              ) : (
                <button
                  className="tag"
                  style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
                  onClick={() => doBoost(v.id)}
                >
                  <IconFire size={12} /> Поднять в топ
                </button>
              )}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {fmtDate(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {rateLabel(v.rate, v.rateType)}
            </div>
            <div className="muted">{v.address}</div>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className="tag"
                style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
                onClick={() => nav("/vacancy/new", { state: { prefill: v } })}
              >
                <IconCalendar size={13} /> Повторить смену
              </button>
              <button
                className="tag"
                style={{ cursor: "pointer", borderColor: "var(--like)", color: "var(--like)" }}
                onClick={() => doUrgent(v.id)}
              >
                <IconFire size={13} /> Срочно: позвать рядом
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
