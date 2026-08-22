import { useRef, useState } from "react";
import { uploadPhoto } from "@/api/endpoints";
import { haptic } from "@/telegram/sdk";
import { IconCamera } from "./Icons";

/** Выбор и загрузка фото.
 *
 *  Поля «вставьте ссылку» здесь нет и не будет. Чужой адрес картинки даёт
 *  владельцу того сервера список всех, кто открыл карточку (IP и устройство),
 *  и возможность подменить картинку уже после модерации — сервер такие адреса
 *  и не примет. Не загрузилось — карточка обойдётся буквой названия. */
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
      // Не предлагаем «вставьте ссылку»: сервер принимает только фото,
      // загруженные через приложение (чужая ссылка даёт её владельцу список
      // всех, кто открыл карточку, и возможность подменить картинку).
      setError(
        "Фото не загрузилось. Попробуйте ещё раз — или продолжайте без него: "
        + "карточка покажет первую букву названия.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="form-label">{label}</div>
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
            color: "var(--muted)",
          }}
        >
          {!value && <IconCamera size={24} />}
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
        <div
          className="muted"
          style={{ marginTop: 6, fontSize: "var(--text-xs)" }}
          role="status"
        >
          {error}
        </div>
      )}
    </div>
  );
}
