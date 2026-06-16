import { useRef, useState } from "react";
import { uploadPhoto } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";

/** Выбор и загрузка фото. При недоступном S3 — мягкая деградация к вводу URL. */
export function PhotoUpload({
  label = "Фото",
  value,
  onChange,
}: {
  label?: string;
  value?: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadPhoto(file);
      onChange(url);
      haptic("success");
    } catch {
      haptic("error");
      setError("Загрузка недоступна — вставьте ссылку на фото вручную.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label className="muted">{label}</label>
      <div className="row" style={{ gap: 12, marginTop: 8 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            flex: "none",
            border: "1px solid var(--border)",
            background: value
              ? `center/cover url(${value})`
              : "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          {value ? "" : "📷"}
        </div>
        <button
          className="btn secondary"
          style={{ width: "auto", padding: "0 16px", height: 46 }}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Загрузка…" : "Выбрать фото"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {error && (
        <>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{error}</div>
          <input
            className="input"
            style={{ marginTop: 6 }}
            placeholder="https://… ссылка на фото"
            defaultValue={value}
            onBlur={(e) => e.target.value && onChange(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
