import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/types/domain";
import { useSession } from "@/store/session";
import { authTelegram } from "@/api/endpoints";
import { rawInitData, haptic } from "@/telegram/sdk";

export function RolePage() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [busy, setBusy] = useState<AppRole | null>(null);

  async function choose(role: AppRole) {
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

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginTop: 24 }}>Кто вы?</h1>
        <p className="muted">Это можно будет поменять позже</p>

        <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
          <RoleCard
            emoji="💼"
            grad="linear-gradient(135deg,#d9a441,#b07a47)"
            title="Я ищу подработку"
            sub="Официант, бариста, повар, бармен, хостес"
            loading={busy === "seeker"}
            onClick={() => choose("seeker")}
          />
          <RoleCard
            emoji="🏪"
            grad="linear-gradient(135deg,#b07a47,#3b2a20)"
            title="Я ищу сотрудников"
            sub="Кафе, ресторан, бар, кофейня"
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
