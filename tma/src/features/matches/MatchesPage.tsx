import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, disputeShift, fetchMatches, markAttendance, markNotHeld } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { IconTabMatches, IconCheck, IconWarning, IconChevronRight } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { Button } from "@/components/Button";
import { haptic, confirmAction } from "@/telegram/sdk";

/** Аватар заведения 52×52: буква на градиенте, поверх — фото, если оно есть
 *  и загрузилось. Битая ссылка не оставляет пустого места. */
function MatchAvatar({ src, initial }: { src?: string; initial: string }) {
  const [ok, setOk] = useState(!!src);
  return (
    <span
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        flex: "none",
        position: "relative",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--grad-brand)",
        color: "#fff",
        fontWeight: 800,
        fontSize: 21,
      }}
    >
      {!ok && initial}
      {src && (
        <img
          src={src}
          alt=""
          onError={() => setOk(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: ok ? 1 : 0,
          }}
        />
      )}
    </span>
  );
}

export function MatchesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = useSession((s) => s.role);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
  });

  // Подтверждение выхода закрывает смену сразу, не дожидаясь расчёта.
  // Отрицательный путь живёт отдельно — в «Смена не состоялась».
  async function mark(matchId: string, attended: boolean) {
    haptic(attended ? "success" : "warning");
    try {
      await markAttendance(matchId, attended);
      toast(attended ? "Смена закрыта ✓" : "Отмечено: не вышел", "success");
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

  // «Смены не было» — единственный способ не платить за договорённую смену.
  // Раньше платить было не нужно по умолчанию: смена закрывалась только когда
  // обе стороны нажимали кнопку. Теперь наоборот, и отказ надо заявить явно.
  async function doNotHeld(matchId: string) {
    const ok = await confirmAction(
      "Отметить, что смена не состоялась? Комиссия за неё начислена не будет.",
      "Смена не состоялась",
    );
    if (!ok) return;
    haptic("warning");
    try {
      await markNotHeld(matchId);
      toast("Отмечено: смена не состоялась", "success");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (e) {
      haptic("error");
      toast(apiError(e, "Не удалось отметить"), "error");
    }
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
              {/* Фото заведения с запасным вариантом. Раньше это был
                  CSS-фон: если ссылка битая (а у большинства заведений фото
                  просто нет), на месте аватара оставался пустой квадрат и
                  карточка выглядела недогруженной. Теперь — буква названия на
                  брендовом градиенте, как в ленте и в профиле. */}
              <MatchAvatar
                src={m.companyPhotoUrl}
                initial={(m.companyName || "З").charAt(0)}
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

            {/* День смены. Главное сообщение — «делать ничего не нужно»:
                смена закроется сама. Раньше приложение требовало действий от
                обеих сторон, и именно поэтому заведению было выгодно молчать. */}
            {m.status === "confirmed" && !m.disputed && (
              <div style={{ marginTop: 12 }}>
                <div
                  className="muted"
                  style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}
                >
                  Смена закроется сама через 12 часов после окончания —
                  нажимать ничего не нужно.
                </div>

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
                      <div className="muted">Вы подтвердили выход ✓ Смена закрыта.</div>
                    ) : (
                      /* Только подтверждение. Отдельной кнопки «Не вышел»
                         здесь больше нет: она делала ровно то же, что общая
                         «Смена не состоялась» ниже, и две одинаковые по смыслу
                         кнопки рядом заставляли выбирать между ними. */
                      <Button onClick={() => mark(m.id, true)}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <IconCheck size={16} /> Человек пришёл — закрыть смену
                        </span>
                      </Button>
                    )}
                  </>
                )}

                {/* Работник */}
                {role === "seeker" && (
                  <>
                    {m.seekerCheckedIn ? (
                      <div className="muted">
                        Код принят ✓ Ваше подтверждение, что вы были на месте.
                      </div>
                    ) : (
                      <>
                        {/* Отметка больше НЕ обязательна: смена закроется сама,
                            если никто не возразит. Код — доказательство: после
                            него заведение не сможет тихо записать смену в
                            неявку, спор уйдёт к оператору. */}
                        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                          На месте попросите у администратора код — так у вас
                          останется доказательство, что вы приходили:
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <input
                            className="input"
                            inputMode="numeric"
                            aria-label="6-значный код прихода от заведения"
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

                {/* Смена закроется сама, если промолчать. Поэтому «не
                    состоялась» — заметная кнопка, а не мелкая ссылка: это
                    единственный способ не платить за смену, которой не было,
                    и человек должен её увидеть, не разыскивая. */}
                <button
                  className="btn ghost"
                  style={{ marginTop: 10, minHeight: 44, fontSize: 14 }}
                  onClick={() => doNotHeld(m.id)}
                >
                  Смена не состоялась
                </button>

                {/* Путь спора — обеим сторонам. */}
                {/* Раньше здесь стоял класс .tab — это класс нижней навигации
                    (колонка, min-height 64). Защитная механика должна быть
                    читаемой кнопкой, а не мелким серым текстом. */}
                <button
                  className="btn ghost"
                  style={{
                    marginTop: 8,
                    minHeight: 44,
                    fontSize: 14,
                    color: "var(--muted)",
                    borderColor: "var(--border-strong)",
                  }}
                  onClick={() => doDispute(m.id)}
                >
                  Проблема — позвать оператора
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
