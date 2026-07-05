import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  fetchAdminOverview,
  fetchEntitlements,
  fetchMe,
  fetchMyCommission,
  fetchReferral,
  setAvailability,
  verifyEmployer,
  type Me,
  type VerifyResult,
} from "@/api/endpoints";
import { share, haptic } from "@/telegram/sdk";
import {
  IconBolt,
  IconFire,
  IconGift,
  IconEdit,
  IconHelp,
  IconShield,
  IconStore,
  IconBriefcase,
  IconCheck,
  IconBookmark,
} from "@/components/Icons";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";

function CommissionCard() {
  const { data: bill } = useQuery({
    queryKey: ["my-commission"],
    queryFn: fetchMyCommission,
  });
  if (!bill) return null;
  const due = bill.pendingRub > 0;
  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        ...(bill.overdue
          ? { border: "1.5px solid var(--dislike)" }
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
          ? `За ${bill.pendingShifts} закрытых смен. Оплата по счёту или СБП — ` +
            `реквизиты пришлёт оператор. Срок: ${bill.dueDays} дней.`
          : "Начисляется только за фактически закрытые смены. Сейчас к оплате: 0 ₽."}
      </div>
      {bill.overdue && (
        <div style={{ marginTop: 8, fontSize: 14, color: "var(--dislike)", fontWeight: 700 }}>
          Счёт просрочен — публикация новых смен приостановлена до оплаты.
          Напишите в поддержку, если уже оплатили.
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
      <b>Подтвердить компанию (DaData)</b>
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
                <span style={{ color: "var(--super)", display: "inline-flex", verticalAlign: "-3px", marginRight: 4 }}>
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

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

// «Готов выйти сегодня» — тумблер доступности. Заведения со срочной сменой
// видят такого человека первым в ленте кандидатов.
function AvailabilityCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

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
        background: on ? "rgba(165,28,48,.06)" : undefined,
      }}
    >
      <span style={{ flex: 1 }}>
        <b style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {on && <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconBolt size={15} /></span>}
          {on ? "Готов выйти сегодня" : "Готов выйти сегодня?"}
        </b>
        <div className="muted">
          {on
            ? "Вы наверху ленты — заведения зовут вас на срочные смены первыми"
            : "Включите — и срочные смены найдут вас быстрее"}
        </div>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Готов выйти сегодня"
        disabled={busy}
        onClick={toggle}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          background: on ? "var(--gold)" : "var(--border)",
          position: "relative",
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 25 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

// Доход через сервис — мотивация деньгами, а не «зашёл N дней подряд».
function EarningsCard({ me }: { me: Me }) {
  const nav = useNavigate();
  const earned = me.earnedRub ?? 0;
  const shifts = me.shiftsDone ?? 0;
  if (!earned && !shifts) return null;
  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        background: "linear-gradient(135deg, var(--crimson-dark), var(--super))",
        color: "#fff",
        border: "none",
      }}
    >
      <div style={{ opacity: 0.9, fontSize: 14 }}>Заработано через StaffSwipe</div>
      <div style={{ fontWeight: 800, fontSize: 28, marginTop: 2 }}>
        {earned.toLocaleString("ru-RU")} ₽
      </div>
      <div style={{ opacity: 0.92, fontSize: 14, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
        {shifts} {shifts === 1 ? "смена закрыта" : "смен закрыто"} · так держать
        <IconFire size={13} />
      </div>
      <button
        onClick={() => nav("/share")}
        style={{
          marginTop: 12,
          width: "100%",
          minHeight: 44,
          borderRadius: 12,
          border: "1.5px solid rgba(255,255,255,.7)",
          background: "rgba(255,255,255,.16)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        Поделиться в сторис
      </button>
    </div>
  );
}

// Доступность: крупные кнопки и текст. Состояние — на <body data-large>,
// сохраняется в localStorage и применяется при старте (main.tsx).
// Цель заработка + кольцо прогресса (психология незавершённого действия —
// люди возвращаются «дозакрыть кольцо», как в Apple Watch). Цель — локально.
const GOAL_PRESETS = [20000, 30000, 50000, 100000];

function GoalCard({ earned }: { earned: number }) {
  const [goal, setGoal] = useState(
    () => Number(localStorage.getItem("ss_goal")) || 30000,
  );
  const [editing, setEditing] = useState(false);
  const pct = Math.max(0, Math.min(1, goal > 0 ? earned / goal : 0));
  const R = 52;
  const C = 2 * Math.PI * R;
  const left = Math.max(0, goal - earned);

  function pick(g: number) {
    setGoal(g);
    localStorage.setItem("ss_goal", String(g));
    setEditing(false);
    haptic("select");
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <svg width="124" height="124" viewBox="0 0 124 124" style={{ flex: "none" }}>
          <circle cx="62" cy="62" r={R} fill="none" stroke="var(--border)" strokeWidth="11" />
          <circle
            cx="62" cy="62" r={R} fill="none"
            stroke="var(--gold)" strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            transform="rotate(-90 62 62)"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
          <text x="62" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">
            {Math.round(pct * 100)}%
          </text>
          <text x="62" y="80" textAnchor="middle" fontSize="12" fill="var(--muted)">
            цель
          </text>
        </svg>
        <span style={{ flex: 1 }}>
          <b>Цель на месяц: {goal.toLocaleString("ru-RU")} ₽</b>
          <div className="muted" style={{ marginTop: 4 }}>
            {left > 0
              ? `Осталось ${left.toLocaleString("ru-RU")} ₽ — лови ещё смены`
              : "Цель достигнута! 🔥 Поставь новую"}
          </div>
          <button
            onClick={() => setEditing((v) => !v)}
            style={{ marginTop: 8, background: "none", border: "none", color: "var(--gold)", fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            Изменить цель
          </button>
        </span>
      </div>
      {editing && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {GOAL_PRESETS.map((g) => (
            <button
              key={g}
              className="tag"
              style={{
                cursor: "pointer",
                background: goal === g ? "var(--gold)" : "transparent",
                color: goal === g ? "#fff" : "var(--text)",
                borderColor: goal === g ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => pick(g)}
            >
              {g.toLocaleString("ru-RU")} ₽
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const { data: ent } = useQuery({
    queryKey: ["entitlements"],
    queryFn: fetchEntitlements,
  });
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
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 className="h1" style={{ margin: 0 }}>Профиль</h1>
        <span className="spacer" />
        <button
          className="tab"
          style={{ flex: "none", width: "auto", color: "var(--muted)" }}
          onClick={() => {
            logout();
            nav("/onboarding", { replace: true });
          }}
        >
          Выйти
        </button>
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
            {me ? `★ ${me.rating.toFixed(1)}` : "—"}
            {me?.tgUsername ? ` · @${me.tgUsername}` : ""}
            {me?.shiftsDone ? ` · ${me.shiftsDone} смен` : ""}
          </div>
        </span>
      </div>

      {me && <EarningsCard me={me} />}

      {role === "seeker" && me && (
        <ProfileMeter pct={me.profileCompletion ?? 100} />
      )}

      {role === "seeker" && me && <GoalCard earned={me.earnedRub ?? 0} />}

      {role === "seeker" && (
        <AvailabilityCard initial={me?.availableToday ?? false} />
      )}

      {!!me?.incomingLikes && me.incomingLikes > 0 && (
        <div
          className="card"
          onClick={() => nav(role === "seeker" ? "/invites" : "/feed")}
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
              ? "столько откликов на твои вакансии — открой ленту"
              : "нажми, чтобы увидеть кто зовёт, и ответить в один тап"}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <b>Тариф: {PLAN_LABEL[ent?.plan ?? "free"]}</b>
          <span className="spacer" />
          <button className="btn ghost" style={{ width: "auto", padding: "8px 14px" }} onClick={() => nav("/pricing")}>
            Улучшить
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <IconBolt size={14} /> Супер-лайки: {ent?.superlikeBalance ?? 0}
          <span style={{ opacity: 0.5 }}>·</span>
          <IconFire size={14} /> Boost: {ent?.boostBalance ?? 0}
        </div>
      </div>

      {role === "employer" && <CommissionCard />}

      {role === "employer" && <EmployerVerify />}

      <div className="card" style={{ marginBottom: 16 }}>
        <b>Пригласить друзей</b>
        <div className="muted" style={{ margin: "6px 0 12px" }}>
          За каждого по вашей ссылке — {ref?.bonusSuperlikes ?? 3} супер-лайка.
          Уже пришло: {ref?.invited ?? 0}.
        </div>
        <Button onClick={invite}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconGift size={18} /> Поделиться приглашением
          </span>
        </Button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Button variant="secondary" onClick={() => nav("/settings")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconEdit size={18} /> Настройки — тема, крупный режим, звук
          </span>
        </Button>
      </div>

      {role === "seeker" && (
        <div style={{ marginBottom: 10 }}>
          <Button variant="secondary" onClick={() => nav("/favorites")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconBookmark size={18} /> Избранные смены
            </span>
          </Button>
        </div>
      )}

      <Button variant="secondary" onClick={() => nav("/profile/edit")}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <IconEdit size={18} /> Редактировать профиль
        </span>
      </Button>

      <div style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => nav("/support")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconHelp size={18} /> Помощь и поддержка
          </span>
        </Button>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 10 }}>
          <Button variant="ghost" onClick={() => nav("/admin")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconShield size={18} /> Админ-панель
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
