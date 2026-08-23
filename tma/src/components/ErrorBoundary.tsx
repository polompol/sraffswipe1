import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/lib/report";
import { Button } from "@/components/Button";
import { IconWarning } from "./Icons";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Ловит исключения в рендере и показывает фоллбэк вместо белого экрана. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, `render: ${info.componentStack ?? ""}`);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="app">
        <div className="page" style={{ textAlign: "center", paddingTop: 80 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto",
            background: "var(--gold-tint)", color: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconWarning size={36} />
          </div>
          <h1 className="h1" style={{ marginTop: 12 }}>Что-то пошло не так</h1>
          <p className="muted" style={{ margin: "8px 0 20px" }}>
            Мы уже знаем о проблеме. Попробуйте перезапустить.
          </p>
          <Button onClick={() => location.reload()}>Перезапустить</Button>
        </div>
      </div>
    );
  }
}
