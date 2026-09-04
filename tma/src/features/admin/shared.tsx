/** Общее для всех вкладок админ-панели: примитивы вида и два помощника.
 *
 *  Панель разбита по вкладкам на отдельные файлы (см. AdminPage.tsx). Всё,
 *  что нужно больше чем одной вкладке, лежит здесь — чтобы не расползалось
 *  копиями, как было до разбора.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { haptic } from "@/telegram/sdk";
import { toast } from "@/components/Toast";
import { apiError } from "@/lib/errors";

/** Крупная цифра сводки. */
export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "14px 8px" }}>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 900, color: "var(--gold)" }}>{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

/** Заголовок раздела внутри вкладки. */
export function Section({ title, hint, children }: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 className="h2" style={{ margin: "0 0 6px" }}>{title}</h2>
      {hint && (
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "var(--text-xs)" }}>{hint}</p>
      )}
      {children}
    </section>
  );
}

/** Пустое состояние раздела — одинаковое на всю панель. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card muted" style={{ textAlign: "center" }}>{children}</div>
  );
}

/** Действие оператора: тост при отказе обязателен.
 *
 *  Восемь кнопок панели вызывали сервер без обработки ошибки. Отказ (403,
 *  409, нет сети) не показывал ничего: оператор жал «Заблокировать» по
 *  жалобе на мошенника, экран не менялся — и он считал, что нарушитель
 *  забанен. Хуже неудобства: тихая ошибка выглядит как успех. */
export async function act(
  fn: () => Promise<unknown>,
  ok: string,
  fail: string,
): Promise<boolean> {
  try {
    await fn();
    haptic("success");
    toast(ok, "success");
    return true;
  } catch (e) {
    haptic("error");
    toast(apiError(e, fail), "error");
    return false;
  }
}

/** Дата и время так, как их читает человек. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** Обновить всё, на что влияет решение оператора.
 *
 *  Одно решение (закрыть спор, разблокировать) меняет сразу несколько
 *  списков, и раньше половина из них оставалась старой до перезагрузки.
 */
export function useAdminRefresh(): () => void {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-blocked"] });
    qc.invalidateQueries({ queryKey: ["admin-revenue"] });
  };
}

/** Запуск ежедневной задачи с блокировкой её кнопки на время работы. */
export function useJobRunner() {
  const qc = useQueryClient();
  const [busyJob, setBusyJob] = useState<string | null>(null);

  async function runJob(
    id: string,
    fn: () => Promise<number>,
    done: (n: number) => string,
    none: string,
  ) {
    setBusyJob(id);
    try {
      const n = await fn();
      haptic("success");
      toast(n > 0 ? done(n) : none, "success");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch {
      haptic("error");
      toast("Не получилось — попробуйте ещё раз", "error");
    } finally {
      setBusyJob(null);
    }
  }

  return { busyJob, runJob };
}
