import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDraft, fetchDrafts, type VacancyDraft } from "@/api/drafts";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconEdit } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { ErrorBox, SkeletonList } from "@/components/States";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";
import { fmtDate, fmtTime, rateLabel } from "@/lib/format";
import { STAFF_ROLE_LABELS } from "@/types/domain";

export function DraftList() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["vacancy-drafts"], queryFn: fetchDrafts });
  const [removing, setRemoving] = useState<VacancyDraft | null>(null);
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await deleteDraft(removing.id, removing.version);
      qc.removeQueries({ queryKey: ["vacancy-draft", removing.id] });
      await qc.invalidateQueries({ queryKey: ["vacancy-drafts"] });
      toast("Черновик удалён", "success");
      setRemoving(null);
    } catch (e) {
      toast(apiError(e, "Не получилось удалить. Попробуйте ещё раз"), "error");
      await qc.invalidateQueries({ queryKey: ["vacancy-drafts"] });
      setRemoving(null);
    } finally { setBusy(false); }
  }
  if (query.isLoading) return <SkeletonList />;
  if (query.isError) return <ErrorBox onRetry={() => query.refetch()} />;
  return <>
    {query.data?.length === 0 ? <EmptyState icon={<IconEdit size={32} />} title="Черновиков пока нет" text="Сохраните незавершённую смену кнопкой «Сохранить и выйти». Продолжить заполнение можно будет из этого списка." /> : <>
      <p className="hint">Видны только вам. После проверки условий разместите смену — тогда её увидят работники.</p>
      <div className="stack stack-lg">
        {query.data?.map(d => <article className="card draft-card" key={d.id}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
            <h2 className="h2" style={{ margin: 0 }}>{STAFF_ROLE_LABELS[d.data.role]}</h2>
            <span className="tag">Черновик</span>
          </div>
          <p className="muted" style={{ margin: "10px 0 6px" }}>
            {d.data.date ? fmtDate(d.data.date) : "Дата не выбрана"}
            {d.data.startTime !== null && d.data.endTime !== null && <> · {fmtTime(d.data.startTime)}–{fmtTime(d.data.endTime)}</>}
          </p>
          <p style={{ margin: "6px 0", overflowWrap: "anywhere" }}>{d.data.city || "Город не указан"}{d.data.rate !== null && <> · {rateLabel(d.data.rate, d.data.rateType)}</>}</p>
          <p className="hint">Сохранён {new Date(d.updatedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <div className="stack" style={{ marginTop: 14 }}>
            <Button variant="secondary" onClick={() => nav(`/vacancy/new?draft=${d.id}`)}>Продолжить заполнение</Button>
            <button className="text-btn" onClick={() => setRemoving(d)}>Удалить черновик</button>
          </div>
        </article>)}
      </div>
    </>}
    {removing && <Sheet title="Удалить черновик?" onClose={() => !busy && setRemoving(null)}>
      <p className="muted">{STAFF_ROLE_LABELS[removing.data.role]} · {removing.data.date ? fmtDate(removing.data.date) : "Без даты"}. Восстановить удалённые поля не получится. Опубликованные смены не изменятся.</p>
      <div className="stack">
        <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Оставить черновик</Button>
        <Button variant="danger" loading={busy} onClick={remove}>Удалить</Button>
      </div>
    </Sheet>}
  </>;
}
