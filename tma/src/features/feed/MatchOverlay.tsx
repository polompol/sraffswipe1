import { useNavigate } from "react-router-dom";
import type { MatchModel } from "@/types/domain";

const COLORS = ["#c9a227", "#d9a441", "#b07a47", "#c2604a", "#3b82f6"];

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
      <div style={{ fontSize: 44, fontWeight: 900, color: "var(--gold)" }}>
        Это мэтч!
      </div>
      <div style={{ fontSize: 64, margin: "8px 0" }}>🤝</div>
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
          💬 Перейти в чат
        </button>
        <button className="btn secondary" style={{ color: "#e6dccd", borderColor: "rgba(255,255,255,.25)" }} onClick={onClose}>
          Продолжить листать
        </button>
      </div>
    </div>
  );
}
