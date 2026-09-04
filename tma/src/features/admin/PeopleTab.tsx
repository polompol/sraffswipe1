/** Вкладка «Люди»: поиск, баланс, бейджи, перенос аккаунта и удаление данных.
 *
 *  Самая опасная вкладка панели: отсюда двигаются деньги и стираются данные
 *  по заявлению (152-ФЗ). Поэтому необратимое — в два тапа, а каждая кнопка
 *  обязана сказать вслух, чем закончилось.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCreditWallet,
  adminEraseAccount,
  adminLogoutAll,
  adminRefundWallet,
  adminRelink,
  adminSearchUsers,
  adminVerifyEmployer,
  fetchBlocked,
  fetchCancelStats,
  unblockUser,
  unblockVacancy,
} from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { confirmAction, haptic } from "@/telegram/sdk";
import { apiError } from "@/lib/errors";
import { Empty, Section, act, useAdminRefresh } from "./shared";

export function PeopleTab() {
  const qc = useQueryClient();
  const refresh = useAdminRefresh();
  const [userQ, setUserQ] = useState("");
  // Зачисление произвольной суммы: перевод по СБП приходит не круглым числом.
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [creditSum, setCreditSum] = useState("");
  // Возврат с баланса: ошиблись при зачислении или заведение уходит.
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundSum, setRefundSum] = useState("");
  // Удаление данных по заявлению (152-ФЗ). Необратимо, поэтому в два тапа:
  // первый показывает предупреждение, второй выполняет.
  const [eraseFor, setEraseFor] = useState<string | null>(null);
  const [eraseBusy, setEraseBusy] = useState(false);
  // Перенос аккаунта на новый Telegram: id аккаунта → ввод нового tg_id.
  const [relinkFor, setRelinkFor] = useState<string | null>(null);
  const [relinkTgId, setRelinkTgId] = useState("");

  const users = useQuery({
    queryKey: ["admin-users", userQ],
    queryFn: () => adminSearchUsers(userQ),
  });
  const cancels = useQuery({
    queryKey: ["admin-cancels"],
    queryFn: () => fetchCancelStats(60),
  });
  const blocked = useQuery({ queryKey: ["admin-blocked"], queryFn: fetchBlocked });

  async function credit(id: string, amountRub: number) {
    const ok = await act(
      () => adminCreditWallet(id, amountRub),
      `Баланс пополнен на ${amountRub.toLocaleString("ru-RU")} ₽`,
      "Не удалось пополнить баланс",
    );
    if (ok) qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function refund(id: string) {
    const sum = Number(refundSum.trim());
    if (!sum || sum < 1) {
      toast("Введите сумму возврата", "error");
      return;
    }
    try {
      const left = await adminRefundWallet(id, sum);
      haptic("success");
      toast(`Возвращено ${sum.toLocaleString("ru-RU")} ₽, остаток ${left} ₽`, "success");
      setRefundFor(null);
      setRefundSum("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      haptic("error");
      toast(apiError(e, "Не удалось вернуть"), "error");
    }
  }

  async function toggleVerified(id: string, next: boolean) {
    if (next && !(await confirmAction(
      "Вы лично убедились, что заведение существует и работает? Работники видят этот знак до отклика.",
      "Проверено",
    ))) return;
    try {
      await adminVerifyEmployer(id, next);
      toast(next ? "Бейдж «Проверено» поставлен" : "Бейдж снят", "success");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast(apiError(e, "Не удалось изменить бейдж"), "error");
    }
  }

  // Завершить все сессии: человек потерял телефон. Не блокировка — он просто
  // откроет приложение заново и войдёт сам.
  async function logoutAll(id: string) {
    try {
      await adminLogoutAll(id);
      haptic("success");
      toast("Все сессии завершены", "success");
    } catch {
      haptic("error");
      toast("Не удалось завершить сессии", "error");
    }
  }

  async function erase(id: string) {
    setEraseBusy(true);
    try {
      const removed = await adminEraseAccount(id);
      const total = Object.values(removed).reduce((s, n) => s + n, 0);
      haptic("success");
      toast(`Данные удалены, записей затронуто: ${total}`, "success");
      setEraseFor(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      haptic("error");
      toast("Не удалось удалить — попробуйте ещё раз", "error");
    } finally {
      setEraseBusy(false);
    }
  }

  async function relink(id: string) {
    const tg = Number(relinkTgId.trim());
    if (!tg) {
      toast("Введите числовой Telegram-id (из @userinfobot)", "error");
      return;
    }
    const ok = await act(
      () => adminRelink(id, tg),
      "Аккаунт перенесён на новый Telegram",
      "Не удалось перенести аккаунт",
    );
    if (!ok) return;
    setRelinkFor(null);
    setRelinkTgId("");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function unblock(type: string, id: string) {
    const ok = await act(
      () => (type === "vacancy" ? unblockVacancy(id) : unblockUser(id)),
      "Разблокировано",
      "Не удалось разблокировать",
    );
    if (ok) refresh();
  }

  return (
    <>
      <Section
        title="Найти человека или заведение"
        hint="Поиск по имени, @нику и телефону. Отсюда же — перенос аккаунта на новый Telegram и удаление данных по заявлению."
      >
        <input
          className="input"
          style={{ width: "100%", marginBottom: 10 }}
          placeholder="Поиск: имя / @ник / телефон"
          value={userQ}
          onChange={(e) => setUserQ(e.target.value)}
        />
        <div className="stack">
          {users.data?.length === 0 && <Empty>Никого не нашли</Empty>}
          {users.data?.map((u) => (
            <div key={u.id} className="card">
              <div className="row">
                <span style={{ flex: 1 }}>
                  <b>{u.name}</b>
                  {u.verified && (
                    <span className="tag" style={{ marginLeft: 8, color: "var(--gold)", borderColor: "var(--gold)" }}>проверено</span>
                  )}
                  {u.blocked && (
                    <span className="tag" style={{ marginLeft: 8, color: "var(--crimson-dark)", borderColor: "var(--crimson-dark)" }}>бан</span>
                  )}
                  <div className="muted small">
                    {u.role === "employer" ? "заведение" : "соискатель"}
                    {u.username ? ` · @${u.username}` : ""}
                    {u.role === "employer"
                      ? ` · баланс ${u.balanceRub.toLocaleString("ru-RU")} ₽`
                      : ""}
                    {u.warnings > 0 ? ` · ⚠ ${u.warnings}` : ""}
                  </div>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                {u.role === "employer" && (
                  <>
                    {/* Именно Button, а не .tag: зачисление денег не
                        идемпотентно, и двойной тап по подтормаживающему
                        экрану клал на баланс вдвое больше. У Button
                        блокировка на время запроса встроена. */}
                    <button
                      className="tag"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setCreditFor(creditFor === u.id ? null : u.id);
                        setCreditSum("");
                      }}
                    >
                      Зачислить сумму
                    </button>
                    {[1000, 5000].map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        block={false}
                        variant="secondary"
                        onClick={() => credit(u.id, a)}
                      >
                        Баланс +{a.toLocaleString("ru-RU")} ₽
                      </Button>
                    ))}
                    <button
                      className="tag"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setRefundFor(refundFor === u.id ? null : u.id);
                        setRefundSum("");
                      }}
                    >
                      Вернуть с баланса
                    </button>
                    {/* Бейдж «Проверено» ставит человек, а не программа:
                        ИНН публичен, и «нашёлся в справочнике» доказывает
                        только умение гуглить. Раньше поставить его не мог
                        никто вообще, а приложение обещало его «после
                        оплаты верификации» — услуги, которой нет. */}
                    <button
                      className="tag"
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleVerified(u.id, !u.verified)}
                    >
                      {u.verified ? "Снять «Проверено»" : "✓ Проверено"}
                    </button>
                  </>
                )}
                <button
                  className="tag"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setRelinkFor(relinkFor === u.id ? null : u.id);
                    setRelinkTgId("");
                  }}
                >
                  ↔ Новый Telegram
                </button>
                <button
                  className="tag"
                  style={{ cursor: "pointer" }}
                  onClick={() => logoutAll(u.id)}
                >
                  Завершить сессии
                </button>
              </div>
              {/* Необратимое действие стоит отдельно от безобидных: в общем
                  ряду «Удалить данные» слишком легко нажать по инерции. */}
              <button
                className="tag"
                style={{
                  width: "100%",
                  marginTop: 8,
                  cursor: "pointer",
                  color: "var(--danger)",
                  borderColor: "var(--danger)",
                }}
                onClick={() => setEraseFor(eraseFor === u.id ? null : u.id)}
              >
                Удалить данные по заявлению
              </button>
              {creditFor === u.id && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Сколько зачислить, ₽"
                    value={creditSum}
                    onChange={(e) => setCreditSum(e.target.value.replace(/\D/g, ""))}
                  />
                  <Button
                    block={false}
                    style={{ padding: "0 14px", height: 46 }}
                    // async и await обязательны: кнопка блокируется на
                    // время запроса, только если обработчик вернул промис.
                    // Зачисление НЕ идемпотентно (см. комментарий выше) —
                    // второй тап кладёт на баланс ещё раз.
                    onClick={async () => {
                      const sum = Number(creditSum) || 0;
                      if (sum <= 0) {
                        toast("Укажите сумму", "error");
                        return;
                      }
                      await credit(u.id, sum);
                      setCreditFor(null);
                      setCreditSum("");
                    }}
                  >
                    Зачислить
                  </Button>
                </div>
              )}
              {refundFor === u.id && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Сколько вернуть, ₽"
                    value={refundSum}
                    onChange={(e) => setRefundSum(e.target.value)}
                  />
                  <Button
                    block={false}
                    style={{ padding: "0 14px", height: 46 }}
                    onClick={() => refund(u.id)}
                  >
                    Вернуть
                  </Button>
                </div>
              )}
              {eraseFor === u.id && (
                <div className="card" style={{ marginTop: 8, borderColor: "var(--danger)" }}>
                  <p className="muted" style={{ margin: "0 0 10px", fontSize: "var(--text-xs)" }}>
                    Удалить персональные данные по заявлению (152-ФЗ). Из профиля
                    исчезнет всё личное, войти в аккаунт будет нельзя.{" "}
                    <b>Отменить это нельзя.</b> Смены, отзывы и начисленная
                    комиссия останутся — это бухгалтерия.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    <Button variant="danger" loading={eraseBusy} onClick={() => erase(u.id)}>
                      Да, удалить данные
                    </Button>
                    <Button variant="ghost" onClick={() => setEraseFor(null)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
              {relinkFor === u.id && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Новый Telegram-id (@userinfobot)"
                    value={relinkTgId}
                    onChange={(e) => setRelinkTgId(e.target.value)}
                  />
                  <Button
                    block={false}
                    style={{ padding: "0 14px", height: 46 }}
                    onClick={() => relink(u.id)}
                  >
                    Перенести
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Отмены и неявки"
        hint="За последние 60 дней. Одна отмена — это жизнь. Пять поздних за месяц — уже поведение: сначала позвонить и спросить, потом предупреждение, потом блок."
      >
        {cancels.data && cancels.data.length === 0 && (
          <Empty>Никто никого не подводил — так и должно быть</Empty>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {(cancels.data ?? []).map((c) => (
            <div key={`${c.ownerId}-${c.role}`} className="card row">
              <span className="grow">
                <b>{c.name}</b>
                <div className="muted small">
                  {c.role === "employer" ? "заведение" : "работник"}
                </div>
              </span>
              <span style={{ textAlign: "right", fontSize: "var(--text-xs)" }}>
                {c.lateCancels > 0 && (
                  <div style={{ color: "var(--danger)", fontWeight: 700 }}>
                    поздних отмен: {c.lateCancels}
                  </div>
                )}
                {c.noShows > 0 && (
                  <div style={{ color: "var(--danger)", fontWeight: 700 }}>
                    неявок: {c.noShows}
                  </div>
                )}
                {/* Единственный способ не платить за договорённую смену —
                    значит он и должен быть на виду. Сервер это число
                    считает специально для оператора, а экран его молча
                    не показывал. */}
                {!!c.notHeld && c.notHeld > 0 && (
                  <div style={{ color: "var(--danger)", fontWeight: 700 }}>
                    заявил «смены не было»: {c.notHeld}
                  </div>
                )}
                {c.cancels > 0 && (
                  <div className="muted">всего отмен: {c.cancels}</div>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {blocked.data && blocked.data.length > 0 && (
        <Section title="Заблокированные">
          <div className="stack">
            {blocked.data.map((b) => (
              <div key={`${b.type}-${b.id}`} className="card row">
                <span style={{ flex: 1 }}>
                  <b>{b.info}</b>
                  <div className="muted small">
                    {b.type === "vacancy" ? "вакансия" : "пользователь"}
                  </div>
                </span>
                <Button
                  variant="ghost"
                  block={false}
                  style={{ padding: "8px 14px" }}
                  onClick={() => unblock(b.type, b.id)}
                >
                  Разблокировать
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
