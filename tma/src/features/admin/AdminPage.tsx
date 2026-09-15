/** Админ-панель — рабочее место оператора. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { fetchAdminOverview } from "@/api/endpoints";
import { IconShield } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBox, SkeletonList } from "@/components/States";
import { showBackButton } from "@/telegram/sdk";
import { GrowthTab } from "./GrowthTab";
import { MoneyTab } from "./MoneyTab";
import { PeopleTab } from "./PeopleTab";
import { SupportQueue } from "./SupportQueue";
import { TodayTab } from "./TodayTab";

const TABS = [
  { id: "today", label: "Сегодня" },
  { id: "money", label: "Деньги" },
  { id: "people", label: "Люди" },
  { id: "growth", label: "Рост" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabId>("today");
  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  const ov = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
  });

  if (ov.isPending) {
    return (
      <div className="page">
        <PageHeader title="Админ-панель" />
        {ov.fetchStatus === "paused" ? (
          <ErrorBox text="Нет соединения. Панель откроется после восстановления связи." />
        ) : (
          <SkeletonList />
        )}
      </div>
    );
  }

  if (ov.isError) {
    const denied =
      ov.error instanceof ApiError && ov.error.response?.status === 403;
    return (
      <div className="page">
        <PageHeader title="Админ-панель" />
        {denied ? (
          <div
            className="card muted row"
            style={{ justifyContent: "center", gap: 8 }}
            role="alert"
          >
            <IconShield size={18} /> Доступ только для администратора
          </div>
        ) : (
          <ErrorBox onRetry={() => ov.refetch()} />
        )}
      </div>
    );
  }

  const openCount = ov.data?.openReports ?? 0;

  return (
    <div className="page">
      <PageHeader title="Админ-панель" />
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tag ${tab === item.id ? "tag-gold-fill" : "tag-nav"}`}
            style={{ flex: "1 0 auto" }}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
            {item.id === "today" && openCount > 0 && (
              <span
                aria-label={`открытых жалоб: ${openCount}`}
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  padding: "0 5px",
                  fontSize: "var(--text-xs)",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    tab === item.id ? "var(--on-brand)" : "var(--gold-fill)",
                  color:
                    tab === item.id ? "var(--gold-fill)" : "var(--on-brand)",
                }}
              >
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <>
          <SupportQueue />
          <TodayTab ov={ov} />
        </>
      )}
      {tab === "money" && <MoneyTab />}
      {tab === "people" && <PeopleTab />}
      {tab === "growth" && <GrowthTab />}
    </div>
  );
}
