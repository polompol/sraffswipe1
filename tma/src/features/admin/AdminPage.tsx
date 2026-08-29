/** Админ-панель — рабочее место оператора.
 *
 *  Четыре раздела вместо одной простыни на шесть экранов прокрутки. Разбивка
 *  не по сущностям базы, а по вопросу, с которым оператор сюда пришёл:
 *  «что горит сегодня», «что с деньгами», «разобраться с человеком»,
 *  «откуда идут люди».
 *
 *  Здесь остались только шапка и переключатель. Каждая вкладка живёт в своём
 *  файле и сама забирает свои данные: файл на тысячу триста строк держал в
 *  одной голове восемь запросов и полтора десятка обработчиков, а правка в
 *  одном углу задевала три других. Заодно исчезли пометки `enabled: tab ===`
 *  у запросов — вкладка просто не существует, пока её не открыли.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminOverview } from "@/api/endpoints";
import { showBackButton } from "@/telegram/sdk";
import { IconShield } from "@/components/Icons";
import { TodayTab } from "./TodayTab";
import { MoneyTab } from "./MoneyTab";
import { PeopleTab } from "./PeopleTab";
import { GrowthTab } from "./GrowthTab";

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

  // Сводка нужна и самой панели (счётчик открытых жалоб на вкладке), поэтому
  // живёт здесь, а не внутри вкладки «Сегодня».
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: fetchAdminOverview });

  // 403 для не-админа → показываем заглушку.
  if (ov.isError) {
    return (
      <div className="page">
        <h1 className="h1">Админ-панель</h1>
        <div className="card muted row" style={{ justifyContent: "center", gap: 8 }} role="alert">
          <IconShield size={18} /> Доступ только для администратора
        </div>
      </div>
    );
  }

  const openCount = ov.data?.openReports ?? 0;

  return (
    <div className="page">
      <h1 className="h1" style={{ margin: "0 0 12px" }}>Админ-панель</h1>

      {/* Вкладки: одна строка, всегда видно, где ты и где горит. */}
      {/* Ряд прокручиваемый, а не сетка в четыре равные доли: на узком
          экране (320px, iPhone SE) четвёртая вкладка не помещалась и
          обрезалась краем экрана — «Рост» был не виден и не нажимался. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            // Не ToggleChip: это вкладка, а не переключатель — у неё
            // aria-current и счётчик внутри. Но цвета те же и берутся из тех
            // же классов, чтобы «выбранное» везде выглядело одинаково.
            className={`tag ${tab === t.id ? "tag-gold-fill" : "tag-nav"}`}
            style={{ flex: "1 0 auto" }}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <span style={{ whiteSpace: "nowrap" }}>{t.label}</span>
            {t.id === "today" && openCount > 0 && (
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
                  background: tab === t.id ? "var(--on-brand)" : "var(--gold-fill)",
                  color: tab === t.id ? "var(--gold-fill)" : "var(--on-brand)",
                }}
              >
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayTab ov={ov} />}
      {tab === "money" && <MoneyTab />}
      {tab === "people" && <PeopleTab />}
      {tab === "growth" && <GrowthTab />}
    </div>
  );
}
