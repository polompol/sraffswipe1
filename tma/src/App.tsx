import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/store/session";
import { Loading } from "@/components/States";
import { haptic } from "@/telegram/sdk";
import {
  IconTabFeed,
  IconTabMatches,
  IconTabShifts,
  IconTabVacancies,
  IconTabProfile,
} from "@/components/Icons";
// Стартовый путь грузим сразу, остальное — по требованию (code-splitting).
import { Onboarding } from "@/features/onboarding/Onboarding";
import { RolePage } from "@/features/auth/RolePage";
import { WelcomePage } from "@/features/auth/WelcomePage";
import { FeedPage } from "@/features/feed/FeedPage";

const MatchesPage = lazy(() =>
  import("@/features/matches/MatchesPage").then((m) => ({ default: m.MatchesPage })),
);
const ChatPage = lazy(() =>
  import("@/features/chat/ChatPage").then((m) => ({ default: m.ChatPage })),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const EditProfilePage = lazy(() =>
  import("@/features/profile/EditProfilePage").then((m) => ({ default: m.EditProfilePage })),
);
const CreateVacancyPage = lazy(() =>
  import("@/features/vacancy/CreateVacancyPage").then((m) => ({ default: m.CreateVacancyPage })),
);
const MyVacanciesPage = lazy(() =>
  import("@/features/vacancy/MyVacanciesPage").then((m) => ({ default: m.MyVacanciesPage })),
);
const FunnelPage = lazy(() =>
  import("@/features/analytics/FunnelPage").then((m) => ({ default: m.FunnelPage })),
);
const AdminPage = lazy(() =>
  import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const SupportPage = lazy(() =>
  import("@/features/support/SupportPage").then((m) => ({ default: m.SupportPage })),
);
const FavoritesPage = lazy(() =>
  import("@/features/feed/FavoritesPage").then((m) => ({ default: m.FavoritesPage })),
);
const WorkersPage = lazy(() =>
  import("@/features/vacancy/WorkersPage").then((m) => ({ default: m.WorkersPage })),
);
const ApplicantsPage = lazy(() =>
  import("@/features/vacancy/ApplicantsPage").then((m) => ({ default: m.ApplicantsPage })),
);
const InvitesPage = lazy(() =>
  import("@/features/invites/InvitesPage").then((m) => ({ default: m.InvitesPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/profile/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function TabBar() {
  const { role } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const isEmployer = role === "employer";

  // У работника «Мэтчи» и «Мои смены» показывали одну и ту же смену в двух
  // местах с разными кнопками: в одном — код прихода, в другом — акт. Человеку
  // приходилось помнить, где что лежит. Теперь у него один раздел со всеми
  // сменами — от «договариваемся» до закрытых.
  //
  // У заведения это РАЗНЫЕ вещи и остаются раздельными: «Мэтчи» — люди, с
  // которыми договорились, «Смены» — собственные объявления.
  const tabs = isEmployer
    ? [
        { path: "/feed", Icon: IconTabFeed, label: "Лента" },
        { path: "/matches", Icon: IconTabMatches, label: "Мэтчи" },
        { path: "/vacancy/my", Icon: IconTabVacancies, label: "Смены" },
        { path: "/profile", Icon: IconTabProfile, label: "Профиль" },
      ]
    : [
        { path: "/feed", Icon: IconTabFeed, label: "Лента" },
        { path: "/matches", Icon: IconTabShifts, label: "Мои смены" },
        { path: "/profile", Icon: IconTabProfile, label: "Профиль" },
      ];

  return (
    <nav className="tabbar">
      {tabs.map((t) => {
        const active = loc.pathname.startsWith(t.path);
        const Icon = t.Icon;
        return (
          <button
            key={t.path}
            className={`tab ${active ? "active" : ""}`}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (!active) haptic("light");
              nav(t.path);
            }}
          >
            <span className="ico">
              <Icon size={32} active={active} />
            </span>
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
    <Suspense fallback={<div className="app"><div className="page"><Loading /></div></div>}>
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/role" element={<RolePage />} />
      <Route
        path="/welcome"
        element={ready ? <WelcomePage /> : <Navigate to="/onboarding" />}
      />

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
        // Отдельного экрана «Мои смены» у работника больше нет — он слился с
        // «Мэтчами». Адрес оставляем: по нему приходят кнопки из уведомлений
        // бота («Я на смене — отметиться», «Открыть смены»), и ссылки из уже
        // отправленных сообщений должны продолжать работать.
        element={<Navigate to="/matches" replace />}
      />
      <Route
        path="/vacancy/my"
        element={ready ? <Shell><MyVacanciesPage /></Shell> : <Navigate to="/onboarding" />}
      />
      <Route
        path="/profile"
        element={ready ? <Shell><ProfilePage /></Shell> : <Navigate to="/onboarding" />}
      />

      <Route path="/profile/edit" element={ready ? <EditProfilePage /> : <Navigate to="/onboarding" />} />
      <Route path="/vacancy/new" element={ready ? <CreateVacancyPage /> : <Navigate to="/onboarding" />} />
      <Route path="/chat/:matchId" element={ready ? <ChatPage /> : <Navigate to="/onboarding" />} />
      <Route path="/funnel" element={ready ? <FunnelPage /> : <Navigate to="/onboarding" />} />
      <Route path="/admin" element={ready ? <AdminPage /> : <Navigate to="/onboarding" />} />
      <Route path="/support" element={ready ? <SupportPage /> : <Navigate to="/onboarding" />} />
      <Route path="/favorites" element={ready ? <FavoritesPage /> : <Navigate to="/onboarding" />} />
      <Route path="/workers" element={ready ? <WorkersPage /> : <Navigate to="/onboarding" />} />
      <Route path="/applicants" element={ready ? <ApplicantsPage /> : <Navigate to="/onboarding" />} />
      <Route path="/invites" element={ready ? <InvitesPage /> : <Navigate to="/onboarding" />} />
      <Route path="/settings" element={ready ? <SettingsPage /> : <Navigate to="/onboarding" />} />

      <Route
        path="*"
        element={<Navigate to={ready ? "/feed" : "/onboarding"} />}
      />
    </Routes>
    </Suspense>
  );
}
