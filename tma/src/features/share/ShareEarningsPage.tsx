import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMe, fetchReferral } from "@/api/endpoints";
import { renderShareCard } from "@/lib/shareCard";
import { share, showBackButton, haptic } from "@/telegram/sdk";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";

function botHandle(link: string): string {
  // из "https://t.me/shiftyworkbot?startapp=..." → "t.me/shiftyworkbot"
  const m = link.match(/t\.me\/[A-Za-z0-9_]+/);
  return m ? m[0] : "t.me/staffswipe";
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

export function ShareEarningsPage() {
  const nav = useNavigate();
  useEffect(() => showBackButton(() => nav(-1)), [nav]);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: ref } = useQuery({ queryKey: ["referral"], queryFn: fetchReferral });

  const link = ref?.link ?? "https://t.me/staffswipe";
  const dataUrl = useMemo(() => {
    if (!me) return "";
    try {
      return renderShareCard({
        name: me.name,
        earnedRub: me.earnedRub ?? 0,
        shiftsDone: me.shiftsDone ?? 0,
        botLink: botHandle(link),
      });
    } catch {
      return "";
    }
  }, [me, link]);

  const text = `Зарабатываю на сменах в общепите через StaffSwipe 🔥 Лови свою смену рядом`;

  async function doShare() {
    haptic("light");
    // Лучший вариант — поделиться картинкой (Web Share Level 2), иначе ссылкой.
    try {
      if (dataUrl && navigator.canShare) {
        const file = dataUrlToFile(dataUrl, "staffswipe.png");
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      }
    } catch {
      /* отмена/ошибка — падаем на ссылку */
    }
    share(link, text);
  }

  function download() {
    if (!dataUrl) return;
    haptic("light");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "staffswipe.png";
    a.click();
    toast("Картинка сохранена — выложите в сторис", "success");
  }

  return (
    <div className="app">
      <div className="page">
        <h1 className="h1" style={{ marginBottom: 4 }}>Поделиться доходом</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Красивая картинка для сторис — друзья придут по вашей ссылке.
        </p>

        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Карточка дохода"
            style={{ width: "100%", borderRadius: 16, boxShadow: "var(--elev-2)", display: "block" }}
          />
        ) : (
          <div className="card" style={{ textAlign: "center" }}>Готовим картинку…</div>
        )}

        <div style={{ marginTop: 16 }}>
          <Button onClick={doShare}>Поделиться</Button>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button variant="secondary" onClick={download}>Скачать картинку</Button>
        </div>
      </div>
    </div>
  );
}
