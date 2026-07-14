import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExperienceTag, StaffRole } from "@/types/domain";
import { EXPERIENCE_TAG_LABELS, STAFF_ROLE_LABELS } from "@/types/domain";
import { Button } from "@/components/Button";
import { fetchMe, updateMe } from "@/api/endpoints";
import { PhotoUpload } from "@/components/PhotoUpload";
import { showBackButton, haptic } from "@/telegram/sdk";

const ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[];
// Навыки для выбора (медкнижка/самозанятость задаются отдельными полями).
const SKILLS: ExperienceTag[] = ["experienced", "english", "cashRegister"];

export function EditProfilePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string>("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [inn, setInn] = useState("");
  const [selfEmployed, setSelfEmployed] = useState(false);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [about, setAbout] = useState("");
  const [skills, setSkills] = useState<ExperienceTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  // Предзаполняем форму текущими данными пользователя (один раз при загрузке).
  useEffect(() => {
    if (!me) return;
    setName(me.name === "Соискатель" ? "" : me.name ?? "");
    setBirthDate(me.birthDate ?? "");
    setCity(me.city ?? "");
    setDistrict(me.district ?? "");
    setInn(me.inn ?? "");
    setSelfEmployed(me.selfEmployed ?? false);
    setRoles((me.roles ?? []) as StaffRole[]);
    setAbout(me.about ?? "");
    setSkills((me.experienceTags ?? []).filter((t) =>
      SKILLS.includes(t as ExperienceTag)) as ExperienceTag[]);
    setPhoto(me.photoUrl ?? "");
  }, [me]);

  function toggle(r: StaffRole) {
    haptic("select");
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function toggleSkill(s: ExperienceTag) {
    haptic("select");
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMe({
        name,
        birth_date: birthDate,
        city,
        district,
        roles,
        self_employed: selfEmployed,
        inn: selfEmployed ? inn : undefined,
        about,
        experience_tags: skills,
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

        <label className="muted" htmlFor="district">Район (чтобы звали на смены рядом)</label>
        <input id="district" className="input" style={{ marginBottom: 12 }} placeholder="например: Басманный" value={district} onChange={(e) => setDistrict(e.target.value)} />

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

        <label className="muted">Опыт и навыки</label>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {SKILLS.map((s) => (
            <button
              key={s}
              className="tag"
              style={{
                cursor: "pointer",
                background: skills.includes(s) ? "var(--gold)" : "transparent",
                color: skills.includes(s) ? "#fff" : "var(--text)",
                borderColor: skills.includes(s) ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => toggleSkill(s)}
            >
              {EXPERIENCE_TAG_LABELS[s]}
            </button>
          ))}
        </div>

        <label className="muted" htmlFor="about">О себе и пожелания по выходу</label>
        <textarea
          id="about"
          className="input"
          style={{ marginBottom: 12, minHeight: 88, resize: "vertical", paddingTop: 12 }}
          placeholder="Например: официант с опытом, выхожу по вечерам и в выходные, район Центр"
          maxLength={1000}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
        />

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
