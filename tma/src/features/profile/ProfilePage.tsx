import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import { fetchEntitlements, fetchMe, fetchReferral } from "@/api/endpoints";
import { share, haptic } from "@/telegram/sdk";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

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

      <div className="card" style={{ marginBottom: 16 }}>
        <b>Пригласить друзей</b>
        <div className="muted" style={{ margin: "6px 0 12px" }}>
          За каждого по вашей ссылке — {ref?.bonusSuperlikes ?? 3} супер-лайка.
          Уже пришло: {ref?.invited ?? 0}.
        </div>
        <button className="btn" onClick={invite}>
          🎁 Поделиться приглашением
        </button>
      </div>

      <button className="btn secondary" onClick={() => nav("/profile/edit")}>
        ✏️ Редактировать профиль
      </button>
    </div>
  );
}
