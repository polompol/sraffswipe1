import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  fetchAdminOverview,
  fetchEntitlements,
  fetchMe,
  fetchReferral,
  verifyEmployer,
  type VerifyResult,
} from "@/api/endpoints";
import { share, haptic } from "@/telegram/sdk";
import { applyTheme, currentTheme } from "@/lib/theme";
import { Button } from "@/components/Button";

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
              {res.verified ? "✅ Проверен: " : "🔎 "}
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
        <span style={{ fontSize: 48 }}>{role === "employer" ? "🏪" : "🙂"}</span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>
            {me?.name ?? (role === "employer" ? "Моё заведение" : "Профиль")}
          </div>
          <div className="muted">
            {me ? `★ ${me.rating.toFixed(1)}` : "—"}
            {me?.tgUsername ? ` · @${me.tgUsername}` : ""}
            {me?.streak ? ` · 🔥 ${me.streak} дн. подряд` : ""}
          </div>
        </span>
      </div>

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
          <b style={{ fontSize: 17 }}>
            ❤️ Тебя хотят: {me.incomingLikes}
          </b>
          <div style={{ opacity: 0.92, fontSize: 13, marginTop: 2 }}>
            {role === "employer"
              ? "столько откликов на твои вакансии — листай ленту"
              : "столько заведений лайкнули тебя — листай ленту и отвечай"}
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
        <div className="muted" style={{ marginTop: 8 }}>
          ⚡ Супер-лайки: {ent?.superlikeBalance ?? 0} · 🔥 Boost: {ent?.boostBalance ?? 0}
        </div>
      </div>

      {role === "employer" && <EmployerVerify />}

      <div className="card" style={{ marginBottom: 16 }}>
        <b>Пригласить друзей</b>
        <div className="muted" style={{ margin: "6px 0 12px" }}>
          За каждого по вашей ссылке — {ref?.bonusSuperlikes ?? 3} супер-лайка.
          Уже пришло: {ref?.invited ?? 0}.
        </div>
        <Button onClick={invite}>🎁 Поделиться приглашением</Button>
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

      <Button variant="secondary" onClick={() => nav("/profile/edit")}>
        ✏️ Редактировать профиль
      </Button>

      <div style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => nav("/support")}>
          ❓ Помощь и поддержка
        </Button>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 10 }}>
          <Button variant="ghost" onClick={() => nav("/admin")}>
            🛡 Админ-панель
          </Button>
        </div>
      )}
    </div>
  );
}
