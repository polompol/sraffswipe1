import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { checkinShift, disputeShift, fetchMatches, markAttendance, markNotHeld } from "@/api/endpoints";
import { STAFF_ROLE_LABELS, type MatchModel } from "@/types/domain";
import { useSession } from "@/store/session";
import { ErrorBox, SkeletonList } from "@/components/States";
import { EmptyState } from "@/components/EmptyState";
import { ReviewStars } from "@/components/ReviewStars";
import { Sheet } from "@/components/Sheet";
import { IconTabMatches, IconCheck, IconWarning, IconChevronRight, IconDoc } from "@/components/Icons";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { canReportNoPay, shiftEnded, shiftStarted, shiftWhen } from "@/lib/format";
import { Button } from "@/components/Button";
import { baseURL, getToken } from "@/api/client";
import { haptic, confirmAction, openExternal } from "@/telegram/sdk";

/** С кем договорились: заведению — имя работника, работнику — название
 *  заведения. Раньше в обеих ролях подставлялось название заведения, и у
 *  работодателя весь список смен состоял из его собственного имени. */
function counterpart(m: MatchModel, role: string | null): string {
  const name = role === "employer" ? m.seekerName : m.companyName;
  return (name || "").trim() || (role === "employer" ? "Работник" : "Заведение");
}

/** Аватар заведения: буква на градиенте, поверх — фото, если оно есть и
 *  загрузилось. Битая ссылка не оставляет пустого места. Размер задан классом
 *  (.match-ava): на узком экране он меньше — иначе колонке с названием
 *  оставалось 158 точек из 254, и короткое «Бар «Полночь»» ломалось надвое. */
function MatchAvatar({ src, initial }: { src?: string; initial: string }) {
  const [ok, setOk] = useState(!!src);
  return (
    <span
      className="match-ava"
      style={{
        borderRadius: 12,
        flex: "none",
        position: "relative",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--grad-brand)",
        color: "var(--on-brand)",
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

/** Состояние смены одной заметной строкой.
 *
 *  Раньше состояние было написано мелким серым текстом под названием
 *  заведения — то есть главное на экране набрано самым незаметным шрифтом.
 *  Человек открывал список и не понимал с ходу, что происходит с какой сменой:
 *  где ждут его, где всё закрыто, где спор. */
function StatusLine({ m, role }: { m: MatchModel; role: string | null }) {
  let color = "var(--muted)";
  let icon: React.ReactNode = null;
  let text = "Договариваетесь о смене";

  if (m.disputed) {
    color = "var(--danger)";
    icon = <IconWarning size={17} />;
    text = "Спор по смене — разбирает оператор";
  } else if (m.status === "completed" || m.checkedIn) {
    color = "var(--success)";
    icon = <IconCheck size={17} />;
    text = "Смена закрыта";
  } else if (m.status === "cancelled") {
    text = "Смена отменена";
  } else if (m.status === "expired") {
    text = "Смена не состоялась";
  } else if (m.status === "confirmed") {
    color = "var(--gold)";
    icon = <IconCheck size={17} />;
    text = shiftStarted(m)
      ? (role === "employer" ? "Смена идёт — ждём человека" : "Сегодня ваша смена")
      : "Смена подтверждена";
  }

  return (
    <div
      className="row"
      style={{ gap: 8, marginTop: 12, color, fontWeight: 700, alignItems: "center" }}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}

/** Раскрывающееся объяснение правил.
 *
 *  Раньше эти два абзаца лежали прямо на карточке серым текстом, и экран
 *  читался как страница помощи. Правила нужны — но их читают один раз, а
 *  экран открывают каждый день. */
function HowItWorks({ role }: { role: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          minHeight: 44,
          padding: 0,
          background: "none",
          border: "none",
          color: "var(--link)",
          font: "inherit",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? "Свернуть" : "Как это работает"}
      </button>
      {open && (
        <div
          className="muted"
          style={{ fontSize: "var(--text-sm)", lineHeight: 1.5, marginTop: 4 }}
        >
          Смена закроется сама через 12 часов после окончания — нажимать ничего
          не нужно.{" "}
          {role === "employer"
            ? "Назовите работнику код прихода: так у него останется доказательство, что он был на месте, а у вас — что смена состоялась."
            : "Попросите у администратора код прихода: с ним заведение не сможет записать смену в неявку."}{" "}
          Если смены не было — отметьте это в меню «Что-то пошло не так»,
          комиссия за неё начислена не будет.
        </div>
      )}
    </div>
  );
}

export function MatchesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = useSession((s) => s.role);
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Одна дверь для редких действий вместо ряда одинаковых кнопок на карточке.
  // Открытая смена — id мэтча, по которому открыто меню.
  const [troubleFor, setTroubleFor] = useState<MatchModel | null>(null);
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

  function downloadAct(matchId: string) {
    const token = getToken();
    openExternal(
      `${baseURL}/matches/${matchId}/act.pdf${token ? `?token=${token}` : ""}`,
    );
  }

  // Смена закрыта, а денег нет. До этой кнопки в приложении не оставалось
  // НИ ОДНОГО хода: «Проблема — позвать оператора» жила только пока смена не
  // закрыта, а закрывается она сама через 12 часов. Человек отработал, наличные
  // не отдали — и пожаловаться некуда. Это ровно тот случай, ради которого
  // сервис и нужен, поэтому кнопка живёт две недели после смены.
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
        {role === "employer" ? "Кто выходит" : "Мои смены"}
      </h1>
      {isLoading && <SkeletonList />}
      {isError && <ErrorBox onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState
          fill
          icon={<IconTabMatches size={34} active />}
          title={role === "employer" ? "Пока никто не выходит" : "Пока нет смен"}
          text={
            role === "employer"
              ? "Здесь появятся люди, с которыми вы договорились. Позовите кого-нибудь из ленты или ответьте на отклик."
              : "Откликайтесь на смены в ленте — как только заведение ответит, здесь откроется чат."
          }
          action={<Button onClick={() => nav("/feed")}>Открыть ленту</Button>}
        />
      )}
      <div className="stagger" style={{ display: "grid", gap: 12 }}>
        {data?.map((m) => {
          const started = shiftStarted(m);
          const live = m.status === "confirmed" && !m.disputed;
          // Позвать оператора можно на любом этапе живой смены: беда бывает
          // и до неё («требуют залог за форму»). А «смена не состоялась» —
          // только после окончания, это решается внутри самой шторки.
          const hasTrouble = live || (role === "seeker" && canReportNoPay(m));
          return (
            <div key={m.id} className="card">
              {/* Настоящая кнопка, а не div с onClick: переход в чат теперь
                  доступен с клавиатуры и озвучивается скринридером. Кнопки
                  действий лежат ниже, вложенности кнопок не возникает. */}
              <button
                className="row"
                aria-label={`Открыть чат: ${counterpart(m, role)}`}
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
                <MatchAvatar
                  src={role === "employer" ? undefined : m.companyPhotoUrl}
                  initial={counterpart(m, role).charAt(0)}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className="match-name">{counterpart(m, role)}</div>
                  {/* Должность и время — одной строкой: «Бариста · завтра,
                      08:00–16:00». Без должности человек с двумя сменами в
                      один день не понимал, какая из них какая. */}
                  {(m.role || shiftWhen(m)) && (
                    <div className="muted match-when">
                      {[m.role ? STAFF_ROLE_LABELS[m.role] : "", shiftWhen(m)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </span>
                {/* Шеврон декоративный: вся строка и так кнопка. На узком
                    экране он уходит (см. .row-chevron) — это 32 точки ширины
                    для названия заведения. */}
                <span className="row-chevron" style={{ color: "var(--muted)" }}>
                  <IconChevronRight size={20} />
                </span>
              </button>

              <StatusLine m={m} role={role} />

              {!!m.shiftPay && m.shiftPay > 0 && (
                <div style={{ marginTop: 6, fontWeight: 800, fontSize: "var(--text-md)" }}>
                  {m.shiftPay.toLocaleString("ru-RU")} ₽
                  {/* Заведение не зарабатывает на смене, а платит за неё:
                      «заработано» в его списке читалось как ошибка. */}
                  {m.status === "completed"
                    ? (role === "employer" ? " выплачено" : " заработано")
                    : " за смену"}
                </div>
              )}

              {/* ГЛАВНОЕ ДЕЙСТВИЕ — ровно одно на карточку, залито цветом.
                  Раньше здесь стояли три кнопки одного веса, и глазу было не за
                  что зацепиться: «отметиться», «смена не состоялась» и «позвать
                  оператора» выглядели одинаково важными. */}

              {/* Заведение: код и закрытие смены — только когда смена началась.
                  До этого дня показывать код и кнопку «человек пришёл» незачем:
                  человек ещё не пришёл, а кнопка провоцирует нажать заранее. */}
              {live && role === "employer" && started && (
                <>
                  {m.checkinCode && !m.employerCheckedIn && (
                    <div
                      style={{
                        marginTop: 12,
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
                    <div className="muted" style={{ marginTop: 10 }}>
                      Вы подтвердили выход ✓ Смена закрыта.
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={() => mark(m.id, true)}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <IconCheck size={16} /> Подтвердить выход
                        </span>
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Работник: поле кода — тоже только в день смены. */}
              {live && role === "seeker" && started && (
                m.seekerCheckedIn ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Код принят ✓ Ваше подтверждение, что вы были на месте.
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 6 }}>
                      Код прихода — попросите у администратора на месте
                    </div>
                    {/* Поле и кнопка делят строку и оба умеют сжиматься.
                        Раньше у поля была жёсткая ширина 128, а кнопка не
                        сжималась уже своей подписи: на экране 320 строке
                        требовалось 272 точки при доступных 254 — и страница
                        уезжала вправо вместе с карточкой. */}
                    <div className="row checkin-row" style={{ gap: 8 }}>
                      <input
                        className="input"
                        inputMode="numeric"
                        aria-label="6-значный код прихода от заведения"
                        maxLength={6}
                        placeholder="000000"
                        style={{ letterSpacing: 4, fontWeight: 800 }}
                        value={codes[m.id] ?? ""}
                        onChange={(e) =>
                          setCodes((c) => ({ ...c, [m.id]: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                      <Button
                        block={false}
                        disabled={(codes[m.id] ?? "").length < 6}
                        onClick={() => doCheckin(m.id)}
                      >
                        Отметиться
                      </Button>
                    </div>
                  </div>
                )
              )}

              {/* До дня смены делать нечего — так и говорим, вместо кнопок. */}
              {live && !started && (
                <div className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)" }}>
                  Ничего делать не нужно — приходите к началу смены.
                </div>
              )}

              {/* Акт — только по закрытой смене: это документ о ВЫПОЛНЕННОЙ
                  работе, и по незакрытой сервер отвечает отказом. */}
              {role === "seeker" && m.status === "completed" && (
                <div style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={() => downloadAct(m.id)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <IconDoc size={17} /> Скачать акт (PDF)
                    </span>
                  </Button>
                </div>
              )}

              {/* Смена закрыта — сразу просим оценку: момент наивысшей эмоции,
                  отзывов собирается больше. */}
              {m.checkedIn && <ReviewStars matchId={m.id} />}

              {live && <HowItWorks role={role} />}

              {/* Одна дверь для всего редкого: «смена не состоялась», спор,
                  «мне не заплатили». Раньше это были три отдельные кнопки на
                  карточке, каждая шириной во весь экран. */}
              {hasTrouble && (
                <button
                  onClick={() => setTroubleFor(m)}
                  style={{
                    marginTop: 6,
                    minHeight: 44,
                    padding: 0,
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    font: "inherit",
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Что-то пошло не так
                </button>
              )}
            </div>
          );
        })}
      </div>

      {troubleFor && (
        <Sheet title="Что-то пошло не так" onClose={() => setTroubleFor(null)}>
          <div style={{ display: "grid", gap: 10 }}>
            {/* Только после окончания смены: заявить «не состоялась» раньше —
                значит отправить человека работать по отменённой смене. До
                начала для отказа есть отмена в чате. */}
            {troubleFor.status === "confirmed" && !troubleFor.disputed && shiftEnded(troubleFor) && (
              <Button
                variant="secondary"
                onClick={() => {
                  const id = troubleFor.id;
                  setTroubleFor(null);
                  doNotHeld(id);
                }}
              >
                Смена не состоялась
              </Button>
            )}
            {troubleFor.status === "confirmed" && !troubleFor.disputed && (
              <Button
                variant="secondary"
                onClick={() => {
                  const id = troubleFor.id;
                  setTroubleFor(null);
                  doDispute(id);
                }}
              >
                Позвать оператора
              </Button>
            )}
            {role === "seeker" && canReportNoPay(troubleFor) && (
              <Button
                variant="danger"
                onClick={() => {
                  const id = troubleFor.id;
                  setTroubleFor(null);
                  doNotPaid(id);
                }}
              >
                Мне не заплатили за смену
              </Button>
            )}
            <div className="muted" style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
              Оператор разбирает спор по переписке и коду прихода. Если смены не
              было вовсе — отметьте это, и комиссия за неё начислена не будет.
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
