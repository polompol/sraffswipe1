import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { showBackButton, haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

export function EditProfilePage() {
  const nav = useNavigate();
  const [name, setName] = useState("Алексей");
  const [city, setCity] = useState("Москва");
  const [inn, setInn] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>(["waiter", "barista"]);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  function toggle(r: StaffRole) {
    haptic("select");
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 16 }}>Профиль</h1>

        <label className="muted">Имя</label>
        <input className="input" style={{ marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} />

        <label className="muted">Город</label>
        <input className="input" style={{ marginBottom: 12 }} value={city} onChange={(e) => setCity(e.target.value)} />

        <label className="muted">Должности</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {ROLES.map((r) => (
            <button
              key={r}
              className="tag"
              style={{
                cursor: "pointer",
                background: roles.includes(r) ? "var(--gold)" : "transparent",
                color: roles.includes(r) ? "#fff" : "var(--text)",
                borderColor: roles.includes(r) ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => toggle(r)}
            >
              {STAFF_ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={selfEmployed} onChange={(e) => setSelfEmployed(e.target.checked)} />
            <span>Я самозанятый (плательщик НПД)</span>
          </label>
          {selfEmployed && (
            <input
              className="input"
              style={{ marginTop: 12 }}
              placeholder="ИНН"
              value={inn}
              onChange={(e) => setInn(e.target.value)}
            />
          )}
        </div>

        <button
          className="btn"
          onClick={() => {
            haptic("success");
            nav(-1);
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
