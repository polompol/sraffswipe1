import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RateType, StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { showBackButton, haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

export function CreateVacancyPage() {
  const nav = useNavigate();
  const [role, setRole] = useState<StaffRole>("waiter");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("22:00");
  const [rate, setRate] = useState("350");
  const [rateType, setRateType] = useState<RateType>("perHour");
  const [address, setAddress] = useState("Москва, ул. Льва Толстого, 16");
  const [desc, setDesc] = useState("");
  const [medBook, setMedBook] = useState(true);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 16 }}>Новая вакансия</h1>

        <label className="muted">Должность</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {ROLES.map((r) => (
            <button
              key={r}
              className="tag"
              style={{
                cursor: "pointer",
                background: role === r ? "var(--gold)" : "transparent",
                color: role === r ? "#fff" : "var(--text)",
                borderColor: role === r ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => setRole(r)}
            >
              {STAFF_ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <label className="muted">Дата смены</label>
        <input className="input" type="date" style={{ marginBottom: 12 }} value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="row" style={{ marginBottom: 12 }}>
          <span style={{ flex: 1 }}>
            <label className="muted">Начало</label>
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </span>
          <span style={{ flex: 1 }}>
            <label className="muted">Конец</label>
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </span>
        </div>

        <label className="muted">Ставка</label>
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button
            className="tag"
            style={{ cursor: "pointer", whiteSpace: "nowrap", borderColor: "var(--border)" }}
            onClick={() => setRateType(rateType === "perHour" ? "perShift" : "perHour")}
          >
            {rateType === "perHour" ? "₽/час" : "₽/смена"}
          </button>
        </div>

        <label className="muted">Адрес (выбор на Яндекс.Картах)</label>
        <input className="input" style={{ marginBottom: 12 }} value={address} onChange={(e) => setAddress(e.target.value)} />

        <div className="card row" style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => setMedBook(!medBook)}>
          <span style={{ flex: 1 }}>Нужна медкнижка</span>
          <span>{medBook ? "✅" : "⬜"}</span>
        </div>

        <label className="muted">Описание</label>
        <textarea
          className="input"
          style={{ marginBottom: 16, minHeight: 90 }}
          placeholder="Дресс-код, бонусы, питание, чаевые…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <button
          className="btn"
          onClick={() => {
            haptic("success");
            nav(-1);
          }}
        >
          Опубликовать вакансию
        </button>
      </div>
    </div>
  );
}
