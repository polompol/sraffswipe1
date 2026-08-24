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
import { CityPicker } from "@/components/CityPicker";
import { showBackButton, haptic, guardClosing } from "@/telegram/sdk";
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

  // Пока анкета отличается от сохранённой, Telegram спрашивает подтверждение
  // при закрытии: иначе случайный тап по крестику стирал всё заполненное.
  const dirty =
    !!me
    && (name !== (me.name ?? "")
      || about !== (me.about ?? "")
      || district !== (me.district ?? "")
      || roles.length !== (me.roles ?? []).length);
  useEffect(() => {
    guardClosing(dirty);
    return () => guardClosing(false);
  }, [dirty]);

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
          ? {
              company_name: name,
              city,
              inn: inn || undefined,
              photo_url: photo || undefined,
            }
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
      setError(apiError(e, "Не удалось сохранить — попробуйте ещё раз"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1">
          {isEmployer ? "Профиль заведения" : "Мой профиль"}
        </h1>

        {isEmployer ? (
          <>
            {/* Фото заведения. Его нельзя было поставить ничем: поле в базе
                есть, лента и список мэтчей его показывают — а у каждого
                живого заведения оставалась буква на цветном квадрате.
                В приложении, где выбирают свайпом за секунду, карточка без
                фото — это карточка, которую пролистывают. */}
            <PhotoUpload label="Фото заведения" value={photo} onChange={setPhoto} />

            <label className="form-label" htmlFor="name">Название заведения</label>
            <input
              id="name"
              className="input"
              style={{ marginBottom: 12 }}
              placeholder="например: Кофемания на Тверской"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <CityPicker
              value={city}
              onChange={setCity}
              hint="Покажем людей из вашего города."
            />

            <label className="form-label" htmlFor="inn">ИНН (необязательно)</label>
            <input
              id="inn"
              className="input"
              style={{ marginBottom: 12 }}
              inputMode="numeric"
              maxLength={12}
              placeholder="12 цифр"
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
            />
            <p className="muted" style={{ marginTop: 0 }}>
              ИНН нужен для счетов, актов и значка «Проверено». Название видят
              работники в списке смен. Поменяете название или ИНН — значок
              «Проверено» придётся получить заново.
            </p>
          </>
        ) : (
          <>
        <PhotoUpload label="Фото профиля" value={photo} onChange={setPhoto} />

        <label className="form-label" htmlFor="name">Имя</label>
        <input id="name" className="input" style={{ marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} />

        {/* Пояснения — отдельной строкой, а не в скобках внутри подписи.
            Скобка посреди заголовка поля читается тяжелее, чем та же мысль
            строкой ниже, — а таких скобок тут было две подряд. */}
        <label className="form-label" htmlFor="bdate">Дата рождения</label>
        <input id="bdate" className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        <p className="hint">
          Смены — только с 18 лет.
        </p>

        <CityPicker value={city} onChange={setCity} />

        <label className="form-label" htmlFor="district">Район</label>
        <input id="district" className="input" placeholder="например: Басманный" value={district} onChange={(e) => setDistrict(e.target.value)} />
        <p className="hint">
          Чтобы звали на смены поближе к дому.
        </p>

        {/* Группировка «Зал/Бар/Кухня/Хозяйство» — как при создании смены.
            Раньше здесь была плоская простыня из 12 чипов, и один и тот же
            выбор в двух местах приложения выглядел по-разному. */}
        <div className="form-label">Кем готовы выйти</div>
        <div style={{ margin: "8px 0 16px" }}>
          {ROLE_FAMILY_ORDER.map((fam) => (
            <div key={fam} style={{ marginBottom: 10 }}>
              <div className="hint">
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
                      color: roles.includes(r) ? "var(--on-brand)" : "var(--text)",
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
                color: skills.includes(s) ? "var(--on-brand)" : "var(--text)",
                borderColor: skills.includes(s) ? "var(--gold-fill)" : "var(--border-strong)",
              }}
              onClick={() => toggleSkill(s)}
            >
              {EXPERIENCE_TAG_LABELS[s]}
            </button>
          ))}
        </div>

        <label className="form-label" htmlFor="about">О себе: когда и где удобно выходить</label>
        <textarea
          id="about"
          className="input"
          style={{ marginBottom: 12, minHeight: 88, resize: "vertical", paddingTop: 12 }}
          placeholder="например: официант с опытом, выхожу по вечерам и в выходные, район Центр"
          maxLength={1000}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
        />
        <div className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "right", marginBottom: 12 }}>
          {about.length} / 1000
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          {/* minHeight: зона нажатия была около 25 точек, а это единственный
              способ открыть поле ИНН. И род: анкету заполняют и женщины. */}
          <label className="row" style={{ cursor: "pointer", minHeight: 44 }}>
            <input type="checkbox" checked={selfEmployed} onChange={(e) => setSelfEmployed(e.target.checked)} />
            <span>У меня оформлена самозанятость</span>
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
              <p className="hint">
                Номер есть в приложении «Мой налог» и в личном кабинете
                налоговой. Нужен только для акта по смене — заведения его
                не видят.
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
