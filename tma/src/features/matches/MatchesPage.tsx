import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchMatches } from "@/api/endpoints";
import { MATCH_STATUS_LABELS } from "@/types/domain";
import { ErrorBox, Loading } from "@/components/States";

export function MatchesPage() {
  const nav = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatches,
  });

  return (
    <div className="page">
      <h1 className="h1" style={{ marginBottom: 12 }}>Мэтчи</h1>
      {isLoading && <Loading />}
      {isError && <ErrorBox onRetry={() => refetch()} />}
      {data && data.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 56 }}>💛</div>
          <p className="muted" style={{ marginTop: 8 }}>
            Пока нет мэтчей. Свайпайте вправо понравившиеся смены.
          </p>
        </div>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        {data?.map((m) => (
          <button
            key={m.id}
            className="card row"
            style={{ textAlign: "left", gap: 12, cursor: "pointer" }}
            onClick={() => nav(`/chat/${m.id}`)}
          >
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                flex: "none",
                backgroundImage: `url(${m.companyPhotoUrl ?? ""})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                background: m.companyPhotoUrl ? undefined : "var(--border)",
              }}
            />
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{m.companyName ?? "Заведение"}</div>
              <div className="muted">{MATCH_STATUS_LABELS[m.status]}</div>
            </span>
            <span style={{ color: "var(--muted)", fontSize: 22 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
