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

// Ошибка была нейтрально-серой (--dislike) и не читалась как ошибка, а успех
// совпадал с брендом. Разводим по смыслу: успех — зелёный, ошибка — тёмный
// багровый, нейтральное — «эспрессо».
const COLOR: Record<ToastItem["kind"], string> = {
  success: "var(--success-bg)",
  error: "var(--danger-bg)",
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
        bottom: "calc(92px + env(safe-area-inset-bottom))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        zIndex: "var(--z-toast)",
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
            fontSize: "var(--text-sm)",
            maxWidth: "88%",
            boxShadow: "var(--elev-3)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
