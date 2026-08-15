/**
 * Tín hiệu nhẹ (âm thanh ngắn + rung) đi kèm toast realtime trong phòng họp.
 * Dùng WebAudio để không cần tải file, tự bỏ qua khi trình duyệt chặn.
 */
type CueKind = "raise" | "lower";

const CUE_TONES: Record<CueKind, { freq: number; duration: number; gain: number }> = {
  raise: { freq: 880, duration: 0.14, gain: 0.05 },
  lower: { freq: 440, duration: 0.1, gain: 0.035 },
};

const CUE_VIBRATION: Record<CueKind, number | number[]> = {
  raise: [18, 60, 18],
  lower: 14,
};

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function playMeetingCue(kind: CueKind) {
  if (typeof window === "undefined") return;
  try {
    const ctx = getCtx();
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      const { freq, duration, gain } = CUE_TONES[kind];
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const now = ctx.currentTime;
      vol.gain.setValueAtTime(0.0001, now);
      vol.gain.exponentialRampToValueAtTime(gain, now + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(vol).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
  } catch {
    /* bỏ qua: audio bị chặn */
  }
  try {
    navigator.vibrate?.(CUE_VIBRATION[kind]);
  } catch {
    /* bỏ qua: không hỗ trợ rung */
  }
}
