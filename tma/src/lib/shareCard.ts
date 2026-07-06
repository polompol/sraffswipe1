// Рендер брендовой шеринг-карточки успеха на canvas → PNG dataURL.
// Формат сторис 9:16, фирменная гамма кримсон→золото. Без внешних шрифтов/
// картинок — всё рисуется, чтобы работало офлайн и в Telegram WebView.

export interface ShareCardData {
  name: string;
  earnedRub: number;
  shiftsDone: number;
  botLink: string; // напр. t.me/shiftyworkbot
}

const W = 1080;
const H = 1920;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function logo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(4, s / 8);
  ctx.lineCap = "round";
  const h = s / 2;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + x1, cy + y1);
    ctx.lineTo(cx + x2, cy + y2);
    ctx.stroke();
  };
  seg(-h, -h, -h, h);
  seg(-h / 3, -h, -h / 3, h);
  seg(-h, -h, 0, -h);
  seg(-h, h, 0, h);
  seg(h / 3, -h, h, -h);
  seg(h / 3, h, h, h);
  seg(h, -h, h, h);
}

/** Возвращает PNG dataURL карточки. */
export function renderShareCard(d: ShareCardData): string {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // фон: градиент кримсон-тёмный → золото
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#7e1322");
  g.addColorStop(1, "#c39a3a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const fam = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

  // бренд сверху
  logo(ctx, 130, 175, 84);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.font = `700 60px ${fam}`;
  ctx.fillText("Staff", 200, 168);
  const sw = ctx.measureText("Staff").width;
  ctx.fillStyle = "#f5e1c8";
  ctx.fillText("Swipe", 200 + sw, 168);

  // суть
  ctx.fillStyle = "rgba(250,240,235,.95)";
  ctx.font = `400 58px ${fam}`;
  ctx.fillText("Я зарабатываю", 90, 560);
  ctx.fillText("на сменах в общепите", 90, 630);

  // большая сумма (вписываем)
  const amount = `${d.earnedRub.toLocaleString("ru-RU")} ₽`;
  let fs = 170;
  do {
    ctx.font = `800 ${fs}px ${fam}`;
    fs -= 4;
  } while (ctx.measureText(amount).width > W - 180 && fs > 90);
  ctx.fillStyle = "#fff";
  ctx.fillText(amount, 90, 830);

  ctx.fillStyle = "rgba(250,238,230,.95)";
  ctx.font = `400 50px ${fam}`;
  const shifts = d.shiftsDone === 1 ? "1 смена" : `${d.shiftsDone} смен`;
  ctx.fillText(`за месяц · ${shifts} закрыто`, 95, 960);

  // факты-пилюли
  const facts = ["Смены рядом", "Оплата в день", "Без посредников"];
  ctx.font = `700 44px ${fam}`;
  let fy = 1090;
  for (const f of facts) {
    const fw = ctx.measureText(f).width;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    roundRect(ctx, 90, fy, fw + 80, 92, 46);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(f, 130, fy + 48);
    fy += 120;
  }

  // футер: призыв + бот
  ctx.fillStyle = "#fffdf8";
  roundRect(ctx, 90, H - 340, W - 180, 220, 40);
  ctx.fill();
  ctx.fillStyle = "#a51c30";
  ctx.font = `700 46px ${fam}`;
  ctx.textAlign = "center";
  ctx.fillText("Найди свою смену за пару минут", W / 2, H - 260);
  ctx.fillStyle = "#a51c30";
  roundRect(ctx, 180, H - 210, W - 360, 64, 32);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 40px ${fam}`;
  ctx.fillText(d.botLink, W / 2, H - 178);
  ctx.textAlign = "left";

  return c.toDataURL("image/png");
}
