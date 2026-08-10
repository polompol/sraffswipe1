import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, disputeShift, fetchMatches, markAttendance } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { IconTabMatches, IconCheck, IconWarning, IconPin, IconChevronRight } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { haptic, confirmAction } from "@/telegram/sdk";

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
    // «Не вышел» бьёт по надёжности человека — подтверждаем, чтобы не отметить
    // случайным тапом.
    if (
      !attended
      && !(await confirmAction(
        "Отметить, что человек не вышел на смену? Это повлияет на его надёжность.",
        "Отметить",
      ))
    ) return;
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
    if (code.length < 6) return;
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
    if (!(await confirmAction("Открыть спор по смене? Его разберёт оператор.", "Открыть спор"))) return;
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
  // Возвращаем промис: определение координат занимает до 8 секунд, и без него
  // кнопка не крутила спиннер — человек не понимал, идёт ли что-то, и жал ещё.
  function checkinByGeo(matchId: string): Promise<void> {
    if (!("geolocation" in navigator)) {
      toast("Геолокация недоступна — введите код", "error");
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      // Страховка: пока висит системный запрос разрешения, штатный timeout
      // не тикает. Без своего таймера кнопка осталась бы со спиннером навсегда.
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const guard = setTimeout(() => {
        toast("Не удалось определить геопозицию — введите код", "error");
        done();
      }, 12000);
      const finish = () => {
        clearTimeout(guard);
        done();
      };
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
          } finally {
            finish();
          }
        },
        () => {
          toast("Нет доступа к геолокации — введите код", "error");
          finish();
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Мэтчи</h1>
      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState
          fill
          icon={<IconTabMatches size={34} active />}
          title="Пока нет мэтчей"
          text="Откликайтесь на смены в ленте — как только заведение ответит, здесь откроется чат."
          action={<Button onClick={() => nav("/feed")}>Открыть ленту</Button>}
        />
      )}
      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((m) => (
          <div key={m.id} className="card">
            {/* Настоящая кнопка, а не div с onClick: переход в чат теперь
                доступен с клавиатуры и озвучивается скринридером. Кнопки
                действий лежат ниже, вложенности кнопок не возникает. */}
            <button
              className="row"
              aria-label={`Открыть чат: ${m.companyName ?? "Заведение"}`}
              style={{
                gap: 12,
                cursor: "pointer",
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                textAlign: "left",
                font: "inherit",
                color: "inherit",
              }}
              onClick={() => nav(`/chat/${m.id}`)}
            >
              {/* Раньше сокращённое `background` шло ПОСЛЕ backgroundImage и
                  затирало size/position, а без фото подставлялся url("").
                  Теперь ветки не смешиваются. */}
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  flex: "none",
                  ...(m.companyPhotoUrl
                    ? {
                        backgroundImage: `url(${m.companyPhotoUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: "var(--border-strong)" }),
                }}
              />
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{m.companyName ?? "Заведение"}</div>
                <div className="muted">{MATCH_STATUS_LABELS[m.status]}</div>
              </span>
              <span style={{ color: "var(--muted)", display: "inline-flex" }}>
                <IconChevronRight size={20} />
              </span>
            </button>
            {/* Спор — эскалация к оператору. */}
            {m.disputed && !m.checkedIn && (
              <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--crimson-dark)" }}>
                <IconWarning size={16} /> <b>Спор по смене — разбирает оператор</b>
              </div>
            )}

            {/* Смена закрыта: обе стороны подтвердили. Сразу просим оценку —
                момент наивысшей эмоции, отзывов собирается больше. */}
            {m.checkedIn && (
              <>
                <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--like)" }}>
                  <IconCheck size={16} /> <b>Смена закрыта — обе стороны подтвердили ✓</b>
                </div>
                <ReviewStars matchId={m.id} />
              </>
            )}

            {/* ВЗАИМНОЕ ПОДТВЕРЖДЕНИЕ выхода (день смены). */}
            {m.status === "confirmed" && !m.disputed && (
              <div style={{ marginTop: 12 }}>
                {/* Заведение */}
                {role === "employer" && (
                  <>
                    {/* Код заведение диктует работнику вслух — поэтому цифры
                        крупные и читаемые, а не мелкой серой строкой. */}
                    {m.checkinCode && !m.employerCheckedIn && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: "10px 14px",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "var(--radius-sm)",
                          textAlign: "center",
                        }}
                      >
                        <div className="muted" style={{ fontSize: 13 }}>
                          Назовите этот код работнику
                        </div>
                        <div
                          style={{
                            fontSize: "var(--text-2xl)",
                            fontWeight: 800,
                            letterSpacing: 6,
                            color: "var(--gold)",
                          }}
                        >
                          {m.checkinCode}
                        </div>
                      </div>
                    )}
                    {m.employerCheckedIn ? (
                      <div className="muted">Вы подтвердили выход ✓ Ждём отметку работника.</div>
                    ) : (
                      <div className="row" style={{ gap: 8 }}>
                        <Button block={false} style={{ flex: 1 }} onClick={() => mark(m.id, true)}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <IconCheck size={16} /> Человек пришёл
                          </span>
                        </Button>
                        <Button variant="danger" block={false} onClick={() => mark(m.id, false)}>
                          Не вышел
                        </Button>
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
                        <Button onClick={() => checkinByGeo(m.id)}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <IconPin size={18} /> Я на смене — отметиться
                          </span>
                        </Button>
                        <div className="muted" style={{ fontSize: 13, margin: "12px 0 6px" }}>
                          …или введите код, если заведение его назвало:
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <input
                            className="input"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="код"
                            style={{ width: 110, letterSpacing: 4, fontWeight: 800 }}
                            value={codes[m.id] ?? ""}
                            onChange={(e) =>
                              setCodes((c) => ({ ...c, [m.id]: e.target.value.replace(/\D/g, "") }))
                            }
                          />
                          <Button
                            variant="secondary"
                            block={false}
                            style={{ flex: 1 }}
                            disabled={(codes[m.id] ?? "").length < 6}
                            onClick={() => doCheckin(m.id)}
                          >
                            Отметиться кодом
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Путь спора — обеим сторонам. */}
                {/* Раньше здесь стоял класс .tab — это класс нижней навигации
                    (колонка, min-height 64). Защитная механика должна быть
                    читаемой кнопкой, а не мелким серым текстом. */}
                <button
                  className="btn ghost"
                  style={{ marginTop: 10, minHeight: 44, fontSize: 14 }}
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
