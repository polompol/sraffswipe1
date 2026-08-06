import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyTheme, currentTheme } from "@/lib/theme";
import { haptic, showBackButton } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { IconHelp } from "@/components/Icons";

function Toggle({
  on,
  label,
  sub,
  aria,
  onToggle,
}: {
  on: boolean;
  label: string;
  sub: string;
  aria: string;
  onToggle: () => void;
}) {
  return (
    <div className="card row" style={{ marginBottom: 16 }}>
      <span style={{ flex: 1 }}>
        <b>{label}</b>
        <div className="muted">{sub}</div>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={aria}
        onClick={onToggle}
        // Дорожка визуально 52×30, но высота кнопки 44px — зона тапа.
        style={{
          width: 52,
          height: 44,
          padding: 0,
          borderRadius: 999,
          border: "none",
          background: "none",
          cursor: "pointer",
          position: "relative",
          flex: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 7,
            left: 0,
            width: 52,
            height: 30,
            borderRadius: 999,
            transition: "background 0.2s",
            // Выключенная дорожка — --border-strong: светлая --border на
            // кремовой карточке почти сливалась, и «выкл» читалось как пустота.
            background: on ? "var(--gold)" : "var(--border-strong)",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            left: on ? 25 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface)",
            boxShadow: "0 1px 3px rgba(60,20,25,.35)",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

/** Настройки — вынесены с профиля, чтобы не перегружать первый экран. */
export function SettingsPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);
  const [theme, setTheme] = useState(currentTheme());
  const [large, setLarge] = useState(() => document.body.dataset.large === "1");
  const [sound, setSound] = useState(
    () => localStorage.getItem("ss_sound") !== "off",
  );

  return (
    // .app даёт max-width 520 и центрирование — без него на планшете
    // тумблеры растягивались во всю ширину (единственная такая страница).
    <div className="app">
      <div className="page">
      <h1 className="h1">Настройки</h1>

      <Toggle
        on={theme === "dark"}
        label="Тёмная тема"
        sub="Удобно листать ночью"
        aria="Тёмная тема"
        onToggle={() => {
          const next = theme === "dark" ? "light" : "dark";
          applyTheme(next);
          setTheme(next);
          haptic("select");
        }}
      />

      <Toggle
        on={large}
        label="Крупные кнопки и текст"
        sub="Удобнее, если мелкое плохо видно"
        aria="Крупные кнопки и текст"
        onToggle={() => {
          const next = !large;
          setLarge(next);
          haptic("select");
          if (next) {
            document.body.dataset.large = "1";
            localStorage.setItem("ss_large", "1");
          } else {
            delete document.body.dataset.large;
            localStorage.removeItem("ss_large");
          }
        }}
      />

      <Toggle
        on={sound}
        label="Звук"
        sub="Приятный сигнал на мэтч и закрытие смены"
        aria="Звук"
        onToggle={() => {
          const next = !sound;
          setSound(next);
          haptic("select");
          if (next) localStorage.removeItem("ss_sound");
          else localStorage.setItem("ss_sound", "off");
        }}
      />

      {/* Экран заканчивался тремя переключателями и пустотой. Версия здесь
          не для красоты: её называют в поддержке, чтобы понять, какая
          сборка у человека на телефоне. */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="row">
          <span className="muted">Версия приложения</span>
          <span className="spacer" />
          <b>{__APP_VERSION__}</b>
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
          Если что-то работает не так — напишите в поддержку и назовите эту
          версию, так проблему найдут быстрее.
        </p>
        <Button
          variant="ghost"
          style={{ marginTop: 12 }}
          onClick={() => nav("/support")}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconHelp size={18} /> Помощь и поддержка
          </span>
        </Button>
      </div>
      </div>
    </div>
  );
}
