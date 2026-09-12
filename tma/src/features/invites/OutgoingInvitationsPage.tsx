import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchOutgoingInvitations, type InvitationView } from "@/api/invitations";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconBell } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBox, SkeletonList } from "@/components/States";
import { shiftWhen } from "@/lib/format";
import { showBackButton } from "@/telegram/sdk";
import { STAFF_ROLE_LABELS } from "@/types/domain";

const STATUS: Record<string, string> = {
  waiting: "Ждём отклика", no_open_shifts: "Нет открытых смен", unavailable: "Профиль недоступен",
  matched: "Взаимный интерес", confirmed: "Смена подтверждена", completed: "Смена завершена",
  cancelled: "Смена отменена", expired: "Смена завершена без подтверждения", no_show: "Не вышел на смену",
};

export function OutgoingInvitationsPage() {
  const nav = useNavigate();
  const [view, setView] = useState<InvitationView>("all");
  useEffect(() => showBackButton(() => nav("/vacancy/my")), [nav]);
  const query = useInfiniteQuery({
    queryKey: ["outgoing-invitations", view], initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchOutgoingInvitations(view, pageParam),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = [...new Map(query.data?.pages.flatMap(p => p.items).map(item => [item.id, item])).values()];
  return <div className="app"><div className="page">
    <PageHeader title="Приглашения" backTo="/vacancy/my" action={<button className="text-btn" disabled={query.isFetching} onClick={() => query.refetch()}>Обновить</button>} />
    <p className="muted" style={{ margin: "0 0 18px" }}>Сотрудник видит ваши открытые смены. После взаимного интереса появляется чат.</p>
    <div className="segment-tabs" role="group" aria-label="Раздел приглашений">
      {([["all", "Все"], ["waiting", "Без ответа"], ["with_matches", "Ответили"]] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {query.isLoading && <SkeletonList />}
    {query.isError && <ErrorBox onRetry={() => query.refetch()} />}
    {!query.isLoading && !query.isError && !items.length && <EmptyState icon={<IconBell size={32} />} title={view === "all" ? "Пока никого не пригласили" : "В этом разделе пока пусто"} text={view === "waiting" ? "Все приглашённые уже ответили взаимно или у вас ещё нет приглашений." : "Позовите подходящих сотрудников из ленты. Здесь сохранятся ваши приглашения и договорённости."} action={<Button onClick={() => view === "all" ? nav("/feed") : setView("all")}>{view === "all" ? "Найти сотрудников" : "Все приглашения"}</Button>} />}
    <div className="stack stack-lg">
      {items.map(item => <article className="card" key={item.id}>
        <div className="row" style={{ gap: 12, alignItems: "start" }}>
          <Avatar name={item.name} src={item.photoUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="h2" style={{ margin: 0, overflowWrap: "anywhere" }}>{item.name}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>{item.roles.map(r => STAFF_ROLE_LABELS[r]).filter(Boolean).join(" · ") || "Сотрудник"}</p>
          </div>
        </div>
        <p style={{ margin: "14px 0 8px" }}><span className="tag" style={{ whiteSpace: "normal", maxWidth: "100%" }}>{STATUS[item.status] ?? "Договорённость"}</span></p>
        {item.latestMatch && <p style={{ margin: "8px 0" }}>{STAFF_ROLE_LABELS[item.latestMatch.role]} · {shiftWhen(item.latestMatch)}</p>}
        <p className="hint">Пригласили {new Date(item.invitedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        {item.latestMatch && <div className="stack" style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={() => nav(`/chat/${item.latestMatch!.id}`)}>Открыть чат</Button>
          <button className="text-btn" onClick={() => nav(`/matches?worker=${item.userId}`)}>Все договорённости · {item.matchesCount}</button>
        </div>}
        {item.status === "no_open_shifts" && <Button variant="secondary" style={{ marginTop: 12 }} onClick={() => nav("/vacancy/new")}>Разместить смену</Button>}
      </article>)}
    </div>
    {query.hasNextPage && <Button variant="secondary" style={{ marginTop: 16 }} loading={query.isFetchingNextPage} onClick={async () => { await query.fetchNextPage(); }}>Показать ещё</Button>}
  </div></div>;
}
