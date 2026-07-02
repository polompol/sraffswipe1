import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, disputeShift, fetchMatches, markAttendance } from "@/api/endpoints";
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

  async function doDispute(matchId: string) {
    haptic("warning");
    try {
      await disputeShift(matchId);
      toast("Спор открыт — с вами свяжется оператор", "success");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      toast("Не удалось открыть спор", "error");
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
            {/* Спор — эскалация к оператору. */}
            {m.disputed && !m.checkedIn && (
              <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--crimson-dark)" }}>
                <IconWarning size={16} /> <b>Спор по смене — разбирает оператор</b>
              </div>
            )}

            {/* Смена закрыта: обе стороны подтвердили. */}
            {m.checkedIn && (
              <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--like)" }}>
                <IconCheck size={16} /> <b>Смена закрыта — обе стороны подтвердили ✓</b>
              </div>
            )}

            {/* ВЗАИМНОЕ ПОДТВЕРЖДЕНИЕ выхода (день смены). */}
            {m.status === "confirmed" && !m.disputed && (
              <div style={{ marginTop: 12 }}>
                {/* Заведение */}
                {role === "employer" && (
                  <>
                    {m.checkinCode && !m.employerCheckedIn && (
                      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                        Код-подсказка работнику (по желанию): <b style={{ color: "var(--gold)", letterSpacing: 3 }}>{m.checkinCode}</b>
                      </div>
                    )}
                    {m.employerCheckedIn ? (
                      <div className="muted">Вы подтвердили выход ✓ Ждём отметку работника.</div>
                    ) : (
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn" style={{ width: "auto", flex: 1 }} onClick={() => mark(m.id, true)}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <IconCheck size={16} /> Человек пришёл
                          </span>
                        </button>
                        <button className="btn secondary" style={{ width: "auto" }} onClick={() => mark(m.id, false)}>
                          Не вышел
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Работник */}
                {role === "seeker" && (
                  <>
                    {m.seekerCheckedIn ? (
                      <div className="muted">Вы отметились ✓ Ждём подтверждения заведения.</div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </>
                )}

                {/* Путь спора — обеим сторонам. */}
                <button
                  className="tab"
                  style={{ width: "auto", marginTop: 10, color: "var(--muted)", fontSize: 13 }}
                  onClick={() => doDispute(m.id)}
                >
                  Проблема — не получается подтвердить
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
