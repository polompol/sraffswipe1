import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  closeSupportCase,
  fetchAdminSupport,
  replySupportCase,
} from "@/api/support";
import { Button } from "@/components/Button";
import { ToggleChip } from "@/components/ToggleChip";
import { act, fmtDate, Section } from "./shared";

const TOPIC_LABEL = {
  shift: "Смена",
  payment: "Оплата",
  account: "Аккаунт",
  safety: "Безопасность",
  other: "Другое",
} as const;

const ROLE_LABEL: Record<string, string> = {
  seeker: "Работник",
  employer: "Заведение",
};

export function SupportQueue() {
  const [status, setStatus] = useState<"open" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const cases = useQuery({
    queryKey: ["admin-support", status],
    queryFn: () => fetchAdminSupport(status),
  });

  async function sendReply(id: string) {
    const reply = (drafts[id] ?? "").trim();
    if (!reply || busyId) return;
    setBusyId(id);
    try {
      const ok = await act(
        () => replySupportCase(id, reply),
        "Ответ отправлен",
        "Не удалось отправить ответ",
      );
      if (!ok) return;
      setDrafts((items) => ({ ...items, [id]: "" }));
      await cases.refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function closeCase(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const ok = await act(
        () => closeSupportCase(id, ""),
        "Обращение закрыто",
        "Не удалось закрыть обращение",
      );
      if (ok) await cases.refetch();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Section
      title="Поддержка"
      hint="Отдельная очередь обращений пользователей. Жалобы на нарушителей остаются ниже в разделе модерации."
    >
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <ToggleChip
          on={status === "open"}
          label="В работе"
          onClick={() => setStatus("open")}
        />
        <ToggleChip
          on={status === "all"}
          label="Все"
          onClick={() => setStatus("all")}
        />
      </div>

      {cases.isLoading && <div className="card muted">Загружаем обращения…</div>}
      {cases.isError && (
        <div className="card" role="alert">
          <p className="muted">Не удалось загрузить очередь поддержки.</p>
          <Button
            variant="secondary"
            onClick={async () => {
              await cases.refetch();
            }}
          >
            Повторить
          </Button>
        </div>
      )}
      {!cases.isLoading && !cases.isError && (cases.data?.length ?? 0) === 0 && (
        <div className="card muted">Новых обращений нет</div>
      )}

      <div className="stack">
        {(cases.data ?? []).map((item) => {
          const draft = drafts[item.id] ?? "";
          const busy = busyId === item.id;
          return (
            <article
              key={item.id}
              className="card"
              aria-label={`Обращение ${item.number}`}
            >
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div>
                  <b>{item.number}</b>
                  <div className="muted small" style={{ marginTop: 3 }}>
                    {ROLE_LABEL[item.ownerRole] ?? item.ownerRole} · {item.ownerInfo} · {fmtDate(item.createdAt)}
                  </div>
                </div>
                <span className="spacer" />
                <span className="tag">
                  {TOPIC_LABEL[item.topic] ?? item.topic}
                </span>
              </div>

              <p style={{ margin: "10px 0" }}>{item.text}</p>
              {item.adminReply && (
                <div className="muted" style={{ marginBottom: 10 }}>
                  Последний ответ: {item.adminReply}
                </div>
              )}

              {item.status !== "closed" ? (
                <>
                  <label
                    htmlFor={`support-reply-${item.id}`}
                    style={{ display: "block", marginBottom: 6 }}
                  >
                    Ответ пользователю
                  </label>
                  <textarea
                    id={`support-reply-${item.id}`}
                    className="input"
                    rows={3}
                    maxLength={2000}
                    value={draft}
                    disabled={busy}
                    onChange={(event) =>
                      setDrafts((items) => ({
                        ...items,
                        [item.id]: event.target.value,
                      }))
                    }
                    style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
                  />
                  <div className="row" style={{ gap: 8 }}>
                    <Button
                      loading={busy}
                      disabled={!draft.trim() || Boolean(busyId)}
                      onClick={() => sendReply(item.id)}
                    >
                      Ответить
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={Boolean(busyId)}
                      onClick={() => closeCase(item.id)}
                    >
                      Закрыть
                    </Button>
                  </div>
                </>
              ) : (
                <div className="muted small">✓ Обращение закрыто</div>
              )}
            </article>
          );
        })}
      </div>
    </Section>
  );
}
