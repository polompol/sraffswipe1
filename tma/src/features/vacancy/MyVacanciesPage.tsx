import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Vacancy } from "@/types/domain";
import { fetchFeed } from "@/api/endpoints";
import { fmtDate, fmtTime, rateLabel } from "@/lib/format";
import { STAFF_ROLE_LABELS } from "@/types/domain";

export function MyVacanciesPage() {
  const nav = useNavigate();
  // В демо переиспользуем ленту как «мои вакансии».
  const { data } = useQuery({
    queryKey: ["my-vacancies"],
    queryFn: () => fetchFeed("seeker") as Promise<Vacancy[]>,
  });

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 className="h1" style={{ margin: 0 }}>Мои вакансии</h1>
        <span className="spacer" />
        <button className="btn" style={{ width: "auto", padding: "10px 14px" }} onClick={() => nav("/vacancy/new")}>
          + Вакансия
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {data?.map((v) => (
          <div key={v.id} className="card">
            <div className="row">
              <b>{STAFF_ROLE_LABELS[v.role]}</b>
              <span className="spacer" />
              {v.boosted ? (
                <span className="tag" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>🔥 в топе</span>
              ) : (
                <button
                  className="tag"
                  style={{ cursor: "pointer", borderColor: "var(--border)" }}
                  onClick={() => nav("/pricing")}
                >
                  Поднять
                </button>
              )}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {fmtDate(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)} · {rateLabel(v.rate, v.rateType)}
            </div>
            <div className="muted">{v.address}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
