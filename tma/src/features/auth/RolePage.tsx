import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/types/domain";
import { useSession } from "@/store/session";
import { authTelegram, track } from "@/api/endpoints";
import { rawInitData, haptic, openExternal, insideTelegram } from "@/telegram/sdk";
import { Button } from "@/components/Button";

// Куда отправить человека, открывшего приложение в обычном браузере.
const BOT_LINK = `https://t.me/${import.meta.env.VITE_BOT_USERNAME ?? "staffswipe_bot"}`;
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { IconBriefcase, IconStore, IconChevronRight } from "@/components/Icons";
import { OFFER_URL, PRIVACY_URL } from "@/lib/legal";
import type { ComponentType } from "react";


export function RolePage() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [busy, setBusy] = useState<AppRole | null>(null);
  const [consent, setConsent] = useState(
    localStorage.getItem("ss_consent") === "1",
  );

  async function choose(role: AppRole) {
    if (!consent) return;
    setBusy(role);
    haptic("light");
    try {
      const res = await authTelegram(rawInitData(), role);
      setAuth(res.accessToken, res.role, res.userId);
      // Сразу в ленту не отправляем: анкета была бы пустой, и заведение
      // пролистало бы карточку без имени и профессии. Знакомство короткое
      // и его можно пропустить.
      nav("/welcome", { replace: true });
    } catch (e) {
      // Раньше отказ был молчаливым: человек жал кнопку, видел «…» и всё
      // возвращалось как было. В метро это выглядит как «приложение не
      // работает», и на этом знакомство заканчивалось.
      haptic("error");
      toast(apiError(e, "Не удалось войти — проверьте интернет"), "error");
      setBusy(null);
    }
  }

  function acceptConsent(v: boolean) {
    setConsent(v);
    if (v) {
      localStorage.setItem("ss_consent", "1");
      track("consent");
    } else {
      localStorage.removeItem("ss_consent");
    }
  }

  // Вне Telegram войти невозможно в принципе: подписи запуска нет, сервер
  // отвечает отказом, и человек упирался в «Не удалось войти — проверьте
  // интернет», хотя интернет ни при чём. Заходят так регулярно: по ссылке из
  // рекламы, из истории браузера.
  if (!insideTelegram()) {
    return (
      <div className="app">
        <div
          className="page"
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <h1 className="h1">StaffSwipe работает в Telegram</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Смены, чат и отклики живут внутри мессенджера — так вход не требует
            ни пароля, ни номера телефона.
          </p>
          <Button onClick={() => openExternal(BOT_LINK)}>
            Открыть в Telegram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Экран короткий: два блока прижимались к верху, а под ними оставалось
          полэкрана пустоты — первое, что человек видит после знакомства,
          выглядело недогруженным. Ставим по центру свободной высоты. */}
      <div
        className="page"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <h1 className="h1" style={{ marginTop: 0 }}>С чего начнём?</h1>
        <p className="muted">Это можно поменять позже</p>

        <label
          className="card row"
          style={{ marginTop: 16, gap: 10, cursor: "pointer", alignItems: "flex-start" }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => acceptConsent(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Мне есть 18 лет. Принимаю{" "}
            {/* Через openLink, а не target="_blank": внутри Telegram новое
                окно молча не открывается. Человек ставил галочку «принимаю
                оферту», не имея физической возможности её прочитать — для
                152-ФЗ это плохо. Тап по ссылке не должен переключать
                галочку, поэтому останавливаем событие. */}
            <a
              href={OFFER_URL}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternal(OFFER_URL); }}
            >
              оферту
            </a>,{" "}
            <a
              href={PRIVACY_URL}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternal(PRIVACY_URL); }}
            >
              политику обработки ПДн (152-ФЗ)
            </a>{" "}
            и даю согласие на обработку персональных данных.
          </span>
        </label>

        {/* До согласия карточки выключены — раньше без единого слова, почему
            тап не срабатывает. Теперь причина написана явно. */}
        {!consent && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Отметьте согласие выше, чтобы выбрать роль
          </p>
        )}

        <div style={{ marginTop: 16, display: "grid", gap: 16, opacity: consent ? 1 : 0.55, pointerEvents: consent ? "auto" : "none" }}>
          <RoleCard
            Icon={IconBriefcase}
            grad="var(--grad-brand)"
            title="Я ищу подработку"
            sub="Официант, бариста, кальянщик, флорист, курьер"
            loading={busy === "seeker"}
            onClick={() => choose("seeker")}
          />
          <RoleCard
            Icon={IconStore}
            grad="linear-gradient(135deg, var(--gold), var(--crimson-dark))"
            title="Я ищу сотрудников"
            sub="Кафе, ресторан, бар, кофейня, кальянная"
            loading={busy === "employer"}
            onClick={() => choose("employer")}
          />
        </div>
      </div>
    </div>
  );
}

function RoleCard(props: {
  Icon: ComponentType<{ size?: number }>;
  grad: string;
  title: string;
  sub: string;
  loading: boolean;
  onClick: () => void;
}) {
  const { Icon } = props;
  return (
    <button
      className="card row"
      style={{ textAlign: "left", gap: 16, cursor: "pointer" }}
      onClick={props.onClick}
      disabled={props.loading}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: props.grad,
          color: "var(--on-brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <Icon size={28} />
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "var(--text-md)" }}>{props.title}</div>
        <div className="muted">{props.sub}</div>
      </span>
      <span style={{ color: "var(--muted)", display: "inline-flex" }}>
        {props.loading ? "…" : <IconChevronRight size={20} />}
      </span>
    </button>
  );
}
