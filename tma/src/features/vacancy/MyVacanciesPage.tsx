import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  boostVacancy,
  deleteVacancy,
  fetchEntitlements,
  fetchMyVacancies,
  urgentPing,
} from "@/api/endpoints";
import { fmtDate, fmtTime, rateLabel } from "@/lib/format";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { haptic, confirmAction } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { IconFire, IconCalendar, IconEdit, IconWarning } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { PILOT_MODE } from "@/lib/flags";

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
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      toast(detail ?? "Не удалось снять смену", "error");
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

      {/* Раньше новое заведение видело заголовок и пустоту — непонятно,
          что делать дальше. Теперь экран сам ведёт к размещению смены. */}
      {data && data.length === 0 && (
        <EmptyState
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
            <div className="row">
              <b>{STAFF_ROLE_LABELS[v.role]}</b>
              <span className="spacer" />
              {v.boosted ? (
                <span className="tag" style={{ color: "var(--super)", borderColor: "var(--super)" }}><IconFire size={12} /> в топе</span>
              ) : !PILOT_MODE ? (
                <button
                  className="tag"
                  style={{ cursor: "pointer", borderColor: "var(--gold)", color: "var(--gold)" }}
                  onClick={() => doBoost(v.id)}
                >
                  <IconFire size={12} /> Поднять в топ
                </button>
              ) : null}
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
                style={{ cursor: "pointer", borderColor: "var(--danger)", color: "var(--danger)" }}
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
