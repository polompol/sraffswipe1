import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StaffRole } from "@/types/domain";
import { STAFF_ROLE_LABELS } from "@/types/domain";
import { Button } from "@/components/Button";
import { fetchMe, updateMe } from "@/api/endpoints";
import { PhotoUpload } from "@/components/PhotoUpload";
import { showBackButton, haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];

export function EditProfilePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string>("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [inn, setInn] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  // Предзаполняем форму текущими данными пользователя (один раз при загрузке).
  useEffect(() => {
    if (!me) return;
    setName(me.name === "Соискатель" ? "" : me.name ?? "");
    setBirthDate(me.birthDate ?? "");
    setCity(me.city ?? "");
    setInn(me.inn ?? "");
    setSelfEmployed(me.selfEmployed ?? false);
    setRoles((me.roles ?? []) as StaffRole[]);
    setPhoto(me.photoUrl ?? "");
  }, [me]);

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
        photo_url: photo || undefined,
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

        <PhotoUpload label="Фото профиля" value={photo} onChange={setPhoto} />

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

        <Button loading={saving} onClick={save}>Сохранить</Button>
      </div>
    </div>
  );
}
