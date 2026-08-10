import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExperienceTag, StaffRole } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import { Button } from "@/components/Button";
import { fetchMe, updateMe } from "@/api/endpoints";
import { PhotoUpload } from "@/components/PhotoUpload";
import { showBackButton, haptic } from "@/telegram/sdk";
import { useSession } from "@/store/session";
import { apiError } from "@/lib/errors";

// Навыки для выбора (медкнижка/самозанятость задаются отдельными полями).
const SKILLS: ExperienceTag[] = ["experienced", "english", "cashRegister"];

export function EditProfilePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  // Форма у ролей разная: заведение правит название и ИНН (это всё, что
  // принимает сервер), соискатель — свою анкету. Без ветвления владелец кафе
  // видел «дату рождения» и «должности» и не мог переименовать заведение.
  const isEmployer = useSession((s) => s.role) === "employer";
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

  // Предзаполняем форму РОВНО ОДИН раз. Иначе повторная загрузка профиля
  // (рефетч при возврате на вкладку) затирала бы уже введённый текст.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!me || prefilled.current) return;
    prefilled.current = true;
    // Имя-заглушка («Соискатель»/«Заведение») показываем как пустое поле,
    // чтобы человек вписал своё, а не правил подставленное слово.
    const stub = me.name === "Соискатель" || me.name === "Заведение";
    setName(stub ? "" : me.name ?? "");
    setBirthDate(me.birthDate ?? "");
    setCity(me.city ?? "");
    setDistrict(me.district ?? "");
    setInn(me.inn ?? "");
    setSelfEmployed(me.selfEmployed ?? false);
    // Только известные должности — как и у отметок об опыте ниже. В старых
    // анкетах могло сохраниться что угодно: сервер теперь такое не принимает,
    // и человек не смог бы сохранить профиль вообще, не понимая почему.
    setRoles(
      (me.roles ?? []).filter(
        (r) => r in STAFF_ROLE_LABELS,
      ) as StaffRole[],
    );
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
      await updateMe(
        isEmployer
          ? { company_name: name, inn: inn || undefined }
          : {
              name,
              // Пустые строки не шлём: сервер ждёт либо дату в формате
              // ГГГГ-ММ-ДД, либо ничего. Пустая строка не проходила проверку,
              // и человек, зарегистрировавшийся через экран знакомства (там
              // даты рождения нет вовсе), не мог сохранить анкету вообще —
              // ни район, ни «о себе», ничего. То же с ИНН.
              birth_date: birthDate || undefined,
              city,
              district,
              roles,
              self_employed: selfEmployed,
              inn: selfEmployed && inn ? inn : undefined,
              about,
              experience_tags: skills,
              photo_url: photo || undefined,
            },
      );
      qc.invalidateQueries({ queryKey: ["me"] });
      haptic("success");
      nav(-1);
    } catch (e) {
      haptic("error");
      setError(apiError(e, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 16 }}>
          {isEmployer ? "Профиль заведения" : "Редактировать профиль"}
        </h1>

        {isEmployer ? (
          <>
            <label className="form-label" htmlFor="name">Название заведения</label>
            <input
              id="name"
              className="input"
              style={{ marginBottom: 12 }}
              placeholder="например: Кофемания на Тверской"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="form-label" htmlFor="inn">ИНН (необязательно)</label>
            <input
              id="inn"
              className="input"
              style={{ marginBottom: 12 }}
              inputMode="numeric"
              maxLength={12}
              placeholder="Нужен для актов и бейджа «Проверено»"
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
            />
            <p className="muted" style={{ marginTop: 0 }}>
              Название видят работники в ленте. Если поменять название или ИНН,
              бейдж «Проверено» слетит — его нужно будет получить заново.
            </p>
          </>
        ) : (
          <>
        <PhotoUpload label="Фото профиля" value={photo} onChange={setPhoto} />

        <label className="form-label" htmlFor="name">Имя</label>
        <input id="name" className="input" style={{ marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} />

        <label className="form-label" htmlFor="bdate">Дата рождения (только 18+)</label>
        <input id="bdate" className="input" type="date" style={{ marginBottom: 12 }} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />

        <label className="form-label" htmlFor="city">Город</label>
        <input id="city" className="input" style={{ marginBottom: 12 }} value={city} onChange={(e) => setCity(e.target.value)} />

        <label className="form-label" htmlFor="district">Район (чтобы звали на смены рядом)</label>
        <input id="district" className="input" style={{ marginBottom: 12 }} placeholder="например: Басманный" value={district} onChange={(e) => setDistrict(e.target.value)} />

        {/* Группировка «Зал/Бар/Кухня/Хозяйство» — как при создании смены.
            Раньше здесь была плоская простыня из 12 чипов, и один и тот же
            выбор в двух местах приложения выглядел по-разному. */}
        <div className="form-label">Должности</div>
        <div style={{ margin: "8px 0 16px" }}>
          {ROLE_FAMILY_ORDER.map((fam) => (
            <div key={fam} style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
                {ROLE_FAMILY_LABELS[fam]}
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                {ROLE_FAMILIES[fam].map((r) => (
                  <button
                    key={r}
                    className="tag"
                    style={{
                      cursor: "pointer",
                      background: roles.includes(r) ? "var(--gold-fill)" : "transparent",
                      color: roles.includes(r) ? "#fff" : "var(--text)",
                      borderColor: roles.includes(r) ? "var(--gold-fill)" : "var(--border-strong)",
                    }}
                    onClick={() => toggle(r)}
                  >
                    {STAFF_ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="form-label">Опыт и навыки</div>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {SKILLS.map((s) => (
            <button
              key={s}
              className="tag"
              style={{
                cursor: "pointer",
                background: skills.includes(s) ? "var(--gold-fill)" : "transparent",
                color: skills.includes(s) ? "#fff" : "var(--text)",
                borderColor: skills.includes(s) ? "var(--gold-fill)" : "var(--border-strong)",
              }}
              onClick={() => toggleSkill(s)}
            >
              {EXPERIENCE_TAG_LABELS[s]}
            </button>
          ))}
        </div>

        <label className="form-label" htmlFor="about">О себе и пожелания по выходу</label>
        <textarea
          id="about"
          className="input"
          style={{ marginBottom: 12, minHeight: 88, resize: "vertical", paddingTop: 12 }}
          placeholder="Например: официант с опытом, выхожу по вечерам и в выходные, район Центр"
          maxLength={1000}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
        />
        <div className="muted" style={{ fontSize: 13, textAlign: "right", marginBottom: 12 }}>
          {about.length} / 1000
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={selfEmployed} onChange={(e) => setSelfEmployed(e.target.checked)} />
            <span>Я самозанятый (плательщик НПД)</span>
          </label>
          {selfEmployed && (
            <>
              {/* Поле было безымянным, с клавиатурой букв и без единой
                  подсказки, где этот номер взять. Человек либо пропускал его,
                  либо вписывал что-то не то — и получал отказ сервера. */}
              <label className="form-label" htmlFor="seeker-inn" style={{ marginTop: 12 }}>
                Ваш ИНН
              </label>
              <input
                id="seeker-inn"
                className="input"
                inputMode="numeric"
                maxLength={12}
                placeholder="12 цифр"
                value={inn}
                onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
              />
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                Номер есть в приложении «Мой налог» и в личном кабинете
                налоговой. Нужен только для акта по смене — заведениям в ленте
                он не виден.
              </p>
            </>
          )}
        </div>
          </>
        )}

        {error && (
          <div className="card" role="alert" style={{ marginBottom: 12, color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <Button loading={saving} onClick={save}>Сохранить</Button>
      </div>
    </div>
  );
}
