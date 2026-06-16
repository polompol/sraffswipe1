import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import { fetchEntitlements } from "@/api/endpoints";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export function ProfilePage() {
  const nav = useNavigate();
  const { role, logout } = useSession();
  const { data: ent } = useQuery({
    queryKey: ["entitlements"],
    queryFn: fetchEntitlements,
  });

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
            {role === "employer" ? "Моё заведение" : "Алексей"}
          </div>
          <div className="muted">
            {role === "employer" ? "Москва, центр" : "24 года · Москва, Хамовники"}
          </div>
        </span>
      </div>

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

      <button className="btn secondary" onClick={() => nav("/profile/edit")}>
        ✏️ Редактировать профиль
      </button>
    </div>
  );
}
