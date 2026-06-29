import { useNavigate } from "react-router-dom";
import type { MatchModel } from "@/types/domain";
import { IconTabMatches, IconChat } from "@/components/Icons";

const COLORS = ["#9e1b32", "#b9485a", "#c7a24b", "#7c1526", "#e0697c"];

export function MatchOverlay({
  match,
  onClose,
}: {
  match: MatchModel;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const confetti = Array.from({ length: 36 });

  return (
    <div className="overlay">
      {confetti.map((_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${(i * 2.8) % 100}%`,
            top: `-${Math.random() * 20}px`,
            background: COLORS[i % COLORS.length],
            animationDuration: `${1.6 + Math.random() * 1.4}s`,
            animationDelay: `${Math.random() * 0.4}s`,
          }}
        />
      ))}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(217,164,65,0.45) 0%, rgba(217,164,65,0) 70%)",
          filter: "blur(8px)",
        }}
        className="pulse"
      />
      <div style={{ fontSize: 44, fontWeight: 900, color: "var(--gold)", position: "relative" }}>
        Это мэтч!
      </div>
      <div style={{ margin: "12px 0", position: "relative", color: "var(--gold)" }}>
        <IconTabMatches size={68} active />
      </div>
      <p style={{ color: "#e6dccd", maxWidth: 300 }}>
        Вы и «{match.companyName ?? "заведение"}» понравились друг другу
      </p>
      <div style={{ width: "100%", maxWidth: 340, marginTop: 24, display: "grid", gap: 10 }}>
        <button
          className="btn"
          onClick={() => {
            onClose();
            nav(`/chat/${match.id}`);
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <IconChat size={18} /> Перейти в чат
          </span>
        </button>
        <button className="btn secondary" style={{ color: "#e6dccd", borderColor: "rgba(255,255,255,.25)" }} onClick={onClose}>
          Продолжить листать
        </button>
      </div>
    </div>
  );
}
