import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, disputeShift, fetchMatches, markAttendance, markNotHeld } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { IconTabMatches, IconCheck, IconWarning, IconChevronRight , IconDoc } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { canReportNoPay, shiftEnded, shiftWhen } from "@/lib/format";
import { Button } from "@/components/Button";
import { baseURL, getToken } from "@/api/client";
import { haptic, confirmAction, openExternal } from "@/telegram/sdk";

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
        fontSize: "var(--text-lg)",
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

  // Смена закрыта, а денег нет. До этой кнопки в приложении не оставалось
  // НИ ОДНОГО хода: «Проблема — позвать оператора» жила только пока смена не
  // закрыта, а закрывается она сама через 12 часов. Человек отработал, наличные
  // не отдали — и пожаловаться некуда. Это ровно тот случай, ради которого
  // сервис и нужен, поэтому кнопка живёт две недели после смены.
  function downloadAct(matchId: string) {
    const token = getToken();
    openExternal(
      `${baseURL}/matches/${matchId}/act.pdf${token ? `?token=${token}` : ""}`,
    );
  }

  async function doNotPaid(matchId: string) {
    if (!(await confirmAction(
      "Заведение не рассчиталось за смену? Оператор свяжется с обеими сторонами и разберётся.",
      "Пожаловаться",
    ))) return;
    haptic("warning");
    try {
      await disputeShift(matchId, "Не заплатили за смену");
      toast("Оператор получил вашу жалобу и свяжется с вами", "success");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      toast("Не удалось отправить жалобу", "error");
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
      <h1 className="h1" style={{ marginBottom: 12 }}>
        {role === "employer" ? "Мэтчи" : "Мои смены"}
      </h1>
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
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                  {m.companyName ?? "Заведение"}
                </div>
                {/* Дата и время смены. Их не было видно нигде: человек
                    открывал список мэтчей и не понимал, на какой день он
                    вообще договорился. */}
                {shiftWhen(m) && <div className="muted">{shiftWhen(m)}</div>}
                <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {MATCH_STATUS_LABELS[m.status]}
                </div>
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

            {!!m.shiftPay && m.shiftPay > 0 && (
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: "var(--text-md)" }}>
                {m.shiftPay.toLocaleString("ru-RU")} ₽
                {m.status === "completed" ? " заработано" : " за смену"}
              </div>
            )}

            {/* Акт — только по закрытой смене: это документ о ВЫПОЛНЕННОЙ
                работе, и по незакрытой сервер отвечает отказом. */}
            {role === "seeker" && m.status === "completed" && (
              <div style={{ marginTop: 10 }}>
                <Button variant="secondary" onClick={() => downloadAct(m.id)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <IconDoc size={17} /> Скачать акт (PDF)
                  </span>
                </Button>
              </div>
            )}

            {/* Смена закрыта: обе стороны подтвердили. Сразу просим оценку —
                момент наивысшей эмоции, отзывов собирается больше. */}
            {m.checkedIn && (
              <>
                <div className="row" style={{ gap: 8, marginTop: 12, color: "var(--success)" }}>
                  <IconCheck size={16} /> <b>Смена закрыта — обе стороны подтвердили</b>
                </div>
                <ReviewStars matchId={m.id} />
              </>
            )}

            {/* Деньги за смену платит заведение напрямую, и сервис этого не
                видит. Единственное, что он может, — позвать оператора и
                оставить след на заведении. Раньше и этого не было. */}
            {role === "seeker" && canReportNoPay(m) && (
              <button
                className="btn ghost"
                style={{
                  marginTop: 12,
                  fontSize: "var(--text-sm)",
                  color: "var(--muted)",
                  borderColor: "var(--border-strong)",
                }}
                onClick={() => doNotPaid(m.id)}
              >
                Мне не заплатили за смену
              </button>
            )}

            {/* День смены. Главное сообщение — «делать ничего не нужно»:
                смена закроется сама. Раньше приложение требовало действий от
                обеих сторон, и именно поэтому заведению было выгодно молчать. */}
            {m.status === "confirmed" && !m.disputed && (
              <div style={{ marginTop: 12 }}>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", marginBottom: 12, lineHeight: 1.5 }}
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
                        <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
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
                        <div className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: 6 }}>
                          На месте попросите у администратора код — так у вас
                          останется доказательство, что вы приходили:
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <input
                            className="input"
                            inputMode="numeric"
                            aria-label="6-значный код прихода от заведения"
                            maxLength={6}
                            placeholder="000000"
                            style={{ width: 128, letterSpacing: 4, fontWeight: 800 }}
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
                {/* Только после окончания смены: заявить «не состоялась»
                    раньше — значит отправить человека работать по отменённой
                    смене. До начала для отказа есть отмена в чате. */}
                {shiftEnded(m) && (
                  <button
                    className="btn ghost"
                    style={{ marginTop: 10, minHeight: 44, fontSize: "var(--text-sm)" }}
                    onClick={() => doNotHeld(m.id)}
                  >
                    Смена не состоялась
                  </button>
                )}

                {/* Путь спора — обеим сторонам. */}
                {/* Раньше здесь стоял класс .tab — это класс нижней навигации
                    (колонка, min-height 64). Защитная механика должна быть
                    читаемой кнопкой, а не мелким серым текстом. */}
                <button
                  className="btn ghost"
                  style={{
                    marginTop: 8,
                    minHeight: 44,
                    fontSize: "var(--text-sm)",
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
