import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  billingDocUrl,
  fetchAdminOverview,
  fetchMe,
  fetchMyCommission,
  fetchReferral,
  setAvailability,
  type VerifyResult,
  verifyEmployer,
  walletTopup,
} from "@/api/endpoints";
import { share, haptic, confirmAction } from "@/telegram/sdk";
import {
  IconBolt,
  IconGift,
  IconEdit,
  IconHelp,
  IconShield,
  IconStore,
  IconBriefcase,
  IconCheck,
  IconBookmark,
  IconChevronRight,
} from "@/components/Icons";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { PILOT_MODE } from "@/lib/flags";

function CommissionCard() {
  const { data: bill } = useQuery({
    queryKey: ["my-commission"],
    queryFn: fetchMyCommission,
  });
  const [busy, setBusy] = useState(false);
  if (!bill) return null;
  const due = bill.pendingRub > 0;

  async function topup(amount: number) {
    setBusy(true);
    try {
      const { url } = await walletTopup(amount);
      haptic("light");
      window.open(url, "_blank");
    } catch {
      haptic("error");
      toast("Не удалось открыть оплату", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        ...(bill.overdue
          ? { border: "1.5px solid var(--danger)" }
          : null),
      }}
    >
      <div className="row">
        <b>Комиссия сервиса · {bill.pct}%</b>
        <span className="spacer" />
        <b style={{ color: due ? "var(--gold)" : "var(--muted)" }}>
          {bill.pendingRub.toLocaleString("ru-RU")} ₽
        </b>
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 14 }}>
        {due
          ? `Смен к оплате: ${bill.pendingShifts}. Спишется с баланса ` +
            `автоматически — пополните его картой ниже.`
          : "Начисляется только за фактически закрытые смены. Сейчас к оплате: 0 ₽."}
      </div>
      {bill.overdue && (
        <div style={{ marginTop: 8, fontSize: 14, color: "var(--danger)", fontWeight: 700 }}>
          Баланс закончился — публикация новых смен на паузе. Пополните
          картой ниже, и всё сразу возобновится.
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 14 }}>Баланс (аванс)</span>
        <span className="spacer" />
        <b>{bill.balanceRub.toLocaleString("ru-RU")} ₽</b>
      </div>
      <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        Комиссия списывается с баланса сама — без счетов, реквизитов
        и переписки. Всё внутри приложения.
      </div>
      {/* Документы для бухгалтерии. Ресторан-юрлицо не проведёт оплату по
          безналу без счёта с реквизитами и не поставит расход без акта —
          «оплатите картой» для него не ответ. Кнопки показываем только когда
          есть за что платить. */}
      {due && (
        <>
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Документы для бухгалтерии
          </div>
          <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
            {([["invoice", "Счёт на оплату"], ["act", "Акт услуг"]] as const).map(
              ([kind, label]) => (
                <button
                  key={kind}
                  className="tag"
                  style={{ flex: 1, minWidth: 120, cursor: "pointer" }}
                  onClick={() => {
                    haptic("light");
                    window.open(billingDocUrl(kind), "_blank");
                  }}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </>
      )}

      {bill.topupAvailable ? (
        <>
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Пополнить баланс
          </div>
          {/* На чипе оставляем только сумму: «Пополнить 1 000 ₽» в трети
              ширины экрана переносилось на 3-4 строки и ломало ряд. */}
          <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
            {[1000, 3000, 5000].map((a) => (
              <button
                key={a}
                className="tag"
                disabled={busy}
                style={{
                  flex: 1,
                  minWidth: 88,
                  cursor: "pointer",
                  borderColor: "var(--gold)",
                  color: "var(--gold)",
                }}
                onClick={() => topup(a)}
              >
                {a.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Оплата картой внутри приложения подключается к запуску — тогда
          баланс можно будет пополнить в один тап.
        </div>
      )}
    </div>
  );
}

function EmployerVerify() {
  const [inn, setInn] = useState("");
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setRes(await verifyEmployer(inn));
      haptic("success");
    } catch {
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b>Подтвердить компанию по ИНН</b>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <input
          className="input"
          inputMode="numeric"
          placeholder="ИНН"
          value={inn}
          onChange={(e) => setInn(e.target.value)}
        />
        <button className="btn" style={{ width: "auto", padding: "0 16px", height: 46 }} disabled={busy || inn.length < 10} onClick={run}>
          {busy ? "…" : "Проверить"}
        </button>
      </div>
      {res && (
        <div className="muted" style={{ marginTop: 10 }}>
          {res.found ? (
            <>
              {res.verified && (
                <span style={{ color: "var(--super-text)", display: "inline-flex", verticalAlign: "-3px", marginRight: 4 }}>
                  <IconCheck size={15} />
                </span>
              )}
              <b style={{ color: "var(--text)" }}>{res.name}</b>
              {res.ogrn && <> · ОГРН {res.ogrn}</>}
              {res.address && <div>{res.address}</div>}
            </>
          ) : null}
          {res.hint && <div style={{ marginTop: 4 }}>{res.hint}</div>}
        </div>
      )}
    </div>
  );
}


// «Готов выйти сегодня» — тумблер доступности. Заведения со срочной сменой
// видят такого человека первым в ленте кандидатов.
function AvailabilityCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  // Профиль приходит с сервера уже после первой отрисовки, и без этой
  // синхронизации тумблер навсегда оставался выключенным: человек включал
  // доступность, возвращался в профиль — и видел «выключено».
  useEffect(() => setOn(initial), [initial]);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    haptic("select");
    try {
      await setAvailability(next);
      toast(next ? "Вы готовы выйти сегодня" : "Статус снят", "success");
    } catch {
      setOn(!next); // откат при ошибке
      toast("Не удалось сохранить", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card row"
      style={{
        marginBottom: 16,
        border: on ? "1px solid var(--gold)" : undefined,
        // --gold-tint: в тёмной теме прежние 6% багрового на тёмной карточке
        // были неотличимы от выключенного состояния.
        background: on ? "var(--gold-tint)" : undefined,
      }}
    >
      <span style={{ flex: 1 }}>
        <b style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {on && <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconBolt size={15} /></span>}
          {on ? "Готов выйти сегодня" : "Готов выйти сегодня?"}
        </b>
        <div className="muted">
          {on
            ? "Ты наверху ленты — на срочные смены зовут первым"
            : "Включите — и срочные смены найдут вас быстрее"}
        </div>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Готов выйти сегодня"
        disabled={busy}
        onClick={toggle}
        // Дорожка визуально 52×30, высота кнопки 44px — минимальная зона тапа.
        style={{
          width: 52,
          height: 44,
          padding: 0,
          borderRadius: 999,
          border: "none",
          background: "none",
          cursor: "pointer",
          position: "relative",
          flex: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 7,
            left: 0,
            width: 52,
            height: 30,
            borderRadius: 999,
            transition: "background 0.2s",
            background: on ? "var(--gold)" : "var(--border-strong)",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            left: on ? 25 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface)",
            boxShadow: "0 1px 3px rgba(60,20,25,.35)",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

// Доступность: крупные кнопки и текст. Состояние — на <body data-large>,
// сохраняется в localStorage и применяется при старте (main.tsx).
// Заполненность анкеты. С фото и опытом зовут заметно чаще — показываем
// прогресс и мягко подталкиваем дополнить недостающее.
function ProfileMeter({ pct }: { pct: number }) {
  const nav = useNavigate();
  if (pct >= 100) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <b>Профиль готов на {pct}%</b>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>
          {pct >= 80 ? "почти всё" : "заполни до конца"}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--grad-brand)",
            transition: "width 0.8s ease",
          }}
        />
      </div>
      <div className="muted" style={{ margin: "10px 0 12px" }}>
        Анкеты с фото и опытом зовут на смены заметно чаще.
      </div>
      <Button variant="secondary" onClick={() => nav("/profile/edit")}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <IconEdit size={18} /> Дополнить профиль
        </span>
      </Button>
    </div>
  );
}

export function ProfilePage() {
  const nav = useNavigate();
  const { role, logout } = useSession();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: ref } = useQuery({
    queryKey: ["referral"],
    queryFn: fetchReferral,
  });
  // Ссылка на админ-панель появляется только у админа (проба эндпоинта).
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchAdminOverview().then(() => true).catch(() => false),
    retry: false,
  });

  function invite() {
    if (!ref) return;
    haptic("light");
    share(ref.link, "Лови смены в общепите рядом — StaffSwipe 🔥");
  }

  return (
    <div className="page">
      {/* «Выйти» переехал в конец списка внизу: деструктивное действие не
          должно быть самым заметным элементом шапки. */}
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 className="h1" style={{ margin: 0 }}>Профиль</h1>
      </div>

      <div className="card row" style={{ gap: 14, marginBottom: 16 }}>
        <span style={{
          width: 56, height: 56, borderRadius: 16, flex: "none",
          background: "var(--grad-brand)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {role === "employer" ? <IconStore size={30} /> : <IconBriefcase size={30} />}
        </span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>
            {me?.name ?? (role === "employer" ? "Моё заведение" : "Профиль")}
          </div>
          <div className="muted">
            {me ? (me.rating > 0 ? `★ ${me.rating.toFixed(1)}` : "Новичок") : "—"}
            {me?.tgUsername ? ` · @${me.tgUsername}` : ""}
            {me?.shiftsDone ? ` · ${me.shiftsDone} смен` : ""}
          </div>
        </span>
      </div>

      {role === "employer" && me && !!me.shiftsDone && me.shiftsDone > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row">
            <b>Смен проведено</b>
            <span className="spacer" />
            <b style={{ color: "var(--gold)", fontSize: 20 }}>{me.shiftsDone}</b>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Закрытые смены формируют рейтинг и знак «Платит вовремя».
          </div>
        </div>
      )}

      {role === "seeker" && me && (
        <ProfileMeter pct={me.profileCompletion ?? 100} />
      )}

      {role === "seeker" && (
        <AvailabilityCard initial={me?.availableToday ?? false} />
      )}

      {!!me?.incomingLikes && me.incomingLikes > 0 && (
        <div
          className="card"
          onClick={() => nav(role === "seeker" ? "/invites" : "/applicants")}
          style={{
            marginBottom: 16,
            background: "linear-gradient(135deg, var(--gold-soft), var(--gold))",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          <b style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 7 }}>
            <IconBolt size={18} />
            {role === "employer"
              ? `Новых откликов: ${me.incomingLikes}`
              : `Тебя зовут на смены: ${me.incomingLikes}`}
          </b>
          <div style={{ opacity: 0.92, fontSize: 14, marginTop: 2 }}>
            {role === "employer"
              ? "нажмите, чтобы увидеть, кто именно, и ответить"
              : "нажми, чтобы увидеть кто зовёт, и ответить в один тап"}
          </div>
        </div>
      )}

      {role === "employer" && <CommissionCard />}

      {role === "employer" && !PILOT_MODE && <EmployerVerify />}

      <div className="card" style={{ marginBottom: 16 }}>
        <b>{role === "employer" ? "Пригласить коллег-рестораторов" : "Пригласить друзей"}</b>
        <div className="muted" style={{ margin: "6px 0 12px" }}>
          {role === "employer"
            ? "Чем больше рядом заведений и людей, тем быстрее закрываются смены у всех."
            : "Чем больше рядом людей, тем чаще заведения ищут именно здесь."}
          {" "}Уже пришло по вашей ссылке: {ref?.invited ?? 0}.
        </div>
        <Button onClick={invite}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconGift size={18} /> Поделиться приглашением
          </span>
        </Button>
      </div>

      {/* Раньше здесь стоял столбик из 4-5 одинаковых полноширинных кнопок —
          читалось как отладочное меню. Теперь это один список со строками. */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          icon={<IconEdit size={18} />}
          label="Редактировать профиль"
          onClick={() => nav("/profile/edit")}
        />
        {role === "seeker" && (
          <MenuRow
            icon={<IconBookmark size={18} />}
            label="Избранные смены"
            onClick={() => nav("/favorites")}
          />
        )}
        <MenuRow
          icon={<IconShield size={18} />}
          label="Настройки"
          onClick={() => nav("/settings")}
        />
        <MenuRow
          icon={<IconHelp size={18} />}
          label="Помощь и поддержка"
          onClick={() => nav("/support")}
        />
        {isAdmin && (
          <MenuRow
            icon={<IconShield size={18} />}
            label="Админ-панель"
            onClick={() => nav("/admin")}
          />
        )}
        <MenuRow
          label="Выйти из аккаунта"
          danger
          last
          onClick={async () => {
            // Подтверждение: случайно вылететь из аккаунта неприятно.
            if (!(await confirmAction("Выйти из аккаунта?", "Выйти"))) return;
            logout();
            nav("/onboarding", { replace: true });
          }}
        />
      </div>
    </div>
  );
}

/** Строка списка в профиле: иконка — подпись — шеврон. Высота ≥52px. */
function MenuRow({
  icon,
  label,
  onClick,
  danger = false,
  last = false,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        minHeight: 54,
        padding: "0 18px",
        background: "none",
        border: "none",
        borderBottom: last ? "none" : "1px solid var(--border)",
        color: danger ? "var(--danger)" : "var(--text)",
        fontSize: 16,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {/* Плейсхолдер держит колонку иконок: без него строка без иконки
          съезжала влево относительно остальных. */}
      <span style={{ display: "inline-flex", width: 18, color: "var(--gold)" }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {/* Шеврон = «откроется экран». У «Выйти» экрана нет — там подтверждение. */}
      {!danger && <IconChevronRight size={18} />}
    </button>
  );
}
