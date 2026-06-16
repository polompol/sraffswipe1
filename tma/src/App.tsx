import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/store/session";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { RolePage } from "@/features/auth/RolePage";
import { FeedPage } from "@/features/feed/FeedPage";
import { MatchesPage } from "@/features/matches/MatchesPage";
import { ChatPage } from "@/features/chat/ChatPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { EditProfilePage } from "@/features/profile/EditProfilePage";
import { CreateVacancyPage } from "@/features/vacancy/CreateVacancyPage";
import { MyVacanciesPage } from "@/features/vacancy/MyVacanciesPage";
import { ShiftsPage } from "@/features/shifts/ShiftsPage";
import { PricingPage } from "@/features/billing/PricingPage";
import { FunnelPage } from "@/features/analytics/FunnelPage";

function TabBar() {
  const { role } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const isEmployer = role === "employer";

  const tabs = [
    { path: "/feed", ico: "🃏", label: "Лента" },
    { path: "/matches", ico: "🔥", label: "Мэтчи" },
    isEmployer
      ? { path: "/vacancy/my", ico: "📋", label: "Вакансии" }
      : { path: "/shifts", ico: "📅", label: "Смены" },
    { path: "/profile", ico: "👤", label: "Профиль" },
  ];

  return (
    <nav className="tabbar">
      {tabs.map((t) => {
        const active = loc.pathname.startsWith(t.path);
        return (
          <button
            key={t.path}
            className={`tab ${active ? "active" : ""}`}
            onClick={() => nav(t.path)}
          >
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      {children}
      <TabBar />
    </div>
  );
}

export function App() {
  const { authenticated, role } = useSession();
  const ready = authenticated && role;

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/role" element={<RolePage />} />

      <Route
        path="/feed"
        element={ready ? <Shell><FeedPage /></Shell> : <Navigate to="/onboarding" />}
      />
      <Route
        path="/matches"
        element={ready ? <Shell><MatchesPage /></Shell> : <Navigate to="/onboarding" />}
      />
      <Route
        path="/shifts"
        element={ready ? <Shell><ShiftsPage /></Shell> : <Navigate to="/onboarding" />}
      />
      <Route
        path="/vacancy/my"
        element={ready ? <Shell><MyVacanciesPage /></Shell> : <Navigate to="/onboarding" />}
      />
      <Route
        path="/profile"
        element={ready ? <Shell><ProfilePage /></Shell> : <Navigate to="/onboarding" />}
      />

      <Route path="/profile/edit" element={<EditProfilePage />} />
      <Route path="/vacancy/new" element={<CreateVacancyPage />} />
      <Route path="/chat/:matchId" element={<ChatPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/funnel" element={<FunnelPage />} />

      <Route
        path="*"
        element={<Navigate to={ready ? "/feed" : "/onboarding"} />}
      />
    </Routes>
  );
}
