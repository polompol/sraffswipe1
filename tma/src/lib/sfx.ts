// Короткие приятные звуки через WebAudio (без файлов). Дофамин на радостных
// моментах: мэтч, закрытая смена. Уважает выключатель «Звук» в профиле.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (localStorage.getItem("ss_sound") === "off") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, vol = 0.13) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = a.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Приятный «ка-чинг» — две восходящие ноты (заработок/успех). */
export function coin(): void {
  const a = audio();
  if (!a) return;
  tone(a, 880, 0, 0.12);
  tone(a, 1318, 0.09, 0.16);
}

/** Лёгкий «поп» — мэтч/позитив. */
export function pop(): void {
  const a = audio();
  if (!a) return;
  tone(a, 660, 0, 0.1);
  tone(a, 990, 0.06, 0.13);
}
