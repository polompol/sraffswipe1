import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { PayMethod, RateType, StaffRole, TipsMode, Vacancy } from "@/types/domain";
import { MIN_RATE_PER_HOUR, MIN_RATE_PER_SHIFT } from "@/types/domain";
import {
  PAY_METHOD_LABELS,
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  STAFF_ROLE_LABELS,
  TIPS_LABELS,
} from "@/types/domain";
import {
  createVacancy,
  updateVacancy,
  suggestAddress,
  track,
  type AddressSuggestion,
} from "@/api/endpoints";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { Button } from "@/components/Button";
import { PhotoUpload } from "@/components/PhotoUpload";
import { CityPicker } from "@/components/CityPicker";
import { IconPin } from "@/components/Icons";
import { showBackButton, haptic, guardClosing } from "@/telegram/sdk";

const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const fromMinutes = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Частые варианты. Всё остальное — через «Нужно другое число».
const HEADCOUNT_PRESETS = [1, 2, 3, 5, 10];

export function CreateVacancyPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  // Экран работает в двух режимах:
  //   prefill — «повторить смену»: копируем поля, дату просим выбрать заново;
  //   edit    — «исправить смену»: копируем всё вместе с датой и сохраняем поверх.
  const navState = useLocation().state as
    | { prefill?: Vacancy; edit?: Vacancy }
    | null;
  const editing = navState?.edit ?? null;
  const pre = editing ?? navState?.prefill;
  const [role, setRole] = useState<StaffRole>(pre?.role ?? "waiter");
  const [date, setDate] = useState(editing?.date ?? "");
  const [start, setStart] = useState(pre ? fromMinutes(pre.startTime) : "10:00");
  const [end, setEnd] = useState(pre ? fromMinutes(pre.endTime) : "22:00");
  const [rate, setRate] = useState(pre ? String(pre.rate) : "350");
  const [interiorPhoto, setInteriorPhoto] = useState(pre?.interiorPhotoUrl ?? "");
  const [rateType, setRateType] = useState<RateType>(pre?.rateType ?? "perHour");
  const [payMethod, setPayMethod] = useState<PayMethod>(pre?.payMethod ?? "cash");
  const [tips, setTips] = useState<TipsMode>(pre?.tips ?? "none");
  // Без «Москвы» по умолчанию: заведение в Казани не заметило бы подстановку
  // и опубликовало смену в чужом городе — там её никто не увидит.
  const [city, setCity] = useState(pre?.city || "");
  // Пусто, а не московская улица. Подстановку легко не заметить: заведение в
  // Казани заполняло дату и ставку, адрес не трогало — и публиковало смену по
  // московскому адресу. Он потом уходит и в напоминание работнику, и в акт.
  const [address, setAddress] = useState(pre?.address || "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggests, setSuggests] = useState<AddressSuggestion[]>([]);
  // Последний адрес, выбранный из списка (или подставленный при входе): для
  // него подсказки не запрашиваем.
  const chosenAddress = useRef<string>(pre?.address || "");
  const [desc, setDesc] = useState(pre?.description ?? "");
  const [medBook, setMedBook] = useState(pre?.requireMedBook ?? true);
  // Сколько человек нужно: на банкет и выходные почти никогда не один.
  const [headcount, setHeadcount] = useState(pre?.headcount ?? 1);
  // Правим смену, где стояло число не из быстрых кнопок (например 4) —
  // сразу открываем поле, иначе выбранное значение негде увидеть.
  const [custom, setCustom] = useState(
    !HEADCOUNT_PRESETS.includes(pre?.headcount ?? 1),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  // Форма длинная: дата, время, ставка, адрес с подсказками, описание — три
  // минуты работы. Задел крестик или смахнул вниз — всё пропадало без
  // единого вопроса. Пока в форме есть несохранённое, Telegram спрашивает
  // подтверждение при закрытии.
  const dirty = !!date || !!desc || address !== (pre?.address ?? "");
  useEffect(() => {
    guardClosing(dirty);
    return () => guardClosing(false);
  }, [dirty]);

  async function publish() {
    if (!date) {
      toast("Укажите дату смены", "error");
      return;
    }
    if (!city.trim()) {
      toast("Укажите город", "error");
      return;
    }
    // Нижняя граница оплаты. Сервер такую смену не примет, и без проверки
    // здесь человек получил бы отказ уже после нажатия «Опубликовать» —
    // с длинной формой это самый обидный момент. Заодно ловится случайный
    // ноль (стёр ставку, забыл вписать заново).
    const rateNum = Number(rate) || 0;
    const minRate = rateType === "perHour" ? MIN_RATE_PER_HOUR : MIN_RATE_PER_SHIFT;
    if (rateNum < minRate) {
      toast(
        rateType === "perHour"
          ? `Ставка не может быть ниже ${minRate} ₽ в час`
          : `Оплата за смену не может быть ниже ${minRate} ₽`,
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      const payload = {
        role,
        date,
        start_time: toMinutes(start),
        end_time: toMinutes(end),
        rate: Number(rate) || 0,
        rate_type: rateType,
        pay_method: payMethod,
        tips,
        description: desc,
        require_med_book: medBook,
        headcount,
        interior_photo_url: interiorPhoto || undefined,
        address,
        city: city.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
      };
      if (editing) {
        await updateVacancy(editing.id, payload);
        toast("Смена обновлена", "success");
      } else {
        await createVacancy(payload);
        track("vacancy_publish", { role });
        toast("Смена опубликована", "success");
      }
      haptic("success");
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["my-vacancies"] });
      nav(-1);
    } catch (e) {
      haptic("error");
      // Сервер объясняет причину сам: и почему нельзя менять смену с
      // откликом (409), и что не так с полями — например «Смена не может
      // быть в прошлом» (422). Раньше проверка полей терялась и человек
      // видел общее «Проверьте поля», не понимая какое.
      toast(
        apiError(
          e,
          editing
            ? "Не удалось сохранить. Проверьте поля."
            : "Не удалось опубликовать. Проверьте поля.",
        ),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  // Подсказки адреса DaData с дебаунсом.
  //
  // Не спрашиваем подсказки для адреса, который человек только что ВЫБРАЛ из
  // списка. Иначе получалась петля: клик по подсказке менял адрес → эффект
  // срабатывал заново → через 300 мс тот же список выпрыгивал обратно поверх
  // формы и закрывал тумблер «Нужна медкнижка». А поскольку адрес
  // предзаполнен, список открывался сам при входе на экран, без единого
  // нажатия.
  useEffect(() => {
    if (address === chosenAddress.current) {
      setSuggests([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSuggests(await suggestAddress(address));
      } catch {
        setSuggests([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [address]);

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>
          {editing ? "Исправить смену" : pre ? "Повторить смену" : "Новая смена"}
        </h1>
        {editing && (
          <p className="muted" style={{ marginBottom: 16 }}>
            Правки видны в ленте сразу. Если по смене уже откликнулись,
            менять условия нельзя — договоритесь в чате.
          </p>
        )}
        {pre && !editing && (
          <p className="muted" style={{ marginBottom: 16 }}>
            Поля заполнены по прошлой смене — укажите новую дату.
          </p>
        )}

        <div className="form-label">Должность</div>
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
                      background: role === r ? "var(--gold-fill)" : "transparent",
                      color: role === r ? "#fff" : "var(--text)",
                      borderColor: role === r ? "var(--gold-fill)" : "var(--border-strong)",
                    }}
                    onClick={() => setRole(r)}
                  >
                    {STAFF_ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="form-label">Дата смены</div>
        <input className="input" type="date" style={{ marginBottom: 12 }} value={date} onChange={(e) => setDate(e.target.value)} />

        <div className="row" style={{ marginBottom: 12 }}>
          <span style={{ flex: 1 }}>
            <div className="form-label">Начало</div>
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </span>
          <span style={{ flex: 1 }}>
            <div className="form-label">Конец</div>
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </span>
        </div>

        <div className="form-label">Ставка</div>
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={rateType === "perHour" ? MIN_RATE_PER_HOUR : MIN_RATE_PER_SHIFT}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <button
            className="tag"
            style={{ cursor: "pointer", whiteSpace: "nowrap", borderColor: "var(--border)" }}
            onClick={() => setRateType(rateType === "perHour" ? "perShift" : "perHour")}
          >
            {rateType === "perHour" ? "₽/час" : "₽/смена"}
          </button>
        </div>

        <div className="form-label">Сколько человек нужно</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 8,
            marginBottom: 8,
          }}
        >
          {HEADCOUNT_PRESETS.map((n) => (
            <button
              key={n}
              className="tag"
              style={{
                cursor: "pointer",
                minWidth: 52,
                justifyContent: "center",
                background: headcount === n ? "var(--gold-fill)" : "transparent",
                color: headcount === n ? "#fff" : "var(--text)",
                borderColor: headcount === n ? "var(--gold-fill)" : "var(--border-strong)",
              }}
              onClick={() => setHeadcount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {/* Поле для своего числа показываем только по запросу. Раньше оно
            стояло всегда и повторяло выбранный чип: под нажатой «1» висела
            безымянная строка с той же единицей, и человек не понимал, что это
            и почему их два. Подсказка «другое число» в нём не появлялась
            никогда — поле не бывает пустым. */}
        {custom ? (
          <>
            <label className="form-label" htmlFor="headcount">
              Сколько именно человек
            </label>
            <input
              id="headcount"
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              style={{ marginBottom: 16 }}
              value={headcount}
              onChange={(e) =>
                setHeadcount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setCustom(true)}
            style={{
              background: "none",
              border: "none",
              padding: "4px 0 12px",
              color: "var(--link)",
              font: "inherit",
              fontSize: 14,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Нужно другое число
          </button>
        )}
        <p className="muted" style={{ margin: "-8px 0 16px", fontSize: 13 }}>
          Одна смена на всех — не нужно публиковать несколько одинаковых.
          Когда наберётся столько людей, смена уйдёт из ленты сама.
        </p>

        <div className="form-label">Как и когда платите</div>
        <div style={{ display: "grid", gap: 8, margin: "8px 0 16px" }}>
          {(Object.keys(PAY_METHOD_LABELS) as PayMethod[]).map((p) => (
            <button
              key={p}
              className="tag"
              style={{
                cursor: "pointer",
                background: payMethod === p ? "var(--gold-fill)" : "transparent",
                color: payMethod === p ? "#fff" : "var(--text)",
                borderColor: payMethod === p ? "var(--gold-fill)" : "var(--border-strong)",
              }}
              onClick={() => setPayMethod(p)}
            >
              {PAY_METHOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="form-label">Чаевые (платят гости)</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 8,
            margin: "8px 0 16px",
          }}
        >
          {(Object.keys(TIPS_LABELS) as TipsMode[]).map((t) => (
            <button
              key={t}
              className="tag"
              style={{
                cursor: "pointer",
                background: tips === t ? "var(--gold-fill)" : "transparent",
                color: tips === t ? "#fff" : "var(--text)",
                borderColor: tips === t ? "var(--gold-fill)" : "var(--border-strong)",
              }}
              onClick={() => setTips(t)}
            >
              {TIPS_LABELS[t]}
            </button>
          ))}
        </div>

        <CityPicker
          value={city}
          onChange={setCity}
          hint="Смену увидят люди из этого города. Время смены тоже считается по нему."
        />

        <label className="form-label" htmlFor="addr">Адрес</label>
        <input
          id="addr"
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        {suggests.length > 0 && (
          <div className="card" style={{ padding: 6, marginTop: 4, marginBottom: 12 }}>
            {suggests.map((s) => (
              <button
                key={s.value}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 10px", cursor: "pointer", color: "var(--text)" }}
                onClick={() => {
                  chosenAddress.current = s.value;
                  setAddress(s.value);
                  if (s.lat != null && s.lng != null) {
                    setCoords({ lat: s.lat, lng: s.lng });
                  }
                  setSuggests([]);
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconPin size={15} /> {s.value}
                </span>
              </button>
            ))}
          </div>
        )}
        {suggests.length === 0 && <div style={{ marginBottom: 12 }} />}

        {/* Настоящий чекбокс внутри label. Был div с onClick: требование
            медкнижки нельзя было ни переключить с клавиатуры, ни услышать в
            озвучке — для человека без мыши и тача поле просто не существовало.
            В анкете работника такой же переключатель уже сделан правильно. */}
        <label className="card row" style={{ marginBottom: 12, cursor: "pointer" }}>
          <span style={{ flex: 1 }}>Нужна медкнижка</span>
          <input
            type="checkbox"
            checked={medBook}
            onChange={(e) => setMedBook(e.target.checked)}
            style={{ marginLeft: 8 }}
          />
        </label>

        {/* Фото места. Сервер это поле принимал и отдавал, карточка в ленте
            на него рассчитана — а в форме его не было вовсе, и поставить
            фотографию смене было нельзя ничем. Именно фото решает, листнут
            карточку дальше или остановятся. */}
        <PhotoUpload
          label="Фото места (необязательно, но с ним откликаются заметно чаще)"
          value={interiorPhoto}
          onChange={setInteriorPhoto}
        />

        <div className="form-label">Описание</div>
        <textarea
          className="input"
          style={{ marginBottom: 16, minHeight: 90 }}
          placeholder="Дресс-код, бонусы, питание, чаевые…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <Button loading={busy} onClick={publish}>
          {editing ? "Сохранить изменения" : "Опубликовать смену"}
        </Button>
      </div>
    </div>
  );
}
