import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  fetchAdminOverview,
  fetchEntitlements,
  fetchMe,
  fetchReferral,
  setAvailability,
  submitVerifyDoc,
  verifyEmployer,
  type Me,
  type VerifyResult,
} from "@/api/endpoints";
import { PhotoUpload } from "@/components/PhotoUpload";
import { share, haptic } from "@/telegram/sdk";
import { applyTheme, currentTheme } from "@/lib/theme";
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
      <div style={{ opacity: 0.9, fontSize: 13 }}>Заработано через StaffSwipe</div>
      <div style={{ fontWeight: 800, fontSize: 28, marginTop: 2 }}>
        {earned.toLocaleString("ru-RU")} ₽
      </div>
      <div style={{ opacity: 0.92, fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
        {shifts} {shifts === 1 ? "смена закрыта" : "смен закрыто"} · так держать
        <IconFire size={13} />
      </div>
    </div>
  );
}

// Доступность: крупные кнопки и текст. Состояние — на <body data-large>,
// сохраняется в localStorage и применяется при старте (main.tsx).
function LargeModeCard() {
  const [on, setOn] = useState(() => document.body.dataset.large === "1");
  function toggle() {
    const next = !on;
    setOn(next);
    haptic("select");
    if (next) {
      document.body.dataset.large = "1";
      localStorage.setItem("ss_large", "1");
    } else {
      delete document.body.dataset.large;
      localStorage.removeItem("ss_large");
    }
  }
  return (
    <div className="card row" style={{ marginBottom: 16 }}>
      <span style={{ flex: 1 }}>
        <b>Крупные кнопки и текст</b>
        <div className="muted">Удобнее, если мелкое плохо видно</div>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Крупные кнопки и текст"
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

// Верификация исполнителя: загрузка медкнижки → «на проверке» → «проверено».
// Проверенных зовут чаще — главный знак доверия для соискателя.
function VerifyCard({ status }: { status?: string }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");

  if (status === "verified") {
    return (
      <div className="card row" style={{ marginBottom: 16, gap: 10, borderColor: "var(--super)" }}>
        <span style={{ color: "var(--super)", display: "inline-flex" }}><IconShield size={22} /></span>
        <span style={{ flex: 1 }}>
          <b>Медкнижка проверена</b>
          <div className="muted">Вы — проверенный исполнитель</div>
        </span>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <b>Медкнижка на проверке</b>
        <div className="muted">Обычно до 24 часов — пришлём результат</div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconShield size={18} /> Подтвердите медкнижку
      </b>
      <div className="muted" style={{ margin: "6px 0 10px" }}>
        Проверенных исполнителей зовут чаще. Загрузите фото медкнижки — мы проверим.
      </div>
      <PhotoUpload
        label="Фото медкнижки"
        value={url}
        onChange={async (u) => {
          setUrl(u);
          try {
            await submitVerifyDoc(u);
            qc.invalidateQueries({ queryKey: ["me"] });
            toast("Отправлено на проверку", "success");
          } catch {
            toast("Не удалось отправить", "error");
          }
        }}
      />
    </div>
  );
}

export function ProfilePage() {
  const nav = useNavigate();
  const { role, logout } = useSession();
  const [theme, setTheme] = useState(currentTheme());
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

      {role === "seeker" && (
        <AvailabilityCard initial={me?.availableToday ?? false} />
      )}

      {role === "seeker" && <VerifyCard status={me?.verifyStatus} />}

      {!!me?.incomingLikes && me.incomingLikes > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            background: "linear-gradient(135deg, var(--gold-soft), var(--gold))",
            color: "#fff",
            border: "none",
          }}
        >
          <b style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 7 }}>
            <IconBolt size={18} />
            {role === "employer"
              ? `Новых откликов: ${me.incomingLikes}`
              : `Тебя зовут на смены: ${me.incomingLikes}`}
          </b>
          <div style={{ opacity: 0.92, fontSize: 13, marginTop: 2 }}>
            {role === "employer"
              ? "столько откликов на твои вакансии — открой ленту"
              : "столько заведений готовы позвать — открой ленту и ответь"}
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

      <div className="card row" style={{ marginBottom: 16 }}>
        <span style={{ flex: 1 }}>
          <b>Тёмная тема</b>
          <div className="muted">Удобно листать ночью</div>
        </span>
        <button
          role="switch"
          aria-checked={theme === "dark"}
          aria-label="Тёмная тема"
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            applyTheme(next);
            setTheme(next);
            haptic("select");
          }}
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: theme === "dark" ? "var(--gold)" : "var(--border)",
            position: "relative",
            transition: "background 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: theme === "dark" ? 25 : 3,
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
            }}
          />
        </button>
      </div>

      <LargeModeCard />

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
