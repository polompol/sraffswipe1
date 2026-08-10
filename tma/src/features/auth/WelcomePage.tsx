/**
 * Шаг знакомства сразу после входа.
 *
 * Зачем: регистрация занимает десять секунд — и человек попадает в ленту с
 * анкетой на 0%. Заведение видит карточку без имени, без профессии и без
 * фото и просто листает дальше. Соискатель при этом уверен, что «уже
 * зарегистрировался», и не понимает, почему его не зовут.
 *
 * Поэтому спрашиваем самое необходимое здесь и сразу: имя и профессию у
 * соискателя, название у заведения. Фото — по желанию, оно чаще всего и
 * тормозит: его надо искать в галерее.
 *
 * Пропустить можно всегда: потерять человека на первом экране хуже, чем
 * получить неполную анкету — дозаполнить её он сможет из профиля.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { updateMe, uploadPhoto } from "@/api/endpoints";
import { useSession } from "@/store/session";
import { haptic } from "@/telegram/sdk";
import { toast } from "@/components/Toast";
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import type { StaffRole } from "@/types/domain";

export function WelcomePage() {
  const nav = useNavigate();
  const role = useSession((s) => s.role);
  const isEmployer = role === "employer";

  const [name, setName] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  // Город спрашиваем здесь же: по нему работает подбор смен рядом и
  // рассылка «смены в вашем городе». Без него человек просто не попадает
  // в выборку — а сам он об этом никогда не догадается.
  const [city, setCity] = useState("Москва");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canSave =
    name.trim().length >= 2 && (isEmployer || (roles.length > 0 && !!city.trim()));

  function toggleRole(r: StaffRole) {
    haptic("select");
    setRoles((cur) =>
      cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r],
    );
  }

  async function pickPhoto(file: File) {
    setUploading(true);
    try {
      setPhoto(await uploadPhoto(file));
      haptic("success");
    } catch (e) {
      // Загрузка фото может быть просто не подключена — это не повод
      // ломать знакомство. Говорим честно и идём дальше без фото.
      toast(e instanceof Error ? e.message : "Фото не загрузилось", "error");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await updateMe(
        isEmployer
          ? { company_name: name.trim(), photo_url: photo || undefined }
          : {
              name: name.trim(),
              roles,
              city: city.trim(),
              photo_url: photo || undefined,
            },
      );
      haptic("success");
      nav("/feed", { replace: true });
    } catch {
      haptic("error");
      toast("Не получилось сохранить — попробуйте ещё раз", "error");
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginTop: 24 }}>
          {isEmployer ? "Как называется заведение?" : "Как вас зовут?"}
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {isEmployer
            ? "Название увидят соискатели в ленте смен"
            : "Пара штрихов — и заведения начнут вас звать"}
        </p>

        <div className="form-label" style={{ marginTop: 20 }}>
          {isEmployer ? "Название" : "Имя"}
        </div>
        <input
          className="input"
          value={name}
          maxLength={isEmployer ? 120 : 80}
          placeholder={isEmployer ? "Кофейня «Дрова»" : "Анна"}
          onChange={(e) => setName(e.target.value)}
        />

        {!isEmployer && (
          <>
            <div className="form-label" style={{ marginTop: 20 }}>
              Кем готовы выйти
            </div>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
              Можно выбрать несколько — смен будет больше
            </p>
            {ROLE_FAMILY_ORDER.map((fam) => (
              <div key={fam} style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  {ROLE_FAMILY_LABELS[fam]}
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {ROLE_FAMILIES[fam].map((r) => {
                    const on = roles.includes(r);
                    return (
                      <button
                        key={r}
                        className="tag"
                        style={{
                          cursor: "pointer",
                          background: on ? "var(--gold-fill)" : "transparent",
                          color: on ? "#fff" : "var(--text)",
                          borderColor: on ? "var(--gold-fill)" : "var(--border-strong)",
                        }}
                        onClick={() => toggleRole(r)}
                      >
                        {STAFF_ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {!isEmployer && (
          <>
            <div className="form-label">Город</div>
            <input
              className="input"
              value={city}
              maxLength={80}
              placeholder="Москва"
              onChange={(e) => setCity(e.target.value)}
            />
          </>
        )}

        <div className="form-label" style={{ marginTop: 20 }}>
          Фото {isEmployer ? "заведения" : ""} — по желанию
        </div>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          {photo && (
            <img
              src={photo}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }}
            />
          )}
          <label
            className="tag"
            style={{ cursor: "pointer", minHeight: 44, alignItems: "center" }}
          >
            {uploading ? "Загружаю…" : photo ? "Заменить фото" : "Добавить фото"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickPhoto(f);
              }}
            />
          </label>
        </div>

        <div style={{ marginTop: 28, display: "grid", gap: 10 }}>
          <Button block loading={busy} disabled={!canSave} onClick={save}>
            Готово
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => nav("/feed", { replace: true })}
          >
            Заполню позже
          </Button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          {isEmployer
            ? "Без названия смену опубликовать можно, но откликов будет меньше."
            : "Анкеты с именем и профессией зовут на смены заметно чаще."}
        </p>
      </div>
    </div>
  );
}
