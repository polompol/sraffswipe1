import { create } from "zustand";

interface ToastItem {
  id: number;
  text: string;
  kind: "success" | "error" | "info";
}

interface ToastState {
  items: ToastItem[];
  push: (text: string, kind?: ToastItem["kind"]) => void;
  remove: (id: number) => void;
}

const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (text, kind = "info") => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { id, text, kind }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, 2600);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Глобальный вызов тоста из любого места. */
export function toast(text: string, kind: ToastItem["kind"] = "info"): void {
  useToastStore.getState().push(text, kind);
}

const COLOR: Record<ToastItem["kind"], string> = {
  success: "var(--like)",
  error: "var(--dislike)",
  info: "var(--espresso)",
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 92,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="fade-up"
          role="status"
          style={{
            background: COLOR[t.kind],
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            maxWidth: "88%",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
