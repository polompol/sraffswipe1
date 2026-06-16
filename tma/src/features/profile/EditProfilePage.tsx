import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { updateMe } from "@/api/endpoints";
import { showBackButton, haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

export function EditProfilePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("Алексей");
  const [birthDate, setBirthDate] = useState("2000-04-12");
  const [city, setCity] = useState("Москва");
  const [inn, setInn] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>(["waiter", "barista"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  function toggle(r: StaffRole) {
    haptic("select");
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMe({
        name,
        birth_date: birthDate,
        city,
        roles,
        self_employed: selfEmployed,
        inn: selfEmployed ? inn : undefined,
      });
      qc.invalidateQueries({ queryKey: ["me"] });
      haptic("success");
      nav(-1);
    } catch (e) {
      haptic("error");
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? (e as Error)?.message ?? "Не удалось сохранить";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 16 }}>Профиль</h1>

        <label className="muted" htmlFor="name">Имя</label>
        <input id="name" className="input" style={{ marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} />

        <label className="muted" htmlFor="bdate">Дата рождения (только 18+)</label>
        <input id="bdate" className="input" type="date" style={{ marginBottom: 12 }} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />

        <label className="muted" htmlFor="city">Город</label>
        <input id="city" className="input" style={{ marginBottom: 12 }} value={city} onChange={(e) => setCity(e.target.value)} />

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

        {error && (
          <div className="card" role="alert" style={{ marginBottom: 12, color: "var(--dislike)" }}>
            {error}
          </div>
        )}

        <button className="btn" disabled={saving} onClick={save}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
