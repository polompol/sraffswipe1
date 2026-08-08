import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { PayMethod, RateType, StaffRole, TipsMode, Vacancy } from "@/types/domain";
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
import { Button } from "@/components/Button";
import { IconPin, IconCheck } from "@/components/Icons";
import { showBackButton, haptic } from "@/telegram/sdk";

const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const fromMinutes = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
  const [rateType, setRateType] = useState<RateType>(pre?.rateType ?? "perHour");
  const [payMethod, setPayMethod] = useState<PayMethod>(pre?.payMethod ?? "cash");
  const [tips, setTips] = useState<TipsMode>(pre?.tips ?? "none");
  const [city, setCity] = useState(pre?.city || "Москва");
  const [address, setAddress] = useState(pre?.address || "Москва, ул. Льва Толстого, 16");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [suggests, setSuggests] = useState<AddressSuggestion[]>([]);
  const [desc, setDesc] = useState(pre?.description ?? "");
  const [medBook, setMedBook] = useState(pre?.requireMedBook ?? true);
  // Сколько человек нужно: на банкет и выходные почти никогда не один.
  const [headcount, setHeadcount] = useState(pre?.headcount ?? 1);
  const [busy, setBusy] = useState(false);

  useEffect(() => showBackButton(() => nav(-1)), [nav]);

  async function publish() {
    if (!date) {
      toast("Укажите дату смены", "error");
      return;
    }
    if (!city.trim()) {
      toast("Укажите город", "error");
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
        toast("Вакансия опубликована", "success");
      }
      haptic("success");
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["my-vacancies"] });
      nav(-1);
    } catch (e) {
      haptic("error");
      // 409 — по смене уже откликнулись: сервер объясняет причину, покажем её.
      const status = (e as { response?: { status?: number } })?.response?.status;
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      toast(
        status === 409 && detail
          ? detail
          : editing
            ? "Не удалось сохранить. Проверьте поля."
            : "Не удалось опубликовать. Проверьте поля.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  // Подсказки адреса DaData с дебаунсом.
  useEffect(() => {
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
          {editing ? "Исправить смену" : pre ? "Повторить смену" : "Новая вакансия"}
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
          <input className="input" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button
            className="tag"
            style={{ cursor: "pointer", whiteSpace: "nowrap", borderColor: "var(--border)" }}
            onClick={() => setRateType(rateType === "perHour" ? "perShift" : "perHour")}
          >
            {rateType === "perHour" ? "₽/час" : "₽/смена"}
          </button>
        </div>

        <div className="form-label">Сколько человек нужно</div>
        <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[1, 2, 3, 5, 10].map((n) => (
            <button
              key={n}
              className="tag"
              style={{
                cursor: "pointer",
                minWidth: 52,
                justifyContent: "center",
                background: headcount === n ? "var(--gold)" : "transparent",
                color: headcount === n ? "#fff" : "var(--text)",
                borderColor: headcount === n ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => setHeadcount(n)}
            >
              {n}
            </button>
          ))}
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            aria-label="Сколько человек нужно"
            style={{ width: 90 }}
            value={headcount}
            onChange={(e) =>
              setHeadcount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </div>
        <p className="muted" style={{ margin: "-8px 0 16px", fontSize: 13 }}>
          Одна смена на всех — не нужно публиковать несколько одинаковых.
          Когда наберётся столько людей, смена уйдёт из ленты сама.
        </p>

        <div className="form-label">Как и когда платите</div>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {(Object.keys(PAY_METHOD_LABELS) as PayMethod[]).map((p) => (
            <button
              key={p}
              className="tag"
              style={{
                cursor: "pointer",
                background: payMethod === p ? "var(--gold)" : "transparent",
                color: payMethod === p ? "#fff" : "var(--text)",
                borderColor: payMethod === p ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => setPayMethod(p)}
            >
              {PAY_METHOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="form-label">Чаевые (платят гости)</div>
        <div className="row" style={{ flexWrap: "wrap", margin: "8px 0 16px" }}>
          {(Object.keys(TIPS_LABELS) as TipsMode[]).map((t) => (
            <button
              key={t}
              className="tag"
              style={{
                cursor: "pointer",
                background: tips === t ? "var(--gold)" : "transparent",
                color: tips === t ? "#fff" : "var(--text)",
                borderColor: tips === t ? "var(--gold)" : "var(--border)",
              }}
              onClick={() => setTips(t)}
            >
              {TIPS_LABELS[t]}
            </button>
          ))}
        </div>

        <label className="form-label" htmlFor="city">Город</label>
        <input
          id="city"
          className="input"
          style={{ marginBottom: 12 }}
          placeholder="например, Москва"
          value={city}
          onChange={(e) => setCity(e.target.value)}
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

        <div className="card row" style={{ marginBottom: 12, cursor: "pointer" }} onClick={() => setMedBook(!medBook)}>
          <span style={{ flex: 1 }}>Нужна медкнижка</span>
          <span
            aria-hidden
            style={{
              width: 26, height: 26, borderRadius: 8,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: medBook ? "var(--gold)" : "transparent",
              border: medBook ? "none" : "2px solid var(--border)",
              color: "#fff",
            }}
          >
            {medBook && <IconCheck size={16} />}
          </span>
        </div>

        <div className="form-label">Описание</div>
        <textarea
          className="input"
          style={{ marginBottom: 16, minHeight: 90 }}
          placeholder="Дресс-код, бонусы, питание, чаевые…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <Button loading={busy} onClick={publish}>
          {editing ? "Сохранить изменения" : "Опубликовать вакансию"}
        </Button>
      </div>
    </div>
  );
}
