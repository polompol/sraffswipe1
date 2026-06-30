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
  // «Повторить смену»: префилл всех полей из прошлой вакансии (кроме даты).
  const pre = (useLocation().state as { prefill?: Vacancy } | null)?.prefill;
  const [role, setRole] = useState<StaffRole>(pre?.role ?? "waiter");
  const [date, setDate] = useState("");
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
      await createVacancy({
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
        address,
        city: city.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
      });
      haptic("success");
      track("vacancy_publish", { role });
      toast("Вакансия опубликована", "success");
      qc.invalidateQueries({ queryKey: ["feed"] });
      nav(-1);
    } catch {
      haptic("error");
      toast("Не удалось опубликовать. Проверьте поля.", "error");
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
          {pre ? "Повторить смену" : "Новая вакансия"}
        </h1>
        {pre && (
          <p className="muted" style={{ marginBottom: 16 }}>
            Поля заполнены по прошлой смене — укажите новую дату.
          </p>
        )}

        <label className="muted">Должность</label>
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

        <label className="muted">Как и когда платите</label>
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

        <label className="muted">Чаевые (платят гости)</label>
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

        <label className="muted" htmlFor="city">Город</label>
        <input
          id="city"
          className="input"
          style={{ marginBottom: 12 }}
          placeholder="например, Москва"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <label className="muted" htmlFor="addr">Адрес (подсказки DaData)</label>
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

        <label className="muted">Описание</label>
        <textarea
          className="input"
          style={{ marginBottom: 16, minHeight: 90 }}
          placeholder="Дресс-код, бонусы, питание, чаевые…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <Button loading={busy} onClick={publish}>
          Опубликовать вакансию
        </Button>
      </div>
    </div>
  );
}
