import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/types/domain";
import { useSession } from "@/store/session";
import { authTelegram, track } from "@/api/endpoints";
import { rawInitData, haptic } from "@/telegram/sdk";

export function RolePage() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [busy, setBusy] = useState<AppRole | null>(null);
  const [consent, setConsent] = useState(
    localStorage.getItem("ss_consent") === "1",
  );

  async function choose(role: AppRole) {
    if (!consent) return;
    setBusy(role);
    haptic("light");
    try {
      const res = await authTelegram(rawInitData(), role);
      setAuth(res.accessToken, res.role, res.userId);
      nav("/feed", { replace: true });
    } catch {
      setBusy(null);
    }
  }

  function acceptConsent(v: boolean) {
    setConsent(v);
    if (v) {
      localStorage.setItem("ss_consent", "1");
      track("consent");
    } else {
      localStorage.removeItem("ss_consent");
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginTop: 24 }}>Кто вы?</h1>
        <p className="muted">Это можно будет поменять позже</p>

        <label
          className="card row"
          style={{ marginTop: 16, gap: 10, cursor: "pointer", alignItems: "flex-start" }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => acceptConsent(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            Мне есть 18 лет. Принимаю{" "}
            <a href="https://example.com/offer" target="_blank" rel="noreferrer">оферту</a>,{" "}
            <a href="https://example.com/privacy" target="_blank" rel="noreferrer">политику обработки ПДн (152-ФЗ)</a>{" "}
            и даю согласие на обработку персональных данных.
          </span>
        </label>

        <div style={{ marginTop: 16, display: "grid", gap: 16, opacity: consent ? 1 : 0.5, pointerEvents: consent ? "auto" : "none" }}>
          <RoleCard
            emoji="💼"
            grad="linear-gradient(135deg,#b9485a,#9e1b32)"
            title="Я ищу подработку"
            sub="Официант, бариста, кальянщик, флорист, курьер"
            loading={busy === "seeker"}
            onClick={() => choose("seeker")}
          />
          <RoleCard
            emoji="🏪"
            grad="linear-gradient(135deg,#9e1b32,#7c1526)"
            title="Я ищу сотрудников"
            sub="Кафе, ресторан, бар, кофейня, кальянная"
            loading={busy === "employer"}
            onClick={() => choose("employer")}
          />
        </div>
      </div>
    </div>
  );
}

function RoleCard(props: {
  emoji: string;
  grad: string;
  title: string;
  sub: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="card row"
      style={{ textAlign: "left", gap: 16, cursor: "pointer" }}
      onClick={props.onClick}
      disabled={props.loading}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: props.grad,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          flex: "none",
        }}
      >
        {props.emoji}
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{props.title}</div>
        <div className="muted">{props.sub}</div>
      </span>
      <span style={{ color: "var(--muted)", fontSize: 24 }}>
        {props.loading ? "…" : "›"}
      </span>
    </button>
  );
}
