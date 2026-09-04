/** Переписка по спорной смене — то, по чему оператор принимает решение.
 *
 *  Раньше её не было видно нигде. Жалобы бывают ровно про написанное —
 *  «мошенничество», «абьюз», «спам», а предмет жалобы так и называется:
 *  «переписка по мэтчу». Оператор открывал такую жалобу и видел всё, кроме
 *  самой переписки, и решал по одному тексту заявителя.
 *
 *  Разворачивается по кнопке, а не грузится сразу: чужой разговор не должен
 *  открываться сам собой, да и на экране жалоб их бывает много.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDisputeChat } from "@/api/endpoints";
import { Button } from "@/components/Button";
import { Loading } from "@/components/States";
import { apiError } from "@/lib/errors";

const SIDE_LABEL: Record<string, string> = {
  seeker: "работник",
  employer: "заведение",
  system: "сервис",
};

export function DisputeChat({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const chat = useQuery({
    queryKey: ["dispute-chat", matchId],
    queryFn: () => fetchDisputeChat(matchId),
    enabled: open,
  });

  if (!open) {
    return (
      <Button
        variant="secondary"
        block={false}
        style={{ margin: "6px 0", padding: "8px 14px" }}
        onClick={() => setOpen(true)}
      >
        Показать переписку
      </Button>
    );
  }

  return (
    <div style={{ margin: "6px 0" }}>
      {chat.isLoading && <Loading />}
      {chat.isError && (
        <div className="card muted" role="alert">
          {apiError(chat.error, "Переписку не открыть")}
        </div>
      )}
      {chat.data && chat.data.length === 0 && (
        <div className="card muted">Сообщений в этой смене нет.</div>
      )}
      {chat.data && chat.data.length > 0 && (
        <div className="dispute-chat">
          {chat.data.map((m) => (
            <div key={m.id} className={`dispute-msg dispute-msg--${m.side}`}>
              <div className="muted small">
                {m.who} · {SIDE_LABEL[m.side] ?? m.side} · {m.at}
              </div>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        block={false}
        style={{ marginTop: 8, padding: "8px 14px" }}
        onClick={() => setOpen(false)}
      >
        Свернуть переписку
      </Button>
    </div>
  );
}
