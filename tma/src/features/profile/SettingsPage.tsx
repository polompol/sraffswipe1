import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyTheme, currentTheme } from "@/lib/theme";
import { haptic, showBackButton } from "@/telegram/sdk";

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
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          background: on ? "var(--gold)" : "var(--border)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 25 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#fff",
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
    </div>
  );
}
