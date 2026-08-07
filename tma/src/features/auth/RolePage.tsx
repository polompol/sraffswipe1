import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/types/domain";
import { useSession } from "@/store/session";
import { authTelegram, track } from "@/api/endpoints";
import { rawInitData, haptic } from "@/telegram/sdk";
import { IconBriefcase, IconStore, IconChevronRight } from "@/components/Icons";
import { OFFER_URL, PRIVACY_URL } from "@/lib/legal";
import type { ComponentType } from "react";


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
        <h1 className="h1" style={{ marginTop: 24 }}>С чего начнём?</h1>
        <p className="muted">Это можно поменять позже</p>

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
            <a href={OFFER_URL} target="_blank" rel="noreferrer">оферту</a>,{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">политику обработки ПДн (152-ФЗ)</a>{" "}
            и даю согласие на обработку персональных данных.
          </span>
        </label>

        {/* До согласия карточки выключены — раньше без единого слова, почему
            тап не срабатывает. Теперь причина написана явно. */}
        {!consent && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Отметьте согласие выше, чтобы выбрать роль
          </p>
        )}

        <div style={{ marginTop: 16, display: "grid", gap: 16, opacity: consent ? 1 : 0.55, pointerEvents: consent ? "auto" : "none" }}>
          <RoleCard
            Icon={IconBriefcase}
            grad="var(--grad-brand)"
            title="Я ищу подработку"
            sub="Официант, бариста, кальянщик, флорист, курьер"
            loading={busy === "seeker"}
            onClick={() => choose("seeker")}
          />
          <RoleCard
            Icon={IconStore}
            grad="linear-gradient(135deg, var(--gold), var(--crimson-dark))"
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
  Icon: ComponentType<{ size?: number }>;
  grad: string;
  title: string;
  sub: string;
  loading: boolean;
  onClick: () => void;
}) {
  const { Icon } = props;
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
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <Icon size={28} />
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{props.title}</div>
        <div className="muted">{props.sub}</div>
      </span>
      <span style={{ color: "var(--muted)", display: "inline-flex" }}>
        {props.loading ? "…" : <IconChevronRight size={20} />}
      </span>
    </button>
  );
}
