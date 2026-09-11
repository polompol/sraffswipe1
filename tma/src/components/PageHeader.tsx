import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { IconBack } from "./Icons";
import { Wordmark } from "./Wordmark";

/** Единая шапка: контекст на главных экранах, явный выход на вложенных. */
export function PageHeader({ title, subtitle, backTo, onBack, action }: {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="page-header">
      <div className="page-header-top">
        {backTo || onBack ? (
          <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack ?? (() => nav(backTo!))}>
            <IconBack size={22} />
          </button>
        ) : <Wordmark />}
        {action}
      </div>
      <h1 className="h1">{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </header>
  );
}

export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="step-progress" aria-label="Этапы заполнения">
      {steps.map((label, i) => (
        <li key={label} className={i <= current ? "is-reached" : ""} aria-current={i === current ? "step" : undefined}>
          <span>{String(i + 1).padStart(2, "0")}</span> {label}
        </li>
      ))}
    </ol>
  );
}
