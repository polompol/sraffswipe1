import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, fetchMatches, markAttendance } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { IconTabMatches, IconCheck, IconWarning, IconPin } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { haptic } from "@/telegram/sdk";

export function MatchesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = useSession((s) => s.role);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
  });

  async function mark(matchId: string, attended: boolean) {
    haptic(attended ? "success" : "warning");
    try {
      await markAttendance(matchId, attended);
      toast(attended ? "Отмечено: вышел" : "Отмечено: не вышел", "success");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      toast("Не удалось отметить", "error");
    }
  }

  async function doCheckin(matchId: string) {
    const code = (codes[matchId] ?? "").trim();
    if (code.length < 4) return;
    try {
      await checkinShift(matchId, { code });
      haptic("success");
      toast("Вы отметились на смене ✓", "success");
      setCodes((c) => ({ ...c, [matchId]: "" }));
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      haptic("error");
      toast("Неверный код прихода", "error");
    }
  }

  // Отметиться геолокацией — работник физически на месте смены, код не нужен.
  function checkinByGeo(matchId: string) {
    if (!("geolocation" in navigator)) {
      toast("Геолокация недоступна — введите код", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await checkinShift(matchId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          haptic("success");
          toast("Вы отметились на смене ✓", "success");
          qc.invalidateQueries({ queryKey: ["matches"] });
        } catch {
          haptic("error");
          toast("Вы не на месте смены — попробуйте код", "error");
        }
      },
      () => toast("Нет доступа к геолокации — введите код", "error"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Мэтчи</h1>
      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<IconTabMatches size={34} active />}
          title="Пока нет мэтчей"
          text="Свайпайте вправо понравившиеся смены — при взаимном лайке откроется чат."
        />
      )}
      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((m) => (
          <div key={m.id} className="card">
            <div
              className="row"
              style={{ gap: 12, cursor: "pointer" }}
              onClick={() => nav(`/chat/${m.id}`)}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  flex: "none",
                  backgroundImage: `url(${m.companyPhotoUrl ?? ""})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  background: m.companyPhotoUrl ? undefined : "var(--border)",
                }}
              />
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{m.companyName ?? "Заведение"}</div>
                <div className="muted">{MATCH_STATUS_LABELS[m.status]}</div>
              </span>
              <span style={{ color: "var(--muted)", fontSize: 22 }}>›</span>
            </div>
            {m.checkedIn && (
              <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--like)" }}>
                <IconCheck size={16} /> <b>Смена закрыта — работник отметился</b>
              </div>
            )}

            {/* Заведение: показывает код прихода, называет работнику на месте. */}
            {role === "employer" && m.status === "confirmed" && m.checkinCode && (
              <div
                className="card"
                style={{ marginTop: 12, background: "rgba(165,28,48,.05)", borderColor: "var(--gold)" }}
              >
                <div className="muted" style={{ fontSize: 13 }}>Код прихода — назовите работнику на месте:</div>
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 6, color: "var(--gold)" }}>
                  {m.checkinCode}
                </div>
              </div>
            )}

            {/* Работник: отметиться геолокацией (основной путь) или кодом. */}
            {role === "seeker" && m.status === "confirmed" && (
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => checkinByGeo(m.id)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <IconPin size={18} /> Я на смене — отметиться
                  </span>
                </button>
                <div className="muted" style={{ fontSize: 13, margin: "12px 0 6px" }}>
                  …или введите код, если заведение его назвало:
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="код"
                    style={{ width: 110, letterSpacing: 4, fontWeight: 800 }}
                    value={codes[m.id] ?? ""}
                    onChange={(e) =>
                      setCodes((c) => ({ ...c, [m.id]: e.target.value.replace(/\D/g, "") }))
                    }
                  />
                  <button
                    className="btn secondary"
                    style={{ width: "auto", flex: 1 }}
                    disabled={(codes[m.id] ?? "").length < 4}
                    onClick={() => doCheckin(m.id)}
                  >
                    Отметиться кодом
                  </button>
                </div>
              </div>
            )}

            {role === "employer" && (m.status === "confirmed" || m.status === "completed") && (
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button
                  className="tag"
                  style={{ cursor: "pointer", color: "var(--super)", borderColor: "var(--super)" }}
                  onClick={() => mark(m.id, true)}
                >
                  <IconCheck size={13} /> Вышел
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer", color: "var(--muted)", borderColor: "var(--border)" }}
                  onClick={() => mark(m.id, false)}
                >
                  <IconWarning size={13} /> Не вышел
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
